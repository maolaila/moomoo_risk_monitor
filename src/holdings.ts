import fs from "node:fs/promises";
import path from "node:path";
import { Holding, SanitizedHoldingExposure } from "./types";
import { compactNumber, readJsonFile } from "./utils";

export interface HoldingsLoadResult {
  sourceFile: string;
  snapshotDate?: string;
  holdings: Holding[];
}

export async function loadLatestHoldings(snapshotDir: string): Promise<HoldingsLoadResult> {
  const files = (await fs.readdir(snapshotDir).catch(() => []))
    .filter((file) => /^snapshot_\d{4}-\d{2}-\d{2}\.json$/i.test(file))
    .sort()
    .reverse();

  if (files.length === 0) {
    throw new Error("No Moomoo snapshot found under data/raw/moomoo-api/snapshot_*.json. Run npm run moomoo:snapshot first.");
  }

  const sourceFile = path.join(snapshotDir, files[0]);
  const payload = await readJsonFile<any>(sourceFile);
  const positionList = payload?.response?.positions?.s2c?.positionList || [];
  const funds = payload?.response?.funds?.s2c?.funds || {};
  const totalAssets = compactNumber(funds.totalAssets) || 0;
  const marketVal = compactNumber(funds.marketVal) || 0;
  const snapshotDate = files[0].replace(/^snapshot_/, "").replace(/\.json$/i, "");

  const holdings: Holding[] = positionList
    .map((item: any) => {
      const quantity = compactNumber(item.qty) || 0;
      const marketValue = compactNumber(item.val);
      return {
        ticker: String(item.code || "").trim().toUpperCase(),
        name: String(item.name || "").trim() || undefined,
        quantity,
        price: compactNumber(item.price),
        marketValueUsd: marketValue,
        averageCost: compactNumber(item.averageCostPrice ?? item.costPrice),
        unrealizedPL: compactNumber(item.unrealizedPL ?? item.plVal),
        portfolioWeight: totalAssets > 0 && marketValue !== undefined ? marketValue / totalAssets : undefined,
        stockBookWeight: marketVal > 0 && marketValue !== undefined ? marketValue / marketVal : undefined,
        sourceFile,
        snapshotDate
      } satisfies Holding;
    })
    .filter((item: Holding) => item.ticker.length > 0 && item.quantity !== 0);

  return { sourceFile, snapshotDate, holdings };
}

export function sanitizeHoldingExposure(holding: Holding): SanitizedHoldingExposure {
  return {
    ticker: holding.ticker,
    name: holding.name,
    quantity: holding.quantity,
    marketValueUsd: holding.marketValueUsd,
    portfolioWeight: holding.portfolioWeight,
    stockBookWeight: holding.stockBookWeight
  };
}
