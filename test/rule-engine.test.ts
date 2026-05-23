import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runRuleEngine } from "../src/rule-engine";
import { Holding, NormalizedEvent } from "../src/types";

const holding: Holding = {
  ticker: "SNDK",
  name: "SanDisk",
  quantity: 1,
  marketValueUsd: 2000,
  portfolioWeight: 0.2,
  stockBookWeight: 0.5,
  sourceFile: "snapshot.json"
};

describe("rule engine", () => {
  it("creates a high codex candidate for offering on held ticker", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "risk-rules-"));
    const event: NormalizedEvent = {
      eventId: "event",
      source: "rss",
      matchedTickers: [],
      title: "SanDisk announces convertible notes offering",
      detectedAt: "2026-05-23T00:00:00Z",
      contentHash: "hash",
      sourceCredibility: "MEDIUM"
    };
    const candidates = await runRuleEngine(dir, [event], [holding]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].highestRuleSeverity).toBe("HIGH");
    expect(candidates[0].shouldInvokeCodex).toBe(true);
  });

  it("ignores unrelated generic events", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "risk-rules-"));
    const event: NormalizedEvent = {
      eventId: "event",
      source: "rss",
      matchedTickers: [],
      title: "Generic market recap",
      detectedAt: "2026-05-23T00:00:00Z",
      contentHash: "hash",
      sourceCredibility: "MEDIUM"
    };
    expect(await runRuleEngine(dir, [event], [holding])).toHaveLength(0);
  });

  it("matches policy crawler events through sector exposure", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "risk-rules-"));
    const event: NormalizedEvent = {
      eventId: "event",
      source: "crawler",
      matchedTickers: [],
      title: "White House announces new export controls on semiconductor equipment and China restrictions",
      summary: "Policy update may affect flash memory and semiconductor supply chains.",
      detectedAt: "2026-05-23T00:00:00Z",
      contentHash: "hash",
      sourceCredibility: "HIGH"
    };
    const candidates = await runRuleEngine(dir, [event], [holding]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].matchedHoldingExposure[0].ticker).toBe("SNDK");
    expect(candidates[0].shouldInvokeCodex).toBe(true);
  });
});
