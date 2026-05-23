import { checkCodex, analyzeWithCodex } from "./codex-analyzer";
import { RiskMonitorConfig } from "./config";
import { dedupeEvents } from "./dedupe";
import { loadLatestHoldings } from "./holdings";
import { Logger } from "./logger";
import { sendRiskEmail } from "./mailer";
import { normalizeEvent } from "./normalize";
import { maybeSaveAlert } from "./alerts";
import { runRuleEngine } from "./rule-engine";
import { fetchAllSources } from "./source-runner";
import { createSourceSchedulerState } from "./source-registry";
import { SourceSchedulerState } from "./source-types";
import { loadOrUpdateSocialWatchlist } from "./social-watchlist";
import { ensureRuntimeDirs, saveCandidate, saveCodexFailure, saveCodexResult, saveNormalizedEvent, saveRawEvent } from "./storage";
import { MonitorStatus, ScanSummary } from "./types";
import { nowIso, sleep } from "./utils";

export async function runScan(config: RiskMonitorConfig, logger: Logger, status?: MonitorStatus, scheduler?: SourceSchedulerState): Promise<ScanSummary> {
  const startedAt = nowIso();
  let codexInvoked = 0;
  let alerts = 0;
  let emailsSent = 0;
  let emailFailures = 0;

  await setTask(status, "准备运行目录", logger);
  await ensureRuntimeDirs(config.dataDir);

  await setTask(status, "读取最新持仓快照", logger);
  const holdingsResult = await loadLatestHoldings(config.snapshotDir);
  const tickers = holdingsResult.holdings.map((holding) => holding.ticker).join(", ");
  console.log(`持仓加载完成：${holdingsResult.holdings.length} 个标的 (${tickers})`);

  await setTask(status, "检查关键人物社媒列表", logger);
  const socialWatchlist = await loadOrUpdateSocialWatchlist({
    config,
    holdings: holdingsResult.holdings,
    logger
  });

  await setTask(status, "抓取 SEC / 来源注册表 / 社交媒体 / 可选数据源", logger);
  const rawEvents = await fetchAllSources(config, holdingsResult.holdings, logger, {
    scheduler,
    socialWatchlist,
    setTask: (task) => setTask(status, task, logger)
  });

  await setTask(status, "保存和标准化事件", logger);
  const normalized = [];
  for (const raw of rawEvents) {
    const rawPath = await saveRawEvent(config.dataDir, raw);
    const event = normalizeEvent(raw, rawPath);
    await saveNormalizedEvent(config.dataDir, event);
    normalized.push(event);
  }

  await setTask(status, "执行去重", logger);
  const newEvents = await dedupeEvents(config.dataDir, normalized);

  await setTask(status, "运行规则引擎", logger);
  const candidates = await runRuleEngine(config.dataDir, newEvents, holdingsResult.holdings);
  for (const candidate of candidates) {
    await saveCandidate(config.dataDir, candidate);
  }

  if (config.codexEnabled) {
    await setTask(status, "调用 Codex 综合评估高风险候选", logger);
    for (const candidate of candidates.filter((item) => item.shouldInvokeCodex)) {
      try {
        codexInvoked += 1;
        const analysis = await analyzeWithCodex(config, candidate);
        await saveCodexResult(config.dataDir, candidate.event.eventId, analysis);
        const alertPath = await maybeSaveAlert({
          dataDir: config.dataDir,
          minSeverity: config.alertMinSeverity,
          emailEnabled: config.alertEmailEnabled,
          candidate,
          analysis
        });
        if (alertPath) {
          alerts += 1;
          console.log(`本地告警：${analysis.severity} ${analysis.ticker} ${analysis.one_sentence_summary}`);
          const emailResult = await sendRiskEmail(config, candidate, analysis);
          if (emailResult.sent) {
            emailsSent += 1;
            console.log(`邮件已发送：${config.alertEmailTo}`);
          } else if (emailResult.status === "failed") {
            emailFailures += 1;
            console.log(`邮件发送失败：${emailResult.error}`);
          } else if (emailResult.reason === "missing_smtp_password") {
            emailFailures += 1;
            console.log(`邮件未发送：缺少 Gmail App Password，请写入 ${config.smtpPassFile}`);
          }
        }
      } catch (error) {
        await saveCodexFailure(config.dataDir, candidate.event.eventId, {
          createdAt: nowIso(),
          error: error instanceof Error ? error.message : String(error),
          candidate
        });
        await logger.warn("Codex analysis failed", { eventId: candidate.event.eventId, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  const summary: ScanSummary = {
    holdings: holdingsResult.holdings.length,
    rawEvents: rawEvents.length,
    normalizedEvents: normalized.length,
    newEvents: newEvents.length,
    candidates: candidates.length,
    codexInvoked,
    alerts,
    emailsSent,
    emailFailures,
    startedAt,
    finishedAt: nowIso()
  };
  await logger.info("scan complete", summary as unknown as Record<string, unknown>);
  if (status) {
    status.lastScanAt = summary.finishedAt;
    status.lastSummary = summary;
  }
  console.log(`扫描完成：原始事件 ${summary.rawEvents}，新增事件 ${summary.newEvents}，候选 ${summary.candidates}，AI 分析 ${summary.codexInvoked}，告警 ${summary.alerts}，邮件 ${summary.emailsSent}/${summary.emailFailures}`);
  return summary;
}

export async function runMonitor(config: RiskMonitorConfig, logger: Logger): Promise<void> {
  const scheduler = createSourceSchedulerState();
  const status: MonitorStatus = {
    running: true,
    currentTask: "启动中"
  };
  const heartbeat = setInterval(() => printHeartbeat(status), Math.max(5, config.heartbeatSeconds) * 1000);

  const shutdown = () => {
    status.running = false;
    status.currentTask = "收到停止信号，正在退出";
    clearInterval(heartbeat);
    printHeartbeat(status);
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  console.log("风险监控已启动。按 Ctrl+C 停止。");
  while (status.running) {
    const started = Date.now();
    const next = new Date(started + config.intervalMinutes * 60 * 1000);
    status.nextScanAt = next.toISOString();
    try {
      await runScan(config, logger, status, scheduler);
    } catch (error) {
      await logger.error("scan failed", { error: error instanceof Error ? error.message : String(error) });
      console.log(`扫描失败：${error instanceof Error ? error.message : String(error)}`);
    }
    status.currentTask = "等待下一轮扫描";
    const elapsed = Date.now() - started;
    await sleep(Math.max(1000, config.intervalMinutes * 60 * 1000 - elapsed));
  }
}

export async function runCodexHealthCheck(config: RiskMonitorConfig): Promise<void> {
  await checkCodex(config);
  console.log(`Codex 可用：${config.codexModel} / ${config.codexReasoningEffort} / fast`);
}

async function setTask(status: MonitorStatus | undefined, task: string, logger: Logger): Promise<void> {
  if (status) {
    status.currentTask = task;
  }
  await logger.info(task);
  console.log(`任务：${task}`);
}

function printHeartbeat(status: MonitorStatus): void {
  const summary = status.lastSummary;
  const detail = summary
    ? `上次扫描：持仓 ${summary.holdings}，新增事件 ${summary.newEvents}，候选 ${summary.candidates}，AI ${summary.codexInvoked}，告警 ${summary.alerts}，邮件 ${summary.emailsSent}/${summary.emailFailures}`
    : "尚未完成首轮扫描";
  console.log(`[心跳 ${new Date().toLocaleString("zh-CN")}] 状态：${status.running ? "运行中" : "停止中"}；当前任务：${status.currentTask}；${detail}；下次扫描：${status.nextScanAt || "待定"}`);
}
