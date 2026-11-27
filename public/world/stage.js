/* eslint-disable */
import * as THREE from "three";
import { buildBand, SIX } from "./band.js";
import { FACING, height, STAGE, SHELF_Y } from "./ground.js";
import { mesh, mergeStill } from "./landmarks.js";
import { eraOn, lineupOn } from "./lineup.js";
import { BEAMS, buildRig, lampOf } from "./rig.js";

/* The stage, on its shelf at the island's north-east edge: a platform whose open front faces the island's middle (ground.js), and on
   it the stage of the show's era (STAGES): a roof on two posts over a back wall, with a PA stack at each side; in 1974, the Wall
   of Sound; or, from 1975 to 1989, an arena's stage, with a lighting truss, flown PA and a backline; a light panel that plays the
   sky's liquid light; a light; the rig's beams under the roof's front edge (rig.js); and the band (band.js): the line-up that played
   the show (lineup.js), five to seven players, lit, dressed in their era's colours and faceless, never likenesses, in its roles (two
   guitars and a bass, one or two drummers, and the organ, the keys, the piano and a singer as its era had them), with their
   instruments and the stage's furniture. */

/* The walk's reach round the stage and the column the third-person camera keeps out of, STAGE_REACH and STAGE_COLUMN, are ground.js's:
   they follow the platform's edge, the PA stacks', the Wall's and the arena's truss's outer corners and the tops of the roof, the Wall
   and the arena's truss built here. */
/* Where the show sounds from: over the platform's centre, 2 m above the shelf, which puts it 0.8 m above the platform's floor (1.2 m
   up); and the way its sound faces: the stage's own. */
export const STAGE_SOUND = { x: STAGE[0], y: SHELF_Y + 2, z: STAGE[1], facing: [Math.sin(FACING), 0, Math.cos(FACING)] };
/* The light panel in the stage's own frame: its middle centred, PANEL.y m over the shelf, on the back wall; PANEL.w m wide and PANEL.h
   high, so it stands on the platform's floor. */
export const PANEL = { y: 3.7, z: -4.08, w: 16, h: 5 };
/* The platform's floor, in the stage's own frame: FLOOR m over the shelf, and FLOOR_R m out to the FLOOR_SIDES corners of its edge. */
export const FLOOR = 1.2, FLOOR_R = 9, FLOOR_SIDES = 16;

/* The stage by the show's date, as the band's line-up is (lineup.js LINEUPS, whose rule for a date, eraOn, it shares): each row is
   [from, to, stage], both dates the row's own, in date order and with no two overlapping, and a date takes the last row that starts on
   or before it. "roof" is the roof on its two posts, the back wall and the PA stacks, which every era stood on before this table;
   "wall" is the Wall of Sound; "arena" is the arena years' stage, an arena rock show's: the roof's, its front a lighting truss, its
   PA flown at its sides, with side-fills and a backline on its floor. A show with no date stands on the roof's stage, as it does on
   the six (band.js SIX).

   The Wall's dates are Wikipedia's "Wall of Sound (Grateful Dead)" (https://en.wikipedia.org/wiki/Wall_of_Sound_(Grateful_Dead), read
   2026-11-26): the completed Wall's touring debut, at the Cow Palace on March 23, 1974, to the shows at Winterland of October 16 to 20,
   1974, after which it was retired ("the full Wall of Sound was only used from March to October of 1974"). Both edges are shows of the
   catalog (data/shows.json), so they need no lean: its show before the first is 1974-03-01 (Mars Hotel outtakes) and its last on a
   stage 1974-02-24 (Winterland), and its next after the last is 1974-12-01 (a studio date), then 1975's.

   The arena's row runs from the day after the Wall's last show to the last day of 1989: the years the stage pass's research reads as
   one era of the stage, 1975 and 1976 folded in with 1977 to 1989. No source here dates a change of the stage's gear inside it or at
   its end; its edges are the Wall's last show and the year's turn, and both fall between two of the catalog's shows, so they move
   none: after the Wall's last, 1974-10-20, the catalog's next is 1974-12-01 (a studio date), then 1975's; its last show of 1989 is
   1989-12-31 (Oakland-Alameda County Coliseum), and its next 1990-02-25, at the same hall, which stands on the roof's stage until
   the nineties have a stage of their own. The table's first row starts on the line-up table's first day, and its last ends on the
   band's last show. */
