import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { runCodexStructured } from "./codex-analyzer";
import { RiskMonitorConfig } from "./config";
import { Logger } from "./logger";
import { saveRepairReport } from "./storage";
import { nowIso, todayLabel } from "./utils";

export interface AiRepairResult {
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  can_continue: boolean;
  probable_cause: string;
  repair_summary: string;
  recommended_steps: string[];
  suggested_commands: string[];
  needs_human: boolean;
  risk_notes: string[];
}

export interface AiRepairState {
  lastAttemptMs?: number;
}

export interface ProcessRunResult {
  command: string;
  code: number | null;
  stdout: string;
  stderr: string;
}

export async function maybeRunAiRepair(options: {
  config: RiskMonitorConfig;
  logger: Logger;
  error: unknown;
  currentTask?: string;
  state: AiRepairState;
}): Promise<string | undefined> {
  if (!options.config.aiRepairEnabled || !options.config.codexEnabled) {
    return undefined;
  }

  const nowMs = Date.now();
  const cooldownMs = Math.max(1, options.config.aiRepairCooldownMinutes) * 60 * 1000;
  if (options.state.lastAttemptMs && nowMs - options.state.lastAttemptMs < cooldownMs) {
    await options.logger.warn("AI repair skipped by cooldown", {
      cooldownMinutes: options.config.aiRepairCooldownMinutes,
      currentTask: options.currentTask
    });
    return undefined;
  }
  options.state.lastAttemptMs = nowMs;

  try {
    const reportId = `repair-${Date.now()}`;
    const prompt = await fs.readFile(path.resolve("prompts", "ai-repair.md"), "utf8");
    const recentLogs = await readRecentLogs(options.config.dataDir, options.config.aiRepairRecentLogLines);

    if (options.config.aiRepairAllowCodeEdits) {
      const repair = await runAutoRepair({
        config: options.config,
        prompt,
        error: options.error,
        currentTask: options.currentTask,
        recentLogs
      });
      const reportPath = await saveRepairReport(options.config.dataDir, reportId, {
        kind: "AI_AUTO_REPAIR_REPORT",
        reportId,
        createdAt: nowIso(),
        currentTask: options.currentTask,
        error: errorPayload(options.error),
        repair
      });
      await options.logger.warn("AI auto repair finished", {
        reportPath,
        repairExitCode: repair.codex.code,
        validationFailures: repair.validations.filter((item) => item.code !== 0).length
      });
      console.log(`AI 自动修复已完成：Codex exit=${repair.codex.code}，验证失败 ${repair.validations.filter((item) => item.code !== 0).length}`);
      console.log(`修复报告：${reportPath}`);
      return reportPath;
    }

    const result = await runCodexStructured<AiRepairResult>(options.config, {
      system_task: "Diagnose this local monitor failure and return a safe repair plan. Return JSON only.",
      prompt,
      runtime_context: {
        cwd: process.cwd(),
        command: "npm run monitor",
        currentTask: options.currentTask,
        platform: process.platform,
        nodeVersion: process.version,
        timezone: options.config.timezone,
        autoCodeModification: false
      },
      monitor_config: {
        sourceRegistryEnabled: options.config.sourceRegistryEnabled,
        socialWatchlistEnabled: options.config.socialWatchlistEnabled,
        newsPoolCleanupEnabled: options.config.newsPoolCleanupEnabled,
        codexModel: options.config.codexModel,
        codexReasoningEffort: options.config.codexReasoningEffort,
        codexSpeedTier: options.config.codexSpeedTier,
        codexServiceTier: options.config.codexServiceTier
      },
      error: errorPayload(options.error),
      recent_logs: recentLogs,
      required_output: {
        severity: "LOW | MEDIUM | HIGH | CRITICAL",
        can_continue: "boolean",
        probable_cause: "short root-cause hypothesis",
        repair_summary: "short Chinese or clear English summary",
        recommended_steps: ["safe next steps"],
        suggested_commands: ["safe commands only"],
        needs_human: "boolean",
        risk_notes: ["risks or caveats"]
      }
    }, options.config.aiRepairSchema);

    const reportPath = await saveRepairReport(options.config.dataDir, reportId, {
      kind: "AI_REPAIR_REPORT",
      reportId,
      createdAt: nowIso(),
      currentTask: options.currentTask,
      error: errorPayload(options.error),
      result
    });
    await options.logger.warn("AI repair report created", {
      reportPath,
      severity: result.severity,
      canContinue: result.can_continue,
      needsHuman: result.needs_human
    });
    console.log(`AI 修复诊断已生成：${result.severity}，${result.repair_summary}`);
    console.log(`修复报告：${reportPath}`);
    return reportPath;
  } catch (repairError) {
    await options.logger.warn("AI repair failed", {
      error: repairError instanceof Error ? repairError.message : String(repairError)
    });
    console.log(`AI 修复诊断失败：${repairError instanceof Error ? repairError.message : String(repairError)}`);
    return undefined;
  }
}

