import { Holding, RawEvent } from "../types";

export async function fetchAlphaVantageEvents(apiKey: string | undefined, holdings: Holding[]): Promise<RawEvent[]> {
  if (!apiKey || holdings.length === 0) {
    return [];
  }
  const tickers = holdings.map((holding) => holding.ticker).join(",");
  const url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${encodeURIComponent(tickers)}&apikey=${encodeURIComponent(apiKey)}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return [];
    }
    const payload = await response.json() as any;
    return (payload.feed || []).map((item: any) => ({
      source: "alphavantage",
      title: String(item.title || ""),
      summary: item.summary,
      url: item.url,
      publishedAt: parseAlphaTime(item.time_published),
      raw: item
    })).filter((event: RawEvent) => event.title);
  } catch {
    return [];
  }
}

function parseAlphaTime(value: unknown): string | undefined {
  const raw = String(value || "");
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (!match) {
    return undefined;
  }
  const [, y, m, d, hh, mm, ss] = match;
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}Z`;
}
