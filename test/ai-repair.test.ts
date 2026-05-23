import { describe, expect, it } from "vitest";
import { buildAutoRepairArgs, buildAutoRepairPrompt } from "../src/ai-repair";
import { RiskMonitorConfig } from "../src/config";

describe("AI auto repair", () => {
  it("uses workspace-write sandbox for auto repair", () => {
    const args = buildAutoRepairArgs(config());

    expect(args).toContain("--sandbox");
    expect(args).toContain("workspace-write");
    expect(args).toContain("approval_policy=never");
    expect(args).toContain("service_tier=fast");
  });

  it("builds a repair prompt focused on restoring the monitor workflow", () => {
    const prompt = buildAutoRepairPrompt({
      config: config(),
      prompt: "repair instructions",
      error: new Error("scan failed"),
      currentTask: "采集来源：X",
      recentLogs: ["{\"level\":\"error\"}"]
    });

    expect(prompt).toContain("normal workflow can continue");
    expect(prompt).toContain("Do not edit .env");
    expect(prompt).toContain("npm run monitor");
    expect(prompt).not.toContain("smtpPass");
  });
});

function config(): RiskMonitorConfig {
  return {
    codexModel: "gpt-5.5",
    codexReasoningEffort: "xhigh",
    codexApprovalPolicy: "never",
    codexSpeedTier: "fast",
    codexServiceTier: "fast",
    aiRepairValidationCommands: ["npm run build", "npm test"],
    timezone: "Asia/Tokyo",
    sourceRegistryEnabled: true,
    socialWatchlistEnabled: true,
    newsPoolCleanupEnabled: true
  } as RiskMonitorConfig;
}
