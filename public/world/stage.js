/* eslint-disable */
import * as THREE from "three";
import { buildBand } from "./band.js";
import { FACING, height, STAGE, SHELF_Y } from "./ground.js";
import { mesh, mergeStill } from "./landmarks.js";
import { buildRig } from "./rig.js";

/* The stage, on its shelf at the island's north-east edge: a platform whose open front faces the island's middle (ground.js); a roof on
   two posts over a back wall with a light panel that plays the sky's liquid light; two PA stacks; a light; the rig's beams under the
   roof's front edge (rig.js); and the band (band.js): six players as flat black silhouettes, never likenesses, two guitars, a bass, keys
   and two drummers, with their instruments and the stage's furniture. */

/* The walk's reach round the stage and the column the third-person camera keeps out of, STAGE_REACH and STAGE_COLUMN, are ground.js's:
   they follow the platform's edge, the PA stacks' outer corners and the roof's top built here. */
/* Where the show sounds from: over the platform's centre, 2 m above the shelf, which puts it 0.8 m above the platform's floor (1.2 m
   up); and the way its sound faces: the stage's own. */
export const STAGE_SOUND = { x: STAGE[0], y: SHELF_Y + 2, z: STAGE[1], facing: [Math.sin(FACING), 0, Math.cos(FACING)] };
/* The light panel in the stage's own frame: its middle centred, PANEL.y m over the shelf, on the back wall; PANEL.w m wide and PANEL.h
   high, so it stands on the platform's floor. */
export const PANEL = { y: 3.7, z: -4.08, w: 16, h: 5 };
/* The platform's floor, in the stage's own frame: FLOOR m over the shelf, and FLOOR_R m out to the FLOOR_SIDES corners of its edge. */
export const FLOOR = 1.2, FLOOR_R = 9, FLOOR_SIDES = 16;

/* Builds the stage. With `shadows` the sun casts the desktop's one shadow map, framed on the stage alone. `panelMat` is the light panel's
   material (sky.js) and `colors` the sky's uniforms, whose two colours the rig's beams take. Returns the group, the light panel, the stage
   light (the downgrade turns it off), the rig (rig.js), `move`, which plays the band, and `fit`, which fits its crashes' poles to the
   canvas (band.js). */
export function buildStage(scene, sun, shadows, panelMat, colors) {
  const group = new THREE.Group();
  group.position.set(STAGE[0], SHELF_Y, STAGE[1]);
  group.rotation.y = FACING;
  group.updateMatrixWorld();
  scene.add(group);

  /* The still parts, merged into one mesh that casts the stage's shadow and takes it: the platform, whose skirt reaches 1.5 m below the
     shelf, so no gap opens under its edge where the shelf blends into the ground; the posts, the roof and the back wall; and the PA
     stacks, standing on the ground beside it. */
  const wood = new THREE.MeshLambertMaterial({ color: 0x6b4e2e, flatShading: true });
  const stone = new THREE.MeshLambertMaterial({ color: 0x8e8a82, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1a1816, flatShading: true });
  const still = new THREE.Group();
  still.add(mesh(new THREE.CylinderGeometry(FLOOR_R, 9.5, 2.7, FLOOR_SIDES), wood, 0, -0.15, 0));
  for (const x of [-8, 8]) still.add(mesh(new THREE.BoxGeometry(0.6, 8, 0.6), stone, x, 4, 4));
  still.add(mesh(new THREE.BoxGeometry(18, 0.5, 9), dark, 0, 8.2, 0), mesh(new THREE.BoxGeometry(18, 7, 0.4), dark, 0, 4.7, -4.3));
  for (const x of [-9.5, 9.5]) {
    const p = group.localToWorld(new THREE.Vector3(x, 0, 3));
    still.add(mesh(new THREE.BoxGeometry(1.6, 3.2, 1.2), dark, x, height(p.x, p.z) - SHELF_Y + 1.6, 3));
  }
  group.add(still);
  mergeStill(still);
  for (const m of still.children) { m.castShadow = true; m.receiveShadow = true; }

  /* The light panel covers the wall from the platform's floor up and plays the sky's liquid light (sky.js). */
  const panel = mesh(new THREE.PlaneGeometry(PANEL.w, PANEL.h), panelMat, 0, PANEL.y, PANEL.z);
  const light = new THREE.PointLight(0xe8b04b, 60, 40);
  light.position.set(0, 7, 0);
  group.add(panel, light);

  /* The band and its furniture stand on the platform's floor (band.js). */
  const band = buildBand(group, FLOOR);
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

  return { group, panel, light, rig, move: band.move, fit: band.fit };
}
