import { Holding, RawEvent } from "../types";

export async function fetchNewsApiEvents(apiKey: string | undefined, holdings: Holding[]): Promise<RawEvent[]> {
  if (!apiKey) {
    return [];
  }
  const events: RawEvent[] = [];
  for (const holding of holdings) {
    const query = encodeURIComponent(`("${holding.ticker}" OR "${holding.name || holding.ticker}") AND (stock OR shares OR earnings OR guidance OR lawsuit OR offering)`);
    const url = `https://newsapi.org/v2/everything?q=${query}&sortBy=publishedAt&pageSize=10&apiKey=${encodeURIComponent(apiKey)}`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        continue;
      }
      const payload = await response.json() as any;
      for (const article of payload.articles || []) {
        events.push({
          source: "newsapi",
          ticker: holding.ticker,
          title: String(article.title || ""),
          summary: article.description || article.content,
          url: article.url,
          publishedAt: article.publishedAt,
          raw: article
        });
      }
    } catch {
      continue;
    }
  }
  return events.filter((event) => event.title);
}
