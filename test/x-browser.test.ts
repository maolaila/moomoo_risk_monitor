import { describe, expect, it } from "vitest";
import { xAccountUrl, xSearchUrl } from "../src/sources/x-browser";

describe("x browser source", () => {
  it("normalizes handles and direct URLs", () => {
    expect(xAccountUrl("@realDonaldTrump")).toBe("https://x.com/realDonaldTrump");
    expect(xAccountUrl("WhiteHouse")).toBe("https://x.com/WhiteHouse");
    expect(xAccountUrl("https://x.com/POTUS")).toBe("https://x.com/POTUS");
  });

  it("builds an unauthenticated search fallback URL", () => {
    expect(xSearchUrl("@WhiteHouse")).toBe("https://x.com/search?q=from%3AWhiteHouse&src=typed_query&f=live");
  });
});
