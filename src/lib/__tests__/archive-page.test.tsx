import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Archive } from "../../components/Archive";
import { archiveMonths, getArchivePicks } from "../archive";

// The day rows and the month links in the markup, each as the attribute it is found by.
const rows = (html: string) => html.match(/href="\/\d{4}-\d{2}-\d{2}"/g) ?? [];
const monthLinks = (html: string) => html.match(/href="\/archive\/\d{4}-\d{2}"/g) ?? [];

describe("Archive", () => {
  // The site day archive.test.ts uses, passed in so that no test reads the clock.
  const months = archiveMonths(getArchivePicks("2026-10-20"));

  it("renders one month's rows and links to the others", () => {
    const html = renderToStaticMarkup(<Archive months={months} open={months[0]} />);
    expect(rows(html)).toHaveLength(19);
    expect(rows(html)).toContain('href="/2026-10-19"');
    expect(rows(html)).not.toContain('href="/2026-09-30"');
    const others = ["2026-09", "2026-08", "2026-07", "2026-06", "2026-05", "2026-04", "2026-03", "2026-02"];
    expect(monthLinks(html)).toEqual(others.map((key) => `href="/archive/${key}"`));
    expect(html).toContain("October 2026");
    expect(html).toContain("Other months");
    expect(html).toContain("13 shows");
    // Static markup joins the text nodes; hydration markup separates them.
    expect(html).toMatch(/246(<!-- -->)? shows featured/);
    expect(html).toContain('data-month="2026-10"');
  });

  it("opens an older month with every other month listed, the newest included", () => {
    const html = renderToStaticMarkup(<Archive months={months} open={months[1]} />);
    expect(rows(html)).toHaveLength(30);
    expect(monthLinks(html)[0]).toBe('href="/archive/2026-10"');
    expect(monthLinks(html)).not.toContain('href="/archive/2026-09"');
    expect(html).toContain('data-month="2026-09"');
  });

  it("counts one show in the singular", () => {
    const second = archiveMonths(getArchivePicks("2026-11-02"));
    const html = renderToStaticMarkup(<Archive months={second} open={second[1]} />);
    // The ">" keeps "31 shows" from standing in for "1 shows".
    expect(html).toContain(">1 show<");
    expect(html).not.toContain(">1 shows");
  });

  it("shows the empty state with no months", () => {
    const html = renderToStaticMarkup(<Archive months={[]} open={null} />);
    expect(html).toContain("No shows in the archive yet.");
    expect(html).not.toContain("Other months");
    expect(rows(html)).toEqual([]);
    expect(html).not.toContain("data-month");
  });

  it("names its navigation, so a screen reader announces the site's links as one landmark", () => {
    const html = renderToStaticMarkup(<Archive months={months} open={months[0]} />);
    expect(html.match(/<nav[^>]*>/g)).toEqual([expect.stringContaining('aria-label="Site"')]);
  });
});