export const STAGES = [
  ["1965-06-01", "1974-03-22", "roof"],
  ["1974-03-23", "1974-10-20", "wall"],
  ["1974-10-21", "1989-12-31", "arena"],
  ["1990-01-01", "1995-07-09", "roof"],
];

/* The stage of a show on `date` (YYYY-MM-DD): its row of STAGES, as { from, to, stage }. */
export function stageOn(date) {
  const row = eraOn(STAGES, date);
  return { from: row[0], to: row[1], stage: row[2] };
}

/* The Wall of Sound, in the stage's own frame: columns of cabinets you can count, stepped up to a cluster in the middle. A column is
   one box of the stage's dark, and on its front, FACE m proud, each cabinet's face: a frame that shades from a shade lighter than the
   dark (SEAM) at its edges to the dark BEVEL m in, so that where two cabinets meet the seam is a soft ridge; on the face its speakers
   are discs a shade darker (SPEAKER), PROUD m proud, each of SIDES sides. A seam of hard edges a few centimetres wide falls under a
   pixel from the hill and comes and goes as the camera walks; a ridge shades over a pixel or two and holds. From the hill the stepped
   tops carry the Wall, and the seams and discs read as a fine, steady grid.

   Above the light panel: WALL_COLS columns of cabinets TOP_W wide, TOP_H high and TOP_D deep, from TOP_Y, just over the panel's top,
   their fronts on the back wall's at TOP_Z, so that none stands in front of the panel; each column as many cabinets high as TOP_ROWS
   says, from the crowd's left, stepping up from the sides to the cluster in the middle, which reaches the column's top (ground.js
   STAGE_COLUMN). Each of these cabinets carries two speakers side by side, of TOP_R m. At each end, beside the panel: a tower of the
   bass's cabinets, END_COLS of them END_W wide across, from the ground, END_D deep, its inner front corner on the panel's edge at
   END_AT and turned END_TURN rad toward the crowd, so the Wall wraps the band; its inner column as high as the top's outer columns
   (END_ROWS[0] cabinets of END_H) and its outer column a cabinet lower, so the skyline steps down at the ends too. Its outer back
   corner is the stage's furthest from its centre, 10.85 m. Each bass cabinet carries two speakers side by side, of END_R m.

   Over the front of the platform, on the posts, the rig's bridge: the roof's front BRIDGE m, as wide as the roof, which the lamps hang
   under as they hang under the roof (rig.js LAMP_Y, LAMP_Z). It is that deep so that from the hill it hides the top of the panel as
   the roof does: over a beam half a metre deep the panel's top showed from there as a bright strip between the beam and the cabinets,
   which at night the beams' feet lit near white. It is the roof's width so that from among the people the panel's top corner does not
   show past its end beside the tower. */
const SIDES = 8, BRIDGE = 2.5, SEAM = 0x2e2a26, SPEAKER = 0x0b0a09, BEVEL = 0.09, FACE = 0.01, PROUD = 0.02;
const WALL_COLS = 20, TOP_W = 0.805, TOP_H = 0.44, TOP_D = 0.75, TOP_Y = 6.25, TOP_Z = -4.1, TOP_R = 0.14;
const TOP_ROWS = [2, 2, 2, 3, 3, 3, 4, 4, 5, 5, 5, 5, 4, 4, 3, 3, 3, 2, 2, 2];
const END_COLS = 2, END_ROWS = [9, 8], END_W = 1.1, END_H = (TOP_Y + TOP_ROWS[0] * TOP_H) / END_ROWS[0], END_D = 0.75;
const END_AT = [WALL_COLS * TOP_W / 2, TOP_Z], END_TURN = 0.61, END_R = 0.22;

