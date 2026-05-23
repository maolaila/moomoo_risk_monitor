import fs from "node:fs/promises";
import path from "node:path";
import { RawEvent } from "../types";
import { fileExists, readJsonFile } from "../utils";

export async function fetchManualEvents(dataDir: string): Promise<RawEvent[]> {
  const dir = path.join(dataDir, "manual-events");
  if (!(await fileExists(dir))) {
    return [];
  }
  const files = (await fs.readdir(dir)).filter((file) => file.endsWith(".json"));
  const events: RawEvent[] = [];
  for (const file of files) {
    const value = await readJsonFile<any>(path.join(dir, file));
    if (!value.title) {
      continue;
    }
    events.push({
      source: "manual",
      id: value.id || file,
      ticker: value.ticker,
      title: String(value.title),
      summary: value.summary,
      url: value.url,
      publishedAt: value.publishedAt,
      raw: value,
      metadata: value.metadata
    });
  }
  return events;
}
