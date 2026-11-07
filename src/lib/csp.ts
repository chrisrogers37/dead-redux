import { importMap } from "@/lib/import-map";

/**
 * A page's Content-Security-Policy, with the nonce made for its request. Each source is something a page loads:
 * - script-src: the build's chunks and the world's modules ('self'); the inline scripts Next.js writes (the bootstrap and the page's
 *   data) and the import map, by the nonce; and each three.js file the import map pins, by its full URL.
 * - style-src, font-src, img-src and manifest-src: the build's stylesheet and fonts, the icons and the manifest, all the site's own.
 * - media-src: the recordings, which stream from archive.org and redirect to its storage hosts, such as dn720304.ca.archive.org.
 * - connect-src: the show's map, /maps/<show date>.json, which the world fetches from the site itself; a page connects nowhere else (its
 *   navigations are page loads).
 * default-src 'none' refuses everything else: workers, frames and objects. No base element, no form posts, and only the site itself may
 * frame a page, as X-Frame-Options says too.
 */
export function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'self' 'nonce-${nonce}' ${Object.keys(importMap.integrity).join(" ")}`,
    "style-src 'self'",
    "font-src 'self'",
    "img-src 'self'",
    "manifest-src 'self'",
    "media-src https://archive.org https://*.archive.org",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'self'",
  ].join("; ");
}
