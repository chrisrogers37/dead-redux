/* eslint-disable */
import * as THREE from "three";
import { height } from "./ground.js";
import { buildBear, stride } from "./bears.js";
import { goRound, HAIR, LEAST, rise, standOff } from "./boom.js";

/* The visitor's bear: a sixth bear in the site's ink, seen from behind and above. Its legs, bob and lean follow its speed, so it
   lopes while the five walk. The walk's camera hangs on a boom behind its head and eases after it; a landmark between them draws the
   camera in, or raises it over one just behind the bear, and the camera goes there at a pace of its own, round the landmark or
   over it, so that the view never cuts; among the trees it slides round a trunk and dips under a crown, its boom as long as ever;
   and on a phone the view tilts down until the bear's feet clear the now-plate. */

/* The five walk at 2.5 m/s, their legs at 6 rad/s; the walk is 12 m/s and the run 1.6 times that. */
const WALK = 2.5, STRIDE = 12, RUN = 19.2;
/* The walk's camera climbs over the crowd, and comes down after it, at CLIMB m/s at most, looking AHEAD s along its way, LOOKS times. */
const CLIMB = 3, AHEAD = 2.2, LOOKS = 22;
/* How high a bear's head stands over its feet: the visitor's head point and the boom's pivot stand there. And the top of its head. */
export const HEAD = 3.6, TOP = 4.85;
/* How long the walk's camera's boom is: a desktop and a TV hang it at 11 m, a phone at 20. */
export const boomLength = (phone) => (phone ? 20 : 11);
/* How fast the camera's place goes to where a landmark or the stage would have it, in m/s, the walk's own moving of it counted
   in: three boom lengths a second at the most, which is 0.55 m in a sixtieth of a second on a desktop and 1 m on a phone. */
export const swift = (phone) => 3 * boomLength(phone);
/* It gathers that pace over GATHER s and comes to rest over the last LAND s of its way, and within SLACK m of its goal it is there.
   A goal that moves no more than SLACK m further in a frame than the walk moved the boom has moved with the walk. And for GRACE s
   after the bear's head leaves a landmark's box the boom takes no notice of that box, as while the head was in it: at a walk the
   bear is by then as far clear of it as the boom rises for (boom.js CLOSE), and the landmark is the camera's to pass, not the
   boom's to clear. */
export const GATHER = 0.4, LAND = 0.08, SLACK = 0.02, GRACE = 0.25;
/* How far over the ground the camera's place keeps, and the middle of its boom. */
const FLOOR = 1.2;
const UP = new THREE.Vector3(0, 1, 0);

/* How far the corners of a camera's near plane stand from it, and a hand more: what the camera keeps this far from, that plane cuts
   nowhere, whichever way the camera looks. */
export const eyeRoom = (camera) => {
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  return camera.near * Math.hypot(1, t, t * camera.aspect) + 0.1;
};

/* The box the walk's camera keeps out of for a landmark: the box of all its parts, or, where its builder gives one (landmarks.js),
   that box cut down to `userData.keepOutTop` m over the landmark's own ground. What such a landmark has higher is open, as a
   handrail is: it is no part of what the boom meets, so the camera does at that landmark what it would without it. */
const origin = new THREE.Vector3();
export function keepOutBox(landmark) {
  const box = new THREE.Box3().setFromObject(landmark), top = landmark.userData.keepOutTop;
  if (top !== undefined) box.max.y = Math.min(box.max.y, origin.setFromMatrixPosition(landmark.matrixWorld).y + top);
  return box;
}

