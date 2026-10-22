/* eslint-disable */

/* The walker's controls: keys on the window (the arrows or W A S D walk and turn, Q and E strafe, Shift runs, T and G look up and
   down, B walks with the bears), a drag on the world that turns and looks, and the pad on a phone. */
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

export function bindInput(container, walker, userInput) {
  const main = document.querySelector("main");
  /* The player's rule: letters act while single-key shortcuts are on (the page mirrors the Details switch on <main>), or while the world has focus. */
  const lettersActive = (e) => main?.dataset.singleKey !== "off" || (e.target instanceof Element && e.target.closest("#world") !== null);
  const keys = { fwd: false, back: false, left: false, right: false, strafeL: false, strafeR: false, run: false, lookUp: false, lookDown: false };
  const input = { keys };
  let drag = null;
  /* No preventDefault: the page has nothing to scroll, and a TV's D-pad keeps moving focus between the controls. */
  window.addEventListener("keydown", (e) => {
    /* B asks the player to start the show first (nothing once it has), then toggles walking with the bears. */
    if (e.code === "KeyB" && !e.repeat && forTheWorld(e) && lettersActive(e)) { document.dispatchEvent(new Event("player:join")); userInput("follow"); return; }
    const k = KEYMAP[e.code];
    if (!k || !forTheWorld(e) || (e.code.startsWith("Key") && !lettersActive(e))) return;
    keys[k] = true;
    if (k !== "run") userInput(k);
  });
  window.addEventListener("keyup", (e) => { const k = KEYMAP[e.code]; if (k) keys[k] = false; });
  /* A key released while the window is in the background never sends keyup. */
  window.addEventListener("blur", () => { for (const k in keys) keys[k] = false; });
  /* In lean-back the world takes no controls, so a drag there starts nothing and leaving it keeps the view it had. */
  container.addEventListener("pointerdown", (e) => { if (main?.dataset.mode === "leanback") return; drag = { x: e.clientX, y: e.clientY, h: walker.heading, p: walker.pitch }; userInput("drag"); });
  window.addEventListener("pointermove", (e) => { if (!drag) return; walker.heading = drag.h - (e.clientX - drag.x) * 0.005; walker.pitch = Math.max(-0.8, Math.min(0.8, drag.p - (e.clientY - drag.y) * 0.005)); userInput("drag"); });
  window.addEventListener("pointerup", () => { drag = null; });
  window.addEventListener("pointercancel", () => { drag = null; });
  for (const b of document.querySelectorAll("[data-pad]")) {
    const k = { up: "fwd", down: "back", left: "left", right: "right" }[b.dataset.pad];
    const on = (e) => { e.preventDefault(); keys[k] = true; userInput(k); };
    const off = () => { keys[k] = false; };
    b.addEventListener("pointerdown", on); b.addEventListener("pointerup", off); b.addEventListener("pointercancel", off); b.addEventListener("pointerleave", off);
  }
  return input;
}
