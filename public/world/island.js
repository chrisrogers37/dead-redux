/* eslint-disable */
import * as THREE from "three";
import { buildFlora } from "./flora.js";
import { CAVES, G, height, SHELF_Y, STAGE } from "./ground.js";
import { MOON } from "./night.js";
import { BAND_RANGE, BAND_SIDE } from "./path.js";
import { across, AXIS, BLANKET_TONES, intoCrowdGround, onAxes, onCrowdGround } from "./seats.js";

/* The island is the mark: a hill with two caves, a ring road and a lightning path, and at its north-east edge a shelf for the stage.
   The ground's height is in ground.js. */

/* The ground turns from turf to bare stone as its normal leans from 28 to 42 degrees off straight up. */
const TURF_TO = Math.cos((28 * Math.PI) / 180), STONE_FROM = Math.cos((42 * Math.PI) / 180);
/* The ring road runs from RING to SHORE m from the island's centre, and the shore past it is sand. */
export const RING = 112, SHORE = 118;
/* The lightning path's corners, from the island's north edge to its south, and how far it reaches to either side of its line. */
export const BOLT = [G(100, 4), G(118, 92), G(82, 108), G(100, 196)], BOLT_HALF = 1.5;
/* The tracks are packed earth worn into the land: the ring road, and the lightning path BOLT_HALF m to either side of its line. Each
   gives way to the land's own colour over FEATHER m at its edge. They are drawn in the ground's own shader (grained), by where a
   point of the ground lies, so they lie on it exactly wherever the ground goes. */
export const TRACK = 0x8a806c, FEATHER = 0.9;
const ease = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/* How far a point lies from the lightning path's line. */
function fromBolt(x, z) {
  let least = Infinity;
  for (let k = 0; k < BOLT.length - 1; k++) {
    const [ax, az] = BOLT[k], [bx, bz] = BOLT[k + 1], dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / Math.max(dx * dx + dz * dz, 1e-6)));
    least = Math.min(least, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return least;
}
/* How far a point lies from the middle of the ring road. */
const fromRing = (x, z) => Math.abs(Math.hypot(x, z) - (RING + SHORE) / 2);
/* How much of a point of the ground is track: 1 on packed earth, 0 on the land, between them across a track's edge. The ground's
   shader reckons the same (TRACKS). */
export function tracksAt(x, z) {
  return Math.max(1 - ease((SHORE - RING) / 2, (SHORE - RING) / 2 + FEATHER, fromRing(x, z)), 1 - ease(BOLT_HALF, BOLT_HALF + FEATHER, fromBolt(x, z)));
}
/* Whether a point stands clear of both tracks by `room` m: what grows on the land grows there. */
export function offTracks(x, z, room) {
  return fromRing(x, z) > (SHORE - RING) / 2 + room && fromBolt(x, z) > BOLT_HALF + room;
}

/* How far past the crowd's ground the turf is trodden bare of tufts. A figure stands or sits anywhere on that ground and rises with
   the music, and one at its rim steps out past it for the visitor, who it keeps 4.2 m from (crowd.js's parting). A blade or a
   bloom that came up through a figure would flicker against it as it swayed. No stone lies there either (flora.js): a pale stone
   among the figures read as one more thing on the ground that no one would stand by. */
const CROWD_ROOM = 4.5;
/* What the land's grain stands at where a pixel cannot hold it, the middle of its range of 0 to 1: the ground's shader sets it so
   (grained), and what goes by the grain is even there, the grain's own shading, the worn grass's patches and a lit band's edge. */
const GRAIN_EVEN = 0.5;

/* The day's gathering on the ground (seats.js gathering): the grass worn where its people stand, and its blankets. Both are drawn in
   the ground's own shader, as the tracks are, from one mask of the gathering that the shader reads once a pixel (crowdMask), so
   they cost no mesh and no draw call, and lie on the ground wherever it goes.
   The grass is trodden, not worn through: WEAR is how far the ground takes WORN's colour where it is trodden hardest, and WORN
   matted grass, browner, greyer and darker than the turf, no brighter than the crowd's turf is, taken together, under any light of
   the show, the stage's glow among them, which is nearly all red and lights a brown more than it does turf. A figure dancing
   against paler ground swings more blocks of the frame than it does against turf: counted with scripts/flash, an earth a quarter
   brighter than the turf took the blocks at 5 swings or more in a second from 1,048 to 1,370 through the seeks, the whole frame
   from behind the crowd. A tan as bright as the turf reads as sand under the evening's light; a darker olive brown reads as grass
   trodden flat. */
export const WEAR = 0.75, WORN = 0x55523c;
/* How hard the ground is trodden, from 0, turf, to 1. Each person treads the ground round their seat as a soft mound `spread` m wide
   (its standard deviation), one seated `sit` of what one standing does; the mounds are summed, and a sum `s` is trodden 1 - e^(-hard
   s), so ground many stand on is trodden hard and none more than 1, and a straggler's ground a little. The aisle the gathering leaves
   is walked up its middle, `aisle` hard within `walked[0]` m of it and not at all by `walked[1]` (seats.js AISLE). All of it is
   eased in from none at `rim[0]` m into the crowd's ground, which lies outside it and inside the CROWD_ROOM where no tuft grows, to
   the whole of it at `rim[1]` m. Every step of it is eased over two metres or more, so the trodden grass fades into the hill as the
   gathering thins out, with no edge of its own: no two neighbouring texels of the mask differ by more than a fifth. The people's
   treading comes and goes in broad patches some 8 m across, down to `broad` less than its own where it is lightest, so the grass
   shows through between patches worn browner, under the packed front as well. And where the turf is thin it is trodden first: the tussock grain moves the wear by `patchy` of itself
   either way from the even grain's, as far one way as the other, so a pixel that cannot hold the grain shows the mean, and nothing
   dithers. */
export const TREAD = { spread: 2.2, sit: 0.6, hard: 0.35, aisle: 0.7, walked: [0.5, 2.8], rim: [-4.2, -0.6], broad: 0.5, patchy: 0.6 };
/* A blanket lies on the ground as a cloth of one of BLANKET_COLOURS (seats.js gives each its colour, and its border's, the same for
   one with no border), with its border from BLANKET_RIM[0] to BLANKET_RIM[1] m in from its edge. Its edge is eased across what a
   pixel takes in of the ground, BLANKET_SOFT m at the least and the most, so it neither shimmers nor steps; its border, too narrow to
   hold far off, is drawn only while a pixel takes in less than BLANKET_HELD[1] m. The colours are dyed cloth faded in the sun, each a
   different hue gone dull and greyed, and none brighter than the brightest of the people's clothes (crowd.js COLOURS), so a blanket
   never outshines those sitting on it; and the mask holds how far a point lies inside the nearest blanket out to BLANKET_REACH m
   either side of its edge. */
