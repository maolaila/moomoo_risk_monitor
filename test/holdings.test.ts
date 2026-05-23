import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadLatestHoldings, sanitizeHoldingExposure } from "../src/holdings";

describe("holdings loader", () => {
  it("loads latest snapshot, ignores zero quantity, and computes weights without account id", async () => {
    const result = await loadLatestHoldings(path.resolve("test/fixtures"));
    expect(result.holdings).toHaveLength(1);
    expect(result.holdings[0].ticker).toBe("SNDK");
    expect(result.holdings[0].portfolioWeight).toBe(0.2);
    expect(result.holdings[0].stockBookWeight).toBe(0.5);
    expect(JSON.stringify(sanitizeHoldingExposure(result.holdings[0]))).not.toContain("should_not_escape");
  });
});
