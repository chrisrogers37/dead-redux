/* eslint-disable */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { FACING, height, STAGE, SHELF_Y } from "./ground.js";
import { mesh, mergeStill } from "./landmarks.js";

/* The stage, on its shelf at the island's north-east edge: a platform whose open front faces the island's middle (ground.js); a roof on
   two posts over a back wall with a light panel in the sky's first colour; two PA stacks; a light; and six players as flat black
   silhouettes, never likenesses: two guitars, a bass, keys and two drummers. */

/* How near a walk comes to the stage's centre: the platform's edge stands 9.5 m out, and a bear's belly reaches 1.3 m ahead of its centre
   below the platform's top. */
export const STAGE_REACH = 11;
/* The column the third-person camera keeps out of (avatar.js): every solid of the stage stands inside it, the PA stacks' outer corners
   10.9 m from the centre and the roof's top 8.45 m above the floor, and no walk does. */
export const STAGE_COLUMN = { x: STAGE[0], z: STAGE[1], r: 10.95, top: SHELF_Y + 8.45 };
/* Where the show sounds from: over the platform's centre, 2 m above the shelf, which puts it 0.8 m above the platform's floor (1.2 m
   up); and the way its sound faces: the stage's own. */
export const STAGE_SOUND = { x: STAGE[0], y: SHELF_Y + 2, z: STAGE[1], facing: [Math.sin(FACING), 0, Math.cos(FACING)] };

/* Builds the stage. With `shadows` the sun casts the desktop's one shadow map, framed on the stage alone. Returns the group, the light
   panel (whose colour follows the sky's), the stage light (the downgrade's last rung turns it off) and `move`, which plays the players. */
export function buildStage(scene, sun, shadows) {
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
  still.add(mesh(new THREE.CylinderGeometry(9, 9.5, 2.7, 16), wood, 0, -0.15, 0));
  for (const x of [-8, 8]) still.add(mesh(new THREE.BoxGeometry(0.6, 8, 0.6), stone, x, 4, 4));
  still.add(mesh(new THREE.BoxGeometry(18, 0.5, 9), dark, 0, 8.2, 0), mesh(new THREE.BoxGeometry(18, 7, 0.4), dark, 0, 4.7, -4.3));
  for (const x of [-9.5, 9.5]) {
    const p = group.localToWorld(new THREE.Vector3(x, 0, 3));
    still.add(mesh(new THREE.BoxGeometry(1.6, 3.2, 1.2), dark, x, height(p.x, p.z) - SHELF_Y + 1.6, 3));
  }
  group.add(still);
  mergeStill(still);
  for (const m of still.children) { m.castShadow = true; m.receiveShadow = true; }

  /* The light panel covers the wall from the platform's floor up; unlit, it shows the sky's colour as it is. */
  const panel = mesh(new THREE.PlaneGeometry(16, 5), new THREE.MeshBasicMaterial({ color: 0xe8b04b }), 0, 3.7, -4.08);
  const light = new THREE.PointLight(0xe8b04b, 60, 40);
  light.position.set(0, 7, 0);
  group.add(panel, light);

  /* The players: flat black and unlit, each one mesh in a group standing on the floor, so a strum rocks the whole player and a nod bobs
     it. The drummers sit, and each one's arms are a mesh that swings from the shoulders; the keyboard and the drums stand still, one mesh. */
  const black = new THREE.MeshBasicMaterial({ color: 0x0b0b0d });
  const part = (geo, x, y, z, rz = 0) => geo.rotateZ(rz).translate(x, y, z);
  /* A capsule body of middle length `len` centred at `y`, and the head just above it. */
  const body = (len, y) => [part(new THREE.CapsuleGeometry(0.5, len), 0, y, 0), part(new THREE.SphereGeometry(0.4, 8, 6), 0, y + len / 2 + 0.85, 0)];
  /* A guitar across the hips, its neck rising to the player's left (the audience's right); the bass has a longer neck. */
  const guitar = (neck) => {
    const r = neck / 2 + 0.4;
    return [part(new THREE.BoxGeometry(0.9, 0.5, 0.15), -0.15, 1.0, 0.55, -0.35),
      part(new THREE.BoxGeometry(0.12, neck, 0.1), -0.15 + r * Math.sin(1.2), 1.0 + r * Math.cos(1.2), 0.55, -1.2)];
  };
  const arm = (x) => new THREE.BoxGeometry(0.14, 0.8, 0.14).translate(0, -0.4, 0).rotateX(-1.0).translate(x, 0, 0);
  const players = [
    { spot: [-3, 1], strums: true, geos: [...body(1.4, 1.2), ...guitar(1.0)] },
    { spot: [3, 1], strums: true, geos: [...body(1.4, 1.2), ...guitar(1.0)] },
    { spot: [-5.5, -1], strums: true, geos: [...body(1.4, 1.2), ...guitar(1.3)] },
    { spot: [6, -1.5], geos: body(1.4, 1.2) },
    /* The drummers, the second playing a half-beat behind the first. */
    { spot: [-1.2, -2.5], lag: 0, geos: body(0.6, 1.1) },
    { spot: [1.2, -2.5], lag: 0.5, geos: body(0.6, 1.1) },
  ].map(({ spot: [x, z], strums = false, lag, geos }) => {
    const g = new THREE.Group();
    g.position.set(x, 1.2, z);
    g.add(new THREE.Mesh(mergeGeometries(geos), black));
    let arms = null;
    if (lag !== undefined) {
      arms = new THREE.Mesh(mergeGeometries([arm(-0.45), arm(0.45)]), black);
      arms.position.set(0, 1.65, 0);
      g.add(arms);
    }
    group.add(g);
    return { g, strums, arms, lag };
  });
  /* The keyboard on its two legs in front of the keys, and each drummer's three drums. */
  const kit = [part(new THREE.BoxGeometry(1.6, 0.2, 0.6), 6, 2.25, -0.75)];
  for (const dx of [-0.7, 0.7]) kit.push(part(new THREE.BoxGeometry(0.1, 1.0, 0.1), 6 + dx, 1.7, -0.75));
  for (const x of [-1.2, 1.2]) {
    for (const dx of [-0.55, 0.55]) kit.push(part(new THREE.CylinderGeometry(0.35, 0.35, 0.5, 10), x + dx, 2.15, -1.65));
    kit.push(part(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 12).rotateX(Math.PI / 2), x, 1.7, -1.55));
  }
  group.add(new THREE.Mesh(mergeGeometries(kit), black));

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

  /* The players keep a fixed 96 beats a minute while the show plays: everyone nods on the beat, the guitars and the bass rock with the
     strum, and each drummer's arms fall on 1 and 3. Otherwise they stand, breathing on a 4-s cycle. Each change eases over 0.8 s. Under
     reduced motion nothing calls this, so they stand still. */
  let level = 0;
  function move(dt, t, playing) {
    level = Math.max(0, Math.min(1, level + (playing ? dt : -dt) / 0.8));
    const beats = (t * 96) / 60, beat = Math.sin(2 * Math.PI * beats), breath = 0.02 * (1 - level) * Math.sin((2 * Math.PI * t) / 4);
    for (const p of players) {
      p.g.position.y = 1.2 + 0.06 * level * beat + breath;
      if (p.strums) p.g.rotation.z = 0.15 * level * beat;
      if (p.arms) p.arms.rotation.x = 0.5 * level * Math.sin(Math.PI * (beats - p.lag));
    }
  }

  return { group, panel, light, move };
}