export const BLANKET_COLOURS = [0x3b2b28, 0x28303a, 0x332f20, 0x24322e, 0x382b39, 0x3c2a30, 0x312d3e];
export const BLANKET_RIM = [0.12, 0.32], BLANKET_SOFT = [0.02, 0.4], BLANKET_HELD = [0.05, 0.15], BLANKET_REACH = 1;
/* The mask: texels CROWD_CELL m a side in the stage's own frame, across its axis from -CROWD_SIDE to CROWD_SIDE m (seats.js across) and
   out along it from 0 to CROWD_OUT m, which takes in all the crowd's ground and its CROWD_ROOM: so its edge's texels, which the
   ground past the mask reads, are untrodden turf with no blanket. */
export const CROWD_CELL = 0.4, CROWD_SIDE = 51.2, CROWD_OUT = 64;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/* The mask of the day's gathering, as a texture for the ground's shader, from `ground`: the seats of those buildCrowd stands
   (crowd.js), its blankets and its aisle, as seats.js gathering gives them. Row by row out from the stage, each from the right of
   its axis as one looks out from the stage to the left. Each texel holds, as a fraction of 255: in red how hard the ground is
   trodden (TREAD); in green how far its middle lies inside the nearest blanket, BLANKET_REACH m out and in at 0 and 1 and its edge
   at a half; and in blue and alpha that blanket's colour and its border's, (k + 1/2) / BLANKET_TONES for the k-th, wherever the
   blanket is the nearest within BLANKET_REACH and two texels more of its edge, so the four texels a filter weighs round any point of a
   blanket all hold its colours and never a blend of two. Texels are read as they are, the four round a point weighed by the GPU's
   linear filter, with no smaller copies (crowdAt). */
export function crowdMask({ seats, blankets, aisle }) {
  const wide = Math.round((2 * CROWD_SIDE) / CROWD_CELL), long = Math.round(CROWD_OUT / CROWD_CELL);
  const data = new Uint8Array(4 * wide * long), sum = new Float64Array(wide * long), inside = new Float64Array(wide * long).fill(-Infinity);
  /* A texel's middle, across and out along the stage's axis, and the texels whose middles lie within `d` m of a point. */
  const sideOf = (i) => (i + 0.5) * CROWD_CELL - CROWD_SIDE, outOf = (j) => (j + 0.5) * CROWD_CELL;
  const cols = (v, d) => [Math.max(0, Math.ceil((v - d + CROWD_SIDE) / CROWD_CELL - 0.5)), Math.min(wide - 1, Math.floor((v + d + CROWD_SIDE) / CROWD_CELL - 0.5))];
  const rows = (u, d) => [Math.max(0, Math.ceil(u / CROWD_CELL - 0.5 - d / CROWD_CELL)), Math.min(long - 1, Math.floor((u + d) / CROWD_CELL - 0.5))];
  const frame = (x, z) => [(x - STAGE[0]) * AXIS[0] + (z - STAGE[1]) * AXIS[1], across(x, z)];
  /* Each seat's mound, out to three of its widths. */
  const two = 2 * TREAD.spread * TREAD.spread, reach = 3 * TREAD.spread;
  for (const seat of seats) {
    const [u, v] = frame(seat.x, seat.z), w = seat.sit ? TREAD.sit : 1, [i0, i1] = cols(v, reach), [j0, j1] = rows(u, reach);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) sum[j * wide + i] += w * Math.exp(-((sideOf(i) - v) ** 2 + (outOf(j) - u) ** 2) / two);
  }
  /* Each blanket's reach: how far inside it each texel near it lies, and its colours where it is the nearest. */
  const tone = new Uint8Array(wide * long), rim = new Uint8Array(wide * long), keep = BLANKET_REACH + 2 * CROWD_CELL;
  for (const b of blankets) {
    const [u, v] = frame(b.x, b.z), d = Math.hypot(b.wide, b.deep) / 2 + keep, [i0, i1] = cols(v, d), [j0, j1] = rows(u, d);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const edge = blanketEdgeOf(b, ...onAxes(outOf(j), sideOf(i))), k = j * wide + i;
      if (edge <= inside[k]) continue;
      inside[k] = edge;
      if (edge > -keep) { tone[k] = Math.round((255 * (b.tone + 0.5)) / BLANKET_TONES); rim[k] = Math.round((255 * (b.rim + 0.5)) / BLANKET_TONES); }
    }
  }
  for (let j = 0; j < long; j++) for (let i = 0; i < wide; i++) {
    const k = j * wide + i, [x, z] = onAxes(outOf(j), sideOf(i));
    const walked = TREAD.aisle * (1 - ease(TREAD.walked[0], TREAD.walked[1], fromMiddle(aisle, outOf(j), sideOf(i))));
    const stood = (1 - Math.exp(-TREAD.hard * sum[k])) * (1 - TREAD.broad * ease(0.4, 0.8, field(x, z, 6)));
    const trodden = Math.max(stood, walked) * ease(TREAD.rim[0], TREAD.rim[1], intoCrowdGround(x, z));
    data[4 * k] = Math.round(255 * clamp01(trodden));
    data[4 * k + 1] = Math.round(255 * clamp01(0.5 + inside[k] / (2 * BLANKET_REACH)));
    data[4 * k + 2] = tone[k];
    data[4 * k + 3] = rim[k];
  }
  const mask = new THREE.DataTexture(data, wide, long, THREE.RGBAFormat, THREE.UnsignedByteType);
  mask.minFilter = mask.magFilter = THREE.LinearFilter;
  mask.needsUpdate = true;
  return mask;
}
/* How far a point (along, side), in the stage's frame (seats.js across), lies from the aisle's middle, its points [along, side, half]
   (seats.js aisleOf); a long way where it is nowhere near. */
function fromMiddle(aisle, along, side) {
  if (along < aisle[0][0] - TREAD.walked[1] || along > aisle[aisle.length - 1][0] + TREAD.walked[1]) return Infinity;
  let least = Infinity;
  for (let k = 0; k + 1 < aisle.length; k++) {
    const [u0, s0] = aisle[k], [u1, s1] = aisle[k + 1], du = u1 - u0, ds = s1 - s0;
    if (Math.abs(along - u0) > TREAD.walked[1] + 1) continue;
    const t = Math.max(0, Math.min(1, ((along - u0) * du + (side - s0) * ds) / (du * du + ds * ds)));
    least = Math.min(least, Math.hypot(along - u0 - t * du, side - s0 - t * ds));
  }
  return least;
}
/* How far a point lies inside a blanket, in metres: less than nothing outside it, as far as its nearest edge or corner. */
export function blanketEdgeOf({ x: bx, z: bz, face, wide, deep }, x, z) {
  const dx = x - bx, dz = z - bz, qx = Math.abs(dx * Math.cos(face) - dz * Math.sin(face)) - wide / 2, qz = Math.abs(dx * Math.sin(face) + dz * Math.cos(face)) - deep / 2;
  return -(Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0));
}
/* The mask at a point of the ground, as the ground's shader reads it: the four texels round the point, each weighed by how near its
   middle is, and past the mask's edge the edge's own texel. How hard it is trodden (0 to 1), how far it lies inside the nearest
   blanket (m), and that blanket's colour and its border's (each an index into BLANKET_COLOURS). */
