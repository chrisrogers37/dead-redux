/* eslint-disable */
import * as THREE from "three";
import { buildBand, SIX } from "./band.js";
import { FACING, height, STAGE, SHELF_Y } from "./ground.js";
import { mesh, mergeStill } from "./landmarks.js";
import { eraOn, lineupOn } from "./lineup.js";
import { buildRig } from "./rig.js";

/* The stage, on its shelf at the island's north-east edge: a platform whose open front faces the island's middle (ground.js), and on
   it the stage of the show's era (STAGES): a roof on two posts over a back wall, with a PA stack at each side, or, in 1974, the Wall
   of Sound; a light panel that plays the sky's liquid light; a light; the rig's beams under the roof's front edge (rig.js); and the
   band (band.js): the line-up that played the show (lineup.js), five to seven players as flat black silhouettes, never likenesses,
   in its roles (two guitars and a bass, one or two drummers, and the organ, the keys, the piano and a singer as its era had them),
   with their instruments and the stage's furniture. */

/* The walk's reach round the stage and the column the third-person camera keeps out of, STAGE_REACH and STAGE_COLUMN, are ground.js's:
   they follow the platform's edge, the PA stacks' and the Wall's outer corners and the tops of the roof and the Wall built here. */
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
   "wall" is the Wall of Sound. A show with no date stands on the roof's stage, as it does on the six (band.js SIX).

   The Wall's dates are Wikipedia's "Wall of Sound (Grateful Dead)" (https://en.wikipedia.org/wiki/Wall_of_Sound_(Grateful_Dead), read
   2026-11-26): the completed Wall's touring debut, at the Cow Palace on March 23, 1974, to the shows at Winterland of October 16 to 20,
   1974, after which it was retired ("the full Wall of Sound was only used from March to October of 1974"). Both edges are shows of the
   catalog (data/shows.json), so they need no lean: its show before the first is 1974-03-01 (Mars Hotel outtakes) and its last on a
   stage 1974-02-24 (Winterland), and its next after the last is 1974-12-01 (a studio date), then 1975's. The table's first row starts
   on the line-up table's first day, and its last ends on the band's last show. */
export const STAGES = [
  ["1965-06-01", "1974-03-22", "roof"],
  ["1974-03-23", "1974-10-20", "wall"],
  ["1974-10-21", "1995-07-09", "roof"],
];

/* The stage of a show on `date` (YYYY-MM-DD): its row of STAGES, as { from, to, stage }. */
export function stageOn(date) {
  const row = eraOn(STAGES, date);
  return { from: row[0], to: row[1], stage: row[2] };
}

/* The Wall of Sound, in the stage's own frame. Its cabinets are dark, each a box with its speakers' cones standing CONE m proud of its
   front, a speaker an eight-sided cone of SIDES facets. Above the light panel: WALL_COLS columns of cabinets TOP_W wide, TOP_H high and
   TOP_D deep, from TOP_Y, just over the panel's top, their fronts on the back wall's at TOP_Z, so that none stands in front of the
   panel: a row of them across the wall's width and, on it, columns as many cabinets high as TOP_ROWS says, from the crowd's left, the
   cluster up the middle reaching the column's top (ground.js STAGE_COLUMN) and a gap of sky between the sides and the middle. At each
   end, beside the panel: a tower of the bass's cabinets, END_COLS of them END_W wide across and END_ROWS high, from the ground to the
   column's top, END_D deep, its inner front corner on the panel's edge at END_AT and turned END_TURN rad toward the crowd, so the Wall
   wraps the band; its outer back corner is the stage's furthest from its centre, 10.85 m. Each cabinet carries four speakers, two by
   two, of TOP_R m and END_R m. */
const CONE = 0.06, SIDES = 8;
const WALL_COLS = 20, TOP_W = 0.805, TOP_H = 2.2 / 3, TOP_D = 0.75, TOP_Y = 6.25, TOP_Z = -4.1, TOP_R = 0.14;
const TOP_ROWS = [2, 2, 2, 1, 2, 2, 2, 2, 3, 3, 3, 3, 2, 2, 2, 2, 1, 2, 2, 2];
const END_COLS = 2, END_ROWS = 9, END_W = 1.1, END_H = 8.45 / END_ROWS, END_D = 0.75, END_AT = [WALL_COLS * TOP_W / 2, TOP_Z], END_TURN = 0.61, END_R = 0.2;

/* Builds the stage. With `shadows` the sun casts the desktop's one shadow map, framed on the stage alone. `panelMat` is the light panel's
   material (sky.js) and `colors` the sky's uniforms, whose two colours the rig's beams take. Returns the group, the light panel, the stage
   light (the downgrade turns it off), the rig (rig.js), the band (band.js), `move`, which plays it, and `fit`, which fits its thin parts
   to the canvas. The stage and the band are those of the show on `showDate` (YYYY-MM-DD, STAGES and lineup.js); without one, the roof's
   stage and the six of 1979 to 1990. */
