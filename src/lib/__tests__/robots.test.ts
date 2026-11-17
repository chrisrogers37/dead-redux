import { describe, expect, it } from "vitest";
import robots from "../../app/robots";

describe("robots", () => {
  it("lets every crawler read every page and gives it the sitemap", () => {
    expect(robots()).toEqual({
      rules: { userAgent: "*", allow: "/" },
      sitemap: "https://dead-redux.vercel.app/sitemap.xml",
    });
  });
});
