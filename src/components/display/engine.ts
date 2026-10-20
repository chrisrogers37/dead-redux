import type { Rgb } from "./schedule";

export interface DisplayParams {
  c0: Rgb; c1: Rgb; c2: Rgb; c3: Rgb;
  energy: number; alpha: number; shape: number; reveal: number; reg: number; rotate: number; boil: number;
  dropX: number; dropY: number; dropAge: number;
}
export interface DisplayOptions {
  seed: number; disc: boolean; internalWidth: number; fps: number; still: boolean;
  update: (t: number, p: DisplayParams) => void;
}
export function defaultParams(): DisplayParams {
  return {
    c0: [0.95, 0.64, 0.23], c1: [0.2, 0.77, 0.86], c2: [0.55, 0.29, 0.72], c3: [0.11, 0.1, 0.2],
    energy: 0.5, alpha: 0, shape: 0, reveal: 1, reg: 2, rotate: 0, boil: 0, dropX: 0.5, dropY: 0.5, dropAge: 99,
  };
}
const VERT = `attribute vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;
const FRAG = `
precision mediump float;
uniform vec2 uRes;
uniform float uTime, uSeed, uEnergy, uAlpha, uShape, uReveal, uReg, uRot, uBoil;
uniform vec3 uC0, uC1, uC2, uC3, uDrop;
float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
float field(vec2 p, float t, float w, out vec2 q, out vec2 r) {
  q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - vec2(0.7 * t, 0.0)));
  r = vec2(fbm(p + w * q + vec2(1.7, 9.2) + 0.15 * t), fbm(p + w * q + vec2(8.3, 2.8) - 0.12 * t));
  return fbm(p + w * r);
}
/* Three separations, each inking its own band of the field: orange the middle tones, the second ink the upper tones, cream the peaks. */
float inkA(float v) { return smoothstep(0.30, 0.48, v) * (1.0 - smoothstep(0.62, 0.80, v)); }
float inkB(float v) { return smoothstep(0.54, 0.72, v); }
float inkC(float v) { return 0.8 * smoothstep(0.80, 0.94, v); }
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 c = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
  float cs = cos(uRot); float sn = sin(uRot);
  vec2 p = vec2(cs * c.x - sn * c.y, sn * c.x + cs * c.y) * 1.6;
  float t = uTime * 0.04 + uSeed;
  float w = 1.2 + 1.4 * uEnergy;
  vec2 q; vec2 r;
  float v = field(p, t, w, q, r);
  float d = distance(uv, uDrop.xy);
  float rr = (d - 0.06 * uDrop.z) * 22.0;
  float ring = exp(-rr * rr) * exp(-uDrop.z * 0.4);
  v += 0.5 * ring;
  vec3 col = mix(uC0, uC1, clamp(v * 1.5 - 0.1, 0.0, 1.0));
  col = mix(col, uC2, clamp(length(q), 0.0, 1.0) * 0.6);
  col = mix(col, uC3, clamp(r.x * r.x, 0.0, 1.0) * 0.5);
  float a = smoothstep(0.25, 0.85, v);
  if (uReg > 0.0) {
    vec2 off = vec2(uReg / uRes.x, 0.4 * uReg / uRes.y) * 1.6;
    vec2 q0; vec2 r0; vec2 q1; vec2 r1;
    float v0 = field(p - off, t, w, q0, r0) + 0.5 * ring;
    float v1 = field(p + off, t, w, q1, r1) + 0.5 * ring;
    /* The inks print opaque, one over another in order, as a screen print does, so the misregistered edges show the ink beneath. */
    float k0 = inkA(v0); float k1 = inkB(v1); float k2 = inkC(v);
    col = mix(mix(mix(uC3, uC0, k0), uC1, k1), uC2, k2);
    a = max(max(k0, k1), k2);
  }
  if (uBoil > 0.5 && uEnergy > 0.6) {
    float b = noise(p * 18.0 + vec2(0.0, -uTime * 0.6) + uSeed);
    float bub = smoothstep(0.80, 0.86, b) * (uEnergy - 0.6) / 0.4;
    col += bub * 0.6; a = max(a, bub);
  }
  float rad = length(c);
  float shape = 1.0;
  if (uShape > 1.5) shape = 1.0 - smoothstep(0.38, 0.5, rad);
  else if (uShape > 0.5) shape = 1.0 - smoothstep(0.485, 0.5, rad);
  shape *= 1.0 - smoothstep(uReveal, uReveal + 0.07, rad);
  gl_FragColor = vec4(col, a * uAlpha * shape);
}`;
type Stop = () => void;
export function startDisplay(canvas: HTMLCanvasElement, options: DisplayOptions): Stop {
  const params = defaultParams();
  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false, antialias: false, preserveDrawingBuffer: false, powerPreference: "low-power" });
  if (gl) { const stop = startWebGL(canvas, gl, options, params); if (stop) return stop; }
  const ctx = canvas.getContext("2d");
  if (ctx) return startCanvas2D(canvas, ctx, options, params);
  canvas.dataset.renderer = "none";
  return () => {};
}
function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type); if (!sh) return null;
  gl.shaderSource(sh, src); gl.compileShader(sh);
  return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
}
function startWebGL(canvas: HTMLCanvasElement, gl: WebGLRenderingContext, options: DisplayOptions, params: DisplayParams): Stop | null {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT); const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG); const prog = gl.createProgram();
  if (!vs || !fs || !prog) return null;
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, "aPos"); gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const u = (n: string) => gl.getUniformLocation(prog, n);
  const U = { res: u("uRes"), time: u("uTime"), seed: u("uSeed"), energy: u("uEnergy"), alpha: u("uAlpha"), shape: u("uShape"), reveal: u("uReveal"), reg: u("uReg"), rot: u("uRot"), boil: u("uBoil"), c0: u("uC0"), c1: u("uC1"), c2: u("uC2"), c3: u("uC3"), drop: u("uDrop") };
  canvas.dataset.renderer = "webgl";
  let lost = false;
  const onLost = (e: Event) => { e.preventDefault(); lost = true; };
  const onRestored = () => { lost = false; };
  canvas.addEventListener("webglcontextlost", onLost); canvas.addEventListener("webglcontextrestored", onRestored);
  const resize = () => {
    const w = Math.max(1, canvas.clientWidth); const h = Math.max(1, canvas.clientHeight);
    canvas.width = options.internalWidth;
    canvas.height = options.disc ? options.internalWidth : Math.max(1, Math.round((options.internalWidth * h) / w));
    gl.viewport(0, 0, canvas.width, canvas.height);
    // A resize clears the canvas, so the still frame is drawn again.
    if (options.still) requestAnimationFrame(() => draw(600));
  };
  resize(); const ro = new ResizeObserver(resize); ro.observe(canvas);
  const draw = (t: number) => {
    if (lost) return;
    options.update(t, params);
    gl.uniform2f(U.res, canvas.width, canvas.height); gl.uniform1f(U.time, t); gl.uniform1f(U.seed, options.seed);
    gl.uniform1f(U.energy, params.energy); gl.uniform1f(U.alpha, params.alpha); gl.uniform1f(U.shape, params.shape);
    gl.uniform1f(U.reveal, params.reveal); gl.uniform1f(U.reg, params.reg); gl.uniform1f(U.rot, params.rotate); gl.uniform1f(U.boil, params.boil);
    gl.uniform3f(U.c0, params.c0[0], params.c0[1], params.c0[2]); gl.uniform3f(U.c1, params.c1[0], params.c1[1], params.c1[2]);
    gl.uniform3f(U.c2, params.c2[0], params.c2[1], params.c2[2]); gl.uniform3f(U.c3, params.c3[0], params.c3[1], params.c3[2]);
    gl.uniform3f(U.drop, params.dropX, params.dropY, params.dropAge);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  return runLoop(options, draw, () => { ro.disconnect(); canvas.removeEventListener("webglcontextlost", onLost); canvas.removeEventListener("webglcontextrestored", onRestored); });
}
/* The field in plain TypeScript for a runner without WebGL: a single pass (the print offsets are not drawn here). */
function hash2(x: number, y: number): number {
  let px = (x * 0.1031) % 1, py = (y * 0.1031) % 1, pz = (x * 0.1031) % 1;
  if (px < 0) px += 1; if (py < 0) py += 1; if (pz < 0) pz += 1;
  const d = px * (py + 33.33) + py * (pz + 33.33) + pz * (px + 33.33);
  px += d; py += d; pz += d;
  const r = ((px + py) * pz) % 1; return r < 0 ? r + 1 : r;
}
function noise2(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y); const fx = x - ix, fy = y - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10); const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbm2(x: number, y: number): number {
  let v = 0, a = 0.5;
  for (let i = 0; i < 3; i++) { v += a * noise2(x, y); const nx = x * 2.03 + 1.7, ny = y * 2.03 + 9.2; x = nx; y = ny; a *= 0.5; }
  return v;
}
function smooth(e0: number, e1: number, x: number): number { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }
function startCanvas2D(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, options: DisplayOptions, params: DisplayParams): Stop {
  canvas.dataset.renderer = "canvas2d";
  const small = document.createElement("canvas"); const sw = options.disc ? 72 : 96; const sh = options.disc ? 72 : 54;
  small.width = sw; small.height = sh;
  const sctx = small.getContext("2d"); if (!sctx) return () => {};
  const img = sctx.createImageData(sw, sh);
  const resize = () => {
    canvas.width = Math.max(1, Math.round(canvas.clientWidth / 2)); canvas.height = Math.max(1, Math.round(canvas.clientHeight / 2));
    // A resize clears the canvas, so the still frame is drawn again.
    if (options.still) requestAnimationFrame(() => draw(600));
  };
  resize(); const ro = new ResizeObserver(resize); ro.observe(canvas);
  const draw = (t: number) => {
    options.update(t, params);
    const time = t * 0.04 + options.seed; const w = 1.2 + 1.4 * params.energy;
    const cs = Math.cos(params.rotate), sn = Math.sin(params.rotate); const data = img.data; let k = 0;
    for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) {
      const cx = (i + 0.5 - sw / 2) / Math.min(sw, sh); const cy = (sh / 2 - (j + 0.5)) / Math.min(sw, sh);
      const px = (cs * cx - sn * cy) * 1.6, py = (sn * cx + cs * cy) * 1.6;
      const qx = fbm2(px, py + time), qy = fbm2(px + 5.2 - 0.7 * time, py + 1.3);
      const rx = fbm2(px + w * qx + 1.7 + 0.15 * time, py + w * qy + 9.2); const ry = fbm2(px + w * qx + 8.3, py + w * qy + 2.8 - 0.12 * time);
      let v = fbm2(px + w * rx, py + w * ry);
      const ux = (i + 0.5) / sw, uy = 1 - (j + 0.5) / sh;
      const dd = Math.hypot(ux - params.dropX, uy - params.dropY);
      v += 0.5 * Math.exp(-Math.pow((dd - 0.06 * params.dropAge) * 22, 2)) * Math.exp(-params.dropAge * 0.4);
      const m1 = Math.max(0, Math.min(1, v * 1.5 - 0.1)); const m2 = Math.min(1, Math.hypot(qx, qy)) * 0.6; const m3 = Math.min(1, rx * rx) * 0.5;
      let r = params.c0[0] + (params.c1[0] - params.c0[0]) * m1, g = params.c0[1] + (params.c1[1] - params.c0[1]) * m1, b = params.c0[2] + (params.c1[2] - params.c0[2]) * m1;
      r += (params.c2[0] - r) * m2; g += (params.c2[1] - g) * m2; b += (params.c2[2] - b) * m2;
      r += (params.c3[0] - r) * m3; g += (params.c3[1] - g) * m3; b += (params.c3[2] - b) * m3;
      const sv = Math.max(0, Math.min(1, (v - 0.25) / 0.6)); let a = sv * sv * (3 - 2 * sv);
      const rad = Math.hypot(cx, cy); let shape = 1;
      if (params.shape > 1.5) shape = 1 - smooth(0.38, 0.5, rad); else if (params.shape > 0.5) shape = 1 - smooth(0.485, 0.5, rad);
      shape *= 1 - smooth(params.reveal, params.reveal + 0.07, rad);
      a *= params.alpha * shape;
      data[k++] = Math.round(255 * Math.min(1, r)); data[k++] = Math.round(255 * Math.min(1, g)); data[k++] = Math.round(255 * Math.min(1, b)); data[k++] = Math.round(255 * Math.max(0, Math.min(1, a)));
    }
    sctx.putImageData(img, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.imageSmoothingEnabled = true; ctx.drawImage(small, 0, 0, canvas.width, canvas.height);
  };
  return runLoop({ ...options, fps: Math.min(options.fps, 12) }, draw, () => ro.disconnect());
}
function runLoop(options: DisplayOptions, draw: (t: number) => void, cleanup: () => void): Stop {
  if (options.still) { draw(600); return cleanup; }
  let raf = 0, last = 0, elapsed = 0, lastNow = performance.now(); const interval = 1000 / options.fps;
  const frame = (now: number) => { raf = requestAnimationFrame(frame); elapsed += (now - lastNow) / 1000; lastNow = now; if (now - last < interval) return; last = now; draw(elapsed); };
  const onVisibility = () => { if (document.visibilityState === "hidden") { cancelAnimationFrame(raf); raf = 0; } else if (!raf) { lastNow = performance.now(); raf = requestAnimationFrame(frame); } };
  document.addEventListener("visibilitychange", onVisibility);
  raf = requestAnimationFrame(frame);
  return () => { cancelAnimationFrame(raf); document.removeEventListener("visibilitychange", onVisibility); cleanup(); };
}
