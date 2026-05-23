import fs from "node:fs/promises";
import path from "node:path";
import { CandidateEvent, CodexAnalysisResult, NormalizedEvent, RawEvent } from "./types";
import { ensureDir, sanitizeFilePart, todayLabel, writeJson } from "./utils";

export interface NewsPoolCleanupSummary {
  retentionHours: number;
  cutoffIso: string;
  deletedFiles: number;
  deletedDirs: number;
}

export async function ensureRuntimeDirs(dataDir: string): Promise<void> {
  for (const dir of ["raw", "normalized", "candidates", "codex", "codex/failed", "alerts", "alerts/daily", "emails", "emails/failed", "repairs", "logs", "manual-events"]) {
    await ensureDir(path.join(dataDir, dir));
  }
}

export async function saveRawEvent(dataDir: string, event: RawEvent): Promise<string> {
  const file = `${Date.now()}_${sanitizeFilePart(event.source)}_${sanitizeFilePart(event.title)}.json`;
  const filePath = path.join(dataDir, "raw", todayLabel(), file);
  await writeJson(filePath, event);
  return filePath;
}

export async function saveNormalizedEvent(dataDir: string, event: NormalizedEvent): Promise<string> {
  const filePath = path.join(dataDir, "normalized", todayLabel(), `${event.eventId}.json`);
  await writeJson(filePath, event);
  return filePath;
}

export async function saveCandidate(dataDir: string, candidate: CandidateEvent): Promise<string> {
  const filePath = path.join(dataDir, "candidates", todayLabel(), `${candidate.event.eventId}.json`);
  await writeJson(filePath, candidate);
  return filePath;
}

export async function saveCodexResult(dataDir: string, eventId: string, result: CodexAnalysisResult): Promise<string> {
  const filePath = path.join(dataDir, "codex", todayLabel(), `${eventId}.json`);
  await writeJson(filePath, result);
  return filePath;
}

export async function saveCodexFailure(dataDir: string, eventId: string, failure: unknown): Promise<string> {
  const filePath = path.join(dataDir, "codex", "failed", todayLabel(), `${eventId}.json`);
  await writeJson(filePath, failure);
  return filePath;
}

export async function saveAlert(dataDir: string, eventId: string, alert: unknown): Promise<string> {
  const filePath = path.join(dataDir, "alerts", todayLabel(), `${eventId}.json`);
  await writeJson(filePath, alert);
  return filePath;
}

export async function saveEmailRecord(dataDir: string, eventId: string, record: unknown, failed = false): Promise<string> {
  const baseDir = failed ? path.join("emails", "failed") : "emails";
  const filePath = path.join(dataDir, baseDir, todayLabel(), `${eventId}.json`);
  await writeJson(filePath, record);
  return filePath;
}

export async function saveRepairReport(dataDir: string, reportId: string, report: unknown): Promise<string> {
  const filePath = path.join(dataDir, "repairs", todayLabel(), `${sanitizeFilePart(reportId)}.json`);
  await writeJson(filePath, report);
  return filePath;
}

export async function cleanupNewsPool(dataDir: string, retentionHours: number): Promise<NewsPoolCleanupSummary> {
  const cutoffMs = Date.now() - Math.max(1, retentionHours) * 60 * 60 * 1000;
  const summary: NewsPoolCleanupSummary = {
    retentionHours,
    cutoffIso: new Date(cutoffMs).toISOString(),
    deletedFiles: 0,
    deletedDirs: 0
  };
  for (const dir of ["raw", "normalized", "candidates"]) {
    await cleanupDir(path.join(dataDir, dir), cutoffMs, summary, true);
  }
  return summary;
}

async function cleanupDir(dir: string, cutoffMs: number, summary: NewsPoolCleanupSummary, keepRoot = false): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await cleanupDir(fullPath, cutoffMs, summary);
      await removeEmptyDir(fullPath, summary);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const stat = await fs.stat(fullPath);
    if (stat.mtimeMs < cutoffMs) {
      await fs.rm(fullPath, { force: true });
      summary.deletedFiles += 1;
    }
  }

  if (!keepRoot) {
    await removeEmptyDir(dir, summary);
  }
}

async function removeEmptyDir(dir: string, summary: NewsPoolCleanupSummary): Promise<void> {
  try {
    if ((await fs.readdir(dir)).length === 0) {
      await fs.rmdir(dir);
      summary.deletedDirs += 1;
    }
  } catch (error) {
    if (!["ENOENT", "ENOTEMPTY"].includes((error as NodeJS.ErrnoException).code || "")) {
      throw error;
    }
  }
}
