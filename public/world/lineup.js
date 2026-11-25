/* The band's line-up on the night of a show (band.js): how many played, and in what roles, by the show's date. A line-up is a count
   and a set of roles, never people: the lead guitar, the rhythm guitar, the bass, one or two drummers, the organ, a second keyboard
   ("keys"), the piano, and a singer at a microphone with no instrument. The same role in two eras is the same player on the stage,
   since it is a role and not a person.

   The dates are Wikipedia's "List of Grateful Dead members" (https://en.wikipedia.org/wiki/List_of_Grateful_Dead_members, read
   2026-11-24): each member's dates of activity, and its table of the band's line-ups. Touring musicians are left out but one: Ned
   Lagin, who sat in through 1974, is a guest; Bruce Hornsby, who toured as the band's pianist from September 1990 to March 1992,
   is in, for the whole of that span. Where the page gives a month and no day, or its two lists disagree, the edge stands between
   two of the catalog's shows (data/shows.json), so that it moves none of them; those edges are marked "lean" below. The page gives
   every keyboard player as "keyboards" and says no more of which: the keyboard of each is this table's own reading of who played
   what, the organ for Pigpen, the piano for Keith Godchaux and for Hornsby, and a second keyboard ("keys") for Constanten, Mydland
   and Welnick.

   Each row is [from, to, roles], both dates the row's own, in date order and with no two overlapping. A date in no row, in the
   weeks between one line-up's last show and the next one's first, takes the row before it; a date before the first row takes the
   first. A catalog date whose day or month is not known (1973-XX-XX) is read as the first day it could be (1973-01-01). */
export const LINEUPS = [
  // To Mickey Hart's first show (September 29, 1967). The page has the band from June 1965 (lean: the catalog's first show is
  // 1965-11-01).
  ["1965-06-01", "1967-09-28", ["lead", "rhythm", "bass", "drums", "organ"]],
  // Hart, to Tom Constanten's first show (November 23, 1968).
  ["1967-09-29", "1968-11-22", ["lead", "rhythm", "bass", "drums", "drums", "organ"]],
  // Constanten, to his last show (January 30, 1970).
  ["1968-11-23", "1970-01-30", ["lead", "rhythm", "bass", "drums", "drums", "organ", "keys"]],
  // To Hart's last show before he left (February 18, 1971).
  ["1970-01-31", "1971-02-18", ["lead", "rhythm", "bass", "drums", "drums", "organ"]],
  // One drummer, to Pigpen's sick leave and Keith Godchaux's start, both "September 1971" on the page (lean: the catalog's last
  // show before is 1971-08-26, its next Keith's rehearsals of 1971-09-28).
  ["1971-02-19", "1971-08-31", ["lead", "rhythm", "bass", "drums", "organ"]],
  // Pigpen's sick leave, "September–November 1971", the piano in his place (lean: the catalog's last show of it is 1971-11-20, and
  // Pigpen is back at its next, 1971-12-01).
  ["1971-09-01", "1971-11-30", ["lead", "rhythm", "bass", "drums", "piano"]],
  // Pigpen back, beside the piano.
  ["1971-12-01", "1971-12-30", ["lead", "rhythm", "bass", "drums", "organ", "piano"]],
  // Donna Jean Godchaux's first show, December 31, 1971, as the page's list of members has it (lean: its table of line-ups has her
  // from March 1972), to Pigpen's last (June 17, 1972).
  ["1971-12-31", "1972-06-17", ["lead", "rhythm", "bass", "drums", "organ", "piano", "voice"]],
  // To Donna's maternity leave, "November–December 1973" (lean: the catalog's last show before it is 1973-10-30, its first 1973-11-01).
  ["1972-06-18", "1973-10-31", ["lead", "rhythm", "bass", "drums", "piano", "voice"]],
  // The leave (lean: the catalog's last show of it is 1973-12-19, and its next 1974-02-22).
  ["1973-11-01", "1973-12-31", ["lead", "rhythm", "bass", "drums", "piano"]],
  // Donna back, to Hart's return (October 20, 1974).
  ["1974-01-01", "1974-10-19", ["lead", "rhythm", "bass", "drums", "piano", "voice"]],
  // Hart back, to Keith's and Donna's last show (February 17, 1979).
  ["1974-10-20", "1979-02-17", ["lead", "rhythm", "bass", "drums", "drums", "piano", "voice"]],
  // Brent Mydland's first show (April 22, 1979) to his last (July 23, 1990).
  ["1979-04-22", "1990-07-23", ["lead", "rhythm", "bass", "drums", "drums", "keys"]],
  // Vince Welnick's first show (September 7, 1990), and Hornsby's span, "September 1990 – March 1992" (lean: from the catalog's
  // first show of that September, Welnick's, to its last of that March, 1992-03-24).
  ["1990-09-07", "1992-03-24", ["lead", "rhythm", "bass", "drums", "drums", "keys", "piano"]],
  // To the band's last show (July 9, 1995).
  ["1992-03-25", "1995-07-09", ["lead", "rhythm", "bass", "drums", "drums", "keys"]],
];

/* The roles a line-up may hold, in the order a row lists them. */
export const ROLES = ["lead", "rhythm", "bass", "drums", "organ", "keys", "piano", "voice"];

/* A date as the table reads it: YYYY-MM-DD, an unknown month or day ("XX") read as its first. */
const readable = (date) => String(date).replace(/^(\d{4})-XX/, "$1-01").replace(/^(\d{4}-\d{2})-XX/, "$1-01");

/* The line-up that played a show on `date` (YYYY-MM-DD): its row of LINEUPS, as { from, to, roles }. */
export function lineupOn(date) {
  const day = readable(date);
  let row = LINEUPS[0];
  for (const each of LINEUPS) if (each[0] <= day) row = each;
  return { from: row[0], to: row[1], roles: row[2] };
}