/* The arena's stage, in the stage's own frame: the roof's stage with no PA stacks on the ground, and

   - in the posts' place, a tower of the truss's (tower), round a core of the posts' stone, CORE m inside its chords;
   - over the front, the lighting truss: the roof's front TRUSS_D m, its height and thickness, a box truss in place of the roof's slab,
     reaching TRUSS_X m out to either side, past the roof's ends, in the truss's grey (TRUSS): a chord CHORD m square along each edge,
     on its front and its top a zigzag of webs WEB m square from chord to chord, a bay BAY m or so long, and between its bottom chords
     a floor of the dark. The slab behind it fills the roof's depth as before, and the floor closes the truss below, so from every
     camera the truss shows what the roof's front showed and no more of the light panel. Under it, straight over each of the rig's
     lamps (rig.js lampOf), a clamp CLAMP[0] m wide and CLAMP[1] deep, as high as a chord and CLAMP[2] m lower than the floor, so that
     its foot and the floor's do not share a plane. Nothing hangs below the lamps: the panel's top shows just under the roof's front edge,
     from the cameras that look down on it, and anything hung there would stand in front of it;
   - at each side, outboard of a tower, the flown PA: a cluster of FLY_COLS by FLY_ROWS PA cabinets (CAB) under a bumper, its top
     FLY_HANG m under the truss's end, hung on two chains, angled FLY_DOWN rad down toward the crowd and FLY_IN rad in toward its
     middle, its top's middle at FLY_AT ([x, z]);
   - on the floor at each wing, behind the tower, a side-fill: SIDE_COLS by SIDE_ROWS PA cabinets facing across the stage to the
     band, its middle at SIDE_AT;
   - and beside the side-fills, the backline: guitar amplifiers (AMP), each a cabinet under a head, standing at the wings and turned
     AMP_TURN rad from facing across the stage toward the crowd, as AMPS lists them: the lead guitar's and the bass's at the crowd's
     left, where they stand, and the rhythm guitar's at its right. They stand at the wings and not behind the players, as a backline
     does, because behind the players stands the light panel, and nothing dark stands in front of it.

   The side-fills and the backline keep under the light panel from the cameras that look down over them (their tops, from where they
   stand), and outside its ends from those that look across (where they stand): so the arena shows exactly the panel the roof's
   stage shows, from every camera of the shoot and of the flash counter (stage.test.ts).

   A PA cabinet is CAB[0] wide, CAB[1] high and CAB[2] deep, its face the Wall's (framed), a seam a shade lighter than the dark at its
   edges shading to the dark BEVEL m in; on it, PROUD m proud and in the speakers' shade, a horn's mouth HORN[0] of its width across
   and HORN[1] of its height high, HORN[2] of its height over its middle, and under it a woofer, a disc WOOFER of its width across,
   WOOFER_SIDES sided. An amplifier's cabinet is AMP[0] wide, AMP[1] high and AMP[2] deep, its face a grille of GRILLE in a frame of
   the dark; its head AMP[3] high and as wide and deep, its face a strip of the truss's grey (its panel) in a frame of the dark.

   Each of its shades is either the stage's black to the outline gates, under 0.05 in linear light (the dark, the seams and the
   speakers), or at least twice that (the truss's grey 0.144, the grilles' 0.125, the posts' stone 0.27 and the platform's wood
   0.147), so that the band keeps its outline against what is near it by contrast and not by a hair (band-outline.ts, stage.test.ts). */
const TRUSS = 0x6a665f, TRUSS_D = 0.6, TRUSS_X = 9.9, CHORD = 0.08, WEB = 0.05, BAY = 0.5, ROOF_UNDER = 7.95, ROOF_TOP = 8.45;
const CLAMP = [0.14, 0.2, 0.02], CORE = 0.02;
const CAB = [0.6, 0.78, 0.6], HORN = [0.6, 0.18, 0.3], WOOFER = 0.7, WOOFER_SIDES = 12;
const FLY_COLS = 2, FLY_ROWS = 3, FLY_HANG = 0.25, FLY_AT = [9.1, 4.05], FLY_DOWN = 0.12, FLY_IN = 0.15;
const SIDE_COLS = 2, SIDE_ROWS = 2, SIDE_AT = [7.76, 2.7];
const AMP = [0.8, 0.95, 0.45, 0.3], GRILLE = 0x635c53, AMP_TURN = 0.35;
const AMPS = [{ role: "lead", at: [-8.25, -1.05] }, { role: "bass", at: [-8.45, 0.25] }, { role: "rhythm", at: [8.45, -0.85] }];

