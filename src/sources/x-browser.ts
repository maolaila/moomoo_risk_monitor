import path from "node:path";
import { chromium, type Page } from "playwright-core";
import { SourceDefinition } from "../source-types";
import { RawEvent } from "../types";
import { ensureDir, sleep } from "../utils";

interface TweetRow {
  account: string;
  text: string;
  url?: string;
  publishedAt?: string;
}

export async function fetchXBrowserEvents(source: SourceDefinition, lookbackHours: number): Promise<RawEvent[]> {
  const accounts = (source.accounts || []).map((account) => account.trim()).filter(Boolean);
  if (!accounts.length) {
    return [];
  }

  const profileDir = path.resolve(source.profileDir || process.env.X_BROWSER_USER_DATA_DIR || "./.browser/x-profile");
  await ensureDir(profileDir);
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: "chrome",
    headless: source.headless ?? false,
    viewport: { width: 1280, height: 900 },
    userAgent: source.userAgent || "Mozilla/5.0 MoomooRiskMonitor/0.1"
  });

  try {
    const page = await context.newPage();
    const rows: TweetRow[] = [];
    const since = Date.now() - lookbackHours * 60 * 60 * 1000;
    const throttleMs = Math.max(1000, source.throttleMs ?? 10000);

    for (let index = 0; index < accounts.length; index += 1) {
      const account = accounts[index];
      await page.goto(xAccountUrl(account), { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(3000);
      rows.push(...await scrapeTweets(page, account, source.maxItemsPerAccount || source.maxItems || 5, since));
      if (index < accounts.length - 1) {
        await sleep(throttleMs);
      }
    }

    return dedupeRows(rows).map((row) => ({
      source: "social",
      id: `${source.id}:${row.account}:${row.url || row.text.slice(0, 80)}`,
      title: firstLine(row.text),
      summary: row.text,
      url: row.url,
      publishedAt: row.publishedAt,
      raw: row,
      metadata: {
        sourceId: source.id,
        sourceName: source.name,
        adapter: source.adapter,
        category: source.category,
        tier: source.tier,
        account: row.account,
        profileDir
      }
    } satisfies RawEvent));
  } finally {
    await context.close();
  }
}

export function xAccountUrl(account: string): string {
  if (/^https?:\/\//i.test(account)) {
    return account;
  }
  return `https://x.com/${account.replace(/^@/, "")}`;
}

async function scrapeTweets(page: Page, account: string, maxItems: number, since: number): Promise<TweetRow[]> {
  return page.$$eval("article", (articles, args) => {
    const rows: TweetRow[] = [];
    for (const article of articles) {
      const text = (article.textContent || "").replace(/\s+/g, " ").trim();
      if (!text || text.length < 10) {
        continue;
      }
      const link = Array.from(article.querySelectorAll("a"))
        .map((anchor) => (anchor as HTMLAnchorElement).href)
        .find((href) => /\/status\/\d+/.test(href));
      const time = article.querySelector("time")?.getAttribute("datetime") || undefined;
      if (time) {
        const published = new Date(time).getTime();
        if (Number.isFinite(published) && published < args.since) {
          continue;
        }
      }
      rows.push({ account: args.account, text, url: link, publishedAt: time });
      if (rows.length >= args.maxItems) {
        break;
      }
    }
    return rows;
  }, { account, maxItems, since });
}

function dedupeRows(rows: TweetRow[]): TweetRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = row.url || `${row.account}:${row.text}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function firstLine(value: string): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length > 180 ? `${cleaned.slice(0, 177)}...` : cleaned;
}
