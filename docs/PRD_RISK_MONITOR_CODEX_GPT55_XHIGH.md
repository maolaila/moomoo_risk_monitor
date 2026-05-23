# PRD: Local Moomoo Portfolio Risk Monitor with Codex `gpt-5.5` + `xhigh`

**Document version:** 1.0  
**Date:** 2026-05-23 JST  
**Target repository:** `maolaila/moomoo_trade_reports`  
**Primary implementation agent:** Codex CLI  
**Required Codex analysis model:** `gpt-5.5`  
**Required reasoning effort:** `xhigh`  
**Runtime target:** Local command-line program, 24-hour continuous monitoring  
**Trading mode:** Alert-only. No automatic trading.

---

## 0. Copy This Instruction to Codex First

Please implement this PRD in the current repository.

Important constraints:

1. Build a local TypeScript/Node.js CLI risk monitor inside the existing `moomoo_trade_reports` repository.
2. Do not rewrite the existing project.
3. Do not implement auto-trading.
4. Do not call Moomoo order-placement, order-modification, unlock-trade, or cancel-order APIs.
5. Read current holdings from local Moomoo snapshot JSON files.
6. Monitor SEC filings, RSS/news sources, optional Alpha Vantage / NewsAPI sources, and optional price events.
7. Use a rule engine first.
8. Invoke `codex exec` only for high-risk or high-uncertainty candidate events.
9. When invoking Codex for risk analysis, use:
   - model: `gpt-5.5`
   - `model_reasoning_effort=xhigh`
   - `approval_policy=never`
   - `--sandbox read-only`
   - `--ephemeral`
   - `--output-schema schemas/risk_analysis.schema.json`
10. Never pass secrets, `.env` contents, API keys, private keys, Moomoo account IDs, broker order IDs, or raw full account JSON to Codex.
11. Codex should receive only compact, sanitized event and exposure JSON.
12. Email only `HIGH` and `CRITICAL` alerts.
13. Add tests for the holdings loader, dedupe, rule engine, and Codex wrapper.
14. Keep code minimal, auditable, and robust.

Implement Phase 1 through Phase 5 first. Leave optional sources as feature-gated modules.

---

## 1. Product Summary

Build a local 24-hour portfolio risk monitoring CLI for the user's Moomoo US stock portfolio.

The system should continuously monitor events that may materially affect the user's current holdings, especially possible black-swan or fast-moving risk events:

- company news;
- SEC filings;
- earnings and guidance;
- financing / dilution;
- analyst downgrades;
- lawsuits and investigations;
- major customer / supply-chain changes;
- sector news related to AI infrastructure, optical networking, NAND / flash memory, semiconductors, and quantum computing;
- macro events that may affect high-beta US technology stocks;
- optional premarket / after-hours / regular-session price shock events.

The system must be local, auditable, and alert-only. It must not place trades.

---

## 2. Background and Existing Repository Context

The existing repository is a TypeScript / Node.js CLI project that tracks Moomoo trading records, canonical JSON files, Moomoo OpenD API raw data, and chain commit records.

Relevant existing paths:

```text
data/raw/moomoo-api/snapshot_YYYY-MM-DD.json
data/raw/moomoo-api/day_YYYY-MM-DD.json
data/canonical/api-trade_*.json
data/chain/records.jsonl
context/trading/QUANTGT_TRADE_JOURNAL.md
context/trading/WEB_CHAT_PROMPT.md
package.json
src/
```

The monitor should follow this data priority:

```text
1. data/chain/records.jsonl
2. data/canonical/api-trade_*.json
3. data/raw/moomoo-api/snapshot_*.json
4. data/raw/moomoo-api/day_*.json
5. data/reports/
6. context/trading/QUANTGT_TRADE_JOURNAL.md
```

For the risk monitor MVP, current holdings should primarily come from the latest `snapshot_*.json`.

Known current holdings for initial tests may include:

```text
AAOI
CIEN
IONQ
LITE
SNDK
VIAV
```

Do not hard-code these as the final source of truth. They are only aliases / fixtures for tests.

---

## 3. Goals

### 3.1 Functional Goals

The system must:

1. Start from the command line and run continuously.
2. Read current holdings from the latest Moomoo snapshot.
3. Monitor event sources at a configurable interval.
4. Normalize events.
5. Deduplicate events.
6. Match events to current holdings.
7. Apply rule-based severity scoring.
8. Invoke Codex only when rules indicate meaningful risk.
9. Require Codex analysis with `gpt-5.5` and `xhigh`.
10. Validate Codex output using a JSON Schema.
11. Send email alerts for `HIGH` and `CRITICAL` results.
12. Persist local audit logs for all raw events, normalized events, candidates, Codex results, and sent alerts.

### 3.2 Risk Control Goals

The system should detect events such as:

- share offering;
- convertible notes;
- secondary offering;
- ATM offering;
- guidance cut;
- preliminary results miss;
- material weakness;
- restatement;
- SEC / DOJ investigation;
- lawsuit / class action;
- executive resignation;
- delisting;
- going concern;
- customer loss;
- contract cancellation;
- export controls;
- major analyst downgrade;
- large premarket / after-hours price shock;
- major sector shock.

