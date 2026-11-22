// The near stills: the shoot stands the visitor beside a landmark, 14 m short of it on the path and facing it, the last bear beside it
// (?pose=near-K and its `world:near` event, public/world/main.js), in first person with the HUD's shelves put away, so a landmark is
// judged whole, at the size a visitor sees it. One page load shows a whole show's landmarks: the page opens beside the first, and an
// event moves the visitor to each of the others. Every still is taken on a desktop and on a phone, whose landmarks have fewer faces.

// A still's name for a song: its title in lower case, apostrophes dropped, anything else that is not a letter or a digit a hyphen.
export const slug = (title) => title.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// The fixed day, and its show's songs in order (1986-07-04, as public/maps has them): every one is shot.
export const FIXED_DAY = "2026-10-20";
export const FIXED_TITLES = [
  "Tuning", "Jack Straw", "Dupree's Diamond Blues", "C C Rider", "Tennessee Jed", "My Brother Esau", "Touch Of Grey",
  "Cold Rain And Snow ->", "Fire On The Mountain ->", "Samson And Delilah", "The Wheel ->", "I Need A Miracle ->", "Uncle John's Band ->",
  "Drums ->", "Space ->", "Gimme Some Lovin' ->", "Goin' Down The Road Feeling Bad ->", "Turn On Your Lovelight", "U.S. Blues",
];

// The kinds of landmark the fixed day's show lacks, as [song's index, title, the still's name where the title is not it]: on a second
// load of the fixed day, each of these songs' landmarks is built as a song of that title would have it (?as=K:Title,
// public/world/main.js), at its own song's point. The last is a song with no landmark of its own: the standing stone. With the fixed
// day's own nineteen, these show every row of the builders' table (public/world/landmarks.js), which
// scripts/__tests__/near-landmarks.test.ts holds them to. The points are ones where the view is clear from 14 m, which the test checks
// too, and none is the first song's, where the playing song's column of light stands until the show moves on. The standing stone
// has the last song's point, where it stands against the sky.
export const AS_TITLES = [
  [1, "Morning Dew"], [2, "Sugar Magnolia"], [3, "Dark Star"], [4, "Box Of Rain"], [5, "Playin' In The Band"], [7, "Truckin'"],
  [8, "Eyes Of The World"], [9, "Not Fade Away"], [10, "One More Saturday Night"], [11, "Scarlet Begonias"], [12, "Ripple"],
  [17, "Terrapin Station"], [18, "China Cat Sunflower", "standing-stone"],
];

// The standing stones: a song with no landmark of its own gets one of eight kinds of stone, by its title (stoneKind,
// public/world/landmarks.js). On a third load of the fixed day, eight of its songs' landmarks are built as these eight songs would have
// them: songs from the maps that no rule matches, one of each kind in the kinds' own order (a menhir, a leaning slab, a split stone, a
// cairn, a trilithon, a pair, a stele, a balanced boulder), at points where the view is clear from 14 m. The cairn stands at song 4's
// point, on the steep climb, where the visitor looks up at a stone's lower side: one that hung over the slope or lay buried in it
// would show there. The test holds this table to all of that.
export const STONE_TITLES = [
  [2, "Cassidy"], [9, "Casey Jones"], [16, "To Lay Me Down"], [4, "Wharf Rat"], [10, "Peggy-O"], [7, "The Other One"], [12, "Bertha"], [18, "Little Red Rooster"],
];

// How many frames the world draws after a move before its still is taken: the one that draws the cut, with the bears in their places,
// and one more, so that the still is taken of a frame that has been shown.
export const NEAR_FRAMES = 2;

// A page of near stills (shoot.mjs's PAGES) of `songs` ([index, title], ...) on the fixed day, with the landmarks of `as` built for
// other titles: it opens beside the first, and each step stands the visitor by a song's landmark and shoots it as `<prefix>-<slug>`.
// The page is shot `whole`: in first person, where the visitor's own bear is out of the frame, with the shelves away.
const nearPage = (songs, prefix, as = []) => ({
  path: `/${FIXED_DAY}?pose=near-${songs[0][0]}${as.map(([index, title]) => `&as=${index}:${encodeURIComponent(title)}`).join("")}`,
  devices: ["desktop", "phone"],
  whole: true,
  shots: [],
  steps: songs.map(([index, title, name = slug(title)]) => ({ near: index, title, shot: `${prefix}-${name}` })),
});

// The shoot's pages for the near stills: the fixed day's own landmarks, then the other kinds, then the eight standing stones.
export const nearPages = () => [
  nearPage(FIXED_TITLES.map((title, index) => [index, title]), "fixed-near"),
  nearPage(AS_TITLES, "fixed-as", AS_TITLES),
  nearPage(STONE_TITLES, "fixed-stone", STONE_TITLES),
];

// Why a near still is wrong, or null: the page says which song the visitor stands by and the title its landmark is built for
// (window.__hill.near), and both must be the step's; and no other landmark may stand in the view. The fixed day's page takes its
// setlist from Relisten as it loads, so a title that has moved there fails the run here, by name, before a still of some other
// landmark is read as this one's.
export function standFailure(near, step) {
  if (!near) return `the page stands the visitor by no landmark, where song ${step.near}, "${step.title}", was asked for`;
  if (near.index !== step.near) return `the visitor stands by song ${near.index}, "${near.title}", not song ${step.near}, "${step.title}"`;
  if (slug(near.title) !== slug(step.title)) return `song ${step.near}'s landmark is built for "${near.title}" on this page, where near.mjs has "${step.title}"`;
  if (!near.clear) return `another landmark stands in the view of song ${step.near}'s, "${step.title}"`;
  return null;
}