/* Builds the stage. With `shadows` the sun casts the desktop's one shadow map, framed on the stage alone. `panelMat` is the light panel's
   material (sky.js) and `colors` the sky's uniforms, whose two colours the rig's beams take. Returns the group, the light panel, the stage
   light (the downgrade turns it off), the rig (rig.js), the band (band.js), `move`, which plays it, `fit`, which fits its thin parts
   to the canvas, and `lightBand`, which sets the band's own steady light for the hour (band.js `light`). The stage and the band are those of the show on `showDate` (YYYY-MM-DD, STAGES and lineup.js); without one, the roof's
   stage and the six of 1979 to 1990. */
export function buildStage(scene, sun, shadows, panelMat, colors, showDate) {
  const group = new THREE.Group();
  group.position.set(STAGE[0], SHELF_Y, STAGE[1]);
  group.rotation.y = FACING;
  group.updateMatrixWorld();
  scene.add(group);

  /* The still parts, merged into one mesh that casts the stage's shadow and takes it: the platform, whose skirt reaches 1.5 m below the
     shelf, so no gap opens under its edge where the shelf blends into the ground; and the era's (STILL), the posts among them. */
  const wood = new THREE.MeshLambertMaterial({ color: 0x6b4e2e, flatShading: true });
  const stone = new THREE.MeshLambertMaterial({ color: 0x8e8a82, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1a1816, flatShading: true });
  const still = new THREE.Group();
  still.add(mesh(new THREE.CylinderGeometry(FLOOR_R, 9.5, 2.7, FLOOR_SIDES), wood, 0, -0.15, 0));
  STILL[showDate ? stageOn(showDate).stage : "roof"](still, group, { dark, stone });
  group.add(still);
  mergeStill(still);
  for (const m of still.children) { m.castShadow = true; m.receiveShadow = true; }

  /* The light panel covers the wall from the platform's floor up and plays the sky's liquid light (sky.js). */
  const panel = mesh(new THREE.PlaneGeometry(PANEL.w, PANEL.h), panelMat, 0, PANEL.y, PANEL.z);
  const light = new THREE.PointLight(0xe8b04b, 60, 40);
  light.position.set(0, 7, 0);
  group.add(panel, light);

  /* The band and its furniture stand on the platform's floor (band.js), as the show's line-up (lineup.js). */
  const band = buildBand(group, FLOOR, showDate ? lineupOn(showDate).roles : SIX, showDate ?? null);
  const rig = buildRig(group, colors);

  if (shadows) {
    /* The sun keeps its direction but aims at the stage, so its shadow camera frames the stage alone. */
    const toSun = sun.position.clone().sub(sun.target.position);
    sun.target.position.set(STAGE[0], SHELF_Y, STAGE[1]);
    sun.position.copy(sun.target.position).add(toSun);
    scene.add(sun.target);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 100, far: 150 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
  }

  return { group, panel, light, rig, band, move: band.move, fit: band.fit, lightBand: band.light };
}

/* The two posts, of stone, at the front of the platform: the roof's stage's and the Wall's, each era's first parts. */
const posts = (still, stone) => { for (const x of [-8, 8]) still.add(mesh(new THREE.BoxGeometry(0.6, 8, 0.6), stone, x, 4, 4)); };

