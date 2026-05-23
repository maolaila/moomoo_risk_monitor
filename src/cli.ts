import http from "node:http";
import https from "node:https";
import { Command } from "commander";
import { loadConfig } from "./config";
import { Logger } from "./logger";
import { runCodexHealthCheck, runMonitor, runScan } from "./monitor";
import { writeDailySummary } from "./daily";
import { analyzeWithCodex } from "./codex-analyzer";
import { loadLatestHoldings } from "./holdings";
import { ensureRuntimeDirs, saveCodexResult } from "./storage";
import { sendRiskEmail } from "./mailer";
import { loadOrUpdateSocialWatchlist } from "./social-watchlist";
import { CandidateEvent, CodexAnalysisResult } from "./types";
import { nowIso } from "./utils";

const program = new Command();

function action(handler: () => Promise<void>): () => void {
  return () => {
    handler().catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
  };
}

function context() {
  const config = loadConfig();
  const logger = new Logger(config.dataDir);
  return { config, logger };
}

program
  .name("moomoo-risk-monitor")
  .description("Local alert-only portfolio risk monitor with Codex analysis.");

program.command("scan").description("运行一次风险扫描，然后退出。").action(action(async () => {
  const { config, logger } = context();
  await runScan(config, logger);
  closeIdleHttpConnections();
}));

program.command("monitor").description("24 小时常驻风险监控。").action(action(async () => {
  const { config, logger } = context();
  await runMonitor(config, logger);
}));

program.command("check-codex").description("检查 Codex gpt-5.5/xhigh/fast 是否可用。").action(action(async () => {
  const { config } = context();
  await runCodexHealthCheck(config);
}));

program.command("test-codex").description("用假高风险事件测试 Codex JSON 输出。").action(action(async () => {
  const { config } = context();
  await ensureRuntimeDirs(config.dataDir);
  const candidate = fakeCandidate();
  const result = await analyzeWithCodex(config, candidate);
  await saveCodexResult(config.dataDir, candidate.event.eventId, result);
  console.log(`Codex 测试通过：${result.severity} ${result.ticker} ${result.one_sentence_summary}`);
  closeIdleHttpConnections();
}));

program.command("test-email").description("发送一封 Gmail SMTP 测试告警邮件。").action(action(async () => {
  const { config } = context();
  await ensureRuntimeDirs(config.dataDir);
  const candidate = fakeCandidate();
  const result = await sendRiskEmail(config, candidate, fakeAnalysis());
  if (result.sent) {
    console.log(`测试邮件已发送：${config.alertEmailTo}`);
    closeIdleHttpConnections();
    return;
  }
  throw new Error(`测试邮件未发送：${result.reason || result.error || result.status}`);
}));

program.command("update-social-watchlist").description("根据当前持仓强制更新关键人物社媒账号列表。").action(action(async () => {
  const { config, logger } = context();
  await ensureRuntimeDirs(config.dataDir);
  const holdings = await loadLatestHoldings(config.snapshotDir);
  const watchlist = await loadOrUpdateSocialWatchlist({
    config,
    holdings: holdings.holdings,
    logger,
    force: true
  });
  console.log(`关键人物社媒列表已更新：${watchlist?.accounts.length || 0} 个账号，路径 ${config.socialWatchlistPath}`);
  closeIdleHttpConnections();
}));

program.command("daily").description("生成最近 24 小时本地风险摘要。").action(action(async () => {
  const { config } = context();
  const output = await writeDailySummary(config.dataDir);
  console.log(`日报已生成：${output}`);
  closeIdleHttpConnections();
}));

program.parseAsync(process.argv);

function fakeCandidate(): CandidateEvent {
  return {
    event: {
      eventId: `test-${Date.now()}`,
      source: "manual",
      matchedTickers: ["SNDK"],
      title: "SanDisk files prospectus supplement for convertible senior notes",
      summary: "The company disclosed a financing transaction involving convertible senior notes.",
      url: "https://example.com/sec-filing",
      publishedAt: nowIso(),
      detectedAt: nowIso(),
      contentHash: "test",
      sourceCredibility: "HIGH"
    },
    matchedHoldingExposure: [{
      ticker: "SNDK",
      name: "SanDisk",
      quantity: 1,
      marketValueUsd: 1466.97,
      portfolioWeight: 0.134,
      stockBookWeight: 0.325
    }],
    rules: [{
      ruleId: "bearish.convertible",
      label: "Convertible financing / possible dilution",
      severity: "HIGH",
      directionHint: "bearish",
      reason: "Event contains convertible financing terms.",
      confidence: 0.9
    }],
    highestRuleSeverity: "HIGH",
    shouldInvokeCodex: true,
    candidateCreatedAt: nowIso()
  };
}

function closeIdleHttpConnections(): void {
  http.globalAgent.destroy();
  https.globalAgent.destroy();
}

function fakeAnalysis(): CodexAnalysisResult {
  return {
    ticker: "SNDK",
    direction: "bearish",
    severity: "HIGH",
    confidence: 0.82,
    should_email: true,
    one_sentence_summary: "这是一封 Moomoo Risk Monitor SMTP 测试邮件。",
    why_it_matters: "用于验证 Gmail App Password 和收件地址配置是否可用。",
    portfolio_impact: "测试邮件不代表真实风险。",
    suggested_action: "watch",
    evidence: [{
      source: "local-test",
      claim: "用户手动触发 SMTP 测试。"
    }],
    missing_data: []
  };
}