export function crowdAt(mask, x, z) {
  const { data, width: wide, height: long } = mask.image;
  const s = ((across(x, z) + CROWD_SIDE) / (2 * CROWD_SIDE)) * wide - 0.5, t = (((x - STAGE[0]) * AXIS[0] + (z - STAGE[1]) * AXIS[1]) / CROWD_OUT) * long - 0.5;
  const i = Math.floor(s), j = Math.floor(t), a = s - i, b = t - j;
  const texel = (ix, iz, c) => data[4 * (Math.max(0, Math.min(long - 1, iz)) * wide + Math.max(0, Math.min(wide - 1, ix))) + c] / 255;
  const read = (c) => (texel(i, j, c) * (1 - a) + texel(i + 1, j, c) * a) * (1 - b) + (texel(i, j + 1, c) * (1 - a) + texel(i + 1, j + 1, c) * a) * b;
  const index = (c) => Math.min(BLANKET_TONES - 1, Math.floor(read(c) * BLANKET_TONES));
  return { trodden: read(0), edge: (read(1) - 0.5) * 2 * BLANKET_REACH, cloth: index(2), rim: index(3) };
}
/* How far a point of the ground takes WORN's colour where it is trodden `trodden` hard (crowdAt) and the tussock grain stands at
   `tussocks`, 0 to 1 (GRAIN_EVEN where a pixel cannot hold the grain): WEAR at the most. The ground's shader reckons the same (CROWD). */
export const wornAt = (trodden, tussocks = GRAIN_EVEN) => WEAR * clamp01(trodden * (1 + TREAD.patchy * (1 - 2 * tussocks)));
/* How much of a pixel a blanket covers, and how much of that is its border, where the point lies `edge` m inside it (crowdAt) and the
   pixel takes in `covers` m of the ground. The ground's shader reckons the same (CROWD). */
const softOf = (covers) => Math.max(BLANKET_SOFT[0], Math.min(BLANKET_SOFT[1], 0.5 * covers));
export const blanketAt = (edge, covers = 0) => clamp01(0.5 + edge / (2 * softOf(covers)));
export const borderAt = (edge, covers = 0) =>
  Math.min(clamp01(0.5 + (edge - BLANKET_RIM[0]) / (2 * softOf(covers))), clamp01(0.5 + (BLANKET_RIM[1] - edge) / (2 * softOf(covers)))) * (1 - ease(BLANKET_HELD[0], BLANKET_HELD[1], covers));
/* The lit bands, where one song runs into the next (path.js bandMask), as the ground wears them: the island's pale stone, BAND_TONE,
   laid over the turf as far as BAND_LAY where a band is whole, under the grain as the tracks and the worn earth are, and glowing in
   BAND_AMBER, BAND_GLOW of it at dusk, which the night dims (main.js). A band is whole within BAND_CORE m of its middle and eases
   to nothing by BAND_REACH m, so it has no hard edge; and its edge is no even line either, but stands BAND_FRAY m further out where
   the turf is thinnest than where a tussock stands thickest, by the ground's own tussock grain, as the worn earth's patches go by
   it. Where a pixel cannot hold that grain the edge runs even, so nothing dithers. At its furthest the edge is inside the room the
   path keeps clear of tufts (LOOP_ROOM), so nothing grows through a band.
   So a band is wider than the ribbon it replaced, which was 2 m across and whole to its edge: 3.4 m from rim to rim on even grain
   and up to 3.9 m where the turf is thin on both sides, whole across 1.6 m of that and half lit across 2.5 m.
   The mask holds distances out to path.js's BAND_RANGE m and no further, so all of a band's look lies inside that, or the mask
   could not say where it ends: BAND_REACH, with half of BAND_FRAY and half of BAND_BLUR (below), is under BAND_RANGE, and
   island.test.ts holds these numbers to it. */
export const BAND_CORE = 0.8, BAND_REACH = 1.7, BAND_FRAY = 0.5, BAND_LAY = 0.9, BAND_TONE = 0x8e8a82, BAND_AMBER = 0xe8b04b, BAND_GLOW = 0.25;
/* A band is drawn as the mean of itself over the ground a pixel takes in, so that far off, where a pixel takes in more ground than
   a band is wide, it is a wider and fainter band holding all of its light, and never a line of pixels that comes and goes as the
   eye moves. A pixel takes in no less than BAND_HELD m, and is reckoned to take in no more than BAND_BLUR m, which is under twice
   what the mask's range leaves past a band's furthest edge: so ground that the mask says is BAND_RANGE m or more from a band is not
   lit at all, whatever a pixel takes in and whatever the grain. */
export const BAND_HELD = 0.02, BAND_BLUR = 8;
/* How much of a band lies between its middle and `x` m to one side of it: the band's strength summed across it, in metres. The same
   sum is written a second time by hand, in GLSL (BANDS, bandArea): island.test.ts runs the shader's own text against this one all
   over the island, so neither can change alone. */
const bandArea = (x) => {
  const a = Math.abs(x), t = Math.max(0, Math.min(1, (a - BAND_CORE) / (BAND_REACH - BAND_CORE)));
  return Math.sign(x) * (Math.min(a, BAND_CORE) + (BAND_REACH - BAND_CORE) * t * (1 - t * t * (1 - 0.5 * t)));
};
/* How far a point of the ground is lit by a band whose middle is `away` m from it, 0 to 1, where a pixel takes in `covers` m of the
   ground and the tussock grain stands at `tussocks`, 0 to 1 (GRAIN_EVEN where a pixel cannot hold the grain): 1 within BAND_CORE,
   none past BAND_REACH and eased between them, as a pixel that takes in next to nothing sees it on even grain. The ground's shader
   reckons the same (BANDS). */
