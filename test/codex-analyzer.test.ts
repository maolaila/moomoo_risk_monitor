import { describe, expect, it } from "vitest";
import { buildCodexArgs } from "../src/codex-analyzer";
import { RiskMonitorConfig } from "../src/config";

describe("codex analyzer command", () => {
  it("uses gpt-5.5, xhigh, fast mode, read-only sandbox, and ephemeral mode", () => {
    const args = buildCodexArgs({
      codexModel: "gpt-5.5",
      codexReasoningEffort: "xhigh",
      codexApprovalPolicy: "never",
      codexSandbox: "read-only",
      codexOutputSchema: "schemas/risk_analysis.schema.json",
      codexTimeoutMs: 120000,
      codexSpeedTier: "fast",
      codexServiceTier: "fast"
    } as RiskMonitorConfig);
    expect(args).toContain("--model");
    expect(args).toContain("gpt-5.5");
    expect(args).toContain("model_reasoning_effort=xhigh");
    expect(args).toContain("model_speed_tier=fast");
    expect(args).toContain("service_tier=fast");
    expect(args).toContain("approval_policy=never");
    expect(args).toContain("--sandbox");
    expect(args).toContain("read-only");
    expect(args).toContain("--ephemeral");
  });
});
