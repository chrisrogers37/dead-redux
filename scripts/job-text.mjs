// Text from the network, as a GitHub Actions job shows it as written: in its log, which reads each line of a step's output on its own,
// and in its summary, which is Markdown.

// A carriage return, a line feed or both end a line, in the job's log and in Markdown alike.
const LINE_BREAKS = /[\r\n]+/g;

/**
 * Text as part of one log line: as written, but for each run of line breaks, which is a space, and each "##[", which is "## [". Its
 * start stays as written: a line the script logs starts with its own words, and one it logs on purpose as a command stays one.
 *
 * @param text - Any value, written as a template literal writes it.
 */
export function logText(text) {
  return String(text).replace(LINE_BREAKS, " ").replaceAll("##[", "## [");
}

/**
 * Text as the job summary shows it as written: on one line, each run of line breaks a space, in a Markdown code span. CommonMark reads
 * nothing in a code span as Markdown and ends it only at a run of as many backticks as opened it, so the span opens with one backtick
 * more than the text's longest run. A space at each end keeps a backtick at either end of the text apart from the span's, and keeps
 * the text's own end spaces, since the span drops one space from each end when both ends have one and it is not all spaces.
 *
 * @param text - Any value, written as a template literal writes it. Empty text shows as nothing.
 */
export function summaryText(text) {
  const line = String(text).replace(LINE_BREAKS, " ");
  if (line === "") return "";
  let longest = 0;
  for (const [run] of line.matchAll(/`+/g)) longest = Math.max(longest, run.length);
  const fence = "`".repeat(longest + 1);
  const spaced = line.startsWith(" ") && line.endsWith(" ") && /[^ ]/.test(line);
  const pad = /^`|`$/.test(line) || spaced ? " " : "";
  return `${fence}${pad}${line}${pad}${fence}`;
}