export function bandAt(away, covers = 0, tussocks = GRAIN_EVEN) {
  const wide = Math.max(BAND_HELD, Math.min(covers, BAND_BLUR)), mid = away + BAND_FRAY * (tussocks - GRAIN_EVEN);
  return (bandArea(mid + 0.5 * wide) - bandArea(mid - 0.5 * wide)) / wide;
}
/* How far from the setlist's path anything grows, and the side of the squares its points are sorted into (no less than that). */
const LOOP_ROOM = 2.2, LOOP_SQUARE = 4;
/* The stage's light on the water: its colour at its fullest, as the screen shows it, and where it lies, from SHINE_OUT m past the stage's
   centre out to sea along the stage's axis, SHINE_LONG m along it and SHINE_WIDE m across. The shore stands 25 m past the stage. */
const SHINE = [0.4, 0.25, 0.1], SHINE_OUT = 36, SHINE_LONG = 30, SHINE_WIDE = 28;
/* The stage's glow on the ground: a steady warm light from POOL_UP m over the stage's floor, in POOL's colour at the night's deepest,
   half as strong POOL_HALF m away and gone by POOL_END. It lights the ground and the bands on it and nothing else, so the crowd stands
   dark against it; and the music does not move it, so it adds no swing in brightness to the stage's own light (stage.js), which the
   music does move. */
export const POOL = new THREE.Color(0xff7a30).multiplyScalar(5), POOL_UP = 7, POOL_HALF = 15, POOL_END = 85;
const f = (v) => v.toFixed(4);

/* Has a Lambert material take the stage's glow (`uPool`, its colour times its strength) as one more light on it, by the angle its
   face turns to the stage. With `stands`, the material draws instances that stand on the ground, each one's root `stands.sunk` m
   under it, as a tree's is: a face that turns squarely to the stage would take the glow several times more strongly than the ground
   it stands on, which lies nearly edge-on to it. So such a thing takes it no more strongly than level ground at its foot does, and
   `stands.share` of that, its colours being paler than the turf's. */