### 3.3 Cost / Quota Goals

The system must minimize Codex usage:

```text
Local program runs all day.
Codex is invoked only for candidate events.
Codex never crawls the web.
Codex never reads the entire repo for analysis.
Codex receives a compact JSON payload.
```

---

## 4. Non-Goals

This project must not:

1. Implement automatic buying or selling.
2. Call Moomoo trading APIs that place, modify, unlock, or cancel orders.
3. Modify existing canonical trade record generation logic.
4. Modify existing chain commit logic.
5. Upload raw account data to third-party services.
6. Let Codex access secrets.
7. Let Codex run with write permissions for risk analysis.
8. Send every minor article by email.
9. Treat AI output as guaranteed financial advice.
10. Replace user judgment.

---

## 5. User Stories

### 5.1 One-Time Scan

As the user, I want to run:

```bash
npm run risk:scan
```

so the monitor scans once, analyzes qualified candidates, writes logs, sends necessary emails, and exits.

### 5.2 Continuous Monitoring

As the user, I want to run:

```bash
npm run risk:monitor
```

so the monitor runs 24 hours per day until interrupted.

### 5.3 Codex Health Check

As the user, I want to run:

```bash
npm run risk:check-codex
```

so the program verifies that `codex exec`, model `gpt-5.5`, and `model_reasoning_effort=xhigh` are available.

### 5.4 Test Codex Analysis

As the user, I want to run:

```bash
npm run risk:test-codex
```

so the program creates a fake high-risk candidate and verifies that Codex returns valid JSON.

### 5.5 Email Alert

As the user, I want to receive email only when the result is `HIGH` or `CRITICAL`.

### 5.6 Local Audit Trail

As the user, I want all events and analyses stored locally so I can inspect what triggered an alert.

---

## 6. Recommended File Structure

Add:

```text
src/risk-monitor/
  cli.ts
  monitor.ts
  config.ts
  holdings.ts
  logger.ts
  types.ts
  utils.ts

  sources/
    sec.ts
    rss.ts
    newsapi.ts
    alphavantage.ts
    price.ts

  normalize.ts
  dedupe.ts
  rule-engine.ts
  codex-analyzer.ts
  mailer.ts

schemas/
  risk_analysis.schema.json

prompts/
  risk-analysis.md

data/news/
  raw/
  normalized/
  candidates/
  codex/
  alerts/
  sent/
  logs/
  seen.jsonl

docs/
  PRD_RISK_MONITOR_CODEX_GPT55_XHIGH.md
```

Runtime must create missing `data/news/*` directories automatically.

---

## 7. Package Scripts

Update `package.json` without removing existing scripts:

```json
{
  "risk:scan": "tsx src/risk-monitor/cli.ts scan",
  "risk:monitor": "tsx src/risk-monitor/cli.ts monitor",
  "risk:check-codex": "tsx src/risk-monitor/cli.ts check-codex",
  "risk:test-codex": "tsx src/risk-monitor/cli.ts test-codex",
  "risk:daily": "tsx src/risk-monitor/cli.ts daily"
}
```

`risk:daily` can be implemented in MVP as a simple last-24h summary or stubbed with a clear TODO.

---

## 8. Dependencies

Prefer native Node.js APIs.

Allowed lightweight dependencies:

```bash
npm install nodemailer rss-parser
npm install -D @types/nodemailer
```

Existing project dependencies such as `commander`, `dotenv`, `tsx`, and TypeScript should be reused.

Do not add heavy frameworks.

---

## 9. Environment Variables

Add to `.env.example`:

```env
# Risk monitor
RISK_MONITOR_ENABLED=true
RISK_MONITOR_INTERVAL_MINUTES=10
RISK_MONITOR_TIMEZONE=Asia/Tokyo
RISK_ALERT_MIN_SEVERITY=HIGH

# Event sources
ENABLE_SEC_MONITOR=true
ENABLE_RSS_MONITOR=true
ENABLE_NEWSAPI_MONITOR=false
ENABLE_ALPHA_VANTAGE_MONITOR=false
ENABLE_PRICE_MONITOR=false

NEWS_API_KEY=
ALPHA_VANTAGE_API_KEY=
RISK_MONITOR_RSS_FEEDS=

# Codex risk analysis
CODEX_ENABLED=true
CODEX_RISK_MODEL=gpt-5.5
CODEX_REASONING_EFFORT=xhigh
CODEX_APPROVAL_POLICY=never
CODEX_SANDBOX=read-only
CODEX_TIMEOUT_MS=120000
CODEX_OUTPUT_SCHEMA=schemas/risk_analysis.schema.json

# Email alerting
ALERT_EMAIL_ENABLED=false
ALERT_EMAIL_TO=
ALERT_EMAIL_FROM=
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
```

Behavior:

- If `CODEX_ENABLED=false`, the monitor must still run and save rule-based candidates.
- If `ALERT_EMAIL_ENABLED=false`, alerts must be saved locally but not emailed.
- Missing optional API keys should not crash the program if the corresponding source is disabled.
- Missing required keys for enabled sources should produce a clear warning or error depending on source criticality.
- SEC and RSS should be available without paid API keys.