/* Each era's still parts, added to `still` in the stage's `group`, after the platform, in the stage's dark and stone. */
const STILL = {
  /* The posts; the roof on them, 18 m by 9 at 8.2 m up; the back wall behind the panel; and the PA stacks, standing on the ground beside
     the platform. */
  roof(still, group, { dark, stone }) {
    posts(still, stone);
    still.add(mesh(new THREE.BoxGeometry(18, 0.5, 9), dark, 0, 8.2, 0), mesh(new THREE.BoxGeometry(18, 7, 0.4), dark, 0, 4.7, -4.3));
    for (const x of [-9.5, 9.5]) {
      const p = group.localToWorld(new THREE.Vector3(x, 0, 3));
      still.add(mesh(new THREE.BoxGeometry(1.6, 3.2, 1.2), dark, x, height(p.x, p.z) - SHELF_Y + 1.6, 3));
    }
  },
  /* The Wall of Sound, 1974, behind the band, with no stacks at the sides and no roof behind the rig's bridge, so that it stands
     against the sky (WALL_COLS and the rest): its cabinets above the panel and its towers at the ends, and the panel's backing, the back
     wall's below the cabinets, up to their faces' foot and no further, so that no face shares its plane; and over the front, on the
     posts, the bridge (BRIDGE), the roof's front with the same front edge. The towers stand on the ground, which there is 3 to 14 cm
     over the shelf. */
  wall(still, group, { dark, stone }) {
    posts(still, stone);
    const mats = { dark, seam: new THREE.Color(SEAM), speaker: new THREE.MeshLambertMaterial({ color: SPEAKER, flatShading: true }) };
    still.add(mesh(new THREE.BoxGeometry(18, 0.5, BRIDGE), dark, 0, 8.2, 4.5 - BRIDGE / 2));
    still.add(mesh(new THREE.BoxGeometry(WALL_COLS * TOP_W, TOP_Y - FLOOR, 0.4), dark, 0, (TOP_Y + FLOOR) / 2, TOP_Z - 0.2));
    TOP_ROWS.forEach((rows, c) => stack(still, mats, [TOP_W * (c + 0.5 - WALL_COLS / 2), TOP_Z], 0, TOP_Y, TOP_W, TOP_H, TOP_D, rows, TOP_R));
    for (const side of [-1, 1]) {
      const at = [side * END_AT[0], END_AT[1]], turn = -side * END_TURN;
      for (let c = 0; c < END_COLS; c++) {
        const along = side * END_W * (c + 0.5);
        stack(still, mats, [at[0] + along * Math.cos(turn), at[1] - along * Math.sin(turn)], turn, 0, END_W, END_H, END_D, END_ROWS[c], END_R);
      }
    }
  },
};

/* The arena's stage (TRUSS and the rest): the roof's slab behind the truss and its back wall, the truss and its clamps, and at each side
   the flown PA, the side-fill and the backline. */
STILL.arena = function arena(still, group, { dark, stone }) {
  const grey = new THREE.MeshLambertMaterial({ color: TRUSS, flatShading: true });
  for (const x of [-8, 8]) tower(still, grey, stone, x);
  const mats = { dark, seam: new THREE.Color(SEAM), speaker: new THREE.MeshLambertMaterial({ color: SPEAKER, flatShading: true }) };
  const front = [4.5 - TRUSS_D, 4.5], under = ROOF_UNDER - CLAMP[2] + CHORD / 2;
  still.add(mesh(new THREE.BoxGeometry(18, ROOF_TOP - ROOF_UNDER, 9 - TRUSS_D), dark, 0, (ROOF_UNDER + ROOF_TOP) / 2, -TRUSS_D / 2));
  still.add(mesh(new THREE.BoxGeometry(18, 7, 0.4), dark, 0, 4.7, -4.3));
  truss(still, grey, -TRUSS_X, TRUSS_X, front, [ROOF_UNDER, ROOF_TOP], ["front", "top"]);
  still.add(mesh(new THREE.BoxGeometry(2 * TRUSS_X, CHORD / 2, TRUSS_D - 2 * CHORD), dark, 0, ROOF_UNDER + CHORD / 4, (front[0] + front[1]) / 2));
  for (let i = 0; i < BEAMS; i++) still.add(mesh(new THREE.BoxGeometry(CLAMP[0], CHORD, CLAMP[1]), grey, lampOf(i).x, under, lampOf(i).z));

  for (const side of [-1, 1]) {
    /* The flown PA, on two chains from the truss's bottom chords. */
    const fly = new THREE.Group(), top = ROOF_UNDER - FLY_HANG;
    fly.position.set(side * FLY_AT[0], top, FLY_AT[1]);
    fly.rotation.set(FLY_DOWN, -side * FLY_IN, 0, "YXZ");
    fly.add(mesh(new THREE.BoxGeometry(FLY_COLS * CAB[0] + 0.1, 0.08, CAB[2]), dark, 0, -0.04, 0));
    for (let c = 0; c < FLY_COLS; c++) for (let r = 0; r < FLY_ROWS; r++) {
      cabinet(fly, mats, (c + 0.5 - FLY_COLS / 2) * CAB[0], -0.08 - (r + 0.5) * CAB[1]);
    }
    fly.updateMatrix();
    for (const u of [-0.5, 0.5]) {
      const hook = new THREE.Vector3(u * CAB[0], 0, 0).applyMatrix4(fly.matrix), drop = ROOF_UNDER - hook.y;
      still.add(mesh(new THREE.BoxGeometry(0.04, drop, 0.04), dark, hook.x, hook.y + drop / 2, hook.z));
    }
    bake(still, fly);

    /* The side-fill, facing across the stage. */
    const fill = new THREE.Group();
    fill.position.set(side * SIDE_AT[0], FLOOR, SIDE_AT[1]);
    fill.rotation.y = -side * Math.PI / 2;
    for (let c = 0; c < SIDE_COLS; c++) for (let r = 0; r < SIDE_ROWS; r++) cabinet(fill, mats, (c + 0.5 - SIDE_COLS / 2) * CAB[0], (r + 0.5) * CAB[1]);
    bake(still, fill);
  }

  /* The backline: each amplifier, its cabinet's face a grille and its head's a panel, facing across the stage and turned toward the
     crowd. */
  const grille = new THREE.Color(GRILLE), panel = new THREE.Color(TRUSS), [w, h, d, head] = AMP;
  for (const { at: [x, z] } of AMPS) {
    const amp = new THREE.Group(), side = Math.sign(x);
    amp.position.set(x, FLOOR, z);
    amp.rotation.y = -side * (Math.PI / 2 - AMP_TURN);
    amp.add(mesh(new THREE.BoxGeometry(w, h, d), dark, 0, h / 2, 0), mesh(new THREE.BoxGeometry(w, head, d - 0.05), dark, 0, h + head / 2, -0.025));
    amp.add(face(framed(w, h, 0.06, dark.color, grille), 0, h / 2, d / 2 + FACE), face(framed(w, head, 0.08, dark.color, panel), 0, h + head / 2, d / 2 - 0.05 + FACE));
    bake(still, amp);
  }
};

