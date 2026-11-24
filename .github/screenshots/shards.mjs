// The shoot's shards. The Screenshots workflow (.github/workflows/screenshots.yml) runs shoot.mjs as three jobs side by side, each
// doing the part of the shoot its SHARD names; with SHARD unset the script does the whole shoot, as a local run does. Every page of
// every device, every recording and the generated images are in exactly one shard (scripts/__tests__/shoot-shards.test.ts).
//
// A device's pages are loaded one after another in one browser context, and the site keeps things there from one load to the next
// (src/components): the place each day's show last played at (player/useResume.ts), which the next play step on that day resumes from
// unless its page names ?at=; the view, first person or third (world/view.ts); the shelves put away, in storage and in a cookie
// (world/shelves.ts); and what a page hands the next one it loads (world/carry.ts). So a still can depend on the pages shot before it.
// In the one-job run of c9753ad on 2026-11-23, desktop-fixed-stage-playing.png is of Space, track 15 of 19, 31 s in, because the
// page before it joined the show there with ?at=14; desktop-fixed-newday-playing.png is of Space too, 58 s in, where the crowd's page
// eleven pages before it stopped; and desktop-fixed-track-failed.png is 52 s into the first track, where the sleep timer's page
// stopped, the show's end before that having forgotten the place.
//
// So only the desktop is split, and only between its pages that act and its pages that only look (onlyLooks, below). The pages that
// act stay together, in the list's order, and each finds the browser as it does in the whole shoot. A page that only looks starts no
// show and leaves the view and the shelves as it found them, so the pages that act are the same without it, and it is the same
// without them: before each of them in the list, the view is third person and the shelves are out, as in a new browser.
//
// What each shard's pages took in two one-job runs, by their logs: 98680e8's, of main's world, then c9753ad's, of the heaviest world
// shot so far.
//   desktop-acts    21.6 min   24.4 min
//   desktop-looks    9.1 min   15.4 min   (the walk's sweep is 2.8 and 7.9 of them)
//   rest            21.0 min   24.2 min   (its recordings are 5.1 and 5.4 of them; their conversion, the compare and the install
//                                          check, which only it runs, took 1.7 and 1.8 more)
// The desktop's two parts are not even: its pages that act are 70 % and 61 % of its time, and each of them that plays leaves the place
// the next play step without ?at= resumes from. One cut among them would hold while archive.org streams: before the sleep timer's
// page, the show's end having forgotten the place two pages before it. It is not made, since `rest` is the longest shard either way
// and evening the desktop's parts would not shorten a run.
import { readdir, stat } from "fs/promises";
import { join } from "path";
import { assetFile } from "./assets.mjs";

/** The shards' names, which the workflow's matrix lists and SHARD takes. */
export const SHARDS = ["desktop-acts", "desktop-looks", "rest"];
const [ACTS, LOOKS, REST] = SHARDS;

/** The device whose pages two shards share. Every other device's pages are shot together, in `rest`. */
export const SPLIT_DEVICE = "desktop";

// What a page may name and still only look: where it is, who shoots it, its shots, and what the shoot waits for or checks in its
// answer. `whole` has the shoot press V and the shelves' tabs, and put both back after the last of a run of pages shot whole
// (showWhole, shoot.mjs); `sweep` sends the world events, as a near step does. Neither starts the show.
const LOOKING = new Set(["path", "devices", "shots", "end", "ready", "status", "whole", "sweep", "steps"]);
// What a step may name and still only look: a near step, which moves the visitor with an event the shoot sends (near.mjs).
const NEAR_STEP = new Set(["near", "title", "shot"]);

/**
 * Whether a page only looks: it is loaded and shot, and no step of it gives the page any input (a near step gives none). A page that
 * names anything else acts, and so does one that names something this list has not heard of: a page that clicks, presses, drags or
 * plays, one whose audio fails (`failAudio`), and one that checks what an earlier page left in the HTML (`served`).
 *
 * That default covers only what this list does not know. A new page made of fields it does know, shots and near steps, is shot apart
 * from the pages that act, in a browser where no show has played and no shelf has moved: one that must see what a play step or any
 * other page left has to act itself, or it will be shot without it and nothing here will say so.
 */
export function onlyLooks(page) {
  return Object.keys(page).every((key) => LOOKING.has(key)) && (page.steps ?? []).every((step) => Object.keys(step).every((key) => NEAR_STEP.has(key)));
}

