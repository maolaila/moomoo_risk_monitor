import path from "node:path";
import { RiskMonitorConfig } from "./config";
import { Holding, RawEvent } from "./types";
import { fetchBrowserDynamicEvents } from "./sources/browser";
import { fetchHtmlStaticEvents } from "./sources/html";
import { fetchRssEvents } from "./sources/rss";
import { fetchSearchRssEvents, fetchTickerRssEvents } from "./sources/search-rss";
import { fetchXBrowserEvents } from "./sources/x-browser";
import { extractXHandles, SocialWatchlist } from "./social-watchlist";
import { fileExists, readJsonFile } from "./utils";
import { SourceDefinition, SourceRegistry, SourceSchedulerState } from "./source-types";
import { Logger } from "./logger";

export function createSourceSchedulerState(): SourceSchedulerState {
  return { lastRunMsBySourceId: {} };
}

export async function fetchRegistrySources(options: {
  config: RiskMonitorConfig;
  holdings: Holding[];
  logger: Logger;
  scheduler?: SourceSchedulerState;
  socialWatchlist?: SocialWatchlist;
  setTask?: (task: string) => Promise<void>;
}): Promise<RawEvent[]> {
  const registry = await loadSourceRegistry(options.config.sourceRegistryPath);
  const now = Date.now();
  const events: RawEvent[] = [];

  for (const source of registry.sources) {
    if (!source.enabled || !enabledByGlobalSwitch(source, options.config) || !isDue(source, options.scheduler, now)) {
      continue;
    }
    if (options.setTask) {
      await options.setTask(`采集来源：${source.name}`);
    }
    const started = Date.now();
    try {
      const result = await fetchSourceWithBrowserFallback(source, options.config, options.holdings, options.socialWatchlist);
      const batch = result.events;
      events.push(...batch);
      await options.logger.info("source fetched", {
        sourceId: source.id,
        sourceName: source.name,
        adapter: source.adapter,
        tier: source.tier,
        count: batch.length,
        browserFallbackUsed: result.browserFallbackUsed,
        primaryCount: result.browserFallbackUsed ? result.primaryCount : undefined,
        primaryError: result.primaryError,
        browserFallbackError: result.browserFallbackError,
        elapsedMs: Date.now() - started
      });
    } catch (error) {
      await options.logger.warn("source failed", {
        sourceId: source.id,
        sourceName: source.name,
        adapter: source.adapter,
        tier: source.tier,
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      if (options.scheduler) {
        options.scheduler.lastRunMsBySourceId[source.id] = now;
      }
    }
  }

  return events;
}

interface FetchSourceResult {
  events: RawEvent[];
  browserFallbackUsed: boolean;
  primaryCount?: number;
  primaryError?: string;
  browserFallbackError?: string;
}

function enabledByGlobalSwitch(source: SourceDefinition, config: RiskMonitorConfig): boolean {
  if (source.adapter === "ticker_rss") {
    return config.enableTickerNews;
  }
  if (source.category === "official" || source.category === "policy") {
    return config.enablePolicyRss;
  }
  if (source.category === "social" || source.sourceKind === "social" || source.adapter === "x_browser") {
    return config.enableSocial;
  }
  if (source.adapter === "rss" || source.adapter === "search_rss" || source.category === "news" || source.category === "industry" || source.category === "search") {
    return config.enableRss;
  }
  return true;
}

export async function loadSourceRegistry(filePath: string): Promise<SourceRegistry> {
  const resolved = path.resolve(filePath);
  if (!(await fileExists(resolved))) {
    throw new Error(`Source registry not found: ${resolved}`);
  }
  const registry = await readJsonFile<SourceRegistry>(resolved);
  validateRegistry(registry, resolved);
  return registry;
}

async function fetchSourceWithBrowserFallback(source: SourceDefinition, config: RiskMonitorConfig, holdings: Holding[], socialWatchlist?: SocialWatchlist): Promise<FetchSourceResult> {
  let primaryEvents: RawEvent[] = [];
  let primaryError: string | undefined;

  try {
    primaryEvents = await fetchSource(source, config, holdings, socialWatchlist);
  } catch (error) {
    primaryError = error instanceof Error ? error.message : String(error);
  }

  if (!shouldUseBrowserFallback(source, primaryEvents.length, primaryError)) {
    if (primaryError) {
      throw new Error(primaryError);
    }
    return {
      events: primaryEvents,
      browserFallbackUsed: false
    };
  }

  try {
    const fallbackEvents = await fetchBrowserFallbackEvents(source, config);
    return {
      events: fallbackEvents,
      browserFallbackUsed: true,
      primaryCount: primaryEvents.length,
      primaryError
    };
  } catch (error) {
    const browserFallbackError = error instanceof Error ? error.message : String(error);
    if (primaryError) {
      throw new Error(`Primary source failed: ${primaryError}; browser fallback failed: ${browserFallbackError}`);
    }
    return {
      events: primaryEvents,
      browserFallbackUsed: false,
      primaryCount: primaryEvents.length,
      browserFallbackError
    };
  }
}

async function fetchSource(source: SourceDefinition, config: RiskMonitorConfig, holdings: Holding[], socialWatchlist?: SocialWatchlist): Promise<RawEvent[]> {
  const lookbackHours = source.lookbackHours ?? config.newsLookbackHours;
  if (source.adapter === "rss") {
    const urls = source.urls || (source.url ? [source.url] : []);
    return fetchRssEvents(urls, source.sourceKind === "social" ? "social" : "rss", lookbackHours, {
      sourceId: source.id,
      sourceName: source.name,
      maxItems: source.maxItems
    });
  }
  if (source.adapter === "ticker_rss") {
    return fetchTickerRssEvents(source, holdings, lookbackHours);
  }
  if (source.adapter === "search_rss") {
    return fetchSearchRssEvents(source, holdings, lookbackHours);
  }
  if (source.adapter === "html_static") {
    return fetchHtmlStaticEvents(source, lookbackHours);
  }
  if (source.adapter === "browser_dynamic") {
    return fetchBrowserDynamicEvents(source, lookbackHours);
  }
  if (source.adapter === "x_browser") {
    const generatedAccounts = source.useGeneratedWatchlist ? extractXHandles(socialWatchlist) : [];
    const mergedSource = generatedAccounts.length
      ? { ...source, accounts: uniqueAccounts([...(source.accounts || []), ...generatedAccounts]) }
      : source;
    return fetchXBrowserEvents(mergedSource, lookbackHours);
  }
  return [];
}

function shouldUseBrowserFallback(source: SourceDefinition, primaryCount: number, primaryError: string | undefined): boolean {
  if (!hasBrowserFallback(source)) {
    return false;
  }
  if (primaryError) {
    return true;
  }
  return primaryCount === 0 && (source.browserFallback?.onEmpty ?? true);
}

function hasBrowserFallback(source: SourceDefinition): boolean {
  const fallback = source.browserFallback;
  if (!fallback || fallback.enabled === false) {
    return false;
  }
  return Boolean(fallback.url || fallback.urls?.length || source.url);
}

async function fetchBrowserFallbackEvents(source: SourceDefinition, config: RiskMonitorConfig): Promise<RawEvent[]> {
  const fallback = source.browserFallback;
  if (!fallback) {
    return [];
  }
  const urls = fallback.urls?.length ? fallback.urls : [fallback.url || source.url].filter(Boolean) as string[];
  const lookbackHours = source.lookbackHours ?? config.newsLookbackHours;
  const batches: RawEvent[][] = [];
  for (const url of urls) {
    const fallbackSource: SourceDefinition = {
      ...source,
      adapter: "browser_dynamic",
      url,
      selectors: fallback.selectors || source.selectors,
      headless: fallback.headless ?? source.headless,
      profileDir: fallback.profileDir || source.profileDir,
      waitMs: fallback.waitMs ?? source.waitMs,
      maxItems: fallback.maxItems ?? source.maxItems,
      sourceKind: source.sourceKind === "social" ? "social" : "crawler"
    };
    const batch = await fetchBrowserDynamicEvents(fallbackSource, lookbackHours);
    batches.push(batch.map((event) => ({
      ...event,
      metadata: {
        ...event.metadata,
        browserFallback: true,
        primaryAdapter: source.adapter
      }
    })));
  }
  return dedupeEventsByUrl(batches.flat()).slice(0, fallback.maxItems ?? source.maxItems ?? 30);
}

function uniqueAccounts(accounts: string[]): string[] {
  return [...new Set(accounts.map((account) => account.trim()).filter(Boolean))];
}

function dedupeEventsByUrl(events: RawEvent[]): RawEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = event.url || event.title;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function isDue(source: SourceDefinition, scheduler: SourceSchedulerState | undefined, now: number): boolean {
  if (!scheduler) {
    return true;
  }
  const cadenceMs = Math.max(1, source.cadenceMinutes) * 60 * 1000;
  const lastRun = scheduler.lastRunMsBySourceId[source.id];
  return !lastRun || now - lastRun >= cadenceMs;
}

function validateRegistry(registry: SourceRegistry, filePath: string): void {
  if (!registry || registry.version !== 1 || !Array.isArray(registry.sources)) {
    throw new Error(`Invalid source registry: ${filePath}`);
  }
  const seen = new Set<string>();
  for (const source of registry.sources) {
    if (!source.id || !source.name || !source.adapter || !source.tier || !source.category) {
      throw new Error(`Invalid source registry entry in ${filePath}: ${JSON.stringify(source)}`);
    }
    if (seen.has(source.id)) {
      throw new Error(`Duplicate source id in ${filePath}: ${source.id}`);
    }
    seen.add(source.id);
  }
}
