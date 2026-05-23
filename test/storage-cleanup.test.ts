import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cleanupNewsPool } from "../src/storage";

describe("news pool cleanup", () => {
  it("deletes old transient news files but preserves alert and log files", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "risk-cleanup-"));
    const oldRaw = path.join(dir, "raw", "2026-05-22", "old.json");
    const freshRaw = path.join(dir, "raw", "2026-05-23", "fresh.json");
    const oldCandidate = path.join(dir, "candidates", "2026-05-22", "old.json");
    const alert = path.join(dir, "alerts", "2026-05-22", "keep.json");
    const log = path.join(dir, "logs", "2026-05-22.jsonl");

    await writeFile(oldRaw);
    await writeFile(freshRaw);
    await writeFile(oldCandidate);
    await writeFile(alert);
    await writeFile(log);

    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await fs.utimes(oldRaw, oldDate, oldDate);
    await fs.utimes(oldCandidate, oldDate, oldDate);

    const summary = await cleanupNewsPool(dir, 24);

    expect(summary.deletedFiles).toBe(2);
    await expect(fs.access(oldRaw)).rejects.toThrow();
    await expect(fs.access(oldCandidate)).rejects.toThrow();
    await expect(fs.access(freshRaw)).resolves.toBeUndefined();
    await expect(fs.access(alert)).resolves.toBeUndefined();
    await expect(fs.access(log)).resolves.toBeUndefined();
  });
});

async function writeFile(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, "{}\n", "utf8");
}
