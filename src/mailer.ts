import fs from "node:fs/promises";
import nodemailer from "nodemailer";
import { RiskMonitorConfig } from "./config";
import { saveEmailRecord } from "./storage";
import { CandidateEvent, CodexAnalysisResult } from "./types";
import { nowIso, severityGte } from "./utils";

export interface RiskEmailPayload {
  from: string;
  to: string;
  subject: string;
  text: string;
}

export interface EmailSendResult {
  enabled: boolean;
  sent: boolean;
  status: "disabled" | "skipped" | "sent" | "failed";
  reason?: string;
  messageId?: string;
  recordPath?: string;
  error?: string;
}

export function buildRiskEmailPayload(config: RiskMonitorConfig, candidate: CandidateEvent, analysis: CodexAnalysisResult): RiskEmailPayload {
  const ticker = analysis.ticker || candidate.event.matchedTickers[0] || "UNKNOWN";
  const severity = severityZh(analysis.severity);
  const direction = directionZh(analysis.direction);
  const subject = `[Moomoo 风控][${severity}][${ticker}] ${oneLine(analysis.one_sentence_summary, 120)}`;
  const suggestedAction = suggestedActionZh(analysis.suggested_action);
  const lines = [
    `标的：${ticker}`,
    `风险级别：${severity}`,
    `AI 判断方向：${direction}`,
    `AI 置信度：${formatConfidence(analysis.confidence)}`,
    `AI 建议处理：${suggestedAction}`,
    "",
    "AI 综合结论：",
    analysis.one_sentence_summary || "未提供",
    "",
    "AI 给出的理由和分析：",
    "为什么重要：",
    analysis.why_it_matters || "未提供",
    "",
    "对持仓的影响：",
    analysis.portfolio_impact || "未提供",
    "",
    "建议处理：",
    suggestedAction,
    "",
    "持仓暴露：",
    formatExposure(candidate),
    "",
    "规则命中：",
    formatRules(candidate),
    "",
    "证据：",
    formatEvidence(analysis),
    "",
    "缺失信息：",
    analysis.missing_data.length ? analysis.missing_data.map((item) => `- ${item}`).join("\n") : "- 无",
    "",
    "原始事件：",
    `- 来源：${sourceZh(candidate.event.source, candidate.event.metadata?.sourceName)}`,
    `- 标题：${candidate.event.title}`,
    `- 时间：${candidate.event.publishedAt || candidate.event.detectedAt}`,
    candidate.event.url ? `- URL：${candidate.event.url}` : "- URL：无",
    "",
    `生成时间：${nowIso()}`
  ];

  return {
    from: config.alertEmailFrom,
    to: config.alertEmailTo,
    subject,
    text: lines.join("\n")
  };
}

export async function sendRiskEmail(config: RiskMonitorConfig, candidate: CandidateEvent, analysis: CodexAnalysisResult): Promise<EmailSendResult> {
  if (!config.alertEmailEnabled) {
    return { enabled: false, sent: false, status: "disabled", reason: "email_disabled" };
  }
  if (!analysis.should_email) {
    return { enabled: true, sent: false, status: "skipped", reason: "codex_should_email_false" };
  }
  if (!severityGte(analysis.severity, config.alertMinSeverity)) {
    return { enabled: true, sent: false, status: "skipped", reason: "below_min_severity" };
  }

  const password = await resolveSmtpPassword(config);
  if (!config.smtpUser || !password) {
    const recordPath = await saveEmailRecord(config.dataDir, candidate.event.eventId, {
      kind: "RISK_EMAIL_SKIPPED",
      createdAt: nowIso(),
      reason: "missing_smtp_password",
      to: config.alertEmailTo,
      from: config.alertEmailFrom,
      smtpUser: config.smtpUser,
      eventId: candidate.event.eventId,
      ticker: analysis.ticker,
      severity: analysis.severity
    }, true);
    return { enabled: true, sent: false, status: "skipped", reason: "missing_smtp_password", recordPath };
  }

  const payload = buildRiskEmailPayload(config, candidate, analysis);
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: {
      user: config.smtpUser,
      pass: password
    }
  });

  try {
    const info = await transporter.sendMail(payload);
    const recordPath = await saveEmailRecord(config.dataDir, candidate.event.eventId, {
      kind: "RISK_EMAIL_SENT",
      createdAt: nowIso(),
      to: payload.to,
      from: payload.from,
      subject: payload.subject,
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
      eventId: candidate.event.eventId,
      ticker: analysis.ticker,
      severity: analysis.severity
    });
    return { enabled: true, sent: true, status: "sent", messageId: info.messageId, recordPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const recordPath = await saveEmailRecord(config.dataDir, candidate.event.eventId, {
      kind: "RISK_EMAIL_FAILED",
      createdAt: nowIso(),
      to: payload.to,
      from: payload.from,
      subject: payload.subject,
      error: message,
      eventId: candidate.event.eventId,
      ticker: analysis.ticker,
      severity: analysis.severity
    }, true);
    return { enabled: true, sent: false, status: "failed", error: message, recordPath };
  }
}

