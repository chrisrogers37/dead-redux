import type { Track } from "@/lib/types";

const row = (n: number, title: string, duration: number): Track => ({
  title,
  duration,
  trackPosition: n,
  mp3Url: "",
  flacUrl: null,
});

/* The tracks of a soundboard recording of the 1986-07-04 show, used only when the fetch returns no source, so the page always has a setlist to set. */
export const FALLBACK_TRACKS: Track[] = [
  row(1, "Tuning", 98),
  row(2, "Jack Straw", 386),
  row(3, "Dupree's Diamond Blues", 461),
  row(4, "C C Rider", 418),
  row(5, "Tennessee Jed", 540),
  row(6, "My Brother Esau", 258),
  row(7, "Touch Of Grey", 333),
  row(8, "Cold Rain And Snow ->", 368),
  row(9, "Fire On The Mountain ->", 570),
  row(10, "Samson And Delilah", 342),
  row(11, "The Wheel ->", 283),
  row(12, "I Need A Miracle ->", 213),
  row(13, "Uncle John's Band ->", 450),
  row(14, "Drums ->", 502),
  row(15, "Space ->", 232),
  row(16, "Gimme Some Lovin' ->", 313),
  row(17, "Goin' Down The Road Feeling Bad ->", 307),
  row(18, "Turn On Your Lovelight", 272),
  row(19, "U.S. Blues", 287),
];

export const FALLBACK_LINEAGE = "SBD -> Cassette Master -> Cassette -> Dat (48k)";
