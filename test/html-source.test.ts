import { afterEach, describe, expect, it, vi } from "vitest";
import { SourceDefinition } from "../src/source-types";
import { fetchHtmlStaticEvents } from "../src/sources/html";

const source: SourceDefinition = {
  id: "bis-test",
  name: "BIS Test",
  enabled: true,
  adapter: "html_static",
  tier: "fast",
  category: "policy",
  cadenceMinutes: 10,
  url: "https://www.bis.gov/news-updates",
  selectors: {
    item: "a[href^=\"/press-release/\"]"
  }
};

describe("html source", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("extracts selected anchor items without generic navigation noise", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(`
      <main>
        <a href="#main-content">Skip to main content</a>
        <a href="/press-release/department-commerce-expands-entity-list">Department of Commerce Expands Entity List</a>
      </main>
    `, { status: 200 })));

    const events = await fetchHtmlStaticEvents(source, 48);

    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("Department of Commerce Expands Entity List");
    expect(events[0].url).toBe("https://www.bis.gov/press-release/department-commerce-expands-entity-list");
  });
});
