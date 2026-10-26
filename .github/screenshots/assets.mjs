import { writeFile } from "fs/promises";
import { join } from "path";

/**
 * What the run does with a generated image's answer: it saves a 200 and skips a 404, since an image can be missing before the change
 * that adds it lands. Anything else, a 401, a 403 or a 5xx, is a page the site should serve and does not, so it fails the run.
 */
export function assetAction(status) {
  if (status === 200) return "save";
  if (status === 404) return "skip";
  return "fail";
}

/** The file a generated image is saved as: "/icon-192.png" as asset-icon-192.png, "/2026-03-01/opengraph-image" as asset-2026-03-01-opengraph-image.png. */
export const assetFile = (path) => `asset-${path.slice(1).replace(/\.png$/, "").replace(/\//g, "-")}.png`;

/**
 * Fetches each generated image from the site: a 200 is saved byte for byte in outDir, a 404 is logged and skipped. Returns each path
 * that answered anything else, with its status, after trying them all, so one failure does not hide another.
 */
export async function saveAssets(site, paths, outDir, log = console.log) {
  const failed = [];
  for (const path of paths) {
    const response = await fetch(new URL(path, site));
    const action = assetAction(response.status);
    if (action === "save") {
      const file = assetFile(path);
      await writeFile(join(outDir, file), Buffer.from(await response.arrayBuffer()));
      log(`${file}  ${path}`);
      continue;
    }
    await response.body?.cancel();
    log(`${path} answered ${response.status}${action === "fail" ? ", which fails the run" : ""}`);
    if (action === "fail") failed.push(`${path} answered ${response.status}`);
  }
  return failed;
}
