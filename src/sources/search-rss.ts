import { SourceDefinition } from "../source-types";
import { Holding, RawEvent } from "../types";
import { uniqueValues } from "../utils";
import { fetchRssEvents } from "./rss";

export async function fetchTickerRssEvents(source: SourceDefinition, holdings: Holding[], lookbackHours: number): Promise<RawEvent[]> {
  if (!source.urlTemplate) {
    return [];
  }
  const urls = uniqueValues(holdings.map((holding) => source.urlTemplate!.replace("{ticker}", encodeURIComponent(holding.ticker.toUpperCase()))));
  return fetchRssEvents(urls, source.sourceKind === "social" ? "social" : "rss", lookbackHours, {
    sourceId: source.id,
    sourceName: source.name,
    maxItems: source.maxItems
  });
}

export async function fetchSearchRssEvents(source: SourceDefinition, holdings: Holding[], lookbackHours: number): Promise<RawEvent[]> {
  if (!source.urlTemplate || !source.queries?.length) {
    return [];
  }
  const queries = source.perTicker
    ? expandPerTickerQueries(source.queries, holdings)
    : source.queries;
  const limited = uniqueValues(queries).slice(0, source.maxQueries || queries.length);
  const urls = limited.map((query) => source.urlTemplate!.replace("{query}", encodeURIComponent(query)));
  const events = await fetchRssEvents(urls, "rss", lookbackHours, {
    sourceId: source.id,
    sourceName: source.name,
    maxItems: source.maxItems
  });
  return events.map((event) => ({
    ...event,
    source: "search" as const,
    metadata: {
      ...event.metadata,
      adapter: source.adapter,
      category: source.category
    }
  } satisfies RawEvent));
}

function expandPerTickerQueries(templates: string[], holdings: Holding[]): string[] {
  const queries: string[] = [];
  for (const holding of holdings) {
    for (const template of templates) {
      queries.push(template
        .replace(/\{ticker\}/g, holding.ticker.toUpperCase())
        .replace(/\{name\}/g, holding.name || holding.ticker.toUpperCase()));
    }
  }
  return queries;
}
