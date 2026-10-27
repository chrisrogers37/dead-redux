/** sessionStorage key of what a page hands the next one it loads. Its presence starts the show on arrival. */
const CARRY_STORAGE = "dead-redux:carry";

/** What carries over a page load: lean-back, and a sleep timer still running. */
export interface Carry {
  leanback: boolean;
  /** When the sleep timer ends, in ms since the epoch, or null while it is off. */
  sleepEndsAt: number | null;
}

/** Hands the carry to the next page. */
export function writeCarry(carry: Carry): void {
  try {
    sessionStorage.setItem(CARRY_STORAGE, JSON.stringify(carry));
  } catch {
    // storage unavailable: the next page starts quiet
  }
}

/** The carry the page before left, or null. */
export function readCarry(): Carry | null {
  let value: unknown;
  try {
    value = JSON.parse(sessionStorage.getItem(CARRY_STORAGE) ?? "null");
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { leanback, sleepEndsAt } = value as Record<string, unknown>;
  return { leanback: leanback === true, sleepEndsAt: typeof sleepEndsAt === "number" ? sleepEndsAt : null };
}

/** Forgets the carry, once it is applied. */
export function clearCarry(): void {
  try {
    sessionStorage.removeItem(CARRY_STORAGE);
  } catch {
    // nothing to clear
  }
}
