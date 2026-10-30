// dead-redux #82: the REAL placeLandmarks of the base and of the head, run in plain Node against the REAL three build, and judged by an
// independent oracle (own convex hull by gift wrapping, own point-to-polygon distance, own sampling of the bears' line).
//   env  BENCH_THREE_DIR BENCH_THREE_FILE BENCH_BASE_WORLD BENCH_HEAD_WORLD BENCH_FIXED_DAY BENCH_OPTS (JSON)
//   mode selftest | fixed | sweep | nearest      (one JSON object per line on stdout)
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { installHooks } from "./hooks.mjs";

const E = process.env;
const MODE = process.argv[2];
const OPTS = JSON.parse(E.BENCH_OPTS ?? "{}");
installHooks({ threeDir: E.BENCH_THREE_DIR, threeFile: E.BENCH_THREE_FILE, treeRoots: [E.BENCH_BASE_WORLD, E.BENCH_HEAD_WORLD] });
const THREE = await import(pathToFileURL(join(E.BENCH_THREE_DIR, "build", E.BENCH_THREE_FILE)).href);
const load = async (dir) => {
  const [p, l, g, c] = await Promise.all(["path.js", "landmarks.js", "ground.js", "collide.js"].map((f) => import(pathToFileURL(join(dir, f)).href)));
  return { buildPath: p.buildPath, buildWalkLine: p.buildWalkLine, layout: p.layout, placeLandmarks: p.placeLandmarks, makeBuilders: l.makeBuilders, height: g.height, STAGE: g.STAGE, CAVES: g.CAVES, collide: c };
};
const BASE = await load(E.BENCH_BASE_WORLD), HEAD = await load(E.BENCH_HEAD_WORLD);

// The contract under test, written here and not read from the PR: a landmark keeps 1.75 m from every point of the bears' line, a bear's half-width being 1.5 m.
const CLEAR = 1.75, HALF = 1.5, WITHIN = 20, CAP = CLEAR + 3;
const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
const sha = (s) => createHash("sha256").update(s).digest("hex");

// ------------------------------------------------------------------ the builders, one sample title per rule (first match wins)
const TITLES = ["Tuning", "Playin", "Truckin", "Sugaree", "Ripple", "Eyes", "Scarlet", "Terrapin", "Dark Star", "Morning Dew", "Box Of Rain", "Not Fade Away",
  "One More Saturday Night", "Jack Straw", "Dupree's Diamond Blues", "C C Rider", "Tennessee Jed", "My Brother Esau", "Touch Of Grey", "Cold Rain And Snow",
  "Fire On The Mountain", "Samson And Delilah", "The Wheel", "I Need A Miracle", "Uncle John's Band", "Drums", "Space", "Gimme Some Lovin'",
  "Goin' Down The Road Feeling Bad", "Turn On Your Lovelight", "Blues"];
const STONE_TITLE = "Zzz";
const titleOf = (k) => (k < 0 ? STONE_TITLE : TITLES[k]);
function checkKinds(builders) {
  const B = builders.BUILDERS;
  if (B.length !== TITLES.length) throw new Error(`the builders table has ${B.length} rules, this driver names ${TITLES.length}`);
  TITLES.forEach((t, i) => { const j = B.findIndex(([re]) => re.test(t)); if (j !== i) throw new Error(`title ${t}: rule ${j}, wanted ${i}`); });
  if (B.some(([re]) => re.test(STONE_TITLE))) throw new Error("the stone title matches a rule");
}

// ------------------------------------------------------------------ the oracle's own geometry
const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

/* Points strictly inside the octagon of the set's extremes cannot be hull vertices; the rest are kept. */
function prefilter(P) {
  if (P.length < 64) return P;
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const ext = dirs.map(([a, b]) => { let best = P[0], bv = -Infinity; for (const p of P) { const v = a * p[0] + b * p[1]; if (v > bv) { bv = v; best = p; } } return best; });
  const keep = [];
  for (const p of P) {
    let inside = true;
    for (let i = 0; i < 8 && inside; i++) if (cross(ext[i], ext[(i + 1) % 8], p) <= 0) inside = false;
    if (!inside) keep.push(p);
  }
  return keep.concat(ext);
}

/* The convex hull by gift wrapping (a different algorithm from the PR's monotone chain), counter-clockwise, collinear points dropped. */
function giftWrap(points) {
  const seen = new Set(), P = [];
  for (const p of prefilter(points)) { const k = p[0] + "," + p[1]; if (!seen.has(k)) { seen.add(k); P.push(p); } }
  if (P.length <= 2) return P;
  let start = P[0];
  for (const p of P) if (p[0] < start[0] || (p[0] === start[0] && p[1] < start[1])) start = p;
  const H = [];
  let cur = start;
  do {
    H.push(cur);
    let next = P[0] === cur ? P[1] : P[0];
    for (const q of P) {
      if (q === cur) continue;
      const c = cross(cur, next, q);
      if (c < 0 || (c === 0 && d2(cur, q) > d2(cur, next))) next = q;
    }
    cur = next;
  } while (cur !== start && H.length <= P.length);
  return H;
}