---

## 10. Codex CLI Configuration

### 10.1 Required Model and Effort

Risk analysis must use:

```text
model = gpt-5.5
model_reasoning_effort = xhigh
```

The implementation should not silently downgrade to another model. If `gpt-5.5` or `xhigh` is unavailable, `risk:check-codex` should fail clearly.

### 10.2 Suggested User-Level Codex Profile

Recommend the user add this to `~/.codex/config.toml`:

```toml
[profiles.risk-monitor]
model = "gpt-5.5"
model_reasoning_effort = "xhigh"
model_verbosity = "medium"
approval_policy = "never"
sandbox_mode = "read-only"
hide_agent_reasoning = true
```

The program may call Codex either using the profile or explicit flags.

### 10.3 Preferred Invocation

Use explicit flags in implementation so the program is self-describing:

```bash
codex exec \
  --model gpt-5.5 \
  -c model_reasoning_effort=xhigh \
  -c model_verbosity=medium \
  -c approval_policy=never \
  --sandbox read-only \
  --output-schema schemas/risk_analysis.schema.json \
  --ephemeral \
  -
```

`-` means the prompt / context is read from stdin.

### 10.4 Strict Safety

For risk analysis, never use:

```bash
--sandbox workspace-write
--sandbox danger-full-access
--dangerously-bypass-approvals-and-sandbox
```

Codex should not modify files during risk analysis. The local TypeScript program writes files itself after parsing Codex output.

---

## 11. Data Model

Create `src/risk-monitor/types.ts`.

### 11.1 Holding

```ts
export type Holding = {
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
};
```

### 11.2 Sanitized Holding Exposure

This is the only holding data that may be sent to Codex:

```ts
export type SanitizedHoldingExposure = {
  ticker: string;
  name?: string;
  quantity: number;
  marketValueUsd?: number;
  portfolioWeight?: number;
  stockBookWeight?: number;
};
```

### 11.3 Raw Event

```ts
export type RawEvent = {
  source: "sec" | "rss" | "newsapi" | "alphavantage" | "price" | "manual";
  id?: string;
  ticker?: string;
  title: string;
  summary?: string;
  url?: string;
  publishedAt?: string;
  raw: unknown;
};
```

### 11.4 Normalized Event

```ts
export type NormalizedEvent = {
  eventId: string;
  source: RawEvent["source"];
  matchedTickers: string[];
  title: string;
  summary?: string;
  url?: string;
  publishedAt?: string;
  detectedAt: string;
  contentHash: string;
  sourceCredibility: "LOW" | "MEDIUM" | "HIGH";
  rawPath?: string;
};
```

### 11.5 Rule Match

```ts
export type RuleMatch = {
  ruleId: string;
  label: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  directionHint: "bullish" | "bearish" | "neutral" | "mixed" | "unknown";
  reason: string;
  confidence: number;
};
```

### 11.6 Candidate Event

```ts
export type CandidateEvent = {
  event: NormalizedEvent;
  matchedHoldingExposure: SanitizedHoldingExposure[];
  rules: RuleMatch[];
  highestRuleSeverity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  shouldInvokeCodex: boolean;
  candidateCreatedAt: string;
};
```

### 11.7 Codex Analysis Result

```ts
export type CodexAnalysisResult = {
  ticker: string;
  direction: "bullish" | "bearish" | "neutral" | "mixed" | "unknown";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  confidence: number;
  should_email: boolean;
  one_sentence_summary: string;
  why_it_matters: string;
  portfolio_impact: string;
  suggested_action:
    | "ignore"
    | "watch"
    | "manual_review"
    | "reduce_risk_candidate"
    | "urgent_manual_review";
  evidence: {
    source: string;
    claim: string;
    url?: string;
  }[];
  missing_data: string[];
};
```

---

## 12. Holdings Loader

Implement `src/risk-monitor/holdings.ts`.

Behavior:

1. Find files:

```text
data/raw/moomoo-api/snapshot_*.json
```

2. Sort descending by date in filename.
3. Load the latest file.
4. Parse:

```text
response.positions.s2c.positionList
response.funds.s2c.funds.totalAssets
response.funds.s2c.funds.marketVal
```

5. Convert each non-zero position to `Holding`.
6. Compute:

```text
portfolioWeight = position.val / totalAssets
stockBookWeight = position.val / marketVal
```

7. Do not log or return:
   - Moomoo account ID;
   - jpAccType if not needed;
   - broker IDs;
   - raw full response;
   - secrets.

8. If no snapshot exists, fail with:

```text
No Moomoo snapshot found under data/raw/moomoo-api/snapshot_*.json.
Run npm run moomoo:snapshot first.
```

Acceptance criteria:

- `risk:scan` prints loaded ticker list and counts.
- `risk:scan` does not print account ID.
- Unit test can load a fixture snapshot.

---

## 13. Event Sources

### 13.1 SEC Source

Implement `src/risk-monitor/sources/sec.ts`.

Purpose:

