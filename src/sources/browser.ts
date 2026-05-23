import { chromium } from "playwright-core";
import { SourceDefinition } from "../source-types";
import { RawEvent } from "../types";

export async function fetchBrowserDynamicEvents(source: SourceDefinition, lookbackHours: number): Promise<RawEvent[]> {
  if (!source.url) {
    return [];
  }
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true
  });
  try {
    const page = await browser.newPage({
      userAgent: source.userAgent || "MoomooRiskMonitor/0.1"
    });
    await page.goto(source.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1500);
    const anchors = await page.$$eval("a", (items) => items.map((item, index) => ({
      index,
      title: (item.textContent || "").replace(/\s+/g, " ").trim(),
      href: (item as HTMLAnchorElement).href
    })));
    const since = Date.now() - lookbackHours * 60 * 60 * 1000;
    const events = anchors
      .filter((item) => item.title.length >= 12 && item.href)
      .slice(0, source.maxItems || 30)
      .map((item) => ({
        source: source.sourceKind === "social" ? "social" : "crawler",
        id: `${source.id}:${item.href || item.index}`,
        title: item.title,
        url: item.href,
        raw: item,
        metadata: {
          sourceId: source.id,
          sourceName: source.name,
          adapter: source.adapter,
          category: source.category,
          tier: source.tier,
          since
        }
      } satisfies RawEvent));
    return dedupeByUrl(events);
  } finally {
    await browser.close();
  }
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
