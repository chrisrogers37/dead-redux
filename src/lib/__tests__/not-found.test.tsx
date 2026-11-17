import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import NotFound from "../../app/not-found";

describe("NotFound", () => {
  it("lays the 404 out with the stylesheet's classes alone, with no style attribute or element for the policy to refuse", () => {
    const html = renderToStaticMarkup(<NotFound />);
    expect(html).not.toContain("style=");
    expect(html).not.toContain("<style");
    expect(html).toContain(">Page not found</h1>");
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/archive"');
  });
});