Monitor SEC filings for held US equities.

Minimum behavior:

1. For each current holding, resolve ticker to CIK.
2. For MVP, use a local mapping file:

```text
data/news/sec_ticker_cik_cache.json
```

or a code-level mapping with TODO to improve.

3. Fetch SEC submissions JSON:

```text
https://data.sec.gov/submissions/CIK##########.json
```

4. Use a polite User-Agent:

```text
MoomooRiskMonitor/0.1 <ALERT_EMAIL_FROM or contact@example.com>
```

5. Normalize recent filings into events.
6. Only consider filings within a configurable lookback period, default 7 days.

Important form types:

```text
8-K
10-Q
10-K
S-3
S-1
424B
424B5
13D
13G
4
```

SEC credibility:

```text
sourceCredibility = HIGH
```

SEC event title format:

```text
SEC filing: {ticker} {formType} filed {filingDate}
```

If accession URL is available, include it.

### 13.2 RSS Source

Implement `src/risk-monitor/sources/rss.ts`.

Behavior:

1. Read comma-separated feeds from:

```env
RISK_MONITOR_RSS_FEEDS=
```

2. If no feeds are configured, use a safe default list only if useful. Otherwise log that no RSS feeds are configured.
3. Fetch feeds.
4. Normalize items into events.
5. Do not crash if one feed fails.
6. RSS credibility defaults to `MEDIUM`, or `HIGH` for company IR / SEC / official sources.

### 13.3 NewsAPI Source

Implement `src/risk-monitor/sources/newsapi.ts`.

Enable only when:

```env
ENABLE_NEWSAPI_MONITOR=true
NEWS_API_KEY is set
```

Query by ticker and known company aliases.

Example query:

```text
("SNDK" OR "SanDisk") AND (stock OR shares OR earnings OR guidance OR AI OR NAND)
```

Use recent articles only.

### 13.4 Alpha Vantage News Sentiment Source

Implement `src/risk-monitor/sources/alphavantage.ts`.

Enable only when:

```env
ENABLE_ALPHA_VANTAGE_MONITOR=true
ALPHA_VANTAGE_API_KEY is set
```

Use `NEWS_SENTIMENT` endpoint by ticker.

Normalize:
- title;
- summary;
- URL;
- published time;
- ticker sentiment if present.

### 13.5 Price Source

Implement `src/risk-monitor/sources/price.ts` as optional.

Enable only when:

```env
ENABLE_PRICE_MONITOR=true
```

MVP can be a stub unless a reliable price source is configured.

Future behavior:

- detect premarket / after-hours / regular-session moves;
- create price events when:
  - single ticker move <= -5%;
  - single ticker move >= +8%;
  - abnormal volume;
  - index / sector shock.

---

## 14. Normalization and Dedupe

Implement:

```text
src/risk-monitor/normalize.ts
src/risk-monitor/dedupe.ts
```

### 14.1 Event ID

Generate deterministic event ID:

```text
sha256(source + normalizedTitle + url + publishedAt)
```

Normalize title before hashing:

- lowercase;
- trim whitespace;
- collapse internal spaces;
- remove common tracking suffixes if obvious.

### 14.2 Content Hash

Generate:

```text
sha256(title + summary + url)
```

### 14.3 Seen File

Maintain:

```text
data/news/seen.jsonl
```

Each line:

```json
{
  "eventId": "...",
  "contentHash": "...",
  "firstSeenAt": "...",
  "lastSeenAt": "...",
  "source": "...",
  "title": "...",
  "url": "..."
}
```

Behavior:

- Do not reprocess exact duplicate `eventId`.
- Update `lastSeenAt` when duplicate appears.
- Keep implementation simple; JSONL append is acceptable for MVP.
- Add a compaction TODO.

### 14.4 Logs

Save raw events to:

```text
data/news/raw/YYYY-MM-DD/
```

Save normalized events to:

```text
data/news/normalized/YYYY-MM-DD/
```

Save candidate events to:

```text
data/news/candidates/YYYY-MM-DD/
```

---

## 15. Ticker Matching and Aliases

The rule engine should match by:

1. direct ticker field;
2. exact ticker in title / summary;
3. company name;
4. alias.

Add default aliases:

```ts
export const DEFAULT_TICKER_ALIASES: Record<string, string[]> = {
  AAOI: ["Applied Optoelectronics", "AOI"],
  CIEN: ["Ciena"],
  IONQ: ["IonQ"],
  LITE: ["Lumentum"],
  SNDK: ["SanDisk", "Sandisk"],
  VIAV: ["Viavi", "Viavi Solutions"]
};
```

Also allow user-defined aliases:

```text
data/news/ticker_aliases.json
```

File format:

```json
{
  "SNDK": ["SanDisk", "Sandisk"],
  "LITE": ["Lumentum"]
}
```

---

## 16. Rule Engine

Implement `src/risk-monitor/rule-engine.ts`.

Input:

```text
NormalizedEvent[]
Holding[]
```

Output:

```text
CandidateEvent[]
```

### 16.1 Severity Order

```text
LOW < MEDIUM < HIGH < CRITICAL
```