/* Signed distance from (x, z) to a convex counter-clockwise outline: its distance outside, or minus its depth inside. */
function signedDist(H, x, z) {
  const n = H.length;
  if (n === 0) return Infinity;
  let inside = n > 2, best = Infinity;
  for (let i = 0; i < n; i++) {
    const a = H[i], b = H[(i + 1) % n];
    const ex = b[0] - a[0], ez = b[1] - a[1], wx = x - a[0], wz = z - a[1], L2 = ex * ex + ez * ez;
    const t = L2 > 0 ? Math.max(0, Math.min(1, (wx * ex + wz * ez) / L2)) : 0;
    const dx = wx - ex * t, dz = wz - ez * t, d = Math.sqrt(dx * dx + dz * dz);
    if (d < best) best = d;
    if (ex * wz - ez * wx < 0) inside = false;
  }
  return inside ? -best : best;
}

// ------------------------------------------------------------------ the oracle's self-test, and the same checks on planted-wrong implementations
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function boundaryDist(H, x, z) { // brute force, no projection formula: 200 points on each edge, then 200 more around the best one (about 5e-4 m on a 20 m edge)
  let best = Infinity;
  const at = (a, b, t) => Math.hypot(a[0] + (b[0] - a[0]) * t - x, a[1] + (b[1] - a[1]) * t - z);
  for (let i = 0; i < H.length; i++) {
    const a = H[i], b = H[(i + 1) % H.length];
    let bt = 0, bd = Infinity;
    for (let s = 0; s <= 200; s++) { const d = at(a, b, s / 200); if (d < bd) { bd = d; bt = s / 200; } }
    for (let s = 0; s <= 200; s++) { const t = Math.min(1, Math.max(0, bt - 1 / 200 + (2 * s) / 40000)); bd = Math.min(bd, at(a, b, t)); }
    best = Math.min(best, bd);
  }
  return best;
}
function geometryChecks(hullFn, sdFn) {
  const res = [];
  const ok = (name, cond) => res.push([name, !!cond]);
  const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
  const SQ = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const sq = hullFn([[0, 0], [1, 1], [-1, -1], [0.5, -1], [1, -1], [-1, 1], [1, 0.2], [-1, -1]]);
  ok("square: 4 corners kept", sq.length === 4 && SQ.every((c) => sq.some((p) => p[0] === c[0] && p[1] === c[1])));
  const area = (H) => H.reduce((s, p, i) => s + (p[0] * H[(i + 1) % H.length][1] - H[(i + 1) % H.length][0] * p[1]), 0) / 2;
  ok("square: counter-clockwise (area +4)", near(area(sq), 4));
  ok("square: 3,0 is 2 outside", near(sdFn(sq, 3, 0), 2));
  ok("square: 2,2 is sqrt2 outside", near(sdFn(sq, 2, 2), Math.SQRT2));
  ok("square: 0,0 is 1 deep", near(sdFn(sq, 0, 0), -1));
  ok("square: 0.5,-0.2 is 0.5 deep", near(sdFn(sq, 0.5, -0.2), -0.5));
  ok("square: a point on the edge is 0", Math.abs(sdFn(sq, 1, 0.3)) < 1e-12);
  ok("square: past a corner it is the corner distance", near(sdFn(sq, 4, 5), 5));
  const tri = hullFn([[0, 0], [4, 0], [0, 3], [1, 1]]);
  ok("triangle: 3 vertices", tri.length === 3);
  ok("triangle: 2,-1 is 1 below the base", near(sdFn(tri, 2, -1), 1));
  ok("triangle: 5,4 is the distance to the hypotenuse's end (4,0) or its foot", near(sdFn(tri, 5, 4), Math.min(Math.hypot(1, 4), Math.abs(3 * 5 + 4 * 4 - 12) / 5)));
  const col = hullFn([[0, 0], [1, 1], [2, 2], [3, 3]]);
  ok("collinear points leave their two ends", col.length === 2);
  const rng = mulberry(20260428);
  let bad = 0, badSign = 0, notConvex = 0, outsideSet = 0;
  for (let t = 0; t < 120; t++) {
    const n = 3 + Math.floor(rng() * 40), P = Array.from({ length: n }, () => [rng() * 20 - 10, rng() * 20 - 10]);
    const H = hullFn(P);
    if (H.length < 3) continue;
    for (let i = 0; i < H.length; i++) if (cross(H[i], H[(i + 1) % H.length], H[(i + 2) % H.length]) < -1e-12) notConvex++;
    for (const p of P) if (sdFn(H, p[0], p[1]) > 1e-9) outsideSet++;
    for (let q = 0; q < 6; q++) {
      const x = rng() * 30 - 15, z = rng() * 30 - 15, v = sdFn(H, x, z), b = boundaryDist(H, x, z);
      if (Math.abs(Math.abs(v) - b) > 2e-3) bad++;
      const inPoly = H.every((a, i) => cross(a, H[(i + 1) % H.length], [x, z]) >= 0);
      if ((v < 0) !== inPoly && Math.abs(v) > 1e-9) badSign++;
    }
  }
  ok("fuzz: every hull is convex", notConvex === 0);
  ok("fuzz: every input point lies in its hull", outsideSet === 0);
  ok("fuzz: |distance| equals the brute-force boundary distance (720 queries)", bad === 0);
  ok("fuzz: the sign is negative exactly inside (720 queries)", badSign === 0);
  return res;
}
const WRONG = {
  "distance never negative": { hullFn: giftWrap, sdFn: (H, x, z) => Math.abs(signedDist(H, x, z)) },
  "distance to the vertices only": { hullFn: giftWrap, sdFn: (H, x, z) => { let m = Infinity; for (const p of H) m = Math.min(m, Math.hypot(p[0] - x, p[1] - z)); return signedDist(H, x, z) < 0 ? -m : m; } },
  "hull is the sorted input": { hullFn: (P) => P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), sdFn: signedDist },
  "hull drops its last vertex": { hullFn: (P) => giftWrap(P).slice(0, -1), sdFn: signedDist },
  "hull is clockwise": { hullFn: (P) => giftWrap(P).reverse(), sdFn: signedDist },
};
function differentialVsPr(world, trials = 4000) {
  const rng = mulberry(77), bad = { hullSet: 0, outside: 0 };
  for (let t = 0; t < trials; t++) {
    const n = 3 + Math.floor(rng() * 30), P = Array.from({ length: n }, () => [Math.round((rng() * 20 - 10) * 8) / 8, Math.round((rng() * 20 - 10) * 8) / 8]);
    const mine = giftWrap(P), prs = world.collide.hull(P.map((p) => p.slice()));
    const key = (H) => H.map((p) => p[0] + "," + p[1]).sort().join(";");
    if (key(mine) !== key(prs)) bad.hullSet++;
    if (mine.length >= 3) for (let q = 0; q < 3; q++) {
      const x = rng() * 30 - 15, z = rng() * 30 - 15;
      if (Math.abs(world.collide.outside(prs, x, z) - signedDist(mine, x, z)) > 1e-9) bad.outside++;
    }
  }
  return { trials, ...bad };
}

