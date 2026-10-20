import { describe, it, expect } from "vitest";
import { shareContent } from "../share";

// A past day: featured on 2026-03-01, a show from 1992.
const deerCreek = {
  featuredDate: "2026-03-01",
  showDate: "1992-06-29",
  venue: "Deer Creek Music Center",
  location: "Noblesville, IN, USA",
  isToday: false,
};

describe("shareContent", () => {
  it("links to the featured day's page, not the show's date", () => {
    const { url, text, twitterUrl, facebookUrl } = shareContent(deerCreek);
    expect(url).toBe("https://dead-redux.vercel.app/2026-03-01");
    expect(twitterUrl).toBe(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`
    );
    expect(facebookUrl).toBe(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`);
  });

  it("says today only for today's show", () => {
    expect(shareContent({ ...deerCreek, isToday: true }).text).toBe(
      "Today's Dead show: Deer Creek Music Center, Noblesville, IN, USA — 1992-06-29"
    );
    expect(shareContent(deerCreek).text).toBe(
      "Featured on March 1, 2026: Deer Creek Music Center, Noblesville, IN, USA — 1992-06-29"
    );
  });
});
