import { readdirSync, readFileSync } from "fs";
import path from "path";
import { renderToStaticMarkup } from "react-dom/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { getScriptNonceFromHeader } from "next/dist/server/app-render/get-script-nonce-from-header";
import { describe, expect, it, vi } from "vitest";
import nextConfig from "../../../next.config";
import RootLayout from "../../app/layout";
import { config, proxy } from "../../proxy";
import { THREE_FILES, contentSecurityPolicy } from "../csp";

// The nonce the proxy would have put on this request, and the fonts, which the layout loads from Google at build time.
const NONCE = "bm9uY2UtZm9yLWEtdGVzdA==";
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-nonce": NONCE }) }));
vi.mock("next/font/google", () => ({ Bricolage_Grotesque: () => ({ variable: "grotesk" }), DM_Mono: () => ({ variable: "mono" }) }));

const SITE = "https://dead-redux.vercel.app";

/** The import map's text, as the layout writes it. */
async function importMap(): Promise<{ html: string; imports: Record<string, string> }> {
  const html = renderToStaticMarkup(await RootLayout({ children: null }));
  const text = html.match(/<script type="importmap"[^>]*>(.*?)<\/script>/)?.[1];
  if (!text) throw new Error("the layout writes no import map");
  return { html, imports: JSON.parse(text).imports };
}

describe("the headers on every response", () => {
  it("frames only on the site, sniffs no types, sends other sites only the origin, and refuses the browser features no page uses", async () => {
    expect(nextConfig.poweredByHeader).toBe(false);
    expect(await nextConfig.headers?.()).toEqual([
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value:
              "accelerometer=(), autoplay=(self), bluetooth=(), browsing-topics=(), camera=(), clipboard-read=(), clipboard-write=(self), " +
              "display-capture=(), encrypted-media=(), fullscreen=(), gamepad=(), geolocation=(), gyroscope=(), hid=(), idle-detection=(), " +
              "local-fonts=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), " +
              "screen-wake-lock=(self), serial=(), usb=(), web-share=(self), window-management=(), xr-spatial-tracking=()",
          },
        ],
      },
    ]);
  });
});

describe("a page's Content-Security-Policy", () => {
  it("allows what a page loads and refuses the rest", () => {
    expect(contentSecurityPolicy(NONCE).split("; ")).toEqual([
      "default-src 'none'",
      `script-src 'self' 'nonce-${NONCE}' https://cdn.jsdelivr.net/npm/three@0.185.0/build/three.module.min.js ` +
        "https://cdn.jsdelivr.net/npm/three@0.185.0/build/three.core.min.js " +
        "https://cdn.jsdelivr.net/npm/three@0.185.0/examples/jsm/utils/BufferGeometryUtils.js",
      "style-src 'self'",
      "font-src 'self'",
      "img-src 'self'",
      "manifest-src 'self'",
      "media-src https://archive.org https://*.archive.org",
      "connect-src 'self'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'self'",
    ]);
  });

  it("names each three.js file the world imports through the import map, and the core the module imports", async () => {
    const { imports } = await importMap();
    // A bare name resolves through its own entry, or through the longest entry ending in "/" that begins it.
    const resolve = (specifier: string) => {
      if (imports[specifier]) return imports[specifier];
      const prefix = Object.keys(imports).filter((key) => key.endsWith("/") && specifier.startsWith(key)).sort((a, b) => b.length - a.length)[0];
      if (!prefix) throw new Error(`the import map does not resolve ${specifier}`);
      return imports[prefix] + specifier.slice(prefix.length);
    };
    const world = path.resolve(__dirname, "../../../public/world");
    const specifiers = readdirSync(world)
      .filter((file) => file.endsWith(".js"))
      .flatMap((file) => [...readFileSync(path.join(world, file), "utf8").matchAll(/\bfrom "(three(?:\/[^"]*)?)"/g)].map((m) => m[1]));
    expect(specifiers).toContain("three");
    const loaded = new Set(specifiers.map(resolve));
    loaded.add(new URL("three.core.min.js", resolve("three")).href);
    expect([...loaded].sort()).toEqual([...THREE_FILES].sort());
  });
});

describe("the proxy", () => {
  it("puts a fresh nonce in each page's policy, on the response and on the request Next.js renders from", () => {
    const first = proxy(new NextRequest(`${SITE}/`));
    const policy = first.headers.get("content-security-policy") ?? "";
    // Next.js finds the nonce this way when it writes its inline scripts.
    const nonce = getScriptNonceFromHeader(policy);
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{20,}={0,2}$/);
    expect(policy).toBe(contentSecurityPolicy(nonce ?? ""));
    expect(first.headers.get("x-middleware-request-content-security-policy")).toBe(policy);
    expect(first.headers.get("x-middleware-request-x-nonce")).toBe(nonce);

    const second = proxy(new NextRequest(`${SITE}/`));
    expect(getScriptNonceFromHeader(second.headers.get("content-security-policy") ?? "")).not.toBe(nonce);
  });

  it("runs for every path but the build's files, the world's modules, the maps and the API", () => {
    const runs = (pathname: string) => unstable_doesMiddlewareMatch({ config, url: `${SITE}${pathname}` });
    for (const path of ["/", "/1986-07-04", "/archive", "/archive/1986-07", "/no/such/page", "/no.such.page", "/favicon.ico", "/icon"]) {
      expect(runs(path), path).toBe(true);
    }
    for (const path of ["/_next/static/immutable/chunks/0t1evh_uibul6.js", "/world/main.js", "/maps/1986-07-04.json", "/api/playing/1986-07-04"]) {
      expect(runs(path), path).toBe(false);
    }
  });
});

describe("the root layout", () => {
  it("gives the import map the request's nonce", async () => {
    const { html } = await importMap();
    expect(html).toContain(`<script type="importmap" nonce="${NONCE}">`);
  });
});