export function buildStage(scene, sun, shadows, panelMat, colors, showDate) {
  const group = new THREE.Group();
  group.position.set(STAGE[0], SHELF_Y, STAGE[1]);
  group.rotation.y = FACING;
  group.updateMatrixWorld();
  scene.add(group);

  /* The still parts, merged into one mesh that casts the stage's shadow and takes it: the platform, whose skirt reaches 1.5 m below the
     shelf, so no gap opens under its edge where the shelf blends into the ground; the posts; and the era's (STILL). */
  const wood = new THREE.MeshLambertMaterial({ color: 0x6b4e2e, flatShading: true });
  const stone = new THREE.MeshLambertMaterial({ color: 0x8e8a82, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1a1816, flatShading: true });
  const still = new THREE.Group();
  still.add(mesh(new THREE.CylinderGeometry(FLOOR_R, 9.5, 2.7, FLOOR_SIDES), wood, 0, -0.15, 0));
  for (const x of [-8, 8]) still.add(mesh(new THREE.BoxGeometry(0.6, 8, 0.6), stone, x, 4, 4));
  STILL[showDate ? stageOn(showDate).stage : "roof"](still, group, dark);
  group.add(still);
  mergeStill(still);
  for (const m of still.children) { m.castShadow = true; m.receiveShadow = true; }

  /* The light panel covers the wall from the platform's floor up and plays the sky's liquid light (sky.js). */
  const panel = mesh(new THREE.PlaneGeometry(PANEL.w, PANEL.h), panelMat, 0, PANEL.y, PANEL.z);
  const light = new THREE.PointLight(0xe8b04b, 60, 40);
  light.position.set(0, 7, 0);
  group.add(panel, light);

  /* The band and its furniture stand on the platform's floor (band.js), as the show's line-up (lineup.js). */
  const band = buildBand(group, FLOOR, showDate ? lineupOn(showDate).roles : SIX);
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

  return { group, panel, light, rig, band, move: band.move, fit: band.fit };
}

/* Each era's still parts, added to `still` in the stage's `group`, after the platform and the posts. */
const STILL = {
  /* The roof on the posts, 18 m by 9 at 8.2 m up; the back wall behind the panel; and the PA stacks, standing on the ground beside the
     platform. */
  roof(still, group, dark) {
    still.add(mesh(new THREE.BoxGeometry(18, 0.5, 9), dark, 0, 8.2, 0), mesh(new THREE.BoxGeometry(18, 7, 0.4), dark, 0, 4.7, -4.3));
    for (const x of [-9.5, 9.5]) {
      const p = group.localToWorld(new THREE.Vector3(x, 0, 3));
      still.add(mesh(new THREE.BoxGeometry(1.6, 3.2, 1.2), dark, x, height(p.x, p.z) - SHELF_Y + 1.6, 3));
    }
  },
  /* The Wall of Sound, 1974, behind the band, with no stacks at the sides and no roof, so that it stands against the sky (WALL_COLS and
     the rest): its cabinets above the panel and its towers at the ends, and the panel's backing, the back wall's below the top of the
     panel; and over the front, on the posts, the roof's front edge, a beam the rig's lamps hang under as they hang under the roof's
     (rig.js LAMP_Y, LAMP_Z). The towers stand on the ground, which there is 3 to 14 cm over the shelf. */
  wall(still, group, dark) {
    still.add(mesh(new THREE.BoxGeometry(16.6, 0.5, 0.5), dark, 0, 8.2, 4.25));
    still.add(mesh(new THREE.BoxGeometry(WALL_COLS * TOP_W, TOP_Y + 0.05 - FLOOR, 0.4), dark, 0, (TOP_Y + 0.05 + FLOOR) / 2, TOP_Z - 0.2));
    TOP_ROWS.forEach((rows, c) => stack(still, dark, [TOP_W * (c + 0.5 - WALL_COLS / 2), TOP_Z], 0, TOP_Y, TOP_W, TOP_H, TOP_D, rows, TOP_R));
    for (const side of [-1, 1]) {
      const at = [side * END_AT[0], END_AT[1]], turn = -side * END_TURN;
      for (let c = 0; c < END_COLS; c++) {
        const along = side * END_W * (c + 0.5);
        stack(still, dark, [at[0] + along * Math.cos(turn), at[1] - along * Math.sin(turn)], turn, 0, END_W, END_H, END_D, END_ROWS, END_R);
      }
    }
  },
};

/* A column of `rows` cabinets, each `w` wide, `h` high and `d` deep, from `y` up: one box, its front's middle at `at` ([x, z]) and
   facing `turn` rad round from the crowd, and on its front each cabinet's four speakers, two by two, cones of radius `r`. */
function stack(still, dark, [x, z], turn, y, w, h, d, rows, r) {
  const sin = Math.sin(turn), cos = Math.cos(turn);
  const put = (m, across, up, out) => {
    m.position.set(x + across * cos + out * sin, up, z - across * sin + out * cos);
    m.rotation.y = turn;
    return m;
  };
  still.add(put(new THREE.Mesh(new THREE.BoxGeometry(w, rows * h, d), dark), 0, y + (rows * h) / 2, -d / 2));
  const cone = new THREE.ConeGeometry(r, CONE, SIDES, 1, true).rotateX(Math.PI / 2);
  for (let k = 0; k < rows; k++) for (const i of [-1, 1]) for (const j of [-1, 1]) {
    still.add(put(new THREE.Mesh(cone, dark), (i * w) / 4, y + h * (k + 0.5) + (j * h) / 4, CONE / 2));
  }
}