### 16.2 High-Risk Bearish Keywords

If title or summary contains any of these terms and matched ticker is held, classify at least `HIGH`:

```text
offering
public offering
secondary offering
share sale
convertible notes
convertible senior notes
dilution
ATM offering
at-the-market
guidance cut
lowered guidance
preliminary results
misses estimates
profit warning
revenue warning
margin pressure
material weakness
restatement
SEC investigation
DOJ investigation
subpoena
class action
lawsuit
fraud
resignation
CFO resignation
CEO resignation
bankruptcy
going concern
delisting
export control
sanctions
customer loss
contract cancellation
```

### 16.3 Bullish Keywords

Classify as `MEDIUM` or `HIGH` depending on exposure and credibility:

```text
raises guidance
beats estimates
major contract
large customer
Nvidia partnership
hyperscaler order
AI data center demand
strategic investment
buyback
acquisition premium
government contract
long-term supply agreement
```

### 16.4 Sector Keywords

For the current strategy, sector-level events matter if they contain:

```text
AI infrastructure
optical networking
800G
1.6T
data center
hyperscaler
NAND
flash memory
SSD
semiconductor capex
quantum computing
interest rates
Fed
CPI
PCE
nonfarm payrolls
Treasury yields
USDJPY
export controls
```

Sector events are usually `MEDIUM` unless combined with severe negative terms.

### 16.5 SEC Filing Rules

If a filing matches a held ticker:

```text
8-K => at least HIGH candidate
10-Q / 10-K => MEDIUM candidate, escalate to HIGH if high exposure
S-3 / S-1 / 424B / 424B5 => HIGH candidate
Form 4 => MEDIUM candidate, escalate if executive sale is large
13D / 13G => MEDIUM candidate
```

### 16.6 Exposure-Based Escalation

Escalate severity if matched holding exposure is high:

```text
portfolioWeight >= 0.10 => add one severity level
stockBookWeight >= 0.25 => add one severity level
portfolioWeight >= 0.15 => force at least HIGH
stockBookWeight >= 0.35 => force at least HIGH
```

### 16.7 Codex Invocation Rules

Set `shouldInvokeCodex=true` if any condition is met:

```text
highest rule severity >= HIGH
SEC filing type is 8-K, 10-Q, 10-K, S-3, S-1, 424B, 424B5, Form 4
matched ticker portfolioWeight >= 0.10 and event severity >= MEDIUM
event contains high-risk bearish keyword
event contains major customer / AI infrastructure keyword
same ticker has 3+ MEDIUM events within 24h
price event severity >= HIGH
```

Do not invoke Codex for:

```text
LOW severity
duplicate event
no matched holding
generic market recap
SEO article
old article
article with no direct relation to holdings
```

---

## 17. Codex Analyzer

Implement `src/risk-monitor/codex-analyzer.ts`.

Use `child_process.spawn`.

### 17.1 Command

Preferred command:

```bash
codex exec \
  --model gpt-5.5 \
  -c model_reasoning_effort=xhigh \
  -c model_verbosity=medium \
  -c approval_policy=never \
  --sandbox read-only \
  --output-schema schemas/risk_analysis.schema.json \
  --ephemeral \
  -
```

The implementation must allow environment overrides but default to exactly:

```text
CODEX_RISK_MODEL=gpt-5.5
CODEX_REASONING_EFFORT=xhigh
CODEX_APPROVAL_POLICY=never
CODEX_SANDBOX=read-only
```

### 17.2 Timeout

Default:

```text
CODEX_TIMEOUT_MS=120000
```

On timeout:

1. kill the process;
2. log failure;
3. save candidate to `data/news/codex/failed/`;
4. continue monitor loop.

### 17.3 Codex Input Payload

Codex receives compact JSON through stdin.

Input shape:

```json
{
  "system_task": "Analyze whether this event is bullish, bearish, neutral, mixed, or unknown for the user's current holding. Return JSON only.",
  "account_context": {
    "strategy": "QuantGT-related US technology growth portfolio",
    "risk_goal": "detect high-impact or black-swan events",
    "timezone": "Asia/Tokyo",
    "auto_trading": false
  },
  "holdings": [
    {
      "ticker": "SNDK",
      "name": "SanDisk",
      "quantity": 1,
      "marketValueUsd": 1466.97,
      "portfolioWeight": 0.134,
      "stockBookWeight": 0.325
    }
  ],
  "event": {
    "source": "sec",
    "title": "Example filing title",
    "summary": "Example summary",
    "url": "https://example.com",
    "publishedAt": "2026-05-23T10:00:00Z",
    "matchedTickers": ["SNDK"]
  },
  "rule_matches": [
    {
      "ruleId": "bearish.offering",
      "label": "Offering / possible dilution",
      "severity": "HIGH",
      "directionHint": "bearish",
      "reason": "Title contains offering keyword",
      "confidence": 0.9
    }
  ],
  "required_output": {
    "direction": "bullish | bearish | neutral | mixed | unknown",
    "severity": "LOW | MEDIUM | HIGH | CRITICAL",
    "confidence": "0 to 1",
    "should_email": "boolean",
    "suggested_action": "ignore | watch | manual_review | reduce_risk_candidate | urgent_manual_review"
  }
}
```

