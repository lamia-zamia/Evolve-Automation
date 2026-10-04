/**
 * The two different questions a caller can ask about the game's keyboard multipliers, kept apart on
 * purpose.
 *
 * **Is a multiplier key physically down right now?** `readCapturedMultiplierKeys` answers from the
 * document-start capture's pressed-key set: whether the key `global.settings.keyMap` currently maps
 * `x10` / `x25` / `x100` to is held at this instant. That is the conservative question a feature can
 * ask before acting on its own — standing down for a moment costs nothing, and a caller with nothing
 * to prove collapses `unknown` to "not held". It is *not* an answer about what the game will do.
 *
 * **What will `keyMultiplier()` multiply by?** `readCapturedMultiplierLatch` answers that instead, and
 * only from the page's own latch: pinned `vars.js:keyMultiplier` reads a module-private `keyMap` of
 * three booleans that `main.js` rewrites from keydown, keyup, and mousemove using the mappings as
 * configured at each event. Those latches are not a function of which keys are down — a mapping
 * changed while its key is still down leaves the latch set — so the two answers must not be collapsed
 * into one. A caller about to mutate through a native multiplier closure has to use the latch answer
 * and fail closed on `unknown`; the pressed-key answer would let it commit ten routes where the game
 * applies ten.
 *
 * `mKeys` is the game's own gate in both, read for truthiness exactly as upstream reads it: with it
 * falsy, `keyMultiplier()` ignores the latches entirely and the keyboard contributes nothing.
 */
import type {
  GameKeyStateReader,
  GameMultiplierLatchName,
  GameMultiplierLatchReader,
} from "../../ports/game-key-state.ts";
import { GAME_MULTIPLIER_LATCH_NAMES } from "../../ports/game-key-state.ts";
import { readProperty, readRecord } from "../validation.ts";

export type CapturedMultiplierKeyAnswer = "none-held" | "one-held" | "unknown";

/**
 * The multiplier mapping the game configures for one latch, as configured right now.
 *
 * A mapping that is neither a string nor a key code cannot equal `e.key || e.keyCode` and is not one
 * of the modifier aliases either, so it is answered as absent rather than as an unmatched value:
 * absent leaves a latch unanswerable, which fails a mutation closed instead of assuming it is clear.
 * This is the one place that rule lives — the page capture compares every event against it, and the
 * pressed-key answer below skips what it would refuse to compare.
 */
export function readCapturedMultiplierMapping(
  root: unknown,
  name: GameMultiplierLatchName,
): string | number | undefined {
  const keyMap = readRecord(
    readProperty(readProperty(root, "settings"), "keyMap"),
  );
  if (keyMap === undefined) return undefined;
  const configured = keyMap[name];
  return typeof configured === "string" || typeof configured === "number"
    ? configured
    : undefined;
}

/**
 * Whether a multiplier key is *physically* down right now, which is what Battle and Mercenary ask
 * before acting: they stand down for a moment rather than prove anything about the game's own latch.
 * `unknown` collapses to "not held" for them, exactly as their previous absent-reader guard did.
 */
export function readCapturedMultiplierKeys(
  root: unknown,
  keyState: GameKeyStateReader | undefined,
): CapturedMultiplierKeyAnswer {
  const settings = readProperty(root, "settings");
  if (!readProperty(settings, "mKeys")) return "none-held";
  if (keyState === undefined) return "unknown";
  if (readRecord(readProperty(settings, "keyMap")) === undefined)
    return "unknown";
  let answer: CapturedMultiplierKeyAnswer = "none-held";
  for (const name of GAME_MULTIPLIER_LATCH_NAMES) {
    const configured = readCapturedMultiplierMapping(root, name);
    if (configured === undefined) continue;
    const pressed = keyState.readPressed(configured);
    if (pressed === true) return "one-held";
    if (pressed === undefined) answer = "unknown";
  }
  return answer;
}

export type CapturedMultiplierLatchAnswer =
  "none-latched" | "one-latched" | "unknown";

/**
 * What the game's private multiplier latch contributes to its next native call.
 *
 * `none-latched` is only ever returned when every latch the game could read is definitively clear, so
 * a caller may treat it as proof that upstream `keyMultiplier()` answers one. `unknown` covers both a
 * capture that cannot answer and a capture that has not yet observed enough of the page to know, and
 * a caller about to mutate must not proceed on it.
 */
export function readCapturedMultiplierLatch(
  root: unknown,
  keyState: GameMultiplierLatchReader | undefined,
): CapturedMultiplierLatchAnswer {
  if (!readProperty(readProperty(root, "settings"), "mKeys"))
    return "none-latched";
  if (keyState === undefined) return "unknown";
  let answer: CapturedMultiplierLatchAnswer = "none-latched";
  for (const name of GAME_MULTIPLIER_LATCH_NAMES) {
    const latched = keyState.readMultiplierLatch(name);
    if (latched === true) return "one-latched";
    if (latched !== false) answer = "unknown";
  }
  return answer;
}