// ------------------------------------------------------------------ footprints, the line, clearances
const _v = new THREE.Vector3();
function footprintOf(g, moving) {
  const spin = new Set(moving.filter((m) => m.kind === "spin").map((m) => m.obj));
  const pts = [], info = { meshes: 0, spinners: 0, nested: 0, nonMesh: 0, children: g.children.length, spinR: 0 };
  g.traverse((o) => {
    if (o === g) return;
    if (o.parent !== g) info.nested++;
    if (!o.isMesh) { info.nonMesh++; return; }
    info.meshes++;
    const pos = o.geometry.attributes.position, e = o.matrixWorld.elements;
    if (spin.has(o)) {
      info.spinners++;
      const cx = e[12], cz = e[14];
      let r = 0;
      for (let i = 0; i < pos.count; i++) { _v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); r = Math.max(r, Math.hypot(_v.x - cx, _v.z - cz)); }
      info.spinR = Math.max(info.spinR, r);
      for (let k = 0; k < 180; k++) pts.push([cx + r * Math.cos((2 * Math.PI * k) / 180), cz + r * Math.sin((2 * Math.PI * k) / 180)]);
    } else for (let i = 0; i < pos.count; i++) { _v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); pts.push([_v.x, _v.z]); }
  });
  return { pts, info };
}
function localFootprint(builders, k) {
  const g = new THREE.Group();
  (k < 0 ? builders.standingStone : builders.BUILDERS[k][1])(g);
  g.updateMatrixWorld(true);
  return footprintOf(g, builders.moving);
}
function worldHull(H0, g) { g.updateMatrixWorld(true); return H0.map(([x, z]) => { _v.set(x, 0, z).applyMatrix4(g.matrixWorld); return [_v.x, _v.z]; }); }
const reachOf = (H, cx, cz) => H.reduce((m, p) => Math.max(m, Math.hypot(p[0] - cx, p[1] - cz)), 0);
/* Two convex outlines overlap unless some edge normal of either separates them (the separating axis test). */
function overlaps(A, B) {
  for (const P of [A, B]) for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], nx = b[1] - a[1], nz = a[0] - b[0];
    let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
    for (const p of A) { const t = p[0] * nx + p[1] * nz; aMin = Math.min(aMin, t); aMax = Math.max(aMax, t); }
    for (const p of B) { const t = p[0] * nx + p[1] * nz; bMin = Math.min(bMin, t); bMax = Math.max(bMax, t); }
    if (aMax <= bMin || bMax <= aMin) return false;
  }
  return true;
}
/* The distance between two convex outlines, 0 when they overlap. */
function gap(A, B) {
  if (overlaps(A, B)) return 0;
  let d = Infinity;
  for (const p of A) d = Math.min(d, Math.abs(signedDist(B, p[0], p[1])));
  for (const p of B) d = Math.min(d, Math.abs(signedDist(A, p[0], p[1])));
  return d;
}

