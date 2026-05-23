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
      const batch = await fetchSource(source, options.config, options.holdings, options.socialWatchlist);
      events.push(...batch);
      await options.logger.info("source fetched", {
        sourceId: source.id,
        sourceName: source.name,
        adapter: source.adapter,
        tier: source.tier,
        count: batch.length,
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

function uniqueAccounts(accounts: string[]): string[] {
  return [...new Set(accounts.map((account) => account.trim()).filter(Boolean))];
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
