/**
 * Format seconds into a human-readable duration string.
 * Examples: 342 → "5:42", 3661 → "1:01:01"
 */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "";

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

// Built once: constructing a formatter on every call is slow.
const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Format an ISO date string into a readable date.
 * "1977-05-08" → "May 8, 1977"; a partial date like "1977-XX-XX" stays as written.
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00Z");
  return isNaN(date.getTime()) ? dateStr : dateFormat.format(date);
}

/**
 * Drop a leading track number from a track title. "01 Tuning", "1. Tuning", "8) Tuning",
 * "12 - Tuning", "12- Tuning", "12 -Tuning" and "01-Tuning" all become "Tuning";
 * "4th Of July", "1977 Jam" and a file name such as "4-26-69d1t01.mp3" stay as written.
 */
export function stripTrackNumber(title: string): string {
  return title.replace(/^\d{1,3}(?:[.)]\s+|\s*-\s+|\s*-(?=[A-Za-z])|\s+)/, "");
}

// The extensions are listed because song titles such as "C.C.Rider", "U.S.Blues" and
// "Johnny B.Goode" also end in a dot and a word.
const PLACEHOLDER_TITLE = /\.(?:mp3|flac|shn|wav|ogg|m4a|aiff?)$|^track \d+$/i;

/**
 * Whether a track title is a placeholder rather than a song title. Some Relisten sources list
 * their files' names ("4-26-69d1t01.mp3") or bare numbers ("Track 7") as track titles.
 */
export function isPlaceholderTitle(title: string): boolean {
  return PLACEHOLDER_TITLE.test(title.trim());
}

// The named entities source text uses; numeric ones are decoded by code point.
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  nbsp: " ",
};

/**
 * Turn source text that may hold HTML into plain text: tags are dropped, then
 * entities are decoded, and each run of whitespace becomes one space. Only a "<"
 * followed by a letter, "/" or "!" starts a tag, so "configuration< (mic stand) >"
 * stays as written. "<b>flac16</b> SBD&gt; Master" → "flac16 SBD> Master".
 */
export function toPlainText(html: string): string {
  return html
    .replace(/<[a-z!/][^>]*>/gi, "")
    .replace(/&(?:#(\d+)|#x([0-9a-f]+)|(amp|lt|gt|quot|nbsp));/gi, (entity, dec, hex, name) => {
      if (name) return NAMED_ENTITIES[name.toLowerCase()];
      const code = dec ? Number(dec) : parseInt(hex, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    })
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Split source notes into plain-text lines. A `<br>` tag, with or without
 * attributes, or a newline ends a line; each line goes through toPlainText, and
 * blank lines are left out.
 */
export function notesToLines(notes: string): string[] {
  return notes
    .split(/<br\b[^>]*>|\n/i)
    .map(toPlainText)
    .filter(Boolean);
}

/**
 * Format a rating to one decimal place.
 * 9.570934 → "9.6"
 */
export function formatRating(rating: number): string {
  return rating.toFixed(1);
}
