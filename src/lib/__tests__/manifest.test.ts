import { describe, expect, it } from "vitest";
import manifest from "../../app/manifest";

// The page colour, which the installed app's frame and splash take.
const PAGE = "#0B0B0D";

describe("manifest", () => {
  it("installs the site as Dead Redux, standalone from the home page, on the page colour", () => {
    const { name, start_url, display, background_color, theme_color } = manifest();
    expect(name).toBe("Dead Redux");
    expect(start_url).toBe("/");
    expect(display).toBe("standalone");
    expect(background_color).toBe(PAGE);
    expect(theme_color).toBe(PAGE);
  });

  it("lists each icon at the size its path names, as a PNG: 192 and 512 as drawn, 512 for a mask", () => {
    const icons = manifest().icons ?? [];
    for (const { src, sizes, type } of icons) {
      const side = src.match(/^\/icon-(\d+)\.png$/)?.[1];
      expect(side, src).toBeDefined();
      expect(sizes, src).toBe(`${side}x${side}`);
      expect(type, src).toBe("image/png");
    }
    const sizesFor = (purpose: string) => icons.filter((icon) => icon.purpose === purpose).map((icon) => icon.sizes).sort();
    expect(sizesFor("any")).toEqual(["192x192", "512x512"]);
    expect(sizesFor("maskable")).toEqual(["512x512"]);
  });
});