/**
 * The pages a device shoots, in the list's order. The TV device is for a ride left alone, so it shoots the home page and only the
 * other pages that name it. A page may name the devices that shoot it; a device in `byName` (one without WebGL, and the phone on its side) shoots
 * only the pages that do.
 */
export function devicePages(device, pages, byName) {
  return pages.filter(({ path, devices }) => (device !== "tv" || path === "/" || devices?.includes("tv")) && (devices ? devices.includes(device) : !byName.has(device)));
}

/** The shard that shoots a page on a device. */
export const pageShard = (device, page) => (device !== SPLIT_DEVICE ? REST : onlyLooks(page) ? LOOKS : ACTS);

/**
 * The part of the shoot a shard does, or the whole shoot when `shard` is undefined: each device's pages, as [device, pages], in the
 * devices' order and the list's, without the devices that shoot nothing in it; the recordings; and the generated images. A name that
 * is no shard's is an error, the empty string too: a job whose SHARD came out empty would otherwise do the whole shoot.
 *
 * @param lists - { devices, byName, pages, recordings, assets }: shoot.mjs's devices' names, BY_NAME, PAGES and ASSETS, and
 *   recordings.mjs's RECORDINGS.
 */
export function shardPlan(shard, { devices, byName, pages, recordings, assets }) {
  if (shard !== undefined && !SHARDS.includes(shard)) {
    throw new Error(`SHARD is "${shard}", which is no shard of the shoot: it is one of ${SHARDS.join(", ")}, or unset for the whole shoot`);
  }
  const mine = (name) => shard === undefined || shard === name;
  return {
    pages: devices
      .map((device) => [device, devicePages(device, pages, byName).filter((page) => mine(pageShard(device, page)))])
      .filter(([, list]) => list.length > 0),
    recordings: mine(REST) ? recordings : [],
    assets: mine(REST) ? assets : [],
  };
}

/** The stills a page's shots, steps and end save on a device, in the order the shoot takes them. */
export const stillFiles = (device, page) =>
  [...(page.shots ?? []), ...(page.steps ?? []).flatMap(({ shot, later }) => (later ? [shot, later.shot] : [shot])), ...(page.end ? [page.end] : [])].map(
    (shot) => `${device}-${shot}.png`
  );

/**
 * A plan as the files it saves, which is what SHOOT_PLAN=1 prints: each page with its device, its path and its stills, in the order
 * they are shot; each recording; and each generated image. A step whose control is missing takes no still, and the workflow adds an
 * MP4 beside each recording.
 */
export const planFiles = ({ pages, recordings, assets }) => ({
  pages: pages.flatMap(([device, list]) => list.map((page) => ({ device, path: page.path, stills: stillFiles(device, page) }))),
  recordings: recordings.map(({ device, name }) => `${device}-${name}.webm`),
  assets: assets.map(assetFile),
});

/**
 * The names of the files in a folder that were written at or after `since` (ms since the epoch): what a run that began then saved
 * there. A folder used before can hold an earlier run's files, and the MP4s and the diffs made from them; those are older.
 */
export async function writtenSince(dir, since) {
  const written = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isFile() && (await stat(join(dir, entry.name))).mtimeMs >= since) written.push(entry.name);
  }
  return written;
}

/**
 * Why the files a run saved are not its plan's, each a failure's line, or none: a still or a recording the plan names that the run
 * did not save, as when a step is skipped because its control is absent, and a file it saved that the plan does not name, those by
 * name. A generated image may be missing: one the site answers with a 404 is skipped, not failed (assetAction, assets.mjs). A file
 * the run did not save for a reason one of its failures already gives (`explained`) is not listed a second time for being missing.
 *
 * @param files - The plan as planFiles gives it.
 * @param written - The names of the files the run saved.
 * @param {Iterable<string>} [explained] - The names of the files the run did not save and has said why.
 */
export function planFailures({ pages, recordings, assets }, written, explained = []) {
  const saved = new Set([...written, ...explained]);
  const named = new Set([...pages.flatMap(({ stills }) => stills), ...recordings, ...assets]);
  return [
    ...pages.flatMap(({ device, path, stills }) => stills.filter((file) => !saved.has(file)).map((file) => `${file}: the plan names this still, of ${device} ${path}, and it was not saved`)),
    ...recordings.filter((file) => !saved.has(file)).map((file) => `${file}: the plan names this recording, and it was not saved`),
    ...[...written].sort().filter((file) => !named.has(file)).map((file) => `${file}: saved, and the plan does not name it`),
  ];
}