export function takesPool(material, uPool, stands = null) {
  const from = `vec3(${f(STAGE[0])}, ${f(SHELF_Y + POOL_UP)}, ${f(STAGE[1])})`, most = stands ? "\nvarying float vPoolMost;" : "";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPool = uPool;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vPoolAt;${most}`)
      /* Where the point stands in the world: for an instanced mesh, where its instance puts it. */
      .replace("#include <project_vertex>", `#include <project_vertex>
        #ifdef USE_INSTANCING
          vPoolAt = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vPoolAt = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif${stands ? `
        /* How squarely level ground at the instance's foot turns to the glow. */
        vPoolMost = max(normalize(${from} - (modelMatrix * instanceMatrix[3]).xyz - vec3(0.0, ${f(stands.sunk)}, 0.0)).y, 0.0);` : ""}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform vec3 uPool;\nvarying vec3 vPoolAt;${most}`)
      .replace("#include <lights_fragment_end>", `#include <lights_fragment_end>
        vec3 poolTo = ${from} - vPoolAt;
        float poolFar = length(poolTo) / ${f(POOL_HALF)};
        float poolLit = max(dot(normal, normalize((viewMatrix * vec4(poolTo, 0.0)).xyz)), 0.0);${stands ? `
        poolLit = min(poolLit, vPoolMost) * ${f(stands.share)};` : ""}
        reflectedLight.directDiffuse += uPool * diffuseColor.rgb * poolLit * (1.0 - smoothstep(${f(0.6 * POOL_END / POOL_HALF)}, ${f(POOL_END / POOL_HALF)}, poolFar)) / (1.0 + poolFar * poolFar);`);
  };
  return material;
}

/* The land's grain, drawn in the ground's own shader: three sizes of soft mottling by a point's place on the island, so turf, stone and
   sand each read as a surface and not as one flat colour. `grain` runs 0 to 1 over cells one unit across. */
const GRAIN = `
float grainAt(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float grain(vec2 p) {
  vec2 i = floor(p), u = fract(p);
  u = u * u * (3.0 - 2.0 * u);
  return mix(mix(grainAt(i), grainAt(i + vec2(1.0, 0.0)), u.x), mix(grainAt(i + vec2(0.0, 1.0)), grainAt(i + vec2(1.0, 1.0)), u.x), u.y);
}`;
/* The grain's sizes, in cells a metre: tussocks about a metre across, and blades a hand across, which fade out between FINE_NEAR and
   FINE_FAR m from the eye, where they would only shimmer, and are not reckoned past it. The land's broad patches, some 9 m across, are
   in its colours by vertex (landColour), which costs a pixel nothing. With `relief` the two finer sizes also stand RELIEF m
   proud of the ground at their highest, so a low sun or the stage's glow picks the turf out; a phone does without it. The relief is
   read from how the grain's height changes from one pixel to the next, which costs no more of the grain than its colour does. */
const TUSSOCK = 0.9, BLADE = 5.3, FINE_NEAR = 22, FINE_FAR = 70, RELIEF = 0.126;
/* The broad grain: cells 2 m across (BROAD a metre), shown, BROAD_AMP deep, only as the tussocks fade out, so the ground near the
   eye is as it was, and ground past the tussocks' reach, 30 m from a phone's eye on level ground, keeps a grain out to 41 m. Colour
   only: it stands in no relief, so a phone and a desktop draw it alike. */
const BROAD = 0.5, BROAD_AMP = 0.24;
/* A grain is drawn in full while a pixel takes in no more than HELD_FROM of one of its cells, and is gone, into the ground's even
   colour, by HELD_TO of one: past that a pixel cannot hold it, and it would break into a dither where the land is seen edge-on. */
const HELD_FROM = 0.25, HELD_TO = 0.6;
/* The angle a pixel spans on a desktop's frame, 900 px tall with a 60 degree view; and the angle one spans for a camera and a frame
   `tall` px high. */
const PIXEL = (2 * Math.tan(Math.PI / 6)) / 900;
export const pixelAngle = (camera, tall) => (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / Math.max(1, tall);
/* The tracks, as the ground's shader reckons them: tracksAt, in GLSL. */
const g2 = ([x, z]) => `vec2(${f(x)}, ${f(z)})`;
const TRACKS = `
float fromLine(vec2 p, vec2 a, vec2 b) { vec2 ab = b - a; return distance(p, a + clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0) * ab); }
float tracks(vec2 p) {
  float ring = 1.0 - smoothstep(${f((SHORE - RING) / 2)}, ${f((SHORE - RING) / 2 + FEATHER)}, abs(length(p) - ${f((RING + SHORE) / 2)}));
  float bolt = min(min(fromLine(p, ${g2(BOLT[0])}, ${g2(BOLT[1])}), fromLine(p, ${g2(BOLT[1])}, ${g2(BOLT[2])})), fromLine(p, ${g2(BOLT[2])}, ${g2(BOLT[3])}));
  return max(ring, 1.0 - smoothstep(${f(BOLT_HALF)}, ${f(BOLT_HALF + FEATHER)}, bolt));
}`;
/* A number as the shader's text takes it after an operator: one under nothing in brackets. */
const signed = (v) => (v < 0 ? `(${f(v)})` : f(v));
/* The day's gathering, as the ground's shader reckons it from the mask (crowdMask): where a point reads it, the texture's two
   coordinates, and wornAt, blanketAt and borderAt, in GLSL. */
const CROWD = `
uniform highp sampler2D uCrowd;
uniform vec3 uCloth[${BLANKET_COLOURS.length}];
float crowdAcross(vec2 p) { return ((p.x - ${signed(STAGE[0])}) * ${signed(AXIS[1])} - (p.y - ${signed(STAGE[1])}) * ${signed(AXIS[0])} + ${f(CROWD_SIDE)}) / ${f(2 * CROWD_SIDE)}; }
float crowdOut(vec2 p) { return ((p.x - ${signed(STAGE[0])}) * ${signed(AXIS[0])} + (p.y - ${signed(STAGE[1])}) * ${signed(AXIS[1])}) / ${f(CROWD_OUT)}; }
float crowdWorn(float trodden, float tussocks) { return ${f(WEAR)} * clamp(trodden * (1.0 + ${f(TREAD.patchy)} * (1.0 - 2.0 * tussocks)), 0.0, 1.0); }
float blanketSoft(float covers) { return 2.0 * clamp(0.5 * covers, ${f(BLANKET_SOFT[0])}, ${f(BLANKET_SOFT[1])}); }
float crowdBlanket(float edge, float covers) { return clamp(0.5 + edge / blanketSoft(covers), 0.0, 1.0); }
float crowdBorder(float edge, float covers) {
  float soft = blanketSoft(covers);
  return min(clamp(0.5 + (edge - ${f(BLANKET_RIM[0])}) / soft, 0.0, 1.0), clamp(0.5 + (${f(BLANKET_RIM[1])} - edge) / soft, 0.0, 1.0)) * (1.0 - smoothstep(${f(BLANKET_HELD[0])}, ${f(BLANKET_HELD[1])}, covers));
}`;
/* The lit bands, as the ground's shader reckons them: how far a point lies from the middle of the nearest, read from the mask
   (path.js bandAway, in GLSL), and bandAt. The mask's reading is kept in a float of the shader's own precision before anything is
   reckoned with it: a sampler's own may be low, and hold no number past 2. A point of the ground the mask reads as off the bands
   pays for that one reading, a comparison, and the glow's own line, which adds nothing there; one within the mask's range of a
   band pays for some fifty sums as well, with no loop and no second reading. */
const BANDS = `
uniform highp sampler2D uBands;
uniform float uBandGlow;
float bandAway(vec2 p) {
  float read = texture2D(uBands, vec2((p.x + ${f(BAND_SIDE / 2)}) / ${f(BAND_SIDE)}, (p.y + ${f(BAND_SIDE / 2)}) / ${f(BAND_SIDE)})).r;
  return (1.0 - read) * ${f(BAND_RANGE)};
}
float bandArea(float x) {
  float a = abs(x), t = clamp((a - ${f(BAND_CORE)}) / ${f(BAND_REACH - BAND_CORE)}, 0.0, 1.0);
  return sign(x) * (min(a, ${f(BAND_CORE)}) + ${f(BAND_REACH - BAND_CORE)} * t * (1.0 - t * t * (1.0 - 0.5 * t)));
}
float band(float away, float covers, float tussocks) {
  float wide = max(${f(BAND_HELD)}, min(covers, ${f(BAND_BLUR)})), mid = away + ${f(BAND_FRAY)} * (tussocks - ${GRAIN_EVEN});
  return (bandArea(mid + 0.5 * wide) - bandArea(mid - 0.5 * wide)) / wide;
}`;
/* Has a material that takes the stage's glow (takesPool) wear the land's grain as well, and with `tracked` the tracks' packed earth
   where they run and the crowd's worn earth where it stands. `pixel` holds the angle one pixel of the frame spans, in radians, which
   whoever draws the mesh keeps to the camera and the frame (pixelAngle); left alone it is a desktop's. With `bands`, the mask of a
   show's lit bands and their glow, as `{ map: { value }, glow: { value } }`, it wears the bands too; without, its shader is the one
   it would be had there never been any. The material is one that shades smooth: the grain reads its normal. */
export function grained(material, relief, tracked = false, pixel = { value: PIXEL }, bands = null, crowd = null) {
  const pool = material.onBeforeCompile;
  material.onBeforeCompile = (shader) => {
    pool(shader);
    shader.uniforms.uPixel = pixel;
    if (bands) { shader.uniforms.uBands = bands.map; shader.uniforms.uBandGlow = bands.glow; }
    if (crowd) { shader.uniforms.uCrowd = crowd.map; shader.uniforms.uCloth = crowd.cloth; }
    const earth = new THREE.Color(TRACK), worn = new THREE.Color(WORN), tone = new THREE.Color(BAND_TONE), amber = new THREE.Color(BAND_AMBER);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform float uPixel;${GRAIN}${tracked ? TRACKS : ""}${crowd ? CROWD : ""}${bands ? BANDS : ""}`)
      .replace("#include <color_fragment>", `#include <color_fragment>${tracked ? `
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${f(earth.r)}, ${f(earth.g)}, ${f(earth.b)}), tracks(vPoolAt.xz));` : ""}
        /* How much ground this pixel takes in along the line of sight, in metres: as far as the ground is from the eye, by the
           angle a pixel spans (uPixel), over how squarely the eye meets the ground. Seen edge-on a pixel takes in more than a
           grain is wide, and a grain a pixel cannot hold only dithers, so each size of grain goes as its cells near a pixel's
           reach. The ground's own smooth normal is read, so the fade runs across the mesh's triangles without a step. */
        float covers = length(vViewPosition) * uPixel / max(abs(dot(normalize(vNormal), normalize(vViewPosition))), 0.02);
        /* Where the land bends sharply, as at the shore's rim, the smooth normal can stand squarer to the eye than the face it is
           drawn on, so the reach is never taken for less than the face's own, read from pixel to pixel. */
        vec2 acrossGround = dFdx(vPoolAt.xz), downGround = dFdy(vPoolAt.xz);
        covers = max(covers, sqrt(max(dot(acrossGround, acrossGround), dot(downGround, downGround))));
        float coarseShown = 1.0 - smoothstep(${f(HELD_FROM)}, ${f(HELD_TO)}, covers * ${f(TUSSOCK)});
        float fineShown = (1.0 - smoothstep(${f(FINE_NEAR)}, ${f(FINE_FAR)}, length(vViewPosition))) * (1.0 - smoothstep(${f(HELD_FROM)}, ${f(HELD_TO)}, covers * ${f(BLADE)}));
        float tussocks = ${GRAIN_EVEN}, blades = ${GRAIN_EVEN};
        if (coarseShown > 0.0) tussocks = mix(${GRAIN_EVEN}, grain(vPoolAt.xz * ${f(TUSSOCK)} + 17.0), coarseShown);
        if (fineShown > 0.0) blades = grain(vPoolAt.xz * ${f(BLADE)} + 41.0);
        /* The broad grain comes in only where the tussocks go, and goes as its own cells near a pixel's reach. */
        float broadShown = (1.0 - coarseShown) * (1.0 - smoothstep(${f(HELD_FROM)}, ${f(HELD_TO)}, covers * ${f(BROAD)}));
        float broad = ${GRAIN_EVEN};
        if (broadShown > 0.0) broad = grain(vPoolAt.xz * ${f(BROAD)} + 73.0);${crowd ? `
        /* The day's gathering: the grass worn where it treads, then its blankets, each eased across what this pixel takes in at its
           edge, and its border only where a pixel holds it. One reading of the mask a pixel, where every pixel of the ground runs:
           a reading inside a branch would have no slope to pick its filter by on some drivers. */
        vec4 crowdRead = texture2D(uCrowd, vec2(crowdAcross(vPoolAt.xz), crowdOut(vPoolAt.xz)));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${f(worn.r)}, ${f(worn.g)}, ${f(worn.b)}), crowdWorn(crowdRead.r, tussocks));
        float blanketEdge = (crowdRead.g - 0.5) * ${f(2 * BLANKET_REACH)}, cloth = crowdBlanket(blanketEdge, covers);
        if (cloth > 0.0) diffuseColor.rgb = mix(diffuseColor.rgb, mix(uCloth[min(int(crowdRead.b * ${f(BLANKET_TONES)}), ${BLANKET_TONES - 1})], uCloth[min(int(crowdRead.a * ${f(BLANKET_TONES)}), ${BLANKET_TONES - 1})], crowdBorder(blanketEdge, covers)), cloth);` : ""}${bands ? `
        /* The lit bands: how far this point of the ground is lit by one, over the ground this pixel takes in and by the tussock
           grain as the shader holds it, and the band's pale stone over whatever the ground is here, the grain lying on it as on
           the turf. The mask is read for every pixel, outside the branch, so its filter has a slope to go by on every driver. */
        float bandLit = 0.0, bandOff = bandAway(vPoolAt.xz);
        if (bandOff < ${f(BAND_RANGE)}) {
          bandLit = band(bandOff, covers, tussocks);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${f(tone.r)}, ${f(tone.g)}, ${f(tone.b)}), ${f(BAND_LAY)} * bandLit);
        }` : ""}
        diffuseColor.rgb *= 0.95 + 0.2 * (tussocks - ${GRAIN_EVEN}) + 0.26 * (blades - ${GRAIN_EVEN}) * fineShown;
        diffuseColor.rgb *= 1.0 + ${f(BROAD_AMP)} * (broad - ${GRAIN_EVEN}) * broadShown;`);
    /* The bands' own glow, added to what the ground gives off, which is nothing else. */
    if (bands) shader.fragmentShader = shader.fragmentShader.replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(${f(amber.r)}, ${f(amber.g)}, ${f(amber.b)}) * uBandGlow * bandLit;`);
    if (relief) shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_begin>", `#include <normal_fragment_begin>
        {
          /* The surface leans away from where the grain rises, as a bump map leans it (three's own way of it). */
          float high = ${f(RELIEF)} * (tussocks + 0.45 * fineShown * blades);
          vec3 acrossX = dFdx(-vViewPosition), acrossY = dFdy(-vViewPosition);
          vec3 r1 = cross(acrossY, normal), r2 = cross(normal, acrossX);
          float det = dot(acrossX, r1);
          vec3 grad = sign(det) * (dFdx(high) * r1 + dFdy(high) * r2);
          normal = normalize(max(abs(det), 1e-12) * normal - grad);
        }`);
  };
  return material;
}

/* The sea: water in the night's colour for it (night.js), with twilight's glow lying on it as a path toward where the sun set or
   will rise, the moon's path the same way toward the moon, and the stage's light on the water behind the stage. A slow swell crosses
   it, a little paler on its backs, where the night sky's light lies on it in the dark, and breaks each path into bars of light; over
   the sand the water is shallow and paler, and it laps the shore in a line of foam. One mesh on its own material, so it costs one
   draw call, as the plain sea did; it is not lit, and it takes the fog, so it fades into the haze as the ground does. It writes its
   colours as they are, as the sky does (sky.js). Returns what draws a look of the night on it at a time (the sky's own, which stands
   still under reduced motion) and sets the stage's glow on the ground (`uPool`). */
/* The swell: SWELL_M m from back to back, crossing a point every SWELL_S seconds, slow enough that no patch of water brightens and
   dims faster than once in several seconds. The shore's line breathes in and out over LAP_S seconds. */
const SWELL_M = 9, SWELL_S = 7, LAP_S = 9;
/* The night sky's light on the swell's backs: the look's `ambient` times SWELL_SKY, laid on a back by how high it stands, so at the
   deep of the night a back stands some 7 steps of the screen's 255 over a trough, in blue, where the water's own colour moves it by
   one at most. It comes on by how dark the island is to the power SWELL_DARK, so dusk's water and daybreak's are as they were. */
const SWELL_SKY = 0.056, SWELL_DARK = 3;
function buildSea(scene, uPool) {
  const far = Math.hypot(STAGE[0], STAGE[1]), ox = STAGE[0] / far, oz = STAGE[1] / far;
  const uniforms = { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uSea: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
    uShine: { value: new THREE.Color() }, uNight: { value: new THREE.Color() }, uSunTo: { value: new THREE.Vector2(0, -1) }, uMoon: { value: 0 }, uTide: { value: 0 } };
  /* The way to the moon along the water. */
  const moonFar = Math.hypot(MOON[0], MOON[2]), mx = MOON[0] / moonFar, mz = MOON[2] / moonFar;
  const mat = new THREE.ShaderMaterial({
    uniforms, fog: true,
    vertexShader: `
      varying highp vec2 vAt;
      #include <fog_pars_vertex>
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vAt = world.xz;
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform vec3 uSea, uGlow, uShine, uNight;
      uniform vec2 uSunTo;
      uniform float uMoon;
      uniform highp float uTide;
      varying highp vec2 vAt;
      #include <fog_pars_fragment>
      ${GRAIN}
      void main() {
        float r = length(vAt);
        /* The swell, 0 in a trough and 1 on a back: two trains of it crossing, drifting. */
        highp vec2 drift = vec2(0.31, 0.95) * uTide * ${f(SWELL_M / SWELL_S)};
        /* Each train's backs lie long across the way it runs: three times as long as the trains stand apart. */
        highp vec2 one = vec2(dot(vAt + drift, vec2(0.31, 0.95)), 0.33 * dot(vAt, vec2(0.95, -0.31)));
        highp vec2 two = vec2(dot(vAt - 1.7 * drift, vec2(-0.62, 0.78)), 0.33 * dot(vAt, vec2(0.78, 0.62)));
        float reach = max(abs(vAt.x), abs(vAt.y));
        float swell = 0.5;
        if (reach < 340.0) swell = 0.6 * grain(one / ${f(SWELL_M)}) + 0.4 * grain(two / ${f(SWELL_M * 0.45)} + 31.0);
        /* How deep the water stands over the island's own ground (ground.js slope, past the ring road), lapping in and out. */
        float depth = (r - 118.0) * 0.55 - 2.5 - 0.6 * sin(vAt.x * 0.3) * cos(vAt.y * 0.27) + 0.22 * sin(6.2832 * uTide / ${f(LAP_S)} + 0.11 * (vAt.x + vAt.y));
        /* The light lies on the water between the eye and its source, so each path runs from under the eye toward it. */
        vec2 out2 = vAt - cameraPosition.xz;
        vec2 away = out2 / max(length(out2), 1.0);
        float facing = max(dot(away, uSunTo), 0.0);
        float bars = 0.55 + 0.9 * swell;
        vec3 col = uSea * (0.92 + 0.18 * swell) + uGlow * (0.34 * pow(facing, 60.0) * bars + 0.1 * pow(facing, 6.0)) * smoothstep(118.0, 160.0, r);
        /* The night sky's light on the swell's backs, none in a trough. */
        col += uNight * smoothstep(0.35, 0.8, swell) * ${f(SWELL_SKY)};
        float moonward = max(dot(away, vec2(${f(mx)}, ${f(mz)})), 0.0);
        col += uMoon * vec3(0.2, 0.25, 0.37) * (pow(moonward, 90.0) * bars + 0.16 * pow(moonward, 6.0)) * smoothstep(118.0, 150.0, r);
        vec2 s = vAt - vec2(${f(STAGE[0])}, ${f(STAGE[1])});
        float along = (dot(s, vec2(${f(ox)}, ${f(oz)})) - ${f(SHINE_OUT)}) / ${f(SHINE_LONG)}, across = dot(s, vec2(${f(-oz)}, ${f(ox)})) / ${f(SHINE_WIDE)};
        col += uShine * exp(-along * along - across * across) * (0.7 + 0.6 * swell);
        /* The shallows over the sand, paler and a little greener, and the foam where the water gives out. */
        vec3 pale = uSea * 1.5 + vec3(0.02, 0.035, 0.03) + 0.25 * uGlow * pow(facing, 6.0);
        col = mix(col, pale, 0.6 * exp(-max(depth, 0.0) * 0.9));
        float foam = 0.0;
        if (depth < 0.5) foam = (1.0 - smoothstep(0.0, 0.5, depth)) * (0.55 + 0.45 * grain(vAt * 0.9 + 3.0));
        col = mix(col, uSea * 1.8 + vec3(0.06) + 0.3 * uGlow * pow(facing, 3.0), 0.7 * foam);
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
        /* The water ends 350 m out along each axis, nearer than the fog's far end from the shore: it is all haze before it ends. */
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(250.0, 340.0, reach));
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(700, 700).rotateX(-Math.PI / 2), mat));
  return (look, time = 0) => {
    uniforms.uTide.value = time;
    uniforms.uSea.value.fromArray(look.sea);
    uniforms.uGlow.value.fromArray(look.glow);
    uniforms.uSunTo.value.fromArray(look.glowTo);
    uniforms.uMoon.value = look.moon;
    uniforms.uShine.value.fromArray(SHINE).multiplyScalar(look.shine);
    uniforms.uNight.value.fromArray(look.ambient).multiplyScalar(Math.pow(look.dark, SWELL_DARK));
    uPool.value.copy(POOL).multiplyScalar(look.shine);
  };
}

