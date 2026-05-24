import { describe, expect, it } from "vitest";
import { RiskMonitorConfig } from "../src/config";
import { buildRiskEmailPayload } from "../src/mailer";
import { CandidateEvent, CodexAnalysisResult } from "../src/types";

describe("mailer", () => {
  it("builds a Gmail plus-address risk alert payload without SMTP secrets", () => {
    const payload = buildRiskEmailPayload(config(), candidate(), analysis());

    expect(payload.to).toBe("maolaila1+moomoo-risk-monitor@gmail.com");
    expect(payload.from).toContain("maolaila2@gmail.com");
    expect(payload.subject).toContain("[高风险]");
    expect(payload.subject).toContain("[SNDK]");
    expect(payload.text).toContain("标的：SNDK");
    expect(payload.text).toContain("风险级别：高风险");
    expect(payload.text).toContain("AI 判断方向：偏利空");
    expect(payload.text).toContain("AI 置信度：83%");
    expect(payload.text).toContain("AI 给出的理由和分析：");
    expect(payload.text).toContain("建议处理：\n人工复核后再决定");
    expect(payload.text).toContain("可转债融资可能带来稀释压力");
    expect(payload.text).toContain("潜在稀释会改变这笔持仓的风险收益结构");
    expect(payload.text).toContain("SEC 文件：发行人提交了融资披露");
    expect(payload.text).not.toContain("manual_review");
    expect(payload.text).not.toContain("bearish");
    expect(payload.text).not.toContain("[HIGH]");
    expect(payload.text).not.toContain("gmail_app_password");
  });

  it("renders urgent action as immediate sell-down language in Chinese", () => {
    const urgent = {
      ...analysis(),
      suggested_action: "urgent_manual_review" as const
    };
    const payload = buildRiskEmailPayload(config(), candidate(), urgent);

    expect(payload.text).toContain("风险很高，紧急考虑卖出");
  });
});

function config(): RiskMonitorConfig {
  return {
    alertEmailTo: "maolaila1+moomoo-risk-monitor@gmail.com",
    alertEmailFrom: "Moomoo Risk Monitor <maolaila2@gmail.com>"
  } as RiskMonitorConfig;
}

function candidate(): CandidateEvent {
  return {
    event: {
      eventId: "event-1",
      source: "sec",
      matchedTickers: ["SNDK"],
      title: "可转债融资披露",
      summary: "公司提交可转债融资文件。",
      url: "https://example.com/filing",
      publishedAt: "2026-05-23T00:00:00.000Z",
      detectedAt: "2026-05-23T00:01:00.000Z",
      contentHash: "hash",
      sourceCredibility: "HIGH"
    },
    matchedHoldingExposure: [{
      ticker: "SNDK",
      name: "SanDisk",
      quantity: 1,
      marketValueUsd: 1000,
      portfolioWeight: 0.1
    }],
    rules: [{
      ruleId: "bearish.convertible",
      label: "可转债融资",
      severity: "HIGH",
      directionHint: "bearish",
      reason: "可能带来稀释压力",
      confidence: 0.9
    }],
    highestRuleSeverity: "HIGH",
    shouldInvokeCodex: true,
    candidateCreatedAt: "2026-05-23T00:02:00.000Z"
  };
}

function analysis(): CodexAnalysisResult {
  return {
    ticker: "SNDK",
    direction: "bearish",
    severity: "HIGH",
    confidence: 0.83,
    should_email: true,
    one_sentence_summary: "可转债融资可能带来稀释压力。",
    why_it_matters: "潜在稀释会改变这笔持仓的风险收益结构。",
    portfolio_impact: "当前持仓需要人工复核融资规模、转股价和资金用途。",
    suggested_action: "manual_review",
    evidence: [{
      source: "sec",
      claim: "发行人提交了融资披露。",
      url: "https://example.com/filing"
    }],
    missing_data: []
  };
}