function sampleLine(line, step) {
  const xs = [], zs = [];
  for (let i = 0; i * step < line.length; i++) { const p = line.at(i * step); xs.push(p.x); zs.push(p.z); }
  const S = { xs: Float64Array.from(xs), zs: Float64Array.from(zs), n: xs.length, cell: 8, cells: new Map() };
  for (let i = 0; i < S.n; i++) { const key = Math.floor(S.xs[i] / S.cell) * 100003 + Math.floor(S.zs[i] / S.cell); (S.cells.get(key) ?? S.cells.set(key, []).get(key)).push(i); }
  return S;
}
function nearIdx(S, cx, cz, R) {
  const r = [], x0 = Math.floor((cx - R) / S.cell), x1 = Math.floor((cx + R) / S.cell), z0 = Math.floor((cz - R) / S.cell), z1 = Math.floor((cz + R) / S.cell);
  for (let a = x0; a <= x1; a++) for (let b = z0; b <= z1; b++) { const l = S.cells.get(a * 100003 + b); if (l) for (const i of l) if (Math.hypot(S.xs[i] - cx, S.zs[i] - cz) <= R) r.push(i); }
  return r;
}
/* The least signed distance from the samples within reach to the outline, capped at CAP when nothing is near. */
function clearance(H, S, cx, cz, reach) {
  let best = CAP;
  for (const i of nearIdx(S, cx, cz, reach + CAP)) { const v = signedDist(H, S.xs[i], S.zs[i]); if (v < best) best = v; }
  return best;
}

// ------------------------------------------------------------------ one build of the world, once per process
const CTX = (() => {
  const pathB = BASE.buildPath(), pathH = HEAD.buildPath(), lineH = HEAD.buildWalkLine(pathH, 7), lineB = BASE.buildWalkLine(pathB, 7);
  let same = 0, total = 0;
  for (let d = 0; d < lineH.length; d += 0.25) { const a = lineH.at(d), b = lineB.at(d); total++; if (Object.is(a.x, b.x) && Object.is(a.z, b.z) && Object.is(a.y, b.y)) same++; }
  return { pathB, pathH, lineH, S25: sampleLine(lineH, 0.25), S02: sampleLine(lineH, 0.02), lineSame: { same, total, lengthEqual: Object.is(lineH.length, lineB.length) } };
})();

