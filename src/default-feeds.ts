import { Holding } from "./types";

export const defaultNewsFeeds = [
  "https://seekingalpha.com/market_currents.xml",
  "https://www.cnbc.com/id/100003114/device/rss/rss.html",
  "https://www.marketwatch.com/rss/topstories"
];

export const defaultPolicyFeeds = [
  "https://www.whitehouse.gov/briefings-statements/feed/",
  "https://www.federalreserve.gov/feeds/press_all.xml",
  "https://www.federalreserve.gov/feeds/speeches.xml"
];

export const defaultSocialFeeds = [
  "https://truthsocial.com/@realDonaldTrump.rss"
];

export function buildYahooFinanceTickerFeeds(holdings: Holding[]): string[] {
  const tickers = [...new Set(holdings.map((holding) => holding.ticker.toUpperCase()).filter(Boolean))];
  return tickers.map((ticker) => `https://finance.yahoo.com/rss/headline?s=${encodeURIComponent(ticker)}`);
}
