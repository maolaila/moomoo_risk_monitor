import { describe, expect, it } from "vitest";
import { buildYahooFinanceTickerFeeds, defaultNewsFeeds, defaultPolicyFeeds, defaultSocialFeeds } from "../src/default-feeds";
import { Holding } from "../src/types";

describe("default feeds", () => {
  it("ships three source layers by default", () => {
    expect(defaultPolicyFeeds).toContain("https://www.whitehouse.gov/briefings-statements/feed/");
    expect(defaultNewsFeeds).toContain("https://seekingalpha.com/market_currents.xml");
    expect(defaultSocialFeeds).toContain("https://truthsocial.com/@realDonaldTrump.rss");
  });

  it("builds Yahoo Finance ticker feeds from current holdings", () => {
    const holdings = [
      { ticker: "SNDK", quantity: 1, sourceFile: "snapshot.json" },
      { ticker: "sndk", quantity: 1, sourceFile: "snapshot.json" },
      { ticker: "IONQ", quantity: 1, sourceFile: "snapshot.json" }
    ] satisfies Holding[];

    expect(buildYahooFinanceTickerFeeds(holdings)).toEqual([
      "https://finance.yahoo.com/rss/headline?s=SNDK",
      "https://finance.yahoo.com/rss/headline?s=IONQ"
    ]);
  });
});
