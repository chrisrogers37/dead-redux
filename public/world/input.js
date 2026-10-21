/* eslint-disable */

/* The walker's controls: the arrow keys or W A S D on the world, a drag on it, and the pad on a phone; B walks with the bears,
   asking the player to start the show first (nothing once it has). */
const KEYMAP = { ArrowUp: "fwd", KeyW: "fwd", ArrowDown: "back", KeyS: "back", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" };

export function bindInput(container, walker, userInput) {
  const keys = { fwd: false, back: false, left: false, right: false };
  const input = { keys, dragSpeed: 0 };
  let drag = null;
  container.addEventListener("keydown", (e) => { if (e.code === "KeyB") { if (!e.repeat) { document.dispatchEvent(new Event("player:join")); userInput("follow"); } return; } const k = KEYMAP[e.code]; if (!k) return; e.preventDefault(); keys[k] = true; userInput(k); });
  container.addEventListener("keyup", (e) => { const k = KEYMAP[e.code]; if (!k) return; e.preventDefault(); keys[k] = false; });
  container.addEventListener("pointerdown", (e) => { container.focus(); drag = { x: e.clientX, y: e.clientY, h: walker.heading }; userInput("drag"); });
  window.addEventListener("pointermove", (e) => { if (!drag) return; walker.heading = drag.h - (e.clientX - drag.x) * 0.005; input.dragSpeed = Math.max(-1, Math.min(1, -(e.clientY - drag.y) / 80)); userInput("drag"); });
  window.addEventListener("pointerup", () => { drag = null; input.dragSpeed = 0; });
  window.addEventListener("pointercancel", () => { drag = null; input.dragSpeed = 0; });
  for (const b of document.querySelectorAll("[data-pad]")) {
    const k = { up: "fwd", down: "back", left: "left", right: "right" }[b.dataset.pad];
    const on = (e) => { e.preventDefault(); keys[k] = true; userInput(k); };
    const off = () => { keys[k] = false; };
    b.addEventListener("pointerdown", on); b.addEventListener("pointerup", off); b.addEventListener("pointercancel", off); b.addEventListener("pointerleave", off);
  }
  return input;
}
