// The near stills: the shoot stands the visitor beside a landmark, 14 m short of it on the path and facing it, the last bear beside it
// (?pose=near-K and its `world:near` event, public/world/main.js), in first person with the HUD's shelves put away, so a landmark is
// judged whole, at the size a visitor sees it. One page load shows a whole show's landmarks: the page opens beside the first, and an
// event moves the visitor to each of the others.

// A still's name for a song: its title in lower case, apostrophes dropped, anything else that is not a letter or a digit a hyphen.
export const slug = (title) => title.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// The fixed day, and its show's songs in order (1986-07-04, as public/maps has them): every one is shot, on a desktop and a phone.
export const FIXED_DAY = "2026-10-20";
export const FIXED_TITLES = [
  "Tuning", "Jack Straw", "Dupree's Diamond Blues", "C C Rider", "Tennessee Jed", "My Brother Esau", "Touch Of Grey",
  "Cold Rain And Snow ->", "Fire On The Mountain ->", "Samson And Delilah", "The Wheel ->", "I Need A Miracle ->", "Uncle John's Band ->",
  "Drums ->", "Space ->", "Gimme Some Lovin' ->", "Goin' Down The Road Feeling Bad ->", "Turn On Your Lovelight", "U.S. Blues",
];

// The kinds of landmark the fixed day's show lacks, each on the day whose show has it, as [date, [song's index, its title], ...]: four
// days are the fewest that hold them all, and these are shot on a desktop. No show has Ripple yet, so nothing here shows its landmark;
// scripts/__tests__/near-landmarks.test.ts holds this table to the maps, the builders' table and the pick schedule.
export const NEAR_DATES = [
  ["2026-11-08", [0, "Terrapin Station >"], [1, "Morning Dew"], [2, "Sugar Magnolia"], [3, "Encore Break"]],
  ["2026-11-24", [4, "Dark Star >"]],
  ["2026-11-27", [5, "Box Of Rain"], [13, "Playin' In The Band"], [20, "Truckin"], [22, "Eyes Of The World"], [23, "Not Fade Away"], [25, "One More Saturday Night"]],
  ["2026-11-28", [8, "Scarlet Begonias"]],
];

// How many frames the world draws after a move before its still is taken: the cut, and the bears in their places beside the landmark.
export const NEAR_FRAMES = 3;

// A page of near stills (shoot.mjs's PAGES) of `songs` ([index, title], ...): it opens beside the first, and each step stands the
// visitor by a song's landmark and shoots it as `<prefix>-near-<slug>`. The page is shot `whole`: in first person, where the visitor's
// own bear is out of the frame, with the shelves away.
const nearPage = (day, devices, songs, prefix) => ({
  path: `/${day}?pose=near-${songs[0][0]}`,
  devices,
  whole: true,
  shots: [],
  steps: songs.map(([index, title]) => ({ near: index, title, shot: `${prefix}-near-${slug(title)}` })),
});

// The shoot's pages for the near stills.
export const nearPages = () => [
  nearPage(FIXED_DAY, ["desktop", "phone"], FIXED_TITLES.map((title, index) => [index, title]), "fixed"),
  ...NEAR_DATES.map(([date, ...songs]) => nearPage(date, ["desktop"], songs, date)),
];

// Why a near still is wrong, or null: the page says which song the visitor stands by (window.__hill.near), and it must be the step's,
// by index and by title. A page takes its setlist from Relisten as it loads, so a title that has moved there fails the run here, by
// name, before a still of some other landmark is read as this one's.
export function standFailure(near, step) {
  if (!near) return `the page stands the visitor by no landmark, where song ${step.near}, "${step.title}", was asked for`;
  if (near.index !== step.near) return `the visitor stands by song ${near.index}, "${near.title}", not song ${step.near}, "${step.title}"`;
  if (slug(near.title) !== slug(step.title)) return `song ${step.near} is "${near.title}" on this page, where near.mjs has "${step.title}"`;
  return null;
}