async function resolveSmtpPassword(config: RiskMonitorConfig): Promise<string | undefined> {
  if (config.smtpPass?.trim()) {
    return config.smtpPass.trim();
  }
  if (!config.smtpPassFile) {
    return undefined;
  }
  try {
    const fileValue = await fs.readFile(config.smtpPassFile, "utf8");
    return fileValue.trim() || undefined;
  } catch {
    return undefined;
  }
}

function formatExposure(candidate: CandidateEvent): string {
  if (!candidate.matchedHoldingExposure.length) {
    return "- 无匹配持仓";
  }
  return candidate.matchedHoldingExposure.map((holding) => {
    const parts = [
      holding.ticker,
      holding.name ? `名称 ${holding.name}` : undefined,
      `数量 ${holding.quantity}`,
      holding.marketValueUsd !== undefined ? `市值 USD ${holding.marketValueUsd}` : undefined,
      holding.portfolioWeight !== undefined ? `组合权重 ${holding.portfolioWeight}` : undefined,
      holding.stockBookWeight !== undefined ? `股票仓位权重 ${holding.stockBookWeight}` : undefined
    ].filter(Boolean);
    return `- ${parts.join("；")}`;
  }).join("\n");
}

function formatRules(candidate: CandidateEvent): string {
  if (!candidate.rules.length) {
    return "- 无";
  }
  return candidate.rules.map((rule) => {
    const direction = directionZh(rule.directionHint);
    return `- [${severityZh(rule.severity)} / ${direction}] ${rule.label}：${rule.reason}；规则置信度 ${formatConfidence(rule.confidence)}`;
  }).join("\n");
}

function formatEvidence(analysis: CodexAnalysisResult): string {
  if (!analysis.evidence.length) {
    return "- 无";
  }
  return analysis.evidence.map((item) => {
    const suffix = item.url ? ` (${item.url})` : "";
    return `- ${sourceZh(item.source)}：${item.claim}${suffix}`;
  }).join("\n");
}

function oneLine(value: string, maxLength: number): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 3)}...` : cleaned;
}

function suggestedActionZh(action: CodexAnalysisResult["suggested_action"]): string {
  const labels: Record<CodexAnalysisResult["suggested_action"], string> = {
    ignore: "无需处理",
    watch: "继续观察，暂不操作",
    manual_review: "人工复核后再决定",
    reduce_risk_candidate: "风险偏高，考虑减仓",
    urgent_manual_review: "风险很高，紧急考虑卖出"
  };
  return labels[action] || "人工复核";
}

function severityZh(severity: CodexAnalysisResult["severity"]): string {
  const labels: Record<CodexAnalysisResult["severity"], string> = {
    LOW: "低风险",
    MEDIUM: "中等风险",
    HIGH: "高风险",
    CRITICAL: "极高风险"
  };
  return labels[severity] || "未知风险";
}

function directionZh(direction: CodexAnalysisResult["direction"]): string {
  const labels: Record<CodexAnalysisResult["direction"], string> = {
    bullish: "偏利好",
    bearish: "偏利空",
    neutral: "中性",
    mixed: "多空混合",
    unknown: "方向不明确"
  };
  return labels[direction] || "方向不明确";
}

function formatConfidence(confidence: number): string {
  if (!Number.isFinite(confidence)) {
    return "未提供";
  }
  return `${Math.round(Math.max(0, Math.min(1, confidence)) * 100)}%`;
}

function sourceZh(source: string, sourceName?: unknown): string {
  if (typeof sourceName === "string" && sourceName.trim()) {
    return sourceName.trim();
  }
  const normalized = source.toLowerCase();
  const labels: Record<string, string> = {
    sec: "SEC 文件",
    rss: "新闻 RSS",
    social: "社交媒体",
    crawler: "网页爬虫",
    search: "新闻搜索",
    newsapi: "NewsAPI 新闻",
    alphavantage: "Alpha Vantage 数据",
    price: "价格数据",
    manual: "手动事件",
    local: "本地测试"
  };
  return labels[normalized] || source;
}
