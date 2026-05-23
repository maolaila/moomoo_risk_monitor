import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { dedupeEvents } from "../src/dedupe";
import { NormalizedEvent } from "../src/types";

describe("dedupe", () => {
  it("dedupes by eventId and contentHash", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "risk-dedupe-"));
    const base: NormalizedEvent = {
      eventId: "a",
      source: "rss",
      matchedTickers: ["SNDK"],
      title: "SanDisk offering",
      detectedAt: "2026-05-23T00:00:00Z",
      contentHash: "hash-a",
      sourceCredibility: "MEDIUM"
    };
    expect(await dedupeEvents(dir, [base])).toHaveLength(1);
    expect(await dedupeEvents(dir, [{ ...base, eventId: "b" }])).toHaveLength(0);
    expect(await dedupeEvents(dir, [{ ...base, eventId: "c", contentHash: "hash-c" }])).toHaveLength(1);
  });
});
