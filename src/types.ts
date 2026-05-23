export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type Direction = "bullish" | "bearish" | "neutral" | "mixed" | "unknown";
export type EventSource = "sec" | "rss" | "social" | "crawler" | "search" | "newsapi" | "alphavantage" | "price" | "manual";

export interface Holding {
  ticker: string;
  name?: string;
  quantity: number;
  price?: number;
  marketValueUsd?: number;
  averageCost?: number;
  unrealizedPL?: number;
  portfolioWeight?: number;
  stockBookWeight?: number;
  sourceFile: string;
  snapshotDate?: string;
}

export interface SanitizedHoldingExposure {
  ticker: string;
  name?: string;
  quantity: number;
  marketValueUsd?: number;
  portfolioWeight?: number;
  stockBookWeight?: number;
}

export interface RawEvent {
  source: EventSource;
  id?: string;
  ticker?: string;
  title: string;
  summary?: string;
  url?: string;
  publishedAt?: string;
  raw: unknown;
  metadata?: Record<string, unknown>;
}

export interface NormalizedEvent {
  eventId: string;
  source: EventSource;
  matchedTickers: string[];
  title: string;
  summary?: string;
  url?: string;
  publishedAt?: string;
  detectedAt: string;
  contentHash: string;
  sourceCredibility: "LOW" | "MEDIUM" | "HIGH";
  rawPath?: string;
  metadata?: Record<string, unknown>;
}

export interface RuleMatch {
  ruleId: string;
  label: string;
  severity: Severity;
  directionHint: Direction;
  reason: string;
  confidence: number;
}

export interface CandidateEvent {
  event: NormalizedEvent;
  matchedHoldingExposure: SanitizedHoldingExposure[];
  rules: RuleMatch[];
  highestRuleSeverity: Severity;
  shouldInvokeCodex: boolean;
  candidateCreatedAt: string;
}

export interface CodexAnalysisResult {
  ticker: string;
  direction: Direction;
  severity: Severity;
  confidence: number;
  should_email: boolean;
  one_sentence_summary: string;
  why_it_matters: string;
  portfolio_impact: string;
  suggested_action: "ignore" | "watch" | "manual_review" | "reduce_risk_candidate" | "urgent_manual_review";
  evidence: Array<{
    source: string;
    claim: string;
    url?: string;
  }>;
  missing_data: string[];
}

export interface ScanSummary {
  holdings: number;
  rawEvents: number;
  normalizedEvents: number;
  newEvents: number;
  candidates: number;
  codexInvoked: number;
  alerts: number;
  emailsSent: number;
  emailFailures: number;
  startedAt: string;
  finishedAt: string;
}

export interface MonitorStatus {
  running: boolean;
  currentTask: string;
  lastScanAt?: string;
  nextScanAt?: string;
  lastSummary?: ScanSummary;
}