### 17.4 Codex Prompt

Create `prompts/risk-analysis.md`:

```text
You are analyzing a portfolio risk event for a local stock monitoring system.

Return JSON only.

Rules:
- Do not invent facts.
- Use only the supplied event, source, rule matches, holding exposure, and evidence.
- Separate direct evidence from inference.
- If evidence is weak, lower confidence.
- Never recommend automatic trading.
- Never claim certainty about future price movement.
- Suggested actions must be one of:
  ignore, watch, manual_review, reduce_risk_candidate, urgent_manual_review.
- HIGH or CRITICAL means the user should be notified by email.
- CRITICAL is reserved for potentially severe events such as dilution, fraud, bankruptcy, delisting, major guidance cut, major customer loss, restatement, or regulatory investigation.
- If the event is generic, weakly related, or old, mark severity LOW or MEDIUM.
- If source is unofficial or low credibility, lower confidence unless there is corroborating evidence.
- Mention missing data explicitly.
```

The TypeScript code should include this prompt content as part of the stdin payload.

### 17.5 Output Parsing

Parse stdout as JSON.

If stdout contains extra text:

1. first attempt strict JSON parse;
2. if failed, attempt to extract the first JSON object safely;
3. validate against schema;
4. if validation fails, log and continue.

Do not send an email on invalid Codex output.

---

## 18. JSON Schema

Create `schemas/risk_analysis.schema.json`:

```json
{
  "type": "object",
  "properties": {
    "ticker": {
      "type": "string"
    },
    "direction": {
      "type": "string",
      "enum": ["bullish", "bearish", "neutral", "mixed", "unknown"]
    },
    "severity": {
      "type": "string",
      "enum": ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    },
    "confidence": {
      "type": "number",
      "minimum": 0,
      "maximum": 1
    },
    "should_email": {
      "type": "boolean"
    },
    "one_sentence_summary": {
      "type": "string"
    },
    "why_it_matters": {
      "type": "string"
    },
    "portfolio_impact": {
      "type": "string"
    },
    "suggested_action": {
      "type": "string",
      "enum": [
        "ignore",
        "watch",
        "manual_review",
        "reduce_risk_candidate",
        "urgent_manual_review"
      ]
    },
    "evidence": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "source": {
            "type": "string"
          },
          "claim": {
            "type": "string"
          },
          "url": {
            "type": "string"
          }
        },
        "required": ["source", "claim"],
        "additionalProperties": false
      }
    },
    "missing_data": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "ticker",
    "direction",
    "severity",
    "confidence",
    "should_email",
    "one_sentence_summary",
    "why_it_matters",
    "portfolio_impact",
    "suggested_action",
    "evidence",
    "missing_data"
  ],
  "additionalProperties": false
}
```

---

## 19. Email Alerts

Implement `src/risk-monitor/mailer.ts`.

Use `nodemailer`.

Send email only when:

```text
ALERT_EMAIL_ENABLED=true
analysis.should_email=true
analysis.severity in ["HIGH", "CRITICAL"]
```

Subject:

```text
[HIGH][SNDK] Bearish risk: one sentence summary
```

Critical subject:

```text
[URGENT][CRITICAL][SNDK] Bearish risk: one sentence summary
```

Email body:

```text
Ticker:
Direction:
Severity:
Confidence:

Summary:
...

Why it matters:
...

Portfolio impact:
...

Suggested action:
...

Evidence:
- source / claim / url

Missing data:
- ...

Detected at:
Published at:
Source:
URL:
```

After sending, save full email payload to:

```text
data/news/sent/YYYY-MM-DD/
```

If email fails:

1. log error;
2. save alert locally;
3. continue monitor loop.

---

## 20. CLI Behavior

Implement `src/risk-monitor/cli.ts` with `commander`.

### 20.1 `scan`

```bash
npm run risk:scan
```

Behavior:

1. Load config.
2. Ensure runtime directories exist.
3. Load latest holdings.
4. Fetch enabled sources once.
5. Normalize events.
6. Dedupe events.
7. Run rule engine.
8. Save candidates.
9. Invoke Codex only for candidates with `shouldInvokeCodex=true`.
10. Save Codex results.
11. Send email for `HIGH` / `CRITICAL` results.
12. Print summary.

Example output:

```text
Risk Monitor Scan
Loaded holdings: 6
Fetched raw events: 42
New normalized events: 12
Candidate events: 3
Codex invoked: 1
High/Critical alerts: 1
Emails sent: 1
```

### 20.2 `monitor`

```bash
npm run risk:monitor
```

Behavior:

1. Start infinite loop.
2. Run scan every `RISK_MONITOR_INTERVAL_MINUTES`.
3. Print concise status each loop.
4. Handle source failures without exiting.
5. Handle Codex failures without exiting.
6. Handle email failures without exiting.
7. Gracefully shutdown on `SIGINT` / `SIGTERM`.

### 20.3 `check-codex`

```bash
npm run risk:check-codex
```

