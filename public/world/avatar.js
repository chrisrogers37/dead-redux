/* eslint-disable */
import * as THREE from "three";
import { height } from "./ground.js";
import { buildBear, stride } from "./bears.js";
import { goRound, HAIR, LEAST, NIL, pressed, rise, standOff } from "./boom.js";

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
/* It gathers that pace over GATHER s and comes to rest over the last LAND s of its way, and within SLACK m of its goal it is there:
   2 cm, which at the boom's length is a pixel and a half of a desktop's frame and less than one of a phone's, so that a camera
   put on its goal from there is not seen to move.
   A goal that moves no more than SLACK m further in a frame than the walk moved the boom has moved with the walk; and once the
   bear stands still, a step that leaves the place no more than SLACK m further from where it will rest than it has been is a
   step toward its rest. And for GRACE s
   after the bear's head leaves a landmark's box the boom takes no notice of that box, as while the head was in it: at a walk the
   bear is by then as far clear of it as the boom rises for (boom.js CLOSE), and the landmark is the camera's to pass, not the
   boom's to clear. */
export const GATHER = 0.4, LAND = 0.08, SLACK = 0.02, GRACE = 0.25;
/* Once the bear stands still and its camera's place steers by where its goal stood before the bear's least pressed it into a
   landmark's room (`chase`), the place cranes for as long as the bear stands: no faster than `crane`, 0.6 boom lengths a
   second (6.6 m/s on a desktop, 12 m/s on a phone), its whole step counted in. And its aim turns no faster than PAN rad/s;
   once the bear moves again, the aim's turn is let go by LOOSEN rad/s each second until it has caught up, so nothing jumps.
   At SWIFT the way round, up the room's side within the bear's least, over and down, 9 m and more, took a quarter of a
   second: the view rose to look down on the bear, small at the landmark's corner, and dropped back, a hop. The crane's pace
   is the slowest that brings every stand that goes round to rest within four seconds: the longest way round, 23 m, takes 3.9
   s (camera.test.ts). */
