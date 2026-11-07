/**
 * What a Markdown code span shows, by CommonMark's rule: a run of backticks opens it and the first run of exactly as many closes it,
 * one space goes from each end of what lies between when both ends have one and it is not all spaces, and nothing in it is read as
 * Markdown, so a link, an image, emphasis, HTML or an entity in it shows as written.
 *
 * @returns The text the span shows, or null when `markdown` is not one code span on one line from end to end: a span that closes
 *   early, never closes or holds a line break, which can start a new block before the span closes.
 */
export function codeSpanText(markdown: string): string | null {
  const fence = /^`+/.exec(markdown)?.[0];
  if (fence === undefined || /[\r\n]/.test(markdown)) return null;
  const runs = /`+/g;
  runs.lastIndex = fence.length;
  for (let run = runs.exec(markdown); run !== null; run = runs.exec(markdown)) {
    if (run[0].length !== fence.length) continue;
    if (run.index + run[0].length !== markdown.length) return null;
    const inner = markdown.slice(fence.length, run.index);
    return inner.startsWith(" ") && inner.endsWith(" ") && /[^ ]/.test(inner) ? inner.slice(1, -1) : inner;
  }
  return null;
}
