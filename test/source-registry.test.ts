import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadSourceRegistry } from "../src/source-registry";

describe("source registry", () => {
  it("loads crawler, search, rss, and browser source definitions", async () => {
    const registry = await loadSourceRegistry(path.resolve("config/sources.json"));
    const adapters = new Set(registry.sources.map((source) => source.adapter));

    expect(adapters.has("rss")).toBe(true);
    expect(adapters.has("ticker_rss")).toBe(true);
    expect(adapters.has("search_rss")).toBe(true);
    expect(adapters.has("html_static")).toBe(true);
    expect(adapters.has("browser_dynamic")).toBe(true);
    expect(adapters.has("x_browser")).toBe(true);
    expect(registry.sources.some((source) => source.adapter === "x_browser" && source.enabled && source.useGeneratedWatchlist)).toBe(true);
    expect(registry.sources.some((source) => source.category === "social")).toBe(true);
    expect(registry.sources.every((source) => source.id && source.name)).toBe(true);
  });
});
