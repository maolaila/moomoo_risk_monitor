import Parser from "rss-parser";
import { RawEvent } from "../types";

interface RssFetchOptions {
  sourceId?: string;
  sourceName?: string;
  maxItems?: number;
}

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent": "MoomooRiskMonitor/0.1"
  }
});

export async function fetchRssEvents(feeds: string[], source: "rss" | "social", lookbackHours?: number, options: RssFetchOptions = {}): Promise<RawEvent[]> {
  const events: RawEvent[] = [];
  const since = lookbackHours ? Date.now() - lookbackHours * 60 * 60 * 1000 : undefined;
  for (const feed of feeds) {
    try {
      const parsed = await parser.parseURL(feed);
      for (const item of parsed.items || []) {
        if (options.maxItems && events.length >= options.maxItems) {
          break;
        }
        const title = String(item.title || "").trim();
        if (!title) {
          continue;
        }
        const publishedAt = item.isoDate || item.pubDate;
        if (since && publishedAt) {
          const publishedTime = new Date(publishedAt).getTime();
          if (Number.isFinite(publishedTime) && publishedTime < since) {
            continue;
          }
        }
        events.push({
          source,
          id: item.guid || item.id || item.link,
          title,
          summary: cleanHtml(String(item.contentSnippet || item.content || item.summary || "")),
          url: item.link,
          publishedAt,
          raw: item,
          metadata: {
            sourceId: options.sourceId,
            sourceName: options.sourceName,
            feed,
            feedTitle: parsed.title
          }
        });
      }
    } catch (error) {
      continue;
    }
  }
  return events;
}

function cleanHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
