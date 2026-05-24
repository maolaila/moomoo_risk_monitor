import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import Ajv from "ajv";
import { RiskMonitorConfig } from "./config";
import { CandidateEvent, CodexAnalysisResult } from "./types";

export function buildCodexArgs(config: RiskMonitorConfig, outputSchema = config.codexOutputSchema): string[] {
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
    config.codexSandbox,
    "--output-schema",
    outputSchema,
    "--ephemeral",
    "-"
  ];
}

export async function analyzeWithCodex(config: RiskMonitorConfig, candidate: CandidateEvent): Promise<CodexAnalysisResult> {
  const prompt = await fs.readFile(path.resolve("prompts", "risk-analysis.md"), "utf8");
  const payload = {
    system_task: "Analyze whether this event is bullish, bearish, neutral, mixed, or unknown for the user's current holding. Return JSON only. All natural-language fields must be written in Simplified Chinese.",
    prompt,
    account_context: {
      strategy: "QuantGT-related US technology growth portfolio",
      risk_goal: "detect high-impact or black-swan events",
      timezone: config.timezone,
      auto_trading: false
    },
    holdings: candidate.matchedHoldingExposure,
    event: {
      source: candidate.event.source,
      title: candidate.event.title,
      summary: candidate.event.summary,
      url: candidate.event.url,
      publishedAt: candidate.event.publishedAt,
      matchedTickers: candidate.event.matchedTickers
    },
    rule_matches: candidate.rules,
    required_output: {
      direction: "bullish | bearish | neutral | mixed | unknown",
      severity: "LOW | MEDIUM | HIGH | CRITICAL",
      confidence: "0 to 1",
      should_email: "boolean",
      one_sentence_summary: "Chinese one-sentence conclusion",
      why_it_matters: "Chinese reason and analysis",
      portfolio_impact: "Chinese portfolio impact analysis",
      suggested_action: "ignore | watch | manual_review | reduce_risk_candidate | urgent_manual_review",
      evidence: "Chinese evidence claims only",
      missing_data: "Chinese missing data list"
    }
  };

  return runCodexStructured<CodexAnalysisResult>(config, payload, config.codexOutputSchema);
}

export async function runCodexStructured<T>(config: RiskMonitorConfig, payload: unknown, outputSchema: string): Promise<T> {
  const output = await runCodex(buildCodexArgs(config, outputSchema), JSON.stringify(payload, null, 2), config.codexTimeoutMs);
  const parsed = parseJsonObject(output);
  validateCodexResult(outputSchema, parsed);
  return parsed as T;
}

export async function checkCodex(config: RiskMonitorConfig): Promise<void> {
  const modelsRaw = await runProcess("codex", ["debug", "models"], "", 30000);
  const catalog = JSON.parse(modelsRaw) as { models: Array<{ slug: string; supported_reasoning_levels?: Array<{ effort: string }>; additional_speed_tiers?: string[] }> };
  const model = catalog.models.find((item) => item.slug === config.codexModel);
  if (!model) {
    throw new Error(`Codex model not available: ${config.codexModel}`);
  }
  if (!model.supported_reasoning_levels?.some((item) => item.effort === config.codexReasoningEffort)) {
    throw new Error(`Codex model ${config.codexModel} does not support reasoning effort ${config.codexReasoningEffort}`);
  }
  if (config.codexSpeedTier === "fast" && !(model.additional_speed_tiers || []).includes("fast")) {
    throw new Error(`Codex model ${config.codexModel} does not advertise fast mode.`);
  }
}

async function runCodex(args: string[], stdin: string, timeoutMs: number): Promise<string> {
  return runProcess("codex", args, stdin, timeoutMs);
}

function runProcess(command: string, args: string[], stdin: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32"
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`${command} exited with code ${code}: ${stderr || stdout}`));
      }
    });
    child.stdin.write(stdin);
    child.stdin.end();
  });
}

function parseJsonObject(output: string): unknown {
  try {
    return JSON.parse(output);
  } catch {
    const start = output.indexOf("{");
    const end = output.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("Codex output did not contain a JSON object.");
    }
    return JSON.parse(output.slice(start, end + 1));
  }
}

function validateCodexResult(schemaPath: string, value: unknown): void {
  const schema = JSON.parse(require("node:fs").readFileSync(path.resolve(schemaPath), "utf8"));
  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(schema);
  if (!validate(value)) {
    throw new Error(`Codex output failed schema validation: ${JSON.stringify(validate.errors)}`);
  }
}
