import { describe, expect, it } from "vitest";
import { buildHoldingsFingerprint, extractXHandles, fallbackWatchlist } from "../src/social-watchlist";
import { Holding } from "../src/types";

describe("social watchlist", () => {
  it("uses a stable holdings fingerprint independent of input order", () => {
    expect(buildHoldingsFingerprint([holding("SNDK"), holding("IONQ")]))
      .toBe(buildHoldingsFingerprint([holding("IONQ"), holding("SNDK")]));
  });

  it("builds fallback x handles for policy and macro monitoring", () => {
    const watchlist = fallbackWatchlist([holding("SNDK"), holding("IONQ")]);
    const handles = extractXHandles(watchlist);

    expect(handles).toContain("realDonaldTrump");
    expect(handles).toContain("WhiteHouse");
    expect(handles).toContain("FederalReserve");
  });
});

function holding(ticker: string): Holding {
  return {
    ticker,
    name: ticker === "SNDK" ? "SanDisk" : "IonQ",
    quantity: 1,
    sourceFile: "snapshot.json"
  };
}
