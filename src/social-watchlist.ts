import fs from "node:fs/promises";
import path from "node:path";
import { runCodexStructured } from "./codex-analyzer";
import { RiskMonitorConfig } from "./config";
import { Holding } from "./types";
import { ensureDir, fileExists, nowIso, readJsonFile, sha256, uniqueValues, writeJson } from "./utils";
import { Logger } from "./logger";

export interface SocialWatchlistAccount {
  platform: "x" | "truth_social" | "other";
  handle: string;
  displayName: string;
  priority: "high" | "medium" | "low";
  rationale: string;
  relatedTickers: string[];
  tags: string[];
}

export interface SocialWatchlist {
  kind: "SOCIAL_WATCHLIST";
  createdAt: string;
  updatedAt: string;
  holdingsFingerprint: string;
  holdingsTickers: string[];
  generatedBy: "codex" | "fallback";
  accounts: SocialWatchlistAccount[];
}

export async function loadOrUpdateSocialWatchlist(options: {
  config: RiskMonitorConfig;
  holdings: Holding[];
  logger: Logger;
  force?: boolean;
}): Promise<SocialWatchlist | undefined> {
  if (!options.config.socialWatchlistEnabled) {
    return undefined;
  }

  const fingerprint = buildHoldingsFingerprint(options.holdings);
  const existing = await loadSocialWatchlist(options.config.socialWatchlistPath);
  if (!options.force && existing?.holdingsFingerprint === fingerprint) {
    await options.logger.info("social watchlist reused", {
      holdingsFingerprint: fingerprint,
      accounts: existing.accounts.length
    });
    return existing;
  }

  let generated: SocialWatchlist;
  if (options.config.codexEnabled && options.config.socialWatchlistAutoUpdate) {
    try {
      generated = await generateWithCodex(options.config, options.holdings, fingerprint, existing);
    } catch (error) {
      await options.logger.warn("social watchlist Codex update failed; using fallback", {
        error: error instanceof Error ? error.message : String(error)
      });
      generated = fallbackWatchlist(options.holdings, fingerprint, existing);
    }
  } else {
    generated = fallbackWatchlist(options.holdings, fingerprint, existing);
  }

  await ensureDir(path.dirname(options.config.socialWatchlistPath));
  await writeJson(options.config.socialWatchlistPath, generated);
  await options.logger.info("social watchlist updated", {
    holdingsFingerprint: fingerprint,
    generatedBy: generated.generatedBy,
    accounts: generated.accounts.length
  });
  return generated;
}

export function buildHoldingsFingerprint(holdings: Holding[]): string {
  const rows = holdings
    .map((holding) => ({
      ticker: holding.ticker.toUpperCase(),
      name: holding.name || ""
    }))
    .sort((a, b) => a.ticker.localeCompare(b.ticker));
  return sha256(JSON.stringify(rows));
}

export function extractXHandles(watchlist: SocialWatchlist | undefined): string[] {
  if (!watchlist) {
    return [];
  }
  return uniqueValues(watchlist.accounts
    .filter((account) => account.platform === "x")
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))
    .map((account) => account.handle.replace(/^@/, "")));
}

async function loadSocialWatchlist(filePath: string): Promise<SocialWatchlist | undefined> {
  if (!(await fileExists(filePath))) {
    return undefined;
  }
  try {
    return await readJsonFile<SocialWatchlist>(filePath);
  } catch {
    await fs.rename(filePath, `${filePath}.invalid-${Date.now()}`);
    return undefined;
  }
}

