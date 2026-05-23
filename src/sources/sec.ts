import fs from "node:fs/promises";
import path from "node:path";
import { Holding, RawEvent } from "../types";
import { ensureDir, fileExists, readJsonFile, writeJson } from "../utils";

interface SecTickerRow {
  cik_str: number;
  ticker: string;
  title: string;
}

export async function fetchSecEvents(options: {
  dataDir: string;
  holdings: Holding[];
  lookbackDays: number;
  contactEmail: string;
}): Promise<RawEvent[]> {
  const cache = await loadTickerCikCache(options.dataDir, options.contactEmail);
  const since = Date.now() - options.lookbackDays * 24 * 60 * 60 * 1000;
  const events: RawEvent[] = [];

  for (const holding of options.holdings) {
    const cik = cache[holding.ticker];
    if (!cik) {
      continue;
    }
    try {
      const response = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
        headers: {
          "User-Agent": `MoomooRiskMonitor/0.1 ${options.contactEmail}`
        }
      });
      if (!response.ok) {
        continue;
      }
      const payload = await response.json() as any;
      const recent = payload?.filings?.recent || {};
      const forms = recent.form || [];
      const dates = recent.filingDate || [];
      const accessionNumbers = recent.accessionNumber || [];
      const primaryDocuments = recent.primaryDocument || [];
      for (let index = 0; index < forms.length; index += 1) {
        const filingDate = String(dates[index] || "");
        if (!filingDate || new Date(`${filingDate}T00:00:00Z`).getTime() < since) {
          continue;
        }
        const formType = String(forms[index] || "");
        const accession = String(accessionNumbers[index] || "");
        const primaryDocument = String(primaryDocuments[index] || "");
        const accessionPath = accession.replace(/-/g, "");
        const url = accession && primaryDocument
          ? `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accessionPath}/${primaryDocument}`
          : undefined;
        events.push({
          source: "sec",
          ticker: holding.ticker,
          title: `SEC filing: ${holding.ticker} ${formType} filed ${filingDate}`,
          summary: `${holding.name || holding.ticker} filed SEC form ${formType}.`,
          url,
          publishedAt: `${filingDate}T00:00:00Z`,
          raw: {
            ticker: holding.ticker,
            cik,
            formType,
            filingDate,
            accession,
            primaryDocument
          },
          metadata: {
            formType,
            cik,
            companyName: holding.name
          }
        });
      }
    } catch {
      continue;
    }
  }

  return events;
}

async function loadTickerCikCache(dataDir: string, contactEmail: string): Promise<Record<string, string>> {
  const cachePath = path.join(dataDir, "sec_ticker_cik_cache.json");
  if (await fileExists(cachePath)) {
    return readJsonFile<Record<string, string>>(cachePath);
  }

  await ensureDir(dataDir);
  try {
    const response = await fetch("https://www.sec.gov/files/company_tickers.json", {
      headers: {
        "User-Agent": `MoomooRiskMonitor/0.1 ${contactEmail}`
      }
    });
    if (!response.ok) {
      return fallbackCache();
    }
    const payload = await response.json() as Record<string, SecTickerRow>;
    const cache: Record<string, string> = {};
    for (const row of Object.values(payload)) {
      cache[row.ticker.toUpperCase()] = String(row.cik_str).padStart(10, "0");
    }
    await writeJson(cachePath, cache);
    return cache;
  } catch {
    await fs.writeFile(cachePath, `${JSON.stringify(fallbackCache(), null, 2)}\n`, "utf8");
    return fallbackCache();
  }
}

function fallbackCache(): Record<string, string> {
  return {
    AAOI: "0001158114",
    CIEN: "0000936395",
    IONQ: "0001824920",
    LITE: "0001633978",
    SNDK: "0001000180",
    VIAV: "0000912093"
  };
}