const hashGeo = (o) => createHash("sha1").update(Buffer.from(o.geometry.attributes.position.array.buffer, o.geometry.attributes.position.array.byteOffset, o.geometry.attributes.position.array.byteLength)).digest("hex");
function sameShape(a, b) { // the landmark itself, apart from where it stands
  if (a.children.length !== b.children.length) return false;
  if (![0, 1, 2].every((i) => Object.is(a.rotation.toArray()[i], b.rotation.toArray()[i])) || !a.scale.equals(b.scale)) return false;
  for (let i = 0; i < a.children.length; i++) {
    const p = a.children[i], q = b.children[i];
    if (p.type !== q.type || p.matrix.elements.some((v, j) => !Object.is(v, q.matrix.elements[j]))) return false;
    if (p.isMesh && (hashGeo(p) !== hashGeo(q) || p.material.color?.getHex() !== q.material.color?.getHex() || p.material.emissive?.getHex() !== q.material.emissive?.getHex())) return false;
  }
  return true;
}
function place(world, path, line, phone, titles, us) {
  const scene = new THREE.Scene(), builders = world.makeBuilders(phone);
  const c0 = process.cpuUsage(), t0 = performance.now();
  const groups = world.placeLandmarks(scene, path, titles.map((title) => ({ title })), true, builders, us, line);
  const cpu = process.cpuUsage(c0);
  return { scene, builders, groups, ms: performance.now() - t0, cpuMs: (cpu.user + cpu.system) / 1000 };
}
function judge(H0, reach0, gb, gh, u) {
  const bx = gb.position.x, bz = gb.position.z, hx = gh.position.x, hz = gh.position.z;
  const moved = !(Object.is(bx, hx) && Object.is(bz, hz));
  const Hb = worldHull(H0, gb), Hh = worldHull(H0, gh);
  const r = {
    u, moved, bx, bz, hx, hz, hy: gh.position.y, by: gb.position.y, disp: Math.hypot(hx - bx, hz - bz), ang: (Math.atan2(hz - bz, hx - bx) * 180) / Math.PI,
    base25: clearance(Hb, CTX.S25, bx, bz, reach0), base02: clearance(Hb, CTX.S02, bx, bz, reach0),
    head25: clearance(Hh, CTX.S25, hx, hz, reach0), head02: clearance(Hh, CTX.S02, hx, hz, reach0),
    radB: Math.hypot(bx, bz), radH: Math.hypot(hx, hz), stageB: Math.hypot(bx - HEAD.STAGE[0], bz - HEAD.STAGE[1]), stageH: Math.hypot(hx - HEAD.STAGE[0], hz - HEAD.STAGE[1]),
    caveB: Math.min(...HEAD.CAVES.map(([cx, cz]) => Math.hypot(bx - cx, bz - cz))), caveH: Math.min(...HEAD.CAVES.map(([cx, cz]) => Math.hypot(hx - cx, hz - cz))),
    shape: sameShape(gb, gh), yRule: Object.is(gh.position.y, HEAD.height(hx, hz)),
    stillIdentical: moved ? null : Object.is(gb.position.y, gh.position.y),
  };
  return r;
}