async function generateWithCodex(config: RiskMonitorConfig, holdings: Holding[], fingerprint: string, existing?: SocialWatchlist): Promise<SocialWatchlist> {
  const prompt = await fs.readFile(path.resolve("prompts", "social-watchlist.md"), "utf8");
  const result = await runCodexStructured<{ accounts: SocialWatchlistAccount[] }>(config, {
    system_task: "Build a concise public social-media watchlist for portfolio risk monitoring. Return JSON only.",
    prompt,
    holdings: holdings.map((holding) => ({
      ticker: holding.ticker,
      name: holding.name,
      portfolioWeight: holding.portfolioWeight,
      stockBookWeight: holding.stockBookWeight
    })),
    existingAccounts: existing?.accounts || [],
    required_output: {
      accounts: [{
        platform: "x | truth_social | other",
        handle: "public account handle or URL-safe account id",
        displayName: "public display name",
        priority: "high | medium | low",
        rationale: "why this account matters for current holdings",
        relatedTickers: ["ticker or theme"],
        tags: ["policy | fed | company | sector | ai | semiconductor | optical | quantum"]
      }]
    }
  }, config.socialWatchlistSchema);

  return finalizeWatchlist(result.accounts, holdings, fingerprint, "codex", existing);
}

export function fallbackWatchlist(holdings: Holding[], fingerprint = buildHoldingsFingerprint(holdings), existing?: SocialWatchlist): SocialWatchlist {
  const accounts: SocialWatchlistAccount[] = [
    {
      platform: "x",
      handle: "realDonaldTrump",
      displayName: "Donald J. Trump",
      priority: "high",
      rationale: "Trump public comments can move tariff, China, export control, and growth-stock risk sentiment.",
      relatedTickers: holdings.map((holding) => holding.ticker.toUpperCase()),
      tags: ["policy", "tariff", "china", "market"]
    },
    {
      platform: "x",
      handle: "WhiteHouse",
      displayName: "The White House",
      priority: "high",
      rationale: "Official White House policy messaging can affect tariffs, sanctions, export controls, and market risk.",
      relatedTickers: holdings.map((holding) => holding.ticker.toUpperCase()),
      tags: ["policy", "official"]
    },
    {
      platform: "x",
      handle: "FederalReserve",
      displayName: "Federal Reserve",
      priority: "high",
      rationale: "Rate, inflation, and liquidity messaging can affect high-growth technology holdings.",
      relatedTickers: holdings.map((holding) => holding.ticker.toUpperCase()),
      tags: ["fed", "rates", "macro"]
    },
    {
      platform: "x",
      handle: "CommerceGov",
      displayName: "U.S. Commerce Dept.",
      priority: "medium",
      rationale: "Commerce policy can affect export controls, semiconductor supply chains, and China restrictions.",
      relatedTickers: holdings.map((holding) => holding.ticker.toUpperCase()),
      tags: ["commerce", "export-control", "semiconductor"]
    },
    {
      platform: "x",
      handle: "USTreasury",
      displayName: "U.S. Treasury",
      priority: "medium",
      rationale: "Treasury sanctions and macro policy can affect China-sensitive technology holdings.",
      relatedTickers: holdings.map((holding) => holding.ticker.toUpperCase()),
      tags: ["treasury", "sanctions", "macro"]
    }
  ];
  return finalizeWatchlist([...(existing?.accounts || []), ...accounts], holdings, fingerprint, "fallback", existing);
}

function finalizeWatchlist(accounts: SocialWatchlistAccount[], holdings: Holding[], fingerprint: string, generatedBy: SocialWatchlist["generatedBy"], existing?: SocialWatchlist): SocialWatchlist {
  const createdAt = existing?.createdAt || nowIso();
  return {
    kind: "SOCIAL_WATCHLIST",
    createdAt,
    updatedAt: nowIso(),
    holdingsFingerprint: fingerprint,
    holdingsTickers: holdings.map((holding) => holding.ticker.toUpperCase()).sort(),
    generatedBy,
    accounts: dedupeAccounts(accounts).slice(0, 30)
  };
}

function dedupeAccounts(accounts: SocialWatchlistAccount[]): SocialWatchlistAccount[] {
  const seen = new Set<string>();
  return accounts.filter((account) => {
    const key = `${account.platform}:${account.handle.replace(/^@/, "").toLowerCase()}`;
    if (!account.handle || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function priorityRank(priority: SocialWatchlistAccount["priority"]): number {
  if (priority === "high") {
    return 0;
  }
  if (priority === "medium") {
    return 1;
  }
  return 2;
}
