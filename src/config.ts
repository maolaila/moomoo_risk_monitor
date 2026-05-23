import path from "node:path";
import dotenv from "dotenv";
import { boolValue, numberValue, splitCsv } from "./utils";
import { Severity } from "./types";
import { defaultNewsFeeds, defaultPolicyFeeds, defaultSocialFeeds } from "./default-feeds";

dotenv.config();

export interface RiskMonitorConfig {
  enabled: boolean;
  intervalMinutes: number;
  heartbeatSeconds: number;
  timezone: string;
  alertMinSeverity: Severity;
  alertEmailEnabled: boolean;
  alertEmailTo: string;
  alertEmailFrom: string;
  dataDir: string;
  sourceRegistryEnabled: boolean;
  sourceRegistryPath: string;
  socialWatchlistEnabled: boolean;
  socialWatchlistAutoUpdate: boolean;
  socialWatchlistPath: string;
  socialWatchlistSchema: string;
  snapshotDir: string;
  moomooReportsDir: string;
  enableSec: boolean;
  enableRss: boolean;
  enablePolicyRss: boolean;
  enableTickerNews: boolean;
  enableSocial: boolean;
  enableNewsApi: boolean;
  enableAlphaVantage: boolean;
  enablePrice: boolean;
  secLookbackDays: number;
  newsLookbackHours: number;
  rssFeeds: string[];
  policyFeeds: string[];
  socialFeeds: string[];
  newsApiKey?: string;
  alphaVantageApiKey?: string;
  secContactEmail: string;
  codexEnabled: boolean;
  codexModel: string;
  codexReasoningEffort: string;
  codexApprovalPolicy: string;
  codexSandbox: string;
  codexTimeoutMs: number;
  codexOutputSchema: string;
  codexSpeedTier: string;
  codexServiceTier: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass?: string;
  smtpPassFile?: string;
}

function severityValue(value: string | undefined): Severity {
  const raw = String(value || "HIGH").toUpperCase();
  if (raw === "LOW" || raw === "MEDIUM" || raw === "HIGH" || raw === "CRITICAL") {
    return raw;
  }
  return "HIGH";
}

export function loadConfig(): RiskMonitorConfig {
  const moomooReportsDir = path.resolve(process.env.MOOMOO_REPORTS_DIR || "../moomoo_trade_reports");
  const snapshotDir = path.resolve(process.env.MOOMOO_SNAPSHOT_DIR || path.join(moomooReportsDir, "data", "raw", "moomoo-api"));

  return {
    enabled: boolValue(process.env.RISK_MONITOR_ENABLED, true),
    intervalMinutes: numberValue(process.env.RISK_MONITOR_INTERVAL_MINUTES, 10),
    heartbeatSeconds: numberValue(process.env.RISK_MONITOR_HEARTBEAT_SECONDS, 30),
    timezone: process.env.RISK_MONITOR_TIMEZONE || "Asia/Tokyo",
    alertMinSeverity: severityValue(process.env.RISK_ALERT_MIN_SEVERITY),
    alertEmailEnabled: boolValue(process.env.ALERT_EMAIL_ENABLED, true),
    alertEmailTo: process.env.ALERT_EMAIL_TO || "maolaila1+moomoo-risk-monitor@gmail.com",
    alertEmailFrom: process.env.ALERT_EMAIL_FROM || "Moomoo Risk Monitor <maolaila2@gmail.com>",
    dataDir: path.resolve(process.env.RISK_MONITOR_DATA_DIR || "./data/risk-monitor"),
    sourceRegistryEnabled: boolValue(process.env.SOURCE_REGISTRY_ENABLED, true),
    sourceRegistryPath: path.resolve(process.env.SOURCE_REGISTRY_PATH || "./config/sources.json"),
    socialWatchlistEnabled: boolValue(process.env.SOCIAL_WATCHLIST_ENABLED, true),
    socialWatchlistAutoUpdate: boolValue(process.env.SOCIAL_WATCHLIST_AUTO_UPDATE, true),
    socialWatchlistPath: path.resolve(process.env.SOCIAL_WATCHLIST_PATH || "./data/risk-monitor/social-watchlist.json"),
    socialWatchlistSchema: process.env.SOCIAL_WATCHLIST_SCHEMA || "schemas/social_watchlist.schema.json",
    snapshotDir,
    moomooReportsDir,
    enableSec: boolValue(process.env.ENABLE_SEC_MONITOR, true),
    enableRss: boolValue(process.env.ENABLE_RSS_MONITOR, true),
    enablePolicyRss: boolValue(process.env.ENABLE_POLICY_RSS_MONITOR, true),
    enableTickerNews: boolValue(process.env.ENABLE_TICKER_NEWS_MONITOR, true),
    enableSocial: boolValue(process.env.ENABLE_SOCIAL_MONITOR, true),
    enableNewsApi: boolValue(process.env.ENABLE_NEWSAPI_MONITOR, false),
    enableAlphaVantage: boolValue(process.env.ENABLE_ALPHA_VANTAGE_MONITOR, false),
    enablePrice: boolValue(process.env.ENABLE_PRICE_MONITOR, false),
    secLookbackDays: numberValue(process.env.SEC_LOOKBACK_DAYS, 7),
    newsLookbackHours: numberValue(process.env.NEWS_LOOKBACK_HOURS, 48),
    rssFeeds: splitCsv(process.env.RISK_MONITOR_RSS_FEEDS).length > 0 ? splitCsv(process.env.RISK_MONITOR_RSS_FEEDS) : defaultNewsFeeds,
    policyFeeds: splitCsv(process.env.RISK_MONITOR_POLICY_FEEDS).length > 0 ? splitCsv(process.env.RISK_MONITOR_POLICY_FEEDS) : defaultPolicyFeeds,
    socialFeeds: splitCsv(process.env.RISK_MONITOR_SOCIAL_FEEDS).length > 0 ? splitCsv(process.env.RISK_MONITOR_SOCIAL_FEEDS) : defaultSocialFeeds,
    newsApiKey: process.env.NEWS_API_KEY || undefined,
    alphaVantageApiKey: process.env.ALPHA_VANTAGE_API_KEY || undefined,
    secContactEmail: process.env.SEC_CONTACT_EMAIL || "contact@example.com",
    codexEnabled: boolValue(process.env.CODEX_ENABLED, true),
    codexModel: process.env.CODEX_RISK_MODEL || "gpt-5.5",
    codexReasoningEffort: process.env.CODEX_REASONING_EFFORT || "xhigh",
    codexApprovalPolicy: process.env.CODEX_APPROVAL_POLICY || "never",
    codexSandbox: process.env.CODEX_SANDBOX || "read-only",
    codexTimeoutMs: numberValue(process.env.CODEX_TIMEOUT_MS, 120000),
    codexOutputSchema: process.env.CODEX_OUTPUT_SCHEMA || "schemas/risk_analysis.schema.json",
    codexSpeedTier: process.env.CODEX_SPEED_TIER || "fast",
    codexServiceTier: process.env.CODEX_SERVICE_TIER || "fast",
    smtpHost: process.env.SMTP_HOST || "smtp.gmail.com",
    smtpPort: numberValue(process.env.SMTP_PORT, 465),
    smtpSecure: boolValue(process.env.SMTP_SECURE, true),
    smtpUser: process.env.SMTP_USER || "maolaila2@gmail.com",
    smtpPass: process.env.SMTP_PASS || undefined,
    smtpPassFile: process.env.SMTP_PASS_FILE ? path.resolve(process.env.SMTP_PASS_FILE) : path.resolve("./secrets/gmail_app_password.txt")
  };
}