/* A face (framed) as a mesh at (x, y, z), its colours its corners'. */
const face = (geo, x, y, z) => mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), x, y, z);

/* Moves a group's parts into `still`, each where the group puts it, so that they merge with the rest (mergeStill). */
function bake(still, group) {
  group.updateMatrix();
  for (const m of [...group.children]) {
    m.applyMatrix4(group.matrix);
    still.add(m);
  }
}

/* A tower of box truss in the posts' place, the post's width and as high as the truss's bottom, round a core, so that it stands in the
   way of what the post stood in the way of: a truss on end (truss), its webs on all four faces in the truss's grey, round a core of the
   post's own stone, CORE m inside the chords. A player seen beside the tower is seen against the stone and the grey as against the
   post, which is no part of the stage's black (band-outline.ts): the seven of 1974 to 1979's pianist, from among the crowd, stands
   within two pixels of it, as of the post. */
function tower(still, grey, stone, x) {
  const t = new THREE.Group(), r = 0.3;
  t.position.set(x, 0, 4);
  t.rotation.z = Math.PI / 2;
  truss(t, grey, 0, ROOF_UNDER, [-r, r], [-r, r], ["front", "back", "top", "bottom"]);
  t.add(mesh(new THREE.BoxGeometry(ROOF_UNDER, 2 * r - 2 * CORE, 2 * r - 2 * CORE), stone, ROOF_UNDER / 2, 0, 0));
  bake(still, t);
}

/* A box truss along x, from x0 to x1, its section from z0 to z1 and from y0 to y1, in `mat`: a chord along each edge, and on each face
   `faces` names a zigzag of webs from chord to chord, BAY m or so a bay (TRUSS and the rest). */
