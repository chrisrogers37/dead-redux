/** The three.js files the world loads from jsDelivr, at the version the import map pins: the module the map names, the core that module
 *  imports, and the one addon the world imports. */
export const THREE_FILES = [
  "https://cdn.jsdelivr.net/npm/three@0.185.0/build/three.module.min.js",
  "https://cdn.jsdelivr.net/npm/three@0.185.0/build/three.core.min.js",
  "https://cdn.jsdelivr.net/npm/three@0.185.0/examples/jsm/utils/BufferGeometryUtils.js",
];

/**
 * A page's Content-Security-Policy, with the nonce made for its request. Each source is something a page loads:
 * - script-src: the build's chunks and the world's modules ('self'); the inline scripts Next.js writes (the bootstrap and the page's
 *   data) and the import map, by the nonce; and the three.js files above.
 * - style-src, font-src, img-src and manifest-src: the build's stylesheet and fonts, the icons and the manifest, all the site's own.
 * - media-src: the recordings, which stream from archive.org and redirect to its storage hosts, such as dn720304.ca.archive.org.
 * - connect-src: the site's own requests.
 * default-src 'none' refuses everything else (workers, frames, objects); no base element, no form posts, and only the site itself may
 * frame a page, as X-Frame-Options says too.
 */
export function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'self' 'nonce-${nonce}' ${THREE_FILES.join(" ")}`,
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
