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
    expect(registry.sources.some((source) => source.id === "ai-tech-industry-rss" && source.category === "industry")).toBe(true);
    expect(registry.sources.some((source) => source.id === "ai-supply-chain-news-search" && source.cadenceMinutes === 10)).toBe(true);
    expect(registry.sources.some((source) => source.id === "ai-policy-risk-news-search" && source.category === "policy")).toBe(true);
    expect(registry.sources.some((source) => source.id === "bis-export-controls-press")).toBe(true);
    expect(registry.sources.some((source) => source.id === "ustr-press-releases")).toBe(true);
    const xSource = registry.sources.find((source) => source.id === "x-key-accounts-browser");
    expect(xSource?.accounts).toContain("BISgov");
    expect(xSource?.accounts).toContain("OpenAI");
    expect(registry.sources.every((source) => source.id && source.name)).toBe(true);
  });
});
