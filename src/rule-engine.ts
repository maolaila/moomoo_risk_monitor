import { loadAliases } from "./aliases";
import { sanitizeHoldingExposure } from "./holdings";
import { CandidateEvent, Direction, Holding, NormalizedEvent, RuleMatch, Severity } from "./types";
import { escalate, maxSeverity, normalizeText, nowIso, severityGte } from "./utils";

const bearishKeywords = [
  "offering",
  "public offering",
  "secondary offering",
  "share sale",
  "convertible notes",
  "convertible senior notes",
  "dilution",
  "atm offering",
  "at-the-market",
  "guidance cut",
  "lowered guidance",
  "preliminary results",
  "misses estimates",
  "profit warning",
  "revenue warning",
  "margin pressure",
  "material weakness",
  "restatement",
  "sec investigation",
  "doj investigation",
  "subpoena",
  "class action",
  "lawsuit",
  "fraud",
  "resignation",
  "cfo resignation",
  "ceo resignation",
  "bankruptcy",
  "going concern",
  "delisting",
  "export control",
  "sanctions",
  "customer loss",
  "contract cancellation"
];

const bullishKeywords = [
  "raises guidance",
  "beats estimates",
  "major contract",
  "large customer",
  "nvidia partnership",
  "hyperscaler order",
  "ai data center demand",
  "strategic investment",
  "buyback",
  "acquisition premium",
  "government contract",
  "long-term supply agreement"
];

const sectorKeywords = [
  "ai infrastructure",
  "optical networking",
  "800g",
  "1.6t",
  "data center",
  "hyperscaler",
  "nand",
  "flash memory",
  "ssd",
  "semiconductor capex",
  "quantum computing",
  "interest rates",
  "fed",
  "federal reserve",
  "powell",
  "rate cut",
  "rate hike",
  "cpi",
  "pce",
  "nonfarm payrolls",
  "treasury yields",
  "usdjpy",
  "export controls",
  "export control",
  "tariff",
  "tariffs",
  "white house",
  "executive order",
  "commerce department",
  "bureau of industry and security",
  "bis",
  "china restrictions",
  "trade restrictions"
];

const secSeverity: Record<string, Severity> = {
  "8-K": "HIGH",
  "10-Q": "MEDIUM",
  "10-K": "MEDIUM",
  "S-3": "HIGH",
  "S-1": "HIGH",
  "424B": "HIGH",
  "424B5": "HIGH",
  "4": "MEDIUM",
  "13D": "MEDIUM",
  "13G": "MEDIUM"
};

const holdingSectorTerms: Record<string, string[]> = {
  AAOI: ["applied optoelectronics", "optical networking", "optical transceiver", "data center", "800g", "1.6t", "ai infrastructure"],
  CIEN: ["ciena", "optical networking", "data center", "hyperscaler", "800g", "1.6t", "ai infrastructure"],
  IONQ: ["ionq", "quantum computing", "quantum computer"],
  LITE: ["lumentum", "optical networking", "optical transceiver", "data center", "800g", "1.6t"],
  SNDK: ["sandisk", "nand", "flash memory", "ssd", "memory chips", "semiconductor"],
  VIAV: ["viavi", "network testing", "optical testing", "semiconductor test", "ai infrastructure"]
};

export async function runRuleEngine(dataDir: string, events: NormalizedEvent[], holdings: Holding[]): Promise<CandidateEvent[]> {
  const aliases = await loadAliases(dataDir);
  const candidates: CandidateEvent[] = [];

  for (const event of events) {
    const matchedHoldings = matchHoldings(event, holdings, aliases);
    if (matchedHoldings.length === 0) {
      continue;
    }
    event.matchedTickers = matchedHoldings.map((holding) => holding.ticker);
    const rules = buildRules(event, matchedHoldings);
    if (rules.length === 0) {
      continue;
    }
    const highest = maxSeverity(rules.map((rule) => rule.severity));
    const exposures = matchedHoldings.map(sanitizeHoldingExposure);
    const shouldInvokeCodex = shouldInvoke(event, rules, matchedHoldings, highest);
    candidates.push({
      event,
      matchedHoldingExposure: exposures,
      rules,
      highestRuleSeverity: highest,
      shouldInvokeCodex,
      candidateCreatedAt: nowIso()
    });
  }

  return candidates;
}

function matchHoldings(event: NormalizedEvent, holdings: Holding[], aliases: Record<string, string[]>): Holding[] {
  const text = normalizeText(`${event.title} ${event.summary || ""}`);
  const explicitTickers = new Set(event.matchedTickers.map((ticker) => ticker.toUpperCase()));
  const matched: Holding[] = [];

  for (const holding of holdings) {
    const ticker = holding.ticker.toUpperCase();
    const terms = [ticker, holding.name || "", ...(aliases[ticker] || [])].filter(Boolean);
    const direct = explicitTickers.has(ticker);
    const inText = terms.some((term) => hasTerm(text, term));
    const sectorRelevant = (holdingSectorTerms[ticker] || []).some((term) => hasTerm(text, term));
    if (direct || inText || sectorRelevant) {
      matched.push(holding);
    }
  }

  return matched;
}