Behavior:

1. Run:

```bash
codex debug models
```

2. Verify `gpt-5.5` appears in model catalog or can be selected.
3. Run a minimal `codex exec` command with `gpt-5.5` and `model_reasoning_effort=xhigh`.
4. Output success or clear failure.
5. Do not send email.

### 20.4 `test-codex`

```bash
npm run risk:test-codex
```

Behavior:

1. Load latest holdings.
2. Create fake high-risk candidate event.
3. Invoke Codex using `gpt-5.5` and `xhigh`.
4. Validate returned JSON.
5. Save result to:

```text
data/news/codex/test/
```

6. Do not send email.

### 20.5 `daily`

```bash
npm run risk:daily
```

MVP:

- summarize last 24 hours of normalized events and alerts;
- print to console;
- save to `data/news/alerts/daily/`.

---

## 21. Logging

Implement `src/risk-monitor/logger.ts`.

Log directory:

```text
data/news/logs/
```

Log format:

```json
{
  "timestamp": "2026-05-23T12:00:00+09:00",
  "level": "info",
  "message": "Scan complete",
  "meta": {}
}
```

Rules:

- Mask secrets.
- Never log `.env` content.
- Never log Moomoo account ID.
- Never log private keys.
- Never log SMTP password.
- Log enough detail to debug failures.

---

## 22. Security Requirements

Mandatory:

1. Never send `.env` content to Codex.
2. Never send API keys to Codex.
3. Never send private keys to Codex.
4. Never send Moomoo account ID to Codex.
5. Never send broker order IDs to Codex.
6. Never give Codex write permissions for risk analysis.
7. Use `--sandbox read-only`.
8. Use `approval_policy=never`.
9. Use `--ephemeral`.
10. Codex input must include only:
    - sanitized holding exposure;
    - event title;
    - event summary;
    - URL;
    - matched rules;
    - source type;
    - published time.
11. Do not let Codex run arbitrary commands.
12. The TypeScript program, not Codex, should write logs and alert files.

---

## 23. Error Handling

The monitor must continue running when:

- one news source fails;
- an RSS feed fails;
- SEC request fails temporarily;
- Codex times out;
- Codex returns invalid JSON;
- email fails;
- dedupe file is temporarily unavailable.

The monitor should exit only when:

- no holdings snapshot exists;
- runtime directories cannot be created;
- configuration is invalid in a way that prevents execution;
- user interrupts the command.

---

## 24. Testing Requirements

Add tests using the existing test framework.

### 24.1 Holdings Loader Tests

Cases:

- loads latest snapshot;
- ignores zero-quantity positions;
- computes portfolioWeight;
- computes stockBookWeight;
- does not expose account ID.

### 24.2 Dedupe Tests

Cases:

- same URL and title dedupes;
- same contentHash dedupes;
- different source but same meaningful content is treated as duplicate if configured.

### 24.3 Rule Engine Tests

Cases:

- `offering` on held ticker => `HIGH`;
- `convertible notes` on held ticker => `HIGH`;
- SEC 8-K on held ticker => Codex candidate;
- generic unrelated news => no candidate;
- high exposure escalates severity;
- no held ticker => ignored.

### 24.4 Codex Wrapper Tests

Mock `child_process.spawn`.

Cases:

- builds command with `--model gpt-5.5`;
- includes `model_reasoning_effort=xhigh`;
- includes `approval_policy=never`;
- includes `--sandbox read-only`;
- includes `--ephemeral`;
- handles timeout;
- parses JSON;
- rejects invalid JSON.

### 24.5 Mailer Tests

Mock `nodemailer`.

Cases:

- sends HIGH;
- sends CRITICAL;
- does not send LOW or MEDIUM;
- saves failed email locally.

---

## 25. Acceptance Criteria

### 25.1 Build and Existing Behavior

- `npm run build` passes.
- Existing scripts continue to work.
- Existing tests still pass.
- New tests pass.

### 25.2 CLI

- `npm run risk:scan` runs once and exits.
- `npm run risk:monitor` loops until interrupted.
- `npm run risk:check-codex` checks Codex availability.
- `npm run risk:test-codex` invokes Codex with `gpt-5.5` and `xhigh`.

### 25.3 Codex

- Codex is not invoked for low-risk events.
- Codex is invoked for high-risk candidates.
- Codex command uses:
  - `--model gpt-5.5`;
  - `-c model_reasoning_effort=xhigh`;
  - `-c approval_policy=never`;
  - `--sandbox read-only`;
  - `--output-schema schemas/risk_analysis.schema.json`;
  - `--ephemeral`.
- Codex output validates against schema.
- Invalid Codex output does not send email.

### 25.4 Security

- No account ID in logs.
- No secrets in logs.
- No full raw Moomoo snapshot sent to Codex.
- No write-enabled Codex sandbox for analysis.

### 25.5 Alerts

- HIGH / CRITICAL events produce local alerts.
- Email is sent only if enabled.
- LOW / MEDIUM events do not send immediate email.

---

## 26. MVP Implementation Phases

### Phase 1: Local Skeleton

Implement:

