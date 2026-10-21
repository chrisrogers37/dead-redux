import type { Source } from "./types";
import { notesToLines } from "./format";

/** Where the second set and the encore begin in a show's flattened track list, as track indices; null where the notes do not say. */
interface DerivedSets { set2Start: number | null; encoreStart: number | null; }

// Where one song ends and the next begins in a list: a comma, "->", ">" or "/".
const SONG_SPLIT = /,|->|>|\//;
// A line that opens the second set: "Set 2", "Set II", "Set Two" or "Second Set".
const SET2 = /^\s*(set\s*(2|ii|two)|second\s+set)\b/i;
// A line that begins with the encore, where the search for a second set ends.
const ENCORE_LINE = /^\s*(encore|e:)/i;
// A line that is the encore's: "Encore: U.S. Blues", "E. U.S. Blues" or a bare "Encore:".
const ENCORE_HEAD = /^\s*(encore|e)\s*[:.]/i;
// A piece of a song list that is the encore's: "E: U.S. Blues".
const ENCORE_INLINE = /^\s*(e|encore)\s*[:.]\s*/i;
// A track title that is the encore's: "Encore: U.S. Blues".
const ENCORE_TITLE = /^\s*encore\b/i;

/** The text before the first ",", "->", ">" or "/" of a list, which is its first song. */
function firstSong(list: string): string {
  return list.split(SONG_SPLIT)[0];
}

/** A title's comparison key: lowercase, "&" read as "and", a leading "the" dropped, then letters and digits only. */
function key(text: string): string {
  return text.toLowerCase().replace(/&/g, " and ").trim().replace(/^the\s+/, "").replace(/[^a-z0-9]/g, "");
}

/** The first index from `from` to `to` whose key is that of the opener's first song, or null; an opener without letters or digits matches nothing. */
function findOpener(keys: string[], opener: string, from: number, to: number): number | null {
  const wanted = key(firstSong(opener));
  if (!wanted) return null;
  for (let j = from; j <= to; j++) if (keys[j] === wanted) return j;
  return null;
}

/** Where set 2 and the encore begin in a source's tracks, from its notes (description first) and for the encore its track titles; null where they do not say. */
export function deriveSets(source: Source): DerivedSets {
  const tracks = source.sets.flatMap((s) => s.tracks);
  const N = tracks.length;
  const keys = tracks.map((t) => key(firstSong(t.title)));
  const lines = [...notesToLines(source.description ?? ""), ...notesToLines(source.taperNotes ?? "")];

  // A set 2 line names its opener after the colon, else on the next line. The opener leaves at least
  // three tracks in each set, and the search ends at an encore line.
  let set2Start: number | null = null;
  for (let i = 0; i < lines.length && set2Start === null; i++) {
    if (ENCORE_LINE.test(lines[i])) break;
    if (!SET2.test(lines[i])) continue;
    const colon = lines[i].indexOf(":");
    const after = colon < 0 ? "" : lines[i].slice(colon + 1);
    set2Start = findOpener(keys, after.trim() ? after : (lines[i + 1] ?? ""), 3, N - 3);
  }

  // An encore line, or a piece of a song list marked as the encore, names its opener among the last four tracks.
  let encoreStart: number | null = null;
  for (let i = 0; i < lines.length && encoreStart === null; i++) {
    let opener: string | undefined;
    if (ENCORE_HEAD.test(lines[i])) {
      const rest = lines[i].replace(ENCORE_HEAD, "");
      opener = rest.trim() ? rest : lines[i + 1];
    } else {
      opener = lines[i].split(SONG_SPLIT).find((piece) => ENCORE_INLINE.test(piece))?.replace(ENCORE_INLINE, "");
    }
    if (opener !== undefined) encoreStart = findOpener(keys, opener, Math.max(1, N - 4), N - 1);
  }
  // Where the notes name no encore, the first track titled as one begins it.
  for (let j = 1; j < N && encoreStart === null; j++) if (ENCORE_TITLE.test(tracks[j].title)) encoreStart = j;

  return { set2Start, encoreStart };
}

/** Whether a track title ends in "->" or ">", optionally followed by "*", a parenthesis or spaces, so the song segues into the next track. */
export function segueOut(title: string): boolean {
  return /(?:->|>)\s*(?:\*|\(.*\))?\s*$/.test(title);
}
