import { NormalizedEvent, RawEvent } from "./types";
import { normalizeText, nowIso, sha256 } from "./utils";

export function normalizeEvent(event: RawEvent, rawPath?: string): NormalizedEvent {
  const normalizedTitle = normalizeText(event.title);
  const eventId = sha256([event.source, normalizedTitle, event.url || "", event.publishedAt || event.id || ""].join("|"));
  const contentHash = sha256([event.title, event.summary || "", event.url || ""].join("|"));

  return {
    eventId,
    source: event.source,
    matchedTickers: event.ticker ? [event.ticker.toUpperCase()] : [],
    title: event.title.trim(),
    summary: event.summary?.trim(),
    url: event.url,
    publishedAt: event.publishedAt,
    detectedAt: nowIso(),
    contentHash,
    sourceCredibility: credibilityFor(event.source),
    rawPath,
    metadata: event.metadata
  };
}

function credibilityFor(source: RawEvent["source"]): "LOW" | "MEDIUM" | "HIGH" {
  if (source === "sec") {
    return "HIGH";
  }
  if (source === "crawler") {
    return "HIGH";
  }
  if (source === "social") {
    return "MEDIUM";
  }
  if (source === "search") {
    return "MEDIUM";
  }
  if (source === "manual") {
    return "HIGH";
  }
  return "MEDIUM";
}