/* The ground's height as its mesh draws it: the mesh is flat across each half of a cell of its grid, so between the grid's points it
   lies a little under or over the island's own height (ground.js). What lies on the ground lies on this. */
export function surfaceOf(grid) {
  /* Each of the grid's points is reckoned once, the first time it is asked for. */
  const cell = 260 / grid, side = grid + 1, known = new Float64Array(side * side).fill(NaN);
  const at = (ix, iz) => {
    const k = iz * side + ix;
    if (Number.isNaN(known[k])) known[k] = height(ix * cell - 130, iz * cell - 130);
    return known[k];
  };
  return (x, z) => {
    const gx = Math.min(grid - 1e-9, Math.max(0, (x + 130) / cell)), gz = Math.min(grid - 1e-9, Math.max(0, (z + 130) / cell));
    const ix = Math.floor(gx), iz = Math.floor(gz), u = gx - ix, v = gz - iz;
    const a = at(ix, iz), b = at(ix, iz + 1), c = at(ix + 1, iz + 1), d = at(ix + 1, iz);
    return u + v <= 1 ? a + (d - a) * u + (b - a) * v : c + (b - c) * (1 - u) + (d - c) * (1 - v);
  };
}

/* The land's colour at a point `y` up whose normal's height is `ny`, into `out`: turf over the hill, greener in its hollows and drier
   toward the summit, in broad patches; bare stone where the slope is steep; sand past the ring road, darker where the sea wets it; and
   the caves' bowls dark. Each gives way to the next over a few metres. */