export function buildAutoRepairArgs(config: RiskMonitorConfig): string[] {
  return [
    "exec",
    "--model",
    config.codexModel,
    "-c",
    `model_reasoning_effort=${config.codexReasoningEffort}`,
    "-c",
    "model_verbosity=medium",
    "-c",
    `approval_policy=${config.codexApprovalPolicy}`,
    "-c",
    `model_speed_tier=${config.codexSpeedTier}`,
    "-c",
    `service_tier=${config.codexServiceTier}`,
    "--sandbox",
    "workspace-write",
    "--ephemeral",
    "-"
  ];
}

async function runAutoRepair(options: {
  config: RiskMonitorConfig;
  prompt: string;
  error: unknown;
  currentTask?: string;
  recentLogs: string[];
}): Promise<{ codex: ProcessRunResult; validations: ProcessRunResult[] }> {
  const payload = buildAutoRepairPrompt(options);
  const codex = await runProcess("codex", buildAutoRepairArgs(options.config), payload, options.config.aiRepairTimeoutMs);
  const validations: ProcessRunResult[] = [];
  for (const command of options.config.aiRepairValidationCommands) {
    validations.push(await runShellCommand(command, 180000));
  }
  return { codex, validations };
}

export function buildAutoRepairPrompt(options: {
  config: RiskMonitorConfig;
  prompt: string;
  error: unknown;
  currentTask?: string;
  recentLogs: string[];
}): string {
  return JSON.stringify({
    system_task: "Repair this local TypeScript monitor so the normal workflow can continue. You may edit project files when needed.",
    prompt: options.prompt,
    hard_limits: [
      "Only modify files needed to restore the monitor workflow.",
      "Do not edit .env, secrets, data, .browser, node_modules, or dist.",
      "Do not delete runtime history, alerts, emails, Codex reports, or secrets.",
      "Do not run git reset, git clean, force push, or destructive cleanup commands.",
      "Do not start npm run monitor as a long-running command during repair.",
      "Prefer small robust fixes, source failure isolation, config validation, and tests."
    ],
    desired_outcome: "After repair, npm run build and npm test should pass, and the monitor should continue to the next scan without the same exception.",
    runtime_context: {
      cwd: process.cwd(),
      command: "npm run monitor",
      currentTask: options.currentTask,
      platform: process.platform,
      nodeVersion: process.version,
      timezone: options.config.timezone,
      autoCodeModification: true
    },
    monitor_config: {
      sourceRegistryEnabled: options.config.sourceRegistryEnabled,
      socialWatchlistEnabled: options.config.socialWatchlistEnabled,
      newsPoolCleanupEnabled: options.config.newsPoolCleanupEnabled,
      codexModel: options.config.codexModel,
      codexReasoningEffort: options.config.codexReasoningEffort,
      codexSpeedTier: options.config.codexSpeedTier,
      codexServiceTier: options.config.codexServiceTier,
      validationCommands: options.config.aiRepairValidationCommands
    },
    error: errorPayload(options.error),
    recent_logs: options.recentLogs
  }, null, 2);
}

function runProcess(command: string, args: string[], stdin: string, timeoutMs: number): Promise<ProcessRunResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32"
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve({ command: `${command} ${args.join(" ")}`, code: -1, stdout, stderr: `${stderr}\nTimed out after ${timeoutMs}ms`.trim() });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ command: `${command} ${args.join(" ")}`, code: -1, stdout, stderr: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ command: `${command} ${args.join(" ")}`, code, stdout: stdout.trim(), stderr: stderr.trim() });
    });
    child.stdin.write(stdin);
    child.stdin.end();
  });
}

function runShellCommand(command: string, timeoutMs: number): Promise<ProcessRunResult> {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      shell: true
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve({ command, code: -1, stdout, stderr: `${stderr}\nTimed out after ${timeoutMs}ms`.trim() });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ command, code: -1, stdout, stderr: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ command, code, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

async function readRecentLogs(dataDir: string, lines: number): Promise<string[]> {
  const logPath = path.join(dataDir, "logs", `${todayLabel()}.jsonl`);
  try {
    const raw = await fs.readFile(logPath, "utf8");
    return raw.split(/\r?\n/).filter(Boolean).slice(-Math.max(1, lines));
  } catch {
    return [];
  }
}

function errorPayload(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }
  return {
    message: String(error)
  };
}
