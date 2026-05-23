import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, todayLabel, writeJson } from "./utils";

export async function writeDailySummary(dataDir: string): Promise<string> {
  const date = todayLabel();
  const alertDir = path.join(dataDir, "alerts", date);
  const emailDir = path.join(dataDir, "emails", date);
  const failedEmailDir = path.join(dataDir, "emails", "failed", date);
  const candidateDir = path.join(dataDir, "candidates", date);
  const alerts = await countJson(alertDir);
  const emailsSent = await countJson(emailDir);
  const emailFailures = await countJson(failedEmailDir);
  const candidates = await countJson(candidateDir);
  const output = {
    kind: "DAILY_RISK_MONITOR_SUMMARY",
    date,
    candidates,
    alerts,
    emailsSent,
    emailFailures
  };
  const outPath = path.join(dataDir, "alerts", "daily", `${date}.json`);
  await ensureDir(path.dirname(outPath));
  await writeJson(outPath, output);
  return outPath;
}

async function countJson(dir: string): Promise<number> {
  try {
    return (await fs.readdir(dir)).filter((file) => file.endsWith(".json")).length;
  } catch {
    return 0;
  }
}