function truss(still, mat, x0, x1, [z0, z1], [y0, y1], faces) {
  const c = CHORD / 2, long = x1 - x0, mid = (x0 + x1) / 2, chord = new THREE.BoxGeometry(long, CHORD, CHORD);
  for (const z of [z0 + c, z1 - c]) for (const y of [y0 + c, y1 - c]) still.add(mesh(chord, mat, mid, y, z));
  const bays = Math.max(1, Math.round(long / BAY)), bay = long / bays;
  for (const face of faces) {
    const upright = face === "front" || face === "back", across = upright ? [y0 + c, y1 - c] : [z0 + c, z1 - c];
    const at = { front: z1 - c, back: z0 + c, top: y1 - c, bottom: y0 + c }[face], span = across[1] - across[0];
    const web = new THREE.BoxGeometry(Math.hypot(bay, span), WEB, WEB), tilt = Math.atan2(span, bay), u = (across[0] + across[1]) / 2;
    for (let k = 0; k < bays; k++) {
      const x = x0 + (k + 0.5) * bay, sign = k % 2 ? -1 : 1, m = upright ? mesh(web, mat, x, u, at) : mesh(web, mat, x, at, u);
      if (upright) m.rotation.z = sign * tilt; else m.rotation.y = -sign * tilt;
      still.add(m);
    }
  }
}

/* A PA cabinet (CAB) in `group`, facing +z, its face's middle at (x, y, CAB[2] / 2): one box of the dark, FACE m short of its face; the
   face (framed); and on it, PROUD m proud, its horn's mouth over its woofer (HORN, WOOFER), in the speakers' shade. */
function cabinet(group, { dark, seam, speaker }, x, y) {
  const [w, h, d] = CAB;
  group.add(mesh(new THREE.BoxGeometry(w, h, d - FACE), dark, x, y, -FACE / 2), face(framed(w, h, BEVEL, seam, dark.color), x, y, d / 2));
  group.add(mesh(new THREE.PlaneGeometry(HORN[0] * w, HORN[1] * h), speaker, x, y + HORN[2] * h, d / 2 + PROUD));
  group.add(mesh(new THREE.CircleGeometry((WOOFER * w) / 2, WOOFER_SIDES), speaker, x, y - (HORN[1] * h) / 2, d / 2 + PROUD));
}

/* A column of `rows` cabinets, each `w` wide, `h` high and `d` deep, from `y` up, its front's middle at `at` ([x, z]) and facing `turn`
   rad round from the crowd: one box of the dark, FACE m short of the front; on it each cabinet's face (framed), shading from the
   seam's shade (a colour) at its edges to the dark BEVEL m in; and on each face two speakers side by side, discs of radius `r` in the speaker's
   shade, PROUD m proud of it. */
function stack(still, { dark, seam, speaker }, [x, z], turn, y, w, h, d, rows, r) {
  const sin = Math.sin(turn), cos = Math.cos(turn);
  const put = (m, across, up, out) => {
    m.position.set(x + across * cos + out * sin, up, z - across * sin + out * cos);
    m.rotation.y = turn;
    return m;
  };
  still.add(put(new THREE.Mesh(new THREE.BoxGeometry(w, rows * h, d - FACE), dark), 0, y + (rows * h) / 2, -(d + FACE) / 2));
  const face = new THREE.Mesh(framed(w, h, BEVEL, seam, dark.color), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  const disc = new THREE.CircleGeometry(r, SIDES);
  for (let k = 0; k < rows; k++) {
    const up = y + h * (k + 0.5);
    still.add(put(face.clone(), 0, up, 0));
    for (const i of [-1, 1]) still.add(put(new THREE.Mesh(disc, speaker), (i * w) / 4, up, PROUD));
  }
}

/* A cabinet's face, `w` by `h`, facing +z: its edge, in the colour `edge`, framing a middle `b` in on every side, in `middle`, the
   colours shading between them across the frame (mergeStill keeps a part's own colours). Ten triangles: four for the frame's sides
   and two for the middle. */
function framed(w, h, b, edge, middle) {
  const X = w / 2, Y = h / 2, x = X - b, y = Y - b;
  const at = [[-X, -Y], [X, -Y], [X, Y], [-X, Y], [-x, -y], [x, -y], [x, y], [-x, y]];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(at.flatMap(([u, v]) => [u, v, 0]), 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(at.flatMap((_, k) => (k < 4 ? edge : middle).toArray()), 3));
  geo.setIndex([0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7, 4, 5, 6, 4, 6, 7]);
  return geo;
}
