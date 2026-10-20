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
 * Format a rating to one decimal place.
 * 9.570934 → "9.6"
 */
export function formatRating(rating: number): string {
  return rating.toFixed(1);
}
