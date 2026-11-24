/* eslint-disable */

/* The walker's controls: keys on the window (the arrows or W A S D walk and turn, Q and E strafe, Shift runs, T and G look up and
   down), a drag on the world that turns and looks, and the stick on a phone. The keys that start and end a ride are the page's. */
const KEYMAP = {
  ArrowUp: "fwd", KeyW: "fwd", ArrowDown: "back", KeyS: "back", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
  KeyQ: "strafeL", KeyE: "strafeR", ShiftLeft: "run", ShiftRight: "run", KeyT: "lookUp", KeyG: "lookDown",
};

/* A key held with Ctrl, Alt or Meta is a browser shortcut, and keys typed into a field belong to it. */
function forTheWorld(e) {
  if (e.ctrlKey || e.altKey || e.metaKey) return false;
  const t = e.target;
  return !(t instanceof HTMLElement && (t.isContentEditable || t.matches("input, select, textarea")));
}

/* The player's rule (lettersActive in src/components/player/keys.ts): letters act while single-key shortcuts are on (the page mirrors
   the Details switch on <main>), or while the world has focus. */
export function lettersActive(main, e) {
  return main?.dataset.singleKey !== "off" || (e.target instanceof Element && e.target.closest("#world") !== null);
}

/* How far the stick's knob travels from its centre, in px. A push that far or farther, on or off the stick, is a full one. */
export const REACH = 44;
/* How much of the reach, along each of its two lines, a push takes before it walks or turns. */
export const DEAD = 0.25;

/* What a push on the stick does, from the thumb's offset from the stick's centre (dx right, dy down, in px): `walk` forward and
   `turn` to the left, each from -1 to 1, as main.js reads the keys. Each line counts alone, so a push straight up that strays a
   little to the side only walks. Past the dead zone a push eases in, as the square of how far into the rest of the reach it goes:
   the first half of that covers the walk's slow paces, up to a quarter of its speed, and the bears' 2.5 m/s among them. */
export function stickAxes(dx, dy, reach = REACH) {
  const line = (d) => {
    const t = Math.min(1, Math.abs(d) / reach);
    return t <= DEAD ? 0 : Math.sign(d) * ((t - DEAD) / (1 - DEAD)) ** 2;
  };
  return { walk: line(-dy), turn: line(-dx) };
}

export function bindInput(container, walker, userInput) {
  const main = document.querySelector("main");
  const keys = { fwd: false, back: false, left: false, right: false, strafeL: false, strafeR: false, run: false, lookUp: false, lookDown: false };
  /* The stick's walk and turn (stickAxes); both 0 while nothing pushes it. */
  const stick = { walk: 0, turn: 0 };
  const input = { keys, stick };
  let drag = null;
  /* No preventDefault: the page has nothing to scroll, and a TV's D-pad keeps moving focus between the controls. */
  window.addEventListener("keydown", (e) => {
    const k = KEYMAP[e.code];
    if (!k || !forTheWorld(e) || (e.code.startsWith("Key") && !lettersActive(main, e))) return;
    keys[k] = true;
    if (k !== "run") userInput(k);
  });
  window.addEventListener("keyup", (e) => { const k = KEYMAP[e.code]; if (k) keys[k] = false; });
  /* A key released while the window is in the background never sends keyup. */
  window.addEventListener("blur", () => { for (const k in keys) keys[k] = false; });
  /* A drag is the pointer's that started it, so a thumb on the stick never turns the view, and a second finger on the world still
     looks. */
  container.addEventListener("pointerdown", (e) => { drag = { id: e.pointerId, x: e.clientX, y: e.clientY, h: walker.heading, p: walker.pitch }; userInput("drag"); });
  window.addEventListener("pointermove", (e) => { if (drag?.id !== e.pointerId) return; walker.heading = drag.h - (e.clientX - drag.x) * 0.005; walker.pitch = Math.max(-0.8, Math.min(0.8, drag.p - (e.clientY - drag.y) * 0.005)); userInput("drag"); });
  const undrag = (e) => { if (drag?.id === e.pointerId) drag = null; };
  window.addEventListener("pointerup", undrag);
  window.addEventListener("pointercancel", undrag);
  bindStick(document.querySelector("[data-stick]"), stick, userInput);
  return input;
}

/* The stick: a press on it takes the pointer, so the thumb steers from its offset from the stick's centre until it lifts, on the
   stick or off it, and a second finger on the stick does nothing. The knob follows the thumb out to the reach (--x and --y on the
   stick, in px); data-held marks the press, and data-walk and data-turn name what it does, for the page's styles. Each push that
   starts to walk or turn, or reverses either, is one control (userInput), as a key's press is. */
function bindStick(el, stick, userInput) {
  if (!el) return;
  let id = null, cx = 0, cy = 0;
  const name = (v, plus, minus) => (v > 0 ? plus : v < 0 ? minus : undefined);
  const mark = (key, value) => { if (value) el.dataset[key] = value; else delete el.dataset[key]; };
  const push = (dx, dy) => {
    const { walk, turn } = stickAxes(dx, dy);
    if (Math.sign(walk) !== Math.sign(stick.walk) && walk) userInput(walk > 0 ? "fwd" : "back");
    if (Math.sign(turn) !== Math.sign(stick.turn) && turn) userInput(turn > 0 ? "left" : "right");
    stick.walk = walk; stick.turn = turn;
    const k = Math.min(1, REACH / (Math.hypot(dx, dy) || 1));
    el.style.setProperty("--x", `${dx * k}px`); el.style.setProperty("--y", `${dy * k}px`);
    mark("walk", name(walk, "fwd", "back")); mark("turn", name(turn, "left", "right"));
  };
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (id !== null) return;
    id = e.pointerId;
    el.setPointerCapture(id);
    const r = el.getBoundingClientRect();
    cx = r.left + r.width / 2; cy = r.top + r.height / 2;
    el.dataset.held = "";
    push(e.clientX - cx, e.clientY - cy);
  });
  el.addEventListener("pointermove", (e) => { if (e.pointerId === id) push(e.clientX - cx, e.clientY - cy); });
  const lift = (e) => {
    if (e.pointerId !== id) return;
    id = null;
    push(0, 0);
    delete el.dataset.held;
  };
  el.addEventListener("pointerup", lift);
  el.addEventListener("pointercancel", lift);
  el.addEventListener("lostpointercapture", lift);
}