/* A soft field 0 to 1 over the island, the same on every tier: three sines that never line up. */
const field = (x, z, k) => 0.5 + 0.25 * Math.sin(x * 0.071 * k + 1.3) * Math.cos(z * 0.063 * k - 0.4) + 0.25 * Math.sin((x + z) * 0.043 * k + 2.1);
const other = new THREE.Color(), tone = new THREE.Color();
export function landColour(x, y, z, ny, out) {
  out.setHex(0x55663f).lerp(other.setHex(0x6d7748), field(x, z, 1));
  out.lerp(other.setHex(0x8a8148), 0.75 * ease(14, 30, y) * field(x, z, 2.3));
  out.lerp(other.setHex(0x8e8a82).lerp(tone.setHex(0x6f6a63), field(z, x, 3.1)), 1 - ease(STONE_FROM, TURF_TO, ny));
  out.lerp(other.setHex(0xa39672).lerp(tone.setHex(0x6b6350), 1 - ease(0.2, 1.6, y)), ease(SHORE - 3, SHORE + 1.5, Math.hypot(x, z)));
  let cave = Infinity;
  for (const [cx, cz] of CAVES) cave = Math.min(cave, Math.hypot(x - cx, z - cz));
  out.lerp(other.setHex(0x2a2622), 1 - ease(9, 14.5, cave));
  /* Broad patches of lighter and darker ground, some 9 m across. */
  return out.multiplyScalar(0.85 + 0.3 * field(x * 2.9 + 40, z * 2.9 - 15, 2.4));
}