function buildRules(event: NormalizedEvent, holdings: Holding[]): RuleMatch[] {
  const text = normalizeText(`${event.title} ${event.summary || ""}`);
  const rules: RuleMatch[] = [];

  for (const keyword of bearishKeywords) {
    if (text.includes(keyword)) {
      rules.push(rule(`bearish.${keyword.replace(/\W+/g, "_")}`, "重大负面关键词", "HIGH", "bearish", `命中负面关键词: ${keyword}`, 0.9));
    }
  }

  for (const keyword of bullishKeywords) {
    if (text.includes(keyword)) {
      rules.push(rule(`bullish.${keyword.replace(/\W+/g, "_")}`, "重大正面关键词", "MEDIUM", "bullish", `命中正面关键词: ${keyword}`, 0.75));
    }
  }

  for (const keyword of sectorKeywords) {
    if (text.includes(keyword)) {
      const hasBearish = rules.some((item) => item.directionHint === "bearish");
      rules.push(rule(`sector.${keyword.replace(/\W+/g, "_")}`, "板块/宏观风险", hasBearish ? "HIGH" : "MEDIUM", hasBearish ? "mixed" : "unknown", `命中板块或宏观关键词: ${keyword}`, 0.65));
    }
  }

  if (event.source === "social") {
    const trumpOrPolicy = /trump|tariff|export|sanction|china|semiconductor|ai|fed|rate|powell|truth social/i.test(text);
    if (trumpOrPolicy) {
      rules.push(rule("social.policy_shock", "社交媒体政策冲击", "MEDIUM", "mixed", "社交媒体来源可能涉及政策或市场冲击", 0.6));
    }
  }

  if (event.source === "sec") {
    const formType = String(event.metadata?.formType || "");
    const base = secSeverity[formType];
    if (base) {
      rules.push(rule(`sec.${formType}`, "SEC 文件", base, secDirection(formType), `持仓公司提交 SEC ${formType}`, 0.95));
    }
  }

  for (const holding of holdings) {
    const portfolioWeight = holding.portfolioWeight || 0;
    const stockBookWeight = holding.stockBookWeight || 0;
    if (rules.length > 0 && hasEscalatableRisk(rules) && (portfolioWeight >= 0.15 || stockBookWeight >= 0.35)) {
      rules.push(rule("exposure.force_high", "高仓位暴露", "HIGH", "unknown", `${holding.ticker} 仓位权重较高`, 1));
    } else if (rules.length > 0 && hasEscalatableRisk(rules) && (portfolioWeight >= 0.10 || stockBookWeight >= 0.25)) {
      const existing = maxSeverity(rules.map((item) => item.severity));
      rules.push(rule("exposure.escalate", "仓位暴露升级", escalate(existing), "unknown", `${holding.ticker} 仓位较高，风险等级上调`, 1));
    }
  }

  return dedupeRules(rules);
}

function shouldInvoke(event: NormalizedEvent, rules: RuleMatch[], holdings: Holding[], highest: Severity): boolean {
  if (severityGte(highest, "HIGH")) {
    return true;
  }
  if (event.source === "sec" && ["8-K", "10-Q", "10-K", "S-3", "S-1", "424B", "424B5", "4"].includes(String(event.metadata?.formType || ""))) {
    return true;
  }
  if (rules.some((item) => item.ruleId.startsWith("bearish."))) {
    return true;
  }
  if (hasEscalatableRisk(rules) && rules.some((item) => item.ruleId.includes("sector") || item.ruleId.includes("social"))) {
    return holdings.some((holding) => (holding.portfolioWeight || 0) >= 0.10 || (holding.stockBookWeight || 0) >= 0.25);
  }
  return false;
}

function hasEscalatableRisk(rules: RuleMatch[]): boolean {
  return rules.some((item) =>
    item.ruleId.startsWith("bearish.") ||
    item.ruleId.startsWith("sec.") ||
    item.ruleId === "social.policy_shock" ||
    isPolicyRiskRule(item.ruleId)
  );
}

function isPolicyRiskRule(ruleId: string): boolean {
  return [
    "sector.export_control",
    "sector.export_controls",
    "sector.sanctions",
    "sector.tariff",
    "sector.tariffs",
    "sector.white_house",
    "sector.executive_order",
    "sector.commerce_department",
    "sector.bureau_of_industry_and_security",
    "sector.bis",
    "sector.china_restrictions",
    "sector.trade_restrictions"
  ].includes(ruleId);
}

function secDirection(formType: string): Direction {
  return ["S-3", "S-1", "424B", "424B5"].includes(formType) ? "bearish" : "unknown";
}

function rule(ruleId: string, label: string, severity: Severity, directionHint: Direction, reason: string, confidence: number): RuleMatch {
  return { ruleId, label, severity, directionHint, reason, confidence };
}

function dedupeRules(rules: RuleMatch[]): RuleMatch[] {
  const seen = new Set<string>();
  return rules.filter((rule) => {
    if (seen.has(rule.ruleId)) {
      return false;
    }
    seen.add(rule.ruleId);
    return true;
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasTerm(text: string, term: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizeText(term))}([^a-z0-9]|$)`, "i").test(text);
}