- config loader;
- directory creation;
- logger;
- holdings loader;
- CLI commands;
- monitor loop.

### Phase 2: Source Collection

Implement:

- SEC source;
- RSS source;
- raw event saving;
- normalization;
- dedupe.

### Phase 3: Rule Engine

Implement:

- ticker / alias matching;
- keyword rules;
- SEC filing rules;
- exposure escalation;
- candidate saving.

### Phase 4: Codex Integration

Implement:

- `risk_analysis.schema.json`;
- prompt file;
- `codex-analyzer.ts`;
- command builder;
- timeout handling;
- schema validation;
- `risk:check-codex`;
- `risk:test-codex`.

### Phase 5: Email Alerts

Implement:

- nodemailer mailer;
- HIGH / CRITICAL send logic;
- sent / failed email local logs.

### Phase 6: Optional Sources

Feature-gated:

- NewsAPI;
- Alpha Vantage;
- price monitor;
- daily digest.

---

## 27. Example High-Risk Candidate

Example input to Codex:

```json
{
  "system_task": "Analyze whether this event is bullish, bearish, neutral, mixed, or unknown for the user's current holding. Return JSON only.",
  "account_context": {
    "strategy": "QuantGT-related US technology growth portfolio",
    "risk_goal": "detect high-impact or black-swan events",
    "timezone": "Asia/Tokyo",
    "auto_trading": false
  },
  "holdings": [
    {
      "ticker": "SNDK",
      "name": "SanDisk",
      "quantity": 1,
      "marketValueUsd": 1466.97,
      "portfolioWeight": 0.134,
      "stockBookWeight": 0.325
    }
  ],
  "event": {
    "source": "sec",
    "title": "SanDisk files prospectus supplement for convertible senior notes",
    "summary": "The company disclosed a financing transaction involving convertible senior notes.",
    "url": "https://example.com/sec-filing",
    "publishedAt": "2026-05-23T14:00:00Z",
    "matchedTickers": ["SNDK"]
  },
  "rule_matches": [
    {
      "ruleId": "bearish.convertible",
      "label": "Convertible financing / possible dilution",
      "severity": "HIGH",
      "directionHint": "bearish",
      "reason": "Event contains convertible financing terms.",
      "confidence": 0.9
    },
    {
      "ruleId": "exposure.large_position",
      "label": "Large portfolio exposure",
      "severity": "HIGH",
      "directionHint": "unknown",
      "reason": "SNDK is a large position in the current stock book.",
      "confidence": 1
    }
  ]
}
```

Expected output:

```json
{
  "ticker": "SNDK",
  "direction": "bearish",
  "severity": "HIGH",
  "confidence": 0.82,
  "should_email": true,
  "one_sentence_summary": "SanDisk may face dilution or balance-sheet risk from a convertible financing event.",
  "why_it_matters": "Convertible financing can pressure the stock if investors expect dilution or if the transaction signals funding needs.",
  "portfolio_impact": "The user holds SNDK as a large position, so a sharp negative reaction could materially affect the portfolio.",
  "suggested_action": "manual_review",
  "evidence": [
    {
      "source": "sec",
      "claim": "The event summary indicates convertible senior notes.",
      "url": "https://example.com/sec-filing"
    }
  ],
  "missing_data": [
    "Need exact principal amount, conversion price, use of proceeds, and market reaction."
  ]
}
```

---

## 28. Implementation Guardrails for Codex

Do:

- keep functions small;
- keep module boundaries clear;
- use explicit types;
- write tests;
- preserve existing project behavior;
- implement errors clearly;
- use local files for auditability;
- keep Codex invocation compact and sanitized.

Do not:

- implement auto-trading;
- add heavy dependencies;
- make Codex run all day;
- let Codex crawl websites itself;
- pass secrets to Codex;
- pass raw full account JSON to Codex;
- silently change model away from `gpt-5.5`;
- silently change reasoning effort away from `xhigh`;
- use dangerous sandbox settings.

---

## 29. Final Architecture

```text
npm run risk:monitor
        |
        v
Load latest holdings from local Moomoo snapshot
        |
        v
Fetch SEC / RSS / optional news and price sources
        |
        v
Normalize + dedupe
        |
        v
Match to current holdings
        |
        v
Rule engine scores candidate severity
        |
        +--> LOW / duplicate / unrelated => log only
        |
        +--> MEDIUM => candidate log / daily summary
        |
        +--> HIGH / CRITICAL / uncertain high-exposure event
                 |
                 v
           codex exec
           model = gpt-5.5
           model_reasoning_effort = xhigh
           sandbox = read-only
                 |
                 v
           JSON schema validated result
                 |
                 v
           HIGH / CRITICAL => local alert + email
           otherwise => local log only
```

---

## 30. References for Implementation

Codex CLI reference:
https://developers.openai.com/codex/cli/reference

Codex non-interactive mode:
https://developers.openai.com/codex/noninteractive

Codex configuration reference:
https://developers.openai.com/codex/config-reference

SEC EDGAR submissions API:
https://data.sec.gov/submissions/

SEC company tickers:
https://www.sec.gov/files/company_tickers.json