/* The ground (a grid of the tier's size, coloured by vertex, with the ring road and the lightning path worn into it) and the sea,
   then what grows, lies and flies on the land (flora.js), then the caves' pools and lights. `loop` is the setlist's path as points
   [x, z] every couple of metres, which nothing grows on, and `trunks(x, z)` whether a tree's trunk stands too near (x, z) for
   anything to grow or lie there (trees.js), `bands` the show's lit bands for the ground to wear (grained), null where it has
   none, and `crowd` the day's gathering for it to wear, as buildCrowd stands it (crowd.js `ground`: its seats, its blankets and its
   aisle), null for none. It returns the caves, the flora, `lit`, which has a material take the stage's glow as
   the ground does, or as a thing that stands on it does (takesPool), and `shade`, which draws a look of the night on the island
   at a time: the water's colour, the light lying on it and its swell, the stage's glow on the ground (buildSea, takesPool), the
   wind in the tufts, and the fireflies. */
export function buildIsland(scene, grid, phone, loop = [], trunks = () => false, bands = null, crowd = null) {
  const ground = new THREE.PlaneGeometry(260, 260, grid, grid);
  ground.rotateX(-Math.PI / 2);
  const pos = ground.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, height(pos.getX(i), pos.getZ(i)));
  ground.computeVertexNormals();
  /* The ground's colours, by vertex (landColour); the shader's grain (grained) breaks up what is left of the facets. */
  const normal = ground.attributes.normal, colors = new Float32Array(pos.count * 3), color = new THREE.Color();
  for (let i = 0; i < pos.count; i++) landColour(pos.getX(i), pos.getY(i), pos.getZ(i), normal.getY(i), color).toArray(colors, i * 3);
  ground.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const uPool = { value: new THREE.Color(0x000000) };
  const uPixel = { value: PIXEL }, drawn = new THREE.Vector2();
  const worn = crowd ? { map: { value: crowdMask(crowd) }, cloth: { value: BLANKET_COLOURS.map((hex) => new THREE.Color(hex)) } } : null;
  const land = new THREE.Mesh(ground, grained(takesPool(new THREE.MeshLambertMaterial({ vertexColors: true }), uPool), !phone, true, uPixel, bands, worn));
  /* The grain fades by what a pixel of this frame takes in of the ground, whatever the tier's view and the render scale. */
  land.onBeforeRender = (renderer, _scene, camera) => { uPixel.value = pixelAngle(camera, renderer.getDrawingBufferSize(drawn).y); };
  scene.add(land);
  const sea = buildSea(scene, uPool);

  /* What grows and lies on the land (flora.js): as many tufts and stones as the tier's ground is fine, thickest on a desktop's (a
     grid of 80 or more), thinner on a TV's and fewer than half as thick on a phone's, whose frame is small and whose every triangle
     costs it more. Each stands on the ground as its mesh draws it and takes the stage's glow as the ground does, and none of them
     stands on a track, on the setlist's path, where the bears walk and the lit bands lie, or in a tree's trunk. Nothing grows or lies
     on the crowd's ground or within CROWD_ROOM of it, where the gathering treads the grass in the ground's own shader (grained). */
  const thick = phone ? 0.6 : grid >= 80 ? 1.0 : 0.8;
  /* The path's points by the square of LOOP_SQUARE m each lies in, so a place is tried against the few points near it and not
     against the whole path. */
  const near = new Map(), square = (v) => Math.floor(v / LOOP_SQUARE), key = (i, j) => i * 4096 + j;
  for (const [px, pz] of loop) {
    const k = key(square(px), square(pz));
    if (!near.has(k)) near.set(k, []);
    near.get(k).push(px, pz);
  }
  const offLoop = (x, z) => {
    for (let i = square(x) - 1; i <= square(x) + 1; i++) for (let j = square(z) - 1; j <= square(z) + 1; j++) {
      const points = near.get(key(i, j));
      if (!points) continue;
      for (let k = 0; k < points.length; k += 2) if ((x - points[k]) ** 2 + (z - points[k + 1]) ** 2 < LOOP_ROOM * LOOP_ROOM) return false;
    }
    return true;
  };
  const lit = (material, stands = null) => takesPool(material, uPool, stands);
  const flora = buildFlora(scene, { tufts: Math.round(grid * grid * thick), stones: Math.round(grid * (phone ? 2.5 : 4)), flies: Math.round(grid * (phone ? 8 : 14)),
    extent: RING - 1, beach: [SHORE + 0.8, SHORE + 3.6], surface: surfaceOf(grid),
    colour: landColour, lit,
    clear: (x, z) => offTracks(x, z, FEATHER + 0.4) && offLoop(x, z) && !trunks(x, z), trodden: (x, z) => onCrowdGround(x, z, CROWD_ROOM) });

  /* The caves light for Drums (left) and Space (right): a pool on each floor and, but on a phone, a light inside. */
  const caves = CAVES.map(([cx, cz]) => {
    const poolGeo = new THREE.RingGeometry(0, 8, 32, 8).rotateX(-Math.PI / 2).translate(cx, 0, cz);
    const poolPos = poolGeo.attributes.position;
    for (let i = 0; i < poolPos.count; i++) poolPos.setY(i, height(poolPos.getX(i), poolPos.getZ(i)) + 0.15);
    const disc = new THREE.Mesh(poolGeo, new THREE.MeshBasicMaterial({ color: 0xd6508a, transparent: true, opacity: 0, depthWrite: false }));
    disc.visible = false;
    scene.add(disc);
    let light = null;
    if (!phone) {
      light = new THREE.PointLight(0xd6508a, 0, 30);
      light.position.set(cx, height(cx, cz) + 4, cz);
      scene.add(light);
    }
    return { disc, light, level: 0 };
  });
  /* A look of the night on the island at a time: the sea's, the wind in the tufts at the same time, and the fireflies, which come out
     as far as the night is dark and `calm` (1 when the music is quiet, 0 at its loudest) lets them. */
  const shade = (look, time = 0, calm = 1) => { sea(look, time); flora.wind(time); flora.glow(look.dark * look.dark * (0.35 + 0.65 * calm)); };
  return { caves, shade, flora, lit };
}