export const crane = (phone) => 0.6 * boomLength(phone);
export const PAN = 0.6;
const LOOSEN = 6;
/* How many times the place's way out of the bear is halved where the bear has pressed it past its pace (`chase`). */
const PRESSED = 5;
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
  /* Where the boom's end will hang once it has eased, which the bear's stand alone tells, and where it would a frame ago: the
     bear stands still while that does not move, its head neither stepping nor turning nor tilting. Then where the camera will
     come to rest is known too: the boom's end there (`ends`), and where the landmarks and the stage would have the camera with
     the boom there (`rest`), which is where a cut would put it. `closest` is the closest the camera's place has been to that
     since the bear stood still, in m, and `bent` whether the place has since left its goal for its rest; `apart`, the boxes the
     head stands in none of, in one array that is the same every frame; `found`, the rise and the reach `seek` came to. */
  const tip = new THREE.Vector3(), tipWas = new THREE.Vector3(), ends = new THREE.Vector3(), rest = new THREE.Vector3(), restWas = new THREE.Vector3();
  const apart = [], found = new Float64Array(2);
  let closest = Infinity, bent = false;
  /* Where the landmarks and the stage would have the camera this frame (`goal`) and a frame ago, and where the goal stood out of
     every room before the bear's least had its say (`bareGoal`); and its place, which goes there at a pace of its own (`pace`, in
     m/s): it is behind while it is not where the goal was. Where the place stood, and places to step from and to; and where the
     boom's two ends stood a frame ago, the head and the place it hangs to. */
  const goal = new THREE.Vector3(), goalWas = new THREE.Vector3(), bareGoal = new THREE.Vector3(), place = new THREE.Vector3(), stood = new THREE.Vector3(), from = new THREE.Vector3(), to = new THREE.Vector3();
  const hungWas = new THREE.Vector3(), pivotWas = new THREE.Vector3();
  const SWIFT = swift(phone), CRANE = crane(phone);
  let pace = 0;
  /* Whether the place goes at CRANE (`craning`); how fast its aim may turn, in rad/s (`pan`, Infinity where nothing holds it);
     the way the camera looked a frame ago, and this frame's way and aim where the turn is held. */
  let craning = false, pan = Infinity;
  const view = new THREE.Vector3(), turned = new THREE.Vector3(), seen = new THREE.Vector3();
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
    if (d > NIL) { p.x = pivot.x + dx * (LEAST / d); p.z = pivot.z + dz * (LEAST / d); if (dy > 0) p.y = pivot.y + dy * (LEAST / d); }
    else if (dy > 0) p.y = pivot.y + LEAST;
    else p.x = pivot.x + LEAST;
    return true;
  }

  /* Keeps the point `p` FLOOR m over the ground. */
  function floored(p) {
    p.y = Math.max(p.y, height(p.x, p.z) + FLOOR);
  }

  /* Whether the point `p` is more than SLACK m further from where the camera will rest than its place has been since the
     bear stood still. */
  function strays(p) {
    return p.distanceTo(rest) > closest + SLACK;
  }

  /* Brings the boom's end `p` to where it may hang: round a trunk in its way, on the side of where the boom will hang (`slide`),
     FLOOR m over the ground there and halfway along the boom, and under a crown. */
  function hang(p, room) {
    slide(p, room, tip);
    p.y = Math.max(p.y, height(p.x, p.z) + FLOOR, 2 * (height((pivot.x + p.x) / 2, (pivot.z + p.z) / 2) + FLOOR) - pivot.y);
    under(p, room);
  }

  /* Writes to `out` where the landmarks and the stage would have the camera of a boom that hangs at `hangs` and meets the boxes
     `met`: along the boom's line as boom.js `rise` turns it, from the rise `lift` and the reach `reach` of a frame ago at the
     ease `k`, and out of every landmark's room (boom.js standOff). Where a landmark has drawn it in, raised it or put it out of
     its room, it still keeps no nearer the head than the boom's least and over the ground. Nearer the head, it goes straight up
     to the least: a landmark's sides stand upright, so that takes it into no room but one it comes up under, and it is put out
     of that again. Tells whether any landmark or the stage had a say in it; the rise and the reach are in `found`. Where `bare` is
     given, it is written where `out` stood before `clear` put it out from the bear: out of every room. */
  function seek(out, hangs, met, lift, reach, k, room, bare = null) {
    dir.subVectors(hangs, pivot);
    const len = dir.length();
    dir.divideScalar(len || 1);
    const r = rise(pivot, dir, len, met, columns, lift, k);
    lift = r.lift;
    reach = r.room < reach ? r.room : reach + (r.room - reach) * k;
    found[0] = lift; found[1] = reach;
    out.copy(pivot).addScaledVector(dir, len * reach);
    const gx = out.x, gy = out.y, gz = out.z;
    standOff(out, pivot, hangs, boxes, columns, room);
    if (!(reach < 1 || lift > 0 || out.x !== gx || out.y !== gy || out.z !== gz)) { if (bare !== null) bare.copy(out); return false; }
    const dx = out.x - pivot.x, dy = out.y - pivot.y, dz = out.z - pivot.z, short = LEAST * LEAST - dx * dx - dz * dz;
    if (short > dy * dy) { out.y = pivot.y + Math.sqrt(short); standOff(out, pivot, hangs, boxes, columns, room); }
    floored(out);
    if (bare !== null) bare.copy(out);
    clear(out);
    return true;
  }

  /* One frame of the place's way to `aim`, which is its goal or where it will rest. After its goal the place goes as its goal
     went, or with the bear in a frame the goal leapt (`leapt`), and then on toward it; to its rest it goes from where it
     stands. It gathers its pace and lands: no faster in all than SWIFT. What it meets stops it and sends it round (goRound).
     It steers by `steer`: the aim itself, or, where the bear's least has pressed the aim into a landmark's room or the stage's,
     where the aim stood out of every room before that. Then it goes there as round anything else, and the bear presses it in as
     it pressed the aim; and a landmark's room gives way to the bear for the place's own step as it did for the aim (goRound
     `given`), at each of its stops. Steered so, it cranes (`craning`) for as long as the bear stands: from where it stands, not
     as its goal went, and its whole step no longer than CRANE takes it. */
  function chase(aim, steer, leapt, dt, room) {
    stood.copy(place);
    const given = steer === aim ? null : aim;
    if (given !== null) craning = true;
    if (aim === goal && !craning) { if (leapt) place.add(pivot).sub(pivotWas); else place.add(goal).sub(goalWas); }
    const fast = craning ? CRANE : SWIFT, bore = place.distanceTo(stood), togo = place.distanceTo(steer), most = craning ? CRANE * dt : Math.max(SWIFT * dt, bore);
    pace = Math.min(pace + (SWIFT / GATHER) * dt, Math.max(0, fast - bore / dt), togo / LAND);
    place.lerp(steer, Math.min(1, (pace * dt) / (togo || 1)));
    slide(place, room, aim);
    goRound(place, stood, steer, pivot, hung, boxes, columns, room, given);
    /* No nearer the bear than the boom's least: put out from it (`clear`), stopped again at what that would take it into, and
       in all no further this frame than SWIFT takes it; then, where a landmark's room has kept it nearer, on toward the goal,
       which is no nearer, by what SWIFT leaves. */
    from.copy(place);
    if (clear(place)) {
      goRound(place, from, null, pivot, hung, boxes, columns, room, given);
      const gone = place.distanceTo(stood);
      if (gone > most) { place.sub(stood).multiplyScalar(most / gone).add(stood); goRound(place, stood, null, pivot, hung, boxes, columns, room, given); }
      const still = place.distanceTo(steer), spare = most - place.distanceTo(stood);
      /* (Whether it is nearer still, a copy of it tells: `clear` says whether it moved the point.) */
      from.copy(place);
      if (still > 0 && spare > 0 && clear(from)) {
        from.copy(place);
        place.lerp(steer, Math.min(1, spare / still));
        goRound(place, from, null, pivot, hung, boxes, columns, room, given);
      }
    }
    floored(place);
    /* A trunk it slid round, the side of a landmark it was sent along and the ground it rose over have added to its step: in
       all it goes no further than `most`. It steps back along its step to that, is stopped again at what that takes it into,
       and is raised again where the ground between stands higher, which adds a millimetre at the most. */
    const all = place.distanceToSquared(stood);
    if (all > most * most * HAIR) {
      place.sub(stood).multiplyScalar(most / Math.sqrt(all)).add(stood);
      goRound(place, stood, null, pivot, hung, boxes, columns, room, given);
      floored(place);
    }
    /* And whatever a room, the ground or its pace has made of that, it is no nearer the bear than the least (`clear`). Where
       the bear, backing into it, has put it past `most` by that, it goes instead as far as `most` allows of the way from
       where the bear's step alone would put it to there, halving for that PRESSED times: within a thirty-second of that way. */
    if (clear(place) && place.distanceToSquared(stood) > most * most * HAIR) {
      to.copy(place);
      from.copy(stood);
      clear(from);
      let near = 0, far = 1;
      for (let n = 0; n < PRESSED; n++) {
        const t = (near + far) / 2;
        place.copy(from).lerp(to, t);
        clear(place);
        if (place.distanceToSquared(stood) > most * most) far = t; else near = t;
      }
      place.copy(from).lerp(to, near);
      clear(place);
    }
    floored(place);
    /* Within SLACK of where it is going it is there, where that too is within its step: put there after a whole step at the
       pace, it went 1.75 cm past the pace in a frame, turning beside a landmark of 1976-06-26. */
    if (place.distanceToSquared(aim) <= SLACK * SLACK * HAIR && place.distanceTo(aim) <= SLACK && aim.distanceToSquared(stood) <= most * most * HAIR) { place.copy(aim); pace = 0; }
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
     the place goes only nearer to where it will rest, which is where a cut would put it, but round what stands between; it
     comes to its goal and rests there. Under reduced motion, and on a cut, the place is its goal.
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
    cam.lerp(tip.set(pivot.x - fx * R * Math.cos(e), pivot.y + R * Math.sin(e), pivot.z - fz * R * Math.cos(e)), k);
    const room = eyeRoom(camera), stands = tip.equals(tipWas);
    hang(cam, room);
    look.lerp(want.set(pivot.x + fx * 6, pivot.y, pivot.z + fz * 6), k);
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
    /* The boxes the boom meets: all but one the head stands in, or stood in within the last GRACE s. Under reduced motion and on
       a cut there is no such grace: the camera is where it comes to rest. */
    met.length = 0;
    for (let i = 0; i < boxes.length; i++) {
      left[i] = boxes[i].containsPoint(pivot) ? 0 : reduced || cut ? Infinity : left[i] + dt;
      if (left[i] >= GRACE) met.push(boxes[i]);
    }
    const say = seek(goal, hung, met, lift, reach, k, room, bareGoal);
    lift = found[0]; reach = found[1];
    /* Once the bear stands still the boom eases on for a second, and its line sweeps on with it: over a landmark's top or under
       it, past its side, into the way of the next. Each of those is a leap of the goal, and one that the line's coming to rest
       may undo; and a goal that is let out again along its line starts from nearer the head than a place that never came in. A
       place that went after such a goal went in toward the bear and out again, or out and in, with nothing moving but its own
       boom. But where the boom will hang is known by then, and so is where the camera will rest (`rest`). So where a landmark or
       the stage has a say in the goal or in that rest, the place goes after no goal that is more than SLACK m further from its
       rest than the place has been since the bear stood still (`strays`), and takes no step that leaves it so: such a step is
       put back, the place standing for that frame. It is bent on its rest from then on, for as long as the bear stands, and
       goes there, and only what stands between it and there, which it goes round, takes it further from there. Both are
       needed. A goal may bring the place nearer its rest and nearer the bear at once, as a post the line crosses does, and
       only the goal tells; and a goal no further from the rest may lie beyond a landmark that the rest does not, and only the
       step tells. With no landmark in it the camera is the boom's own, as it is on a walk.
       The rule knows one rest. Where the rest moves with the bear still standing, the crowd's figures or the eye's room having
       moved it, how near the place came to the last says nothing of its way to this one, and it starts again: as the crowd goes,
       the place comes down after its goal at CLIMB, and not straight for its new rest at its chase's pace. And it stands aside
       where the bear has pressed the place, or the rest, into a landmark's room (boom.js `pressed`). Its own way to its rest is
       straight, and the bear's least, pressing the place back into the room each frame, can hold it there short of its rest for
       good; the goal's way is the boom's, which swings and rises round the bear as it eases. Held so, the camera stood 0.88 m
       from its rest on a desktop and 0.69 m on a phone after looking up beside a landmark of 1986-07-04.
       Where the bear's least has pressed the goal itself into a room, the bear standing, the place steers by where the goal
       stood out of every room before that (`bareGoal`): it goes there round the landmark as round anything, the bear presses it
       in as it pressed the goal, and a landmark's room gives way to the bear for the place as it did for the goal (`chase`,
       boom.js goRound). Going after the pressed goal itself, the place was stopped at that room's side or top with its goal
       inside, or pressed back in at one spot each frame, and stood short of its rest for good: by up to 7.5 m, at 50 of 60,000
       stands beside boxes of every size round a bear looking up (camera.test.ts). */
    let bound = false;
    if (stands) {
      ends.copy(tip);
      hang(ends, room);
      over(ends);
      apart.length = 0;
      for (let i = 0; i < boxes.length; i++) if (left[i] > 0) apart.push(boxes[i]);
      bound = seek(rest, ends, apart, 0, 1, 1, room) || say;
    }
    if (!rest.equals(restWas)) { closest = Infinity; bent = false; }
    restWas.copy(rest);
    closest = bound ? Math.min(closest, place.distanceTo(rest)) : Infinity;
    const ruled = bound && !pressed(place, pivot, hung, boxes, columns, room) && !pressed(rest, pivot, hung, boxes, columns, room);
    bent = ruled && (bent || strays(goal));
    /* How far the walk itself moved the boom's ends this frame, squared. A goal that moved no further than that, and SLACK, moved
       with the walk; one that moved further leapt. Most frames need no root to tell. */
    const walked = Math.max(hung.distanceToSquared(hungWas), pivot.distanceToSquared(pivotWas)), went = goal.distanceToSquared(goalWas);
    const leapt = went > walked && Math.sqrt(went) > Math.sqrt(walked) + SLACK;
    craning = craning && stands && !reduced && !cut && dt > 0;
    if (reduced || cut || !(dt > 0)) { place.copy(goal); pace = 0; }
    else if (bent) chase(rest, rest, false, dt, room);
    else {
      /* (A place put on its goal has not strayed, since its goal has not: the step put back is one of the chase's.) */
      if (!leapt && place.equals(goalWas)) { place.copy(goal); pace = 0; } else { chase(goal, stands && pressed(goal, pivot, hung, boxes, columns, room) ? bareGoal : goal, leapt, dt, room); if (ruled && strays(place)) { bent = true; place.copy(stood); } }
    }
    goalWas.copy(goal); hungWas.copy(hung); pivotWas.copy(pivot); tipWas.copy(tip);
    camera.position.copy(place);
    /* (Within a millimetre of the boom's own end the camera is on it, and the trees have had their say in that already.) */
    if (camera.position.distanceToSquared(cam) > 1e-6) { slide(camera.position, room); under(camera.position, room); }
    over(camera.position);
    /* The aim, as the place cranes round, turns no faster than PAN; after, its turn is let go by LOOSEN each second until it has
       caught up. Held, it turns from the way the camera looked a frame ago toward the aim's way, in the plane of the two. */
    turned.subVectors(look, camera.position);
    const far = turned.length();
    turned.divideScalar(far || 1);
    pan = reduced || cut || !(dt > 0) ? Infinity : craning ? PAN : pan + LOOSEN * dt;
    const cos = Math.max(-1, Math.min(1, view.dot(turned))), most = pan * dt;
    if (!(Math.acos(cos) > most) || cos < -1 + NIL) { view.copy(turned); if (!craning) pan = Infinity; return look; }
    turned.addScaledVector(view, -cos).normalize();
    view.multiplyScalar(Math.cos(most)).addScaledVector(turned, Math.sin(most)).normalize();
    return seen.copy(camera.position).addScaledVector(view, far);
  }

  /* Another camera placed the view: the boom eases on from there, its place on its goal. */
  function settle(position, aim) {
    cam.copy(position); look.copy(aim); reach = 1; lift = 0; raise[0] = 0;
    place.copy(position); goalWas.copy(position); hungWas.copy(position); pivotWas.set(feet.x, feet.y + HEAD, feet.z); pace = 0;
    closest = Infinity; bent = false; craning = false; pan = Infinity;
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
