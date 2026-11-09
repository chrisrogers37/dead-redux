/* eslint-disable */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { height, STAGE } from "./ground.js";
import { PERSON, seats } from "./seats.js";

/* The crowd on the hill: faceless figures at the band's height, dark like the band's silhouettes, standing on the slope in front of the
   stage (seats.js). One instanced mesh on a Lambert material, so the crowd keeps the island's light and fog and costs one draw call.
   Nothing is printed on anyone. */

/* Dark, nearly grey colours, a little apart in hue, so the figures read as silhouettes and as many people. */
const PALETTE = [0x1d1b22, 0x22201d, 0x1a1f26, 0x26201f, 0x1e2320, 0x2a2420, 0x18181b, 0x241c24];

/* One figure in its own units, standing on y = 0 and facing +z, 1.81 tall: legs LEG tall, a torso, a head and two arms at its sides. The
   legs carry aLeg = 1. */
const LEG = 0.86;
/* A sitter (aSit = 1) folds in the vertex shader: its legs to FOLD of their height, and the rest of it down onto them. */
const FOLD = 0.18;
const SITTING = `if (aSit > 0.5) transformed.y = aLeg > 0.5 ? transformed.y * ${FOLD} : transformed.y - ${(LEG * (1 - FOLD)).toFixed(4)};`;
function figureGeometry() {
  const part = (geo, leg) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.setAttribute("aLeg", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(leg), 1));
    return g;
  };
  return mergeGeometries([
    part(new THREE.CylinderGeometry(0.2, 0.15, LEG, 6, 1, true).translate(0, LEG / 2, 0), 1),
    part(new THREE.CylinderGeometry(0.27, 0.2, 0.62, 6, 1, false).translate(0, 1.17, 0), 0),
    part(new THREE.IcosahedronGeometry(0.15, 0).translate(0, 1.68, 0), 0),
    part(new THREE.BoxGeometry(0.1, 0.62, 0.1).translate(-0.3, 1.13, 0), 0),
    part(new THREE.BoxGeometry(0.1, 0.62, 0.1).translate(0.3, 1.13, 0), 0),
  ]);
}

/* Builds the crowd: at most `count` figures on the first seats, kept clear of the path, the bears' line and a circle round each
   landmark's bounds. It reads those bounds, so it runs before the landmarks merge (landmarks.js) empties them. Each figure faces the
   stage, turned a little, and stands PERSON tall, give or take 8 %. `count` is how many it seated. */
export function buildCrowd(scene, { count, path, line, landmarks }) {
  /* A point every 2 m along `length` metres of the path or the line. */
  const along = (length, at) => Array.from({ length: Math.ceil(length / 2) }, (_, i) => { const p = at(i * 2); return [p.x, p.z]; });
  const box = new THREE.Box3(), mid = new THREE.Vector3();
  const placed = seats({
    path: along(path.curveLength, (d) => path.at(d / path.curveLength)),
    line: along(line.length, (d) => line.at(d)),
    landmarks: landmarks.map((l) => {
      box.setFromObject(l).getCenter(mid);
      return [mid.x, mid.z, Math.hypot(box.max.x - box.min.x, box.max.z - box.min.z) / 2];
    }),
  }).slice(0, count);
  const n = placed.length;
  const geo = figureGeometry();
  geo.computeBoundingBox();
  const scale = PERSON / geo.boundingBox.max.y;
  const mat = new THREE.MeshLambertMaterial({ flatShading: true });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aLeg;\nattribute float aSit;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${SITTING}`);
  };
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const sit = new Float32Array(n);
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  /* The seats come in a random order across the hill, so a figure's place in it picks its turn, its size and its colour. */
  placed.forEach((p, i) => {
    dummy.position.set(p.x, height(p.x, p.z), p.z);
    dummy.rotation.set(0, Math.atan2(STAGE[0] - p.x, STAGE[1] - p.z) + (i % 7 - 3) * 0.08, 0);
    dummy.scale.setScalar(scale * (1 + ((i * 37) % 17 - 8) * 0.01));
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, color.setHex(PALETTE[(i * 5) % PALETTE.length]));
    sit[i] = p.sit ? 1 : 0;
  });
  geo.setAttribute("aSit", new THREE.InstancedBufferAttribute(sit, 1));
  mesh.computeBoundingSphere();
  scene.add(mesh);
  return { mesh, count: n };
}
