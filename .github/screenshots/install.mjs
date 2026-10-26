import { appendFile, mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { chromium, request } from "playwright";

// The install surface, checked on the site the shoot shot: the manifest and the page's link to it, each icon the manifest lists against
// the PNG served at its path, and Chrome's own installability verdict over the DevTools protocol. Every check logs one line; a failed
// check fails the run once all of them have run.

const site = new URL(process.env.SITE_URL);
if (site.protocol !== "https:") {
  throw new Error(`SITE_URL must be an https URL, got ${process.env.SITE_URL}`);
}

// Each check's line, and whether it passed.
const findings = [];
const log = (line, ok = true) => {
  console.log(line);
  findings.push({ line, ok });
};

// A PNG's width and height, read from its header: the signature, then the IHDR chunk.
const pngSize = (bytes) => {
  const png = bytes.length >= 24 && bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" && bytes.subarray(12, 16).toString() === "IHDR";
  return png ? `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}` : null;
};

// What is wrong with a served icon, or null: it answers 200 as a PNG whose header gives the declared size.
const iconProblem = (response, type, size, sizes) => {
  if (!response.ok()) return `answered ${response.status()}`;
  if (!type.startsWith("image/png")) return "not image/png";
  if (size === null) return "not a PNG";
  if (size !== sizes) return "size differs";
  return null;
};

const manifestUrl = new URL("/manifest.webmanifest", site);
const api = await request.newContext();
const response = await api.get(manifestUrl.href);
const manifest = response.ok() ? await response.json().catch(() => null) : null;
log(
  `manifest ${manifestUrl} ${response.status()} ${response.headers()["content-type"] ?? "no content-type"}${manifest ? "" : ": not JSON"}`,
  manifest !== null
);

for (const { src, sizes, purpose = "any" } of manifest?.icons ?? []) {
  const icon = await api.get(new URL(src, manifestUrl).href);
  const type = icon.headers()["content-type"] ?? "no content-type";
  const size = icon.ok() ? pngSize(await icon.body()) : null;
  const problem = iconProblem(icon, type, size, sizes);
  log(`icon ${src} ${type} ${size ?? "no size"} declared ${sizes} ${purpose}${problem ? `: ${problem}` : ""}`, problem === null);
}
await api.dispose();

// Chrome answers the installability question, from a profile of its own: a browser context is off the record, and Chrome does not
// install from there. The headless shell the shoot uses may not answer; then its answer is logged as such.
const profile = await mkdtemp(join(tmpdir(), "install-"));
const context = await chromium.launchPersistentContext(profile, { channel: "chrome" }).catch((error) => {
  console.log(`chrome unavailable: ${error.message.split("\n")[0]}; using the headless shell`);
  return chromium.launchPersistentContext(profile);
});
try {
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(site.href, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load", { timeout: 30_000 }).catch(() => console.log(`${site} never finished loading; checking anyway`));
  const href = await page.evaluate(() => document.querySelector('link[rel="manifest"]')?.getAttribute("href") ?? null);
  const linked = href !== null && new URL(href, site).href === manifestUrl.href;
  log(`manifest link ${href ?? "absent"}${linked ? "" : `: not ${manifestUrl.pathname}`}`, linked);

  const cdp = await context.newCDPSession(page);
  const verdict = await cdp.send("Page.getInstallabilityErrors").catch((error) => ({ error }));
  if (verdict.error) {
    log(`installability ${site} not supported: ${verdict.error.message.split("\n")[0]}`);
  } else {
    const errors = verdict.installabilityErrors.map(({ errorId, errorArguments }) =>
      errorArguments.length === 0 ? errorId : `${errorId} (${errorArguments.map(({ name, value }) => `${name} ${value}`).join(", ")})`
    );
    log(`installability ${site} ${errors.length === 0 ? "installable" : `not installable: ${errors.join("; ")}`}`, errors.length === 0);
  }
} finally {
  await context.close();
}

// The job summary shows the result on the run's page, so nobody has to open the log.
if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = findings.map(({ line, ok }) => `- ${ok ? "" : "failed: "}\`${line}\``).join("\n");
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `### Install check\n\n${lines}\n`);
}

const failed = findings.filter(({ ok }) => !ok).length;
console.log(failed === 0 ? "install checks passed" : `${failed} install check${failed === 1 ? "" : "s"} failed`);
process.exit(failed === 0 ? 0 : 1);