export function buildAvatar(scene, landmarks, { phone, reduced, columns = [], over = () => {}, ahead = (point, way) => { way[6] = 0; way[7] = 0; }, slide = () => {}, ceiling = () => Infinity }) {
  const bear = buildBear(scene, 0xeceae4), { g, legs, color } = bear;
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
    const drop = stride(bear, swing);
    const y = height(x, z);
    g.position.set(x, y + 0.06 * stance * Math.sin(2 * gait), z);
    g.rotation.set(0.12 * stance * Math.min(1, speed / STRIDE), heading + Math.PI, 0);
    feet.set(x, y, z);
    /* The head and the top of it come down with the stride, as the body does. */
    head.set(x - Math.sin(heading) * 0.8, g.position.y - drop + HEAD, z - Math.cos(heading) * 0.8);
    top.set(head.x, g.position.y - drop + TOP, head.z);
  }

  /* The boom: R behind the head and 0.35 rad above it, the walker's pitch lowering or raising it, looking 6 m past the head. */
  const R = boomLength(phone);
  /* Each landmark stands for its box (keepOutBox); a column (collide.js) for a solid that a walk keeps out of but whose box would
     reach past it, as the stage's does, turned on its shelf. */
  const boxes = landmarks.map(keepOutBox);
  const pivot = new THREE.Vector3(), cam = new THREE.Vector3(), look = new THREE.Vector3(), want = new THREE.Vector3();
  const dir = new THREE.Vector3();
  /* How much of the boom a landmark leaves the camera's goal: drawn in at once, let out at the ease. How far a landmark too near the
     head to come in front of raises the boom, in rad: raised at once, let down at the ease. How far the crowd raises the camera over its
     figures, in m (raise[0]), and the camera's way for `ahead`, in arrays so that a frame boxes no number. */
  let reach = 1, lift = 0;
  const raise = new Float64Array(1), way = Float64Array.of(0, 0, 0, AHEAD, LOOKS, CLIMB, 0, 0);
  const hung = new THREE.Vector3(), was = new THREE.Vector3();
  /* Where the landmarks and the stage would have the camera this frame (`goal`) and a frame ago, and its place, which goes there
     at a pace of its own (`pace`, in m/s): it is behind while it is not where the goal was. Where the place stood, and places
     to step from and to; and where the boom's two ends stood a frame ago, the head and the place it hangs to. */
  const goal = new THREE.Vector3(), goalWas = new THREE.Vector3(), place = new THREE.Vector3(), stood = new THREE.Vector3(), from = new THREE.Vector3(), to = new THREE.Vector3();
  const hungWas = new THREE.Vector3(), pivotWas = new THREE.Vector3();
  const SWIFT = swift(phone);
  let pace = 0;
  /* How long ago the head last stood in each box, in s, and the boxes the boom meets this frame, in one array that is the same
     every frame. */
  const left = new Float32Array(boxes.length).fill(Infinity), met = [];

  /* Brings the point `p` down under the crowns' ceiling there (trees.js), but never to within the boom's least of the head, which
     stands at `pivot`: a crown hangs further than that over the head of a bear that stands under it. */
  function under(p, room) {
    const top = ceiling(p.x, p.y, p.z, room), near = LEAST * LEAST - (p.x - pivot.x) ** 2 - (p.z - pivot.z) ** 2;
    if (p.y > top) p.y = near > 0 ? Math.max(top, Math.min(p.y, pivot.y + Math.sqrt(near))) : top;
  }

  /* Puts the point `p` out from the bear to the boom's least, where it is nearer, and tells whether it did: straight out from the
     head's point where it is higher than that, and level out from the bear's own line where it is lower, since the bear stands
     under its head and a point sent straight out from the head would go down under it and into the bear. The last word on the
     camera's goal and on its place, whatever stands there. So where a landmark's room and the bear leave the camera less than
     the least between them, it is the room that gives, by what the bear takes; the room is the eye's margin round the landmark,
     not the landmark. */
  function clear(p) {
    const dx = p.x - pivot.x, dy = p.y - pivot.y, dz = p.z - pivot.z, dd = dx * dx + dz * dz + (dy > 0 ? dy * dy : 0);
    if (dd >= LEAST * LEAST * HAIR) return false;
    const d = Math.sqrt(dd);
    if (d >= LEAST) return false;
    if (d > 1e-9) { p.x = pivot.x + dx * (LEAST / d); p.z = pivot.z + dz * (LEAST / d); if (dy > 0) p.y = pivot.y + dy * (LEAST / d); }
    else if (dy > 0) p.y = pivot.y + LEAST;
    else p.x = pivot.x + LEAST;
    return true;
  }

  /* The walk's camera. Its place and its aim ease after the bear (at once under reduced motion or on a cut), keep 1.2 m above the
     ground at the camera and halfway along the boom, and keep clear of the landmarks: in front of one between the camera and the
     head, never nearer the head than 2.5 m, the boom rising for one that starts within 3 m of the head (boom.js). Over the crowd it
     stands as high as `over` asks, out of the figures (crowd.js): it climbs toward the height it will need along its way, at CLIMB, so
     it is there before it reaches them, and comes down at CLIMB only as far as the most it will need along that way, so it holds its
     height over the crowd; and where it would stand lower than `over` asks, it rises at once.
     That is where it hangs, so the landmarks' test takes the boom's line from there, and `over` holds again where a landmark draws it
     in along that line.
     Where a landmark or the stage's column would have the camera is its goal, and the goal can leap: a landmark comes into the
     boom's way, or the bear's head leaves one. The camera's place does not. It stands on its goal while the goal moves with the
     walk; when the goal leaps it goes after it, its whole step in a frame no longer than SWIFT allows, and what stands between
     sends it round (boom.js goRound), so the view swings or rises where it used to cut. Meanwhile the landmark may stand between
     the camera and the bear. Its goal is out of every landmark's room (boom.js standOff) and over the ground; and neither goal
     nor place is nearer the bear than the boom's least, whatever else would have it there (`clear`). Once the bear stands still
     the place comes to its goal and rests there. Under reduced motion, and on a cut, the place is its goal.
     Among the trees (trees.js) the boom keeps its length. As it eases, the camera's place slides level round a trunk in its way
     (`slide`) and comes down under a crown (`ceiling`), never under what the ground asks, since a crown's ceiling stands over that;
     and the same holds again where a landmark or the crowd has moved the camera from that place. A place that is going after its
     goal goes round a trunk in its way itself, on the goal's side of it: slid out of the trunk afresh each frame instead, the
     camera would jump from one side of the trunk to the other as its place crossed the trunk's middle. A crown still brings the
     camera down from its place, a metre for each metre nearer, so under a crown's edge the camera goes up to 1.41 times as fast as
     its place. The aim is as it would be with no tree there. Returns the aim. */
  function boom(camera, walker, dt, cut) {
    const k = reduced || cut ? 1 : 1 - Math.exp(-dt / 0.2);
    const fx = -Math.sin(walker.heading), fz = -Math.cos(walker.heading), e = 0.35 - walker.pitch;
    pivot.set(walker.x, height(walker.x, walker.z) + HEAD, walker.z);
    was.copy(cam);
    cam.lerp(want.set(pivot.x - fx * R * Math.cos(e), pivot.y + R * Math.sin(e), pivot.z - fz * R * Math.cos(e)), k);
    const room = eyeRoom(camera);
    slide(cam, room, want);
    look.lerp(want.set(pivot.x + fx * 6, pivot.y, pivot.z + fz * 6), k);
    const mx = (pivot.x + cam.x) / 2, mz = (pivot.z + cam.z) / 2;
    cam.y = Math.max(cam.y, height(cam.x, cam.z) + FLOOR, 2 * (height(mx, mz) + FLOOR) - pivot.y);
    under(cam, room);
    hung.copy(cam);
    over(hung);
    const need = hung.y - cam.y;
    if (reduced || cut || !(dt > 0)) raise[0] = need;
    else {
      /* It climbs toward the most it will need along its way, at its pace out to AHEAD s, less what CLIMB covers by then, and comes
         down toward the most it will need along that way (crowd.js); between the two it holds. */
      way[0] = (cam.x - was.x) / dt; way[1] = (cam.y - was.y) / dt; way[2] = (cam.z - was.z) / dt;
      ahead(cam, way);
      const up = Math.max(need, way[6]), hold = Math.max(up, way[7]), to = raise[0] < up ? up : Math.min(raise[0], hold);
      raise[0] = Math.max(need, Math.min(raise[0] + CLIMB * dt, Math.max(raise[0] - CLIMB * dt, to)));
    }
    hung.y = cam.y + raise[0];
    dir.subVectors(hung, pivot);
    const len = dir.length();
    dir.divideScalar(len || 1);
    /* The boxes the boom meets: all but one the head stands in, or stood in within the last GRACE s. Under reduced motion and on
       a cut there is no such grace: the camera is where it comes to rest. */
    met.length = 0;
    for (let i = 0; i < boxes.length; i++) {
      left[i] = boxes[i].containsPoint(pivot) ? 0 : reduced || cut ? Infinity : left[i] + dt;
      if (left[i] >= GRACE) met.push(boxes[i]);
    }
    const r = rise(pivot, dir, len, met, columns, lift, k);
    lift = r.lift;
    reach = r.room < reach ? r.room : reach + (r.room - reach) * k;
    goal.copy(pivot).addScaledVector(dir, len * reach);
    const gx = goal.x, gy = goal.y, gz = goal.z;
    standOff(goal, pivot, hung, boxes, columns, room);
    /* Where a landmark has drawn it in, raised it or put it out of its room, it still keeps no nearer the head than the boom's
       least and over the ground. Nearer the head, it goes straight up to the least: a landmark's sides stand upright, so that
       takes it into no room but one it comes up under, and it is put out of that again. */
    if (reach < 1 || lift > 0 || goal.x !== gx || goal.y !== gy || goal.z !== gz) {
      const dx = goal.x - pivot.x, dy = goal.y - pivot.y, dz = goal.z - pivot.z, short = LEAST * LEAST - dx * dx - dz * dz;
      if (short > dy * dy) { goal.y = pivot.y + Math.sqrt(short); standOff(goal, pivot, hung, boxes, columns, room); }
      goal.y = Math.max(goal.y, height(goal.x, goal.z) + FLOOR);
      clear(goal);
    }
    /* How far the walk itself moved the boom's ends this frame, squared. A goal that moved no further than that, and SLACK, moved
       with the walk; one that moved further leapt. Most frames need no root to tell. */
    const walked = Math.max(hung.distanceToSquared(hungWas), pivot.distanceToSquared(pivotWas)), went = goal.distanceToSquared(goalWas);
    const leapt = went > walked && Math.sqrt(went) > Math.sqrt(walked) + SLACK;
    if (reduced || cut || !(dt > 0) || (!leapt && place.equals(goalWas))) { place.copy(goal); pace = 0; }
    else {
      /* The place goes as its goal went, or with the bear in a frame the goal leapt, and then on toward the goal, gathering its
         pace and landing: no faster in all than SWIFT. What it meets stops it and sends it round (goRound). */
      stood.copy(place);
      if (leapt) place.add(pivot).sub(pivotWas); else place.add(goal).sub(goalWas);
      const bore = place.distanceTo(stood), togo = place.distanceTo(goal), most = Math.max(SWIFT * dt, bore);
      pace = Math.min(pace + (SWIFT / GATHER) * dt, Math.max(0, SWIFT - bore / dt), togo / LAND);
      place.lerp(goal, Math.min(1, (pace * dt) / (togo || 1)));
      slide(place, room, goal);
      goRound(place, stood, goal, pivot, hung, boxes, columns, room);
      /* No nearer the bear than the boom's least: put out from it (`clear`), stopped again at what that would take it into, and
         in all no further this frame than SWIFT takes it; then, where a landmark's room has kept it nearer, on toward the goal,
         which is no nearer, by what SWIFT leaves. */
      from.copy(place);
      if (clear(place)) {
        goRound(place, from, null, pivot, hung, boxes, columns, room);
        const gone = place.distanceTo(stood);
        if (gone > most) { place.sub(stood).multiplyScalar(most / gone).add(stood); goRound(place, stood, null, pivot, hung, boxes, columns, room); }
        const still = place.distanceTo(goal), spare = most - place.distanceTo(stood);
        /* (Whether it is nearer still, a copy of it tells: `clear` says whether it moved the point.) */
        from.copy(place);
        if (still > 0 && spare > 0 && clear(from)) {
          from.copy(place);
          place.lerp(goal, Math.min(1, spare / still));
          goRound(place, from, null, pivot, hung, boxes, columns, room);
        }
      }
      place.y = Math.max(place.y, height(place.x, place.z) + FLOOR);
      /* A trunk it slid round, the side of a landmark it was sent along and the ground it rose over have added to its step: in
         all it goes no further than `most`. It steps back along its step to that, is stopped again at what that takes it into,
         and is raised again where the ground between stands higher, which adds a millimetre at the most. */
      const all = place.distanceToSquared(stood);
      if (all > most * most * HAIR) {
        place.sub(stood).multiplyScalar(most / Math.sqrt(all)).add(stood);
        goRound(place, stood, null, pivot, hung, boxes, columns, room);
        place.y = Math.max(place.y, height(place.x, place.z) + FLOOR);
      }
      /* And whatever a room, the ground or its pace has made of that, it is no nearer the bear than the least (`clear`). Where
         the bear, backing into it, has put it past `most` by that, it goes instead as far as `most` allows of the way from
         where the bear's step alone would put it to there, halving for that five times: within a thirtieth of that way. */
      if (clear(place) && place.distanceToSquared(stood) > most * most * HAIR) {
        to.copy(place);
        from.copy(stood);
        clear(from);
        let near = 0, far = 1;
        for (let n = 0; n < 5; n++) {
          const t = (near + far) / 2;
          place.copy(from).lerp(to, t);
          clear(place);
          if (place.distanceToSquared(stood) > most * most) far = t; else near = t;
        }
        place.copy(from).lerp(to, near);
        clear(place);
      }
      place.y = Math.max(place.y, height(place.x, place.z) + FLOOR);
      if (place.distanceToSquared(goal) <= SLACK * SLACK * HAIR && place.distanceTo(goal) <= SLACK) { place.copy(goal); pace = 0; }
    }
    goalWas.copy(goal); hungWas.copy(hung); pivotWas.copy(pivot);
    camera.position.copy(place);
    if (camera.position.distanceToSquared(cam) > 1e-6) { slide(camera.position, room); under(camera.position, room); }
    over(camera.position);
    return look;
  }

  /* Another camera placed the view: the boom eases on from there, its place on its goal. */
  function settle(position, aim) {
    cam.copy(position); look.copy(aim); reach = 1; lift = 0; raise[0] = 0;
    place.copy(position); goalWas.copy(position); hungWas.copy(position); pivotWas.set(feet.x, feet.y + HEAD, feet.z); pace = 0;
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

  return { g, legs, color, head, top, feet, step, boom, settle, turnDown, tilt, report };
}
