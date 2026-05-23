import path from "node:path";
import { CandidateEvent, CodexAnalysisResult, NormalizedEvent, RawEvent } from "./types";
import { ensureDir, sanitizeFilePart, todayLabel, writeJson } from "./utils";

export async function ensureRuntimeDirs(dataDir: string): Promise<void> {
  for (const dir of ["raw", "normalized", "candidates", "codex", "codex/failed", "alerts", "alerts/daily", "emails", "emails/failed", "logs", "manual-events"]) {
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