// ------------------------------------------------------------------ modes
async function main() {
  if (MODE === "selftest") {
    const rows = [];
    const real = geometryChecks(giftWrap, signedDist);
    for (const [name, pass] of real) rows.push({ impl: "oracle", name, pass });
    out({ phase: "geometry", failed: real.filter(([, p]) => !p).map(([n]) => n), total: real.length });
    for (const [label, impl] of Object.entries(WRONG)) {
      const r = geometryChecks(impl.hullFn, impl.sdFn), caught = r.filter(([, p]) => !p).map(([n]) => n);
      out({ phase: "planted-wrong oracle", label, caught: caught.length, firstCaught: caught[0] ?? null });
    }
    out({ phase: "kinds", ...(() => { checkKinds(HEAD.makeBuilders(false)); checkKinds(HEAD.makeBuilders(true)); checkKinds(BASE.makeBuilders(false)); return { ok: true, rules: TITLES.length }; })() });
    out({ phase: "differential of the PR's hull and outside against the oracle", head: differentialVsPr(HEAD) });
    out({ phase: "line", ...CTX.lineSame, samples25: CTX.S25.n, samples02: CTX.S02.n, pathLength: CTX.pathH.curveLength, lineLength: CTX.lineH.length });
    return;
  }

  if (MODE === "sweep") {
    const { tier, kinds, stride = 1, offset = 0 } = OPTS, phone = tier === "phone";
    checkKinds(HEAD.makeBuilders(phone));
    const L = CTX.pathH.curveLength, us = [];
    if (OPTS.n) for (let i = 0; i < OPTS.n; i++) us.push(i / OPTS.n); // n points round the loop, evenly in u
    else for (let s = offset; s < L; s += stride) us.push(s / L);
    for (const k of kinds) {
      const ref = localFootprint(HEAD.makeBuilders(phone), k), H0 = giftWrap(ref.pts), reach0 = reachOf(H0, 0, 0), refBase = giftWrap(localFootprint(BASE.makeBuilders(phone), k).pts);
      const S = { n: 0, moved: 0, baseViol: 0, baseHit: 0, baseInside: 0, movedButClear: 0, stayViol: 0, headShort25: 0, headShort02: 0, hardHit: 0, shapeBad: 0, yBad: 0, stillBad: 0, consistBad: 0,
        maxDisp: 0, maxShort25: 0, maxShort02: 0, minHead25: Infinity, minHead02: Infinity, sumDisp: 0, msBase: 0, msHead: 0, ex: [],
        cpuBase: 0, cpuHead: 0, maxRadB: 0, maxRadH: 0, minStageB: Infinity, minStageH: Infinity, minCaveB: Infinity, minCaveH: Infinity, minHy: Infinity, minBy: Infinity };
      const digest = createHash("sha256");
      for (let c0 = 0; c0 < us.length; c0 += 100) {
        const chunk = us.slice(c0, c0 + 100), titles = chunk.map(() => titleOf(k));
        const B = place(BASE, CTX.pathB, CTX.lineH, phone, titles, chunk), H = place(HEAD, CTX.pathH, CTX.lineH, phone, titles, chunk);
        S.msBase += B.ms; S.msHead += H.ms; S.cpuBase += B.cpuMs; S.cpuHead += H.cpuMs;
        for (let j = 0; j < chunk.length; j++) {
          const gb = B.groups[j], gh = H.groups[j];
          if (c0 === 0 && j === 0) { // the placed group's own footprint must equal the cached one, moved by the group's matrix
            gh.updateMatrixWorld(true); gb.updateMatrixWorld(true); // the groups' world matrices, which the footprint reads, are made before it is taken
            const direct = giftWrap(footprintOf(gh, H.builders.moving).pts), cached = worldHull(H0, gh);
            const key = (A) => A.map((p) => p[0].toFixed(7) + "," + p[1].toFixed(7)).sort().join(";");
            if (key(direct) !== key(cached)) S.consistBad++;
            if (key(giftWrap(footprintOf(gb, B.builders.moving).pts)) !== key(worldHull(H0, gb)) && key(refBase) === key(H0)) S.consistBad++;
          }
          const r = judge(H0, reach0, gb, gh, chunk[j]);
          S.n++;
          if (r.moved) { S.moved++; S.sumDisp += r.disp; S.maxDisp = Math.max(S.maxDisp, r.disp); }
          if (r.base25 < CLEAR) S.baseViol++;
          if (r.base02 < HALF) S.baseHit++;
          if (r.base02 < 0) S.baseInside++;
          if (r.moved && r.base25 >= CLEAR) S.movedButClear++;
          if (!r.moved && r.base25 < CLEAR) { S.stayViol++; if (S.ex.length < 6) S.ex.push({ kind: k, tier, u: r.u, why: "stays and violates", base25: r.base25, head25: r.head25 }); }
          const s25 = CLEAR - r.head25, s02 = CLEAR - r.head02;
          if (s25 > 1e-6) S.headShort25++;
          if (s02 > 1e-6) S.headShort02++;
          S.maxShort25 = Math.max(S.maxShort25, s25); S.maxShort02 = Math.max(S.maxShort02, s02);
          if (r.head02 < HALF) { S.hardHit++; if (S.ex.length < 6) S.ex.push({ kind: k, tier, u: r.u, why: "a bear's body reaches it", head02: r.head02 }); }
          S.minHead25 = Math.min(S.minHead25, r.head25); S.minHead02 = Math.min(S.minHead02, r.head02);
          S.maxRadB = Math.max(S.maxRadB, r.radB); S.maxRadH = Math.max(S.maxRadH, r.radH); S.minStageB = Math.min(S.minStageB, r.stageB); S.minStageH = Math.min(S.minStageH, r.stageH);
          S.minCaveB = Math.min(S.minCaveB, r.caveB); S.minCaveH = Math.min(S.minCaveH, r.caveH); S.minHy = Math.min(S.minHy, r.hy); S.minBy = Math.min(S.minBy, r.by);
          if (!r.shape) S.shapeBad++;
          if (!r.yRule) S.yBad++;
          if (r.stillIdentical === false) S.stillBad++;
          digest.update(`${k}|${tier}|${r.u.toFixed(12)}|${r.hx.toFixed(9)}|${r.hy.toFixed(9)}|${r.hz.toFixed(9)}\n`);
        }
      }
      out({ slice: { tier, kind: k, title: titleOf(k), stride, offset }, footprint: { hullVertices: H0.length, reach: reach0, ...ref.info, headHullEqualsBaseHull: giftWrap(ref.pts).length === refBase.length }, ...S,
        minHead25: Number.isFinite(S.minHead25) ? S.minHead25 : null, minHead02: Number.isFinite(S.minHead02) ? S.minHead02 : null, meanDisp: S.moved ? S.sumDisp / S.moved : 0, digest: digest.digest("hex") });
    }
    return;
  }

  if (MODE === "fixed") {
    const day = JSON.parse(readFileSync(E.BENCH_FIXED_DAY, "utf8")), titles = day.tracks.map((t) => t.title);
    const uH = HEAD.layout(day.tracks, day.set2Start, CTX.pathH), uB = BASE.layout(day.tracks, day.set2Start, CTX.pathB);
    const layoutEqual = uH.length === uB.length && uH.every((v, i) => Object.is(v, uB[i]));
    const digest = createHash("sha256");
    for (const tier of ["desktop", "phone"]) {
      const phone = tier === "phone", B = place(BASE, CTX.pathB, CTX.lineH, phone, titles, uB), H = place(HEAD, CTX.pathH, CTX.lineH, phone, titles, uH);
      const rows = [], hB = [], hH = [];
      for (let i = 0; i < titles.length; i++) {
        const k = HEAD.makeBuilders(phone).BUILDERS.findIndex(([re]) => re.test(titles[i]));
        const ref = localFootprint(HEAD.makeBuilders(phone), k), H0 = giftWrap(ref.pts), r = judge(H0, reachOf(H0, 0, 0), B.groups[i], H.groups[i], uH[i]);
        hB.push(worldHull(H0, B.groups[i])); hH.push(worldHull(H0, H.groups[i]));
        let nearD = Infinity, nearAt = 0;
        for (let q = 0; q < CTX.S25.n; q++) { const dd = Math.hypot(CTX.S25.xs[q] - r.bx, CTX.S25.zs[q] - r.bz); if (dd < nearD) { nearD = dd; nearAt = q * 0.25; } }
        rows.push({ i, title: titles[i], kind: k, u: r.u, moved: r.moved, disp: r.disp, ang: r.ang, dy: r.hy - r.by, base25: r.base25, base02: r.base02, head25: r.head25, head02: r.head02, shape: r.shape, yRule: r.yRule, lineToCentre: nearD, lineAtD: nearAt, spinR: ref.info.spinR });
        digest.update(`${tier}|${i}|${r.hx.toFixed(9)}|${r.hy.toFixed(9)}|${r.hz.toFixed(9)}\n`);
      }
      // landmark against landmark: pairs that overlap or come near, before and after
      const pairs = [];
      for (let i = 0; i < hB.length; i++) for (let j = i + 1; j < hB.length; j++) {
        const gb = gap(hB[i], hB[j]), gh = gap(hH[i], hH[j]);
        if (gb < 3 || gh < 3) pairs.push({ i, j, a: titles[i], b: titles[j], gapBase: gb, gapHead: gh, overlapBase: gb === 0, overlapHead: gh === 0 });
      }
      // the scene as a whole: the same objects in the same order, and every unmoved landmark's world matrix bit for bit
      B.scene.updateMatrixWorld(true); H.scene.updateMatrixWorld(true);
      const sameCount = B.scene.children.length === H.scene.children.length;
      const unmovedEqual = rows.filter((r) => !r.moved).every((r) => B.groups[r.i].matrixWorld.elements.every((v, j) => Object.is(v, H.groups[r.i].matrixWorld.elements[j])));
      // timing of the whole call, 25 repeats each, interleaved
      const tb = [], th = [], cb = [], ch = [];
      for (let rep = 0; rep < 25; rep++) {
        const b = place(BASE, CTX.pathB, CTX.lineH, phone, titles, uB), h = place(HEAD, CTX.pathH, CTX.lineH, phone, titles, uH);
        tb.push(b.ms); th.push(h.ms); cb.push(b.cpuMs); ch.push(h.cpuMs);
      }
      const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
      out({ fixed: { tier, layoutEqual, sameCount, unmovedEqual, movedCount: rows.filter((r) => r.moved).length, msBaseMedian: med(tb), msHeadMedian: med(th), msBaseMax: Math.max(...tb), msHeadMax: Math.max(...th),
        cpuBaseMedian: med(cb), cpuHeadMedian: med(ch), cpuBaseMax: Math.max(...cb), cpuHeadMax: Math.max(...ch), pairs, rows } });
    }
    out({ digest: digest.digest("hex") });
    return;
  }

  if (MODE === "nearest") {
    const { tier, kinds, stride = 2, offset = 0, perKind = 4, dirs = 288, ring = 0.05 } = OPTS, phone = tier === "phone";
    const L = CTX.pathH.curveLength, us = [];
    for (let s = offset; s < L; s += stride) us.push(s / L);
    for (const k of kinds) {
      const H0 = giftWrap(localFootprint(HEAD.makeBuilders(phone), k).pts), reach0 = reachOf(H0, 0, 0), movedList = [];
      for (let c0 = 0; c0 < us.length; c0 += 100) {
        const chunk = us.slice(c0, c0 + 100), titles = chunk.map(() => titleOf(k)), B = place(BASE, CTX.pathB, CTX.lineH, phone, titles, chunk), H = place(HEAD, CTX.pathH, CTX.lineH, phone, titles, chunk);
        for (let j = 0; j < chunk.length; j++) if (!(Object.is(B.groups[j].position.x, H.groups[j].position.x) && Object.is(B.groups[j].position.z, H.groups[j].position.z))) movedList.push({ u: chunk[j], gb: B.groups[j], gh: H.groups[j] });
      }
      const pick = movedList.length <= perKind ? movedList : Array.from({ length: perKind }, (_, i) => movedList[Math.floor(((i + 0.5) * movedList.length) / perKind)]);
      const rows = [];
      for (const m of pick) {
        const bx = m.gb.position.x, bz = m.gb.position.z, Hb = worldHull(H0, m.gb), disp = Math.hypot(m.gh.position.x - bx, m.gh.position.z - bz);
        const idx = nearIdx(CTX.S25, bx, bz, reach0 + CLEAR + WITHIN + 1).sort((a, b) => Math.hypot(CTX.S25.xs[a] - bx, CTX.S25.zs[a] - bz) - Math.hypot(CTX.S25.xs[b] - bx, CTX.S25.zs[b] - bz));
        const clear = (ox, oz) => { for (const i of idx) if (signedDist(Hb, CTX.S25.xs[i] - ox, CTX.S25.zs[i] - oz) < CLEAR) return false; return true; };
        let found = null;
        for (let r = ring; r <= WITHIN + 1e-9 && !found; r += ring) for (let q = 0; q < dirs; q++) { const th = ((q + 0.3) * 2 * Math.PI) / dirs; if (clear(r * Math.cos(th), r * Math.sin(th))) { found = { r, deg: (th * 180) / Math.PI }; break; } }
        rows.push({ u: m.u, disp, trueNearest: found ? found.r : null, trueDeg: found ? found.deg : null, overshoot: found ? disp - found.r : null, prDeg: (Math.atan2(m.gh.position.z - bz, m.gh.position.x - bx) * 180) / Math.PI });
      }
      out({ nearest: { tier, kind: k, title: titleOf(k), movedPlacements: movedList.length, sampled: rows.length, dirs, ring, rows } });
    }
    return;
  }
  if (MODE === "timing") { // CPU time of one placeLandmarks call with ONE landmark, base and head, n positions spread evenly round the loop (the build of the landmark is in both)
    const { tier, kinds, n = 40 } = OPTS, phone = tier === "phone";
    const us = Array.from({ length: n }, (_, i) => (i + 0.5) / n);
    const stats = (a) => { const s = a.slice().sort((x, y) => x - y); return { p50: s[Math.floor(s.length * 0.5)], p95: s[Math.floor(s.length * 0.95)], max: s[s.length - 1], mean: s.reduce((x, y) => x + y, 0) / s.length }; };
    for (const k of kinds) {
      const cb = [], ch = [], disp = [];
      for (const u of us) {
        const B = place(BASE, CTX.pathB, CTX.lineH, phone, [titleOf(k)], [u]), H = place(HEAD, CTX.pathH, CTX.lineH, phone, [titleOf(k)], [u]);
        cb.push(B.cpuMs); ch.push(H.cpuMs);
        disp.push(Math.hypot(H.groups[0].position.x - B.groups[0].position.x, H.groups[0].position.z - B.groups[0].position.z));
      }
      out({ timing: { tier, kind: k, title: titleOf(k), n, base: stats(cb), head: stats(ch), movedFraction: disp.filter((d) => d > 0).length / n, maxDisp: Math.max(...disp) } });
    }
    return;
  }

  if (MODE === "pins") { // the places the layout pins songs to (path.js layout): they recur in every show, so every kind is placed on each of them
    const { tier } = OPTS, phone = tier === "phone", P = CTX.pathH;
    const pins = [["trailhead", 0], ["summit (point 6)", P.pointU(6)], ["left cave (13)", P.pointU(13)], ["right cave (14)", P.pointU(14)]];
    for (let k = -1; k < TITLES.length; k++) {
      const H0 = giftWrap(localFootprint(HEAD.makeBuilders(phone), k).pts), reach0 = reachOf(H0, 0, 0), us = pins.map(([, u]) => u), titles = us.map(() => titleOf(k));
      const B = place(BASE, CTX.pathB, CTX.lineH, phone, titles, us), H = place(HEAD, CTX.pathH, CTX.lineH, phone, titles, us);
      const rows = pins.map(([pin], j) => { const r = judge(H0, reach0, B.groups[j], H.groups[j], us[j]); return { pin, moved: r.moved, disp: r.disp, base25: r.base25, base02: r.base02, head25: r.head25, head02: r.head02 }; });
      out({ pins: { tier, kind: k, title: titleOf(k), rows } });
    }
    return;
  }
  throw new Error("unknown mode " + MODE);
}
await main();
