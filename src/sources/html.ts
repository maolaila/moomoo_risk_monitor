import { load, type CheerioAPI } from "cheerio";
import { SourceDefinition } from "../source-types";
import { RawEvent } from "../types";

export async function fetchHtmlStaticEvents(source: SourceDefinition, lookbackHours: number): Promise<RawEvent[]> {
  if (!source.url) {
    return [];
  }
  const response = await fetch(source.url, {
    headers: {
      "User-Agent": source.userAgent || "MoomooRiskMonitor/0.1"
    },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    throw new Error(`HTML fetch failed ${response.status}: ${source.url}`);
  }
  const html = await response.text();
  const $ = load(html);
  const events = source.selectors?.item
    ? extractSelectedItems($, source, html, lookbackHours)
    : extractGenericLinks($, source, html);
  return events.slice(0, source.maxItems || 30);
}

function extractSelectedItems($: CheerioAPI, source: SourceDefinition, html: string, lookbackHours: number): RawEvent[] {
  const events: RawEvent[] = [];
  const selectors = source.selectors!;
  const since = Date.now() - lookbackHours * 60 * 60 * 1000;

  $(selectors.item!).each((index, element) => {
    const item = $(element);
    const linkElement = selectors.link
      ? (item.is(selectors.link) ? item : item.find(selectors.link).first())
      : (item.is("a") ? item : item.find("a").first());
    const titleElement = selectors.title
      ? (item.is(selectors.title) ? item : item.find(selectors.title).first())
      : linkElement;
    const title = cleanText(titleElement.text());
    const href = linkElement.attr("href");
    if (!title || title.length < 12 || !href || isLowValueTitle(title)) {
      return;
    }
    const url = absoluteUrl(href, source.url!);
    const summary = selectors.summary ? cleanText(item.find(selectors.summary).first().text()) : undefined;
    const publishedAt = selectors.date ? parseDate(cleanText(item.find(selectors.date).first().text())) : undefined;
    if (publishedAt && new Date(publishedAt).getTime() < since) {
      return;
    }
    events.push(rawCrawlerEvent(source, title, summary, url, publishedAt, index, html));
  });

  return dedupeByUrl(events);
}

function extractGenericLinks($: CheerioAPI, source: SourceDefinition, html: string): RawEvent[] {
  const events: RawEvent[] = [];
  $("a").each((index, element) => {
    const title = cleanText($(element).text());
    const href = $(element).attr("href");
    if (!title || !href || title.length < 12 || isLowValueTitle(title)) {
      return;
    }
    const url = absoluteUrl(href, source.url!);
    if (!sameSiteOrOfficialUrl(url, source.url!)) {
      return;
    }
    events.push(rawCrawlerEvent(source, title, undefined, url, undefined, index, html));
  });
  return dedupeByUrl(events);
}

function rawCrawlerEvent(source: SourceDefinition, title: string, summary: string | undefined, url: string, publishedAt: string | undefined, index: number, html: string): RawEvent {
  return {
    source: source.sourceKind === "social" ? "social" : "crawler",
    id: `${source.id}:${url || index}`,
    title,
    summary,
    url,
    publishedAt,
    raw: {
      sourceId: source.id,
      sourceName: source.name,
      index,
      htmlLength: html.length
    },
    metadata: {
      sourceId: source.id,
      sourceName: source.name,
      adapter: source.adapter,
      category: source.category,
      tier: source.tier
    }
  };
}

function dedupeByUrl(events: RawEvent[]): RawEvent[] {
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

function absoluteUrl(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function sameSiteOrOfficialUrl(candidate: string, base: string): boolean {
  try {
    const candidateHost = new URL(candidate).hostname.replace(/^www\./, "");
    const baseHost = new URL(base).hostname.replace(/^www\./, "");
    return candidateHost === baseHost || candidateHost.endsWith(`.${baseHost}`);
  } catch {
    return false;
  }
}

function parseDate(value: string): string | undefined {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined;
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isLowValueTitle(title: string): boolean {
  return /^(home|about|contact|search|subscribe|menu|privacy|terms|skip to.*|read more|learn more)$/i.test(title);
}
