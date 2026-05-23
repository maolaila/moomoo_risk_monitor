import { RiskMonitorConfig } from "./config";
import { buildYahooFinanceTickerFeeds } from "./default-feeds";
import { Holding, RawEvent } from "./types";
import { Logger } from "./logger";
import { fetchRegistrySources } from "./source-registry";
import { SourceSchedulerState } from "./source-types";
import { SocialWatchlist } from "./social-watchlist";
import { fetchAlphaVantageEvents } from "./sources/alphavantage";
import { fetchManualEvents } from "./sources/manual";
import { fetchNewsApiEvents } from "./sources/newsapi";
import { fetchPriceEvents } from "./sources/price";
import { fetchRssEvents } from "./sources/rss";
import { fetchSecEvents } from "./sources/sec";

export async function fetchAllSources(
  config: RiskMonitorConfig,
  holdings: Holding[],
  logger: Logger,
  options: {
    scheduler?: SourceSchedulerState;
    socialWatchlist?: SocialWatchlist;
    setTask?: (task: string) => Promise<void>;
  } = {}
): Promise<RawEvent[]> {
  const batches: RawEvent[][] = [];

  if (config.enableSec) {
    if (options.setTask) {
      await options.setTask("采集来源：SEC submissions API");
    }
    batches.push(await safeFetch("SEC", () => fetchSecEvents({
      dataDir: config.dataDir,
      holdings,
      lookbackDays: config.secLookbackDays,
      contactEmail: config.secContactEmail
    }), logger));
  }
  if (config.sourceRegistryEnabled) {
    batches.push(await fetchRegistrySources({
      config,
      holdings,
      logger,
      scheduler: options.scheduler,
      socialWatchlist: options.socialWatchlist,
      setTask: options.setTask
    }));
  } else {
    if (config.enableRss && config.rssFeeds.length > 0) {
      batches.push(await safeFetch("新闻 RSS", () => fetchRssEvents(config.rssFeeds, "rss", config.newsLookbackHours), logger));
    }
    if (config.enablePolicyRss && config.policyFeeds.length > 0) {
      batches.push(await safeFetch("官方政策 RSS", () => fetchRssEvents(config.policyFeeds, "rss", config.newsLookbackHours), logger));
    }
    if (config.enableTickerNews) {
      const feeds = buildYahooFinanceTickerFeeds(holdings);
      batches.push(await safeFetch("持仓 Yahoo Finance RSS", () => fetchRssEvents(feeds, "rss", config.newsLookbackHours), logger));
    }
    if (config.enableSocial && config.socialFeeds.length > 0) {
      batches.push(await safeFetch("社交媒体", () => fetchRssEvents(config.socialFeeds, "social", config.newsLookbackHours), logger));
    }
  }
  if (config.enableNewsApi) {
    if (options.setTask) {
      await options.setTask("采集来源：NewsAPI");
    }
    batches.push(await safeFetch("NewsAPI", () => fetchNewsApiEvents(config.newsApiKey, holdings), logger));
  }
  if (config.enableAlphaVantage) {
    if (options.setTask) {
      await options.setTask("采集来源：Alpha Vantage");
    }
    batches.push(await safeFetch("Alpha Vantage", () => fetchAlphaVantageEvents(config.alphaVantageApiKey, holdings), logger));
  }
  if (config.enablePrice) {
    if (options.setTask) {
      await options.setTask("采集来源：价格");
    }
    batches.push(await safeFetch("价格", () => fetchPriceEvents(), logger));
  }

  if (options.setTask) {
    await options.setTask("采集来源：手动事件");
  }
  batches.push(await safeFetch("手动事件", () => fetchManualEvents(config.dataDir), logger));
  return batches.flat();
}

async function safeFetch(name: string, fetcher: () => Promise<RawEvent[]>, logger: Logger): Promise<RawEvent[]> {
  try {
    const events = await fetcher();
    await logger.info(`${name} source fetched`, { count: events.length });
    return events;
  } catch (error) {
    await logger.warn(`${name} source failed`, { error: error instanceof Error ? error.message : String(error) });
    return [];
  }
}
