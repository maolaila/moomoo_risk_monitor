import fs from "node:fs/promises";
import path from "node:path";
import { NormalizedEvent } from "./types";
import { appendJsonl, ensureDir, nowIso } from "./utils";

interface SeenRow {
  eventId: string;
  contentHash: string;
  firstSeenAt: string;
  lastSeenAt: string;
  source: string;
  title: string;
  url?: string;
}

export async function dedupeEvents(dataDir: string, events: NormalizedEvent[]): Promise<NormalizedEvent[]> {
  await ensureDir(dataDir);
  const seenPath = path.join(dataDir, "seen.jsonl");
  const seen = await readSeen(seenPath);
  const newEvents: NormalizedEvent[] = [];

  for (const event of events) {
    if (seen.eventIds.has(event.eventId) || seen.contentHashes.has(event.contentHash)) {
      await appendJsonl(seenPath, {
        eventId: event.eventId,
        contentHash: event.contentHash,
        firstSeenAt: nowIso(),
        lastSeenAt: nowIso(),
        source: event.source,
        title: event.title,
        url: event.url,
        duplicate: true
      });
      continue;
    }
    newEvents.push(event);
    seen.eventIds.add(event.eventId);
    seen.contentHashes.add(event.contentHash);
    await appendJsonl(seenPath, {
      eventId: event.eventId,
      contentHash: event.contentHash,
      firstSeenAt: nowIso(),
      lastSeenAt: nowIso(),
      source: event.source,
      title: event.title,
      url: event.url
    } satisfies SeenRow);
  }

  return newEvents;
}

async function readSeen(seenPath: string): Promise<{ eventIds: Set<string>; contentHashes: Set<string> }> {
  const eventIds = new Set<string>();
  const contentHashes = new Set<string>();
  try {
    const raw = await fs.readFile(seenPath, "utf8");
    for (const line of raw.split(/\r?\n/).filter(Boolean)) {
      const row = JSON.parse(line) as SeenRow;
      eventIds.add(row.eventId);
      contentHashes.add(row.contentHash);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
  return { eventIds, contentHashes };
}
