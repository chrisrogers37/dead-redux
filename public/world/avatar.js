/* eslint-disable */
import * as THREE from "three";
import { height } from "./island.js";
import { buildBear } from "./bears.js";

/* The visitor's bear: a sixth bear in the site's ink, seen from behind and above. Its legs, bob and lean follow its speed, so it
   lopes while the five walk. The walk's camera hangs on a boom behind its head and eases after it; a landmark between them draws the
   camera in, or raises it over one just behind the bear, and on a phone the view tilts down until the bear's feet clear the
   now-plate. */

/* The five walk at 2.5 m/s, their legs at 6 rad/s; the walk is 12 m/s and the run 1.6 times that. */
const WALK = 2.5, STRIDE = 12, RUN = 19.2;
const UP = new THREE.Vector3(0, 1, 0);

export function buildAvatar(scene, landmarks, { phone, reduced }) {
  const { g, legs } = buildBear(scene, 0xeceae4);
  g.rotation.order = "YXZ";
  /* The head, for the stats and the sound's listener; the top of the head and the ground point under the bear, which the cameras
     keep in the frame. */
  const head = new THREE.Vector3(), top = new THREE.Vector3(), feet = new THREE.Vector3();
  let gait = 0, speed = 0, placed = false;

  /* Stands the bear at a ground point facing `heading` (the walker's: 0 faces -z). Its speed is how far it moved this frame, eased;
     under reduced motion it neither swings its legs, bobs nor leans. */
  function step(x, z, heading, dt) {
    if (!placed) { g.position.set(x, 0, z); placed = true; }
    const v = dt > 0 ? Math.min(RUN, Math.hypot(x - g.position.x, z - g.position.z) / dt) : 0;
    speed += (v - speed) * (1 - Math.exp(-dt / 0.2));
    /* The five's rate at their pace, rising as the square root of speed, so a run still reads as legs at 30 Hz. */
    gait += 6 * Math.sqrt(speed / WALK) * dt;
    const stance = reduced ? 0 : Math.min(1, speed / WALK);
    const swing = (0.5 + 0.2 * Math.min(1, Math.max(0, (speed - STRIDE) / (RUN - STRIDE)))) * stance * Math.sin(gait);
    legs[0].rotation.x = swing; legs[3].rotation.x = swing; legs[1].rotation.x = -swing; legs[2].rotation.x = -swing;
    const y = height(x, z);
    g.position.set(x, y + 0.06 * stance * Math.sin(2 * gait), z);
    g.rotation.set(0.12 * stance * Math.min(1, speed / STRIDE), heading + Math.PI, 0);
    feet.set(x, y, z);
    head.set(x - Math.sin(heading) * 0.8, g.position.y + 3.6, z - Math.cos(heading) * 0.8);
    top.set(head.x, g.position.y + 4.85, head.z);
  }

  /* The boom: R behind the head and 0.35 rad above it, the walker's pitch lowering or raising it, looking 6 m past the head. Desktop and
     TV hang it at 11 m, a phone at 20. */
  const R = phone ? 20 : 11;
  const boxes = landmarks.map((l) => new THREE.Box3().setFromObject(l));
  const pivot = new THREE.Vector3(), cam = new THREE.Vector3(), look = new THREE.Vector3(), want = new THREE.Vector3();
  const dir = new THREE.Vector3(), hit = new THREE.Vector3(), ray = new THREE.Ray();
  /* How much of the boom a landmark leaves the camera: drawn in at once, let out at the ease. How far a landmark too near the head to
     come in front of raises the boom, in rad: raised at once, let down at the ease. */
  let reach = 1, lift = 0;

  /* How far from the head along `dir` the line enters the nearest landmark's box (any box around the head aside), or Infinity. */
  function nearest() {
    ray.set(pivot, dir);
    let s = Infinity;
    for (const b of boxes) if (!b.containsPoint(pivot) && ray.intersectBox(b, hit)) s = Math.min(s, hit.distanceTo(pivot));
    return s;
  }

  /* The walk's camera. Its place and its aim ease after the bear (at once under reduced motion or on a cut), keep 1.2 m above the
     ground at the camera and halfway along the boom, and come 0.5 m in front of a landmark between the camera and the head, but
     never nearer the head than 2.5 m. A landmark that starts within 3 m of the head leaves no room for that, so the boom rises
     instead, 0.05 rad at a time, until the line from the head passes over it. Straight up always does: every landmark stands on the
     ground, so none reaches over a head outside it. Returns the aim. */
  function boom(camera, walker, dt, cut) {
    const k = reduced || cut ? 1 : 1 - Math.exp(-dt / 0.2);
    const fx = -Math.sin(walker.heading), fz = -Math.cos(walker.heading), e = 0.35 - walker.pitch;
    pivot.set(walker.x, height(walker.x, walker.z) + 3.6, walker.z);
    cam.lerp(want.set(pivot.x - fx * R * Math.cos(e), pivot.y + R * Math.sin(e), pivot.z - fz * R * Math.cos(e)), k);
    look.lerp(want.set(pivot.x + fx * 6, pivot.y, pivot.z + fz * 6), k);
    const mx = (pivot.x + cam.x) / 2, mz = (pivot.z + cam.z) / 2;
    cam.y = Math.max(cam.y, height(cam.x, cam.z) + 1.2, 2 * (height(mx, mz) + 1.2) - pivot.y);
    dir.subVectors(cam, pivot);
    const len = dir.length();
    dir.divideScalar(len || 1);
    const h = Math.hypot(dir.x, dir.z), el = Math.atan2(dir.y, h), hx = dir.x / (h || 1), hz = dir.z / (h || 1);
    const raise = (a) => dir.set(hx * Math.cos(a), Math.sin(a), hz * Math.cos(a));
    let need = 0;
    while (el + need < Math.PI / 2 && nearest() < Math.min(3, len)) raise(el + (need += 0.05));
    lift = need > lift ? need : lift + (need - lift) * k;
    raise(Math.max(el, Math.min(Math.PI / 2, el + lift)));
    const s = nearest();
    const room = s < len ? Math.min(1, Math.max(2.5, s - 0.5) / (len || 1)) : 1;
    reach = room < reach ? room : reach + (room - reach) * k;
    camera.position.copy(pivot).addScaledVector(dir, len * reach);
    return look;
  }

  /* Another camera placed the view: the boom eases on from there. */
  function settle(position, aim) {
    cam.copy(position); look.copy(aim); reach = 1; lift = 0;
  }

  const d = new THREE.Vector3(), r = new THREE.Vector3(), u = new THREE.Vector3(), f = new THREE.Vector3();
  /* How far a view from `from` toward `aim` must turn down, at most `cap`, for `point` to stand at `ndcY` of the frame's height (-1 at
     the bottom, 1 at the top) or above it. Never up. */
  function turnDown(camera, from, aim, point, ndcY, cap = 0.3) {
    const dist = d.subVectors(aim, from).length();
    d.divideScalar(dist || 1);
    r.crossVectors(d, UP).normalize();
    u.crossVectors(r, d);
    f.subVectors(point, from);
    const T = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    return Math.max(0, Math.min(cap, Math.atan(ndcY * T) - Math.atan2(f.dot(u), f.dot(d))));
  }
  /* Turns `aim` down about the camera that far. */
  function tilt(camera, aim, point, ndcY) {
    const turn = turnDown(camera, camera.position, aim, point, ndcY), dist = aim.distanceTo(camera.position);
    if (turn > 0) aim.copy(camera.position).addScaledVector(d.multiplyScalar(Math.cos(turn)).addScaledVector(u, -Math.sin(turn)), dist);
  }

  const p = new THREE.Vector3();
  /* For the stats: where the head lands in the frame, as fractions from the top-left, and whether the feet land inside it, above the
     now-plate's top (`plateY`, a fraction from the top) where one is given. */
  function report(camera, plateY) {
    p.copy(feet).project(camera);
    const clear = Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && p.z < 1 && (plateY === null || (1 - p.y) / 2 <= plateY);
    p.copy(head).project(camera);
    const round = (x) => Math.round(x * 1000) / 1000;
    return { clear, screen: [round((p.x + 1) / 2), round((1 - p.y) / 2)] };
  }

  return { g, head, top, feet, step, boom, settle, turnDown, tilt, report };
}
