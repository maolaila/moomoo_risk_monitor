import path from "node:path";
import { chromium } from "playwright-core";
import { SourceDefinition } from "../source-types";
import { RawEvent } from "../types";

export async function fetchBrowserDynamicEvents(source: SourceDefinition, lookbackHours: number): Promise<RawEvent[]> {
  if (!source.url) {
    return [];
  }
  const session = await openBrowserSession(source);
  try {
    const page = session.page;
    const response = await page.goto(source.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(source.waitMs ?? 1500);
    const anchors = await page.evaluate((selectors) => {
      const cleanText = (value: string | null | undefined) => (value || "").replace(/\s+/g, " ").trim();
      const elements = Array.from(document.querySelectorAll(selectors?.item || "a"));
      return elements.map((element, index) => {
        const linkElement = selectors?.link
          ? (element.matches(selectors.link) ? element : element.querySelector(selectors.link))
          : (element.matches("a") ? element : element.querySelector("a"));
        const titleElement = selectors?.title
          ? (element.matches(selectors.title) ? element : element.querySelector(selectors.title))
          : linkElement;
        const summaryElement = selectors?.summary ? element.querySelector(selectors.summary) : undefined;
        const dateElement = selectors?.date ? element.querySelector(selectors.date) : undefined;
        const href = linkElement instanceof HTMLAnchorElement ? linkElement.href : "";
        return {
          index,
          title: cleanText(titleElement?.textContent || linkElement?.textContent),
          href,
          summary: cleanText(summaryElement?.textContent),
          dateText: cleanText(dateElement?.textContent)
        };
      });
    }, source.selectors);
    const since = Date.now() - lookbackHours * 60 * 60 * 1000;
    const browserTitle = await page.title();
    const browserFinalUrl = page.url();
    const browserStatus = response?.status();
    const events = anchors
      .filter((item) => item.title.length >= 12 && item.href && !isLowValueTitle(item.title))
      .slice(0, source.maxItems || 30)
      .map((item) => ({
        source: source.sourceKind === "social" ? "social" : "crawler",
        id: `${source.id}:${item.href || item.index}`,
        title: item.title,
        summary: item.summary || undefined,
        url: item.href,
        publishedAt: parseDate(item.dateText),
        raw: item,
        metadata: {
          sourceId: source.id,
          sourceName: source.name,
          adapter: source.adapter,
          category: source.category,
          tier: source.tier,
          since,
          browserFinalUrl,
          browserTitle,
          browserStatus
        }
      } satisfies RawEvent));
    return dedupeByUrl(events);
  } finally {
    await session.close();
  }
}

async function openBrowserSession(source: SourceDefinition) {
  const headless = source.headless ?? true;
  const userAgent = source.userAgent || "MoomooRiskMonitor/0.1";
  if (source.profileDir) {
    const context = await chromium.launchPersistentContext(path.resolve(source.profileDir), {
      channel: "chrome",
      headless,
      userAgent
    });
    const page = context.pages()[0] || await context.newPage();
    return {
      page,
      close: () => context.close()
    };
  }

  const browser = await chromium.launch({
    channel: "chrome",
    headless
  });
  const context = await browser.newContext({ userAgent });
  const page = await context.newPage();
  return {
    page,
    close: () => browser.close()
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

function parseDate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined;
}

function isLowValueTitle(title: string): boolean {
  return /^(home|about|contact|search|subscribe|menu|privacy|terms|skip to.*|read more|learn more)$/i.test(title);
}
