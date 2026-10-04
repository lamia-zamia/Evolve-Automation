/**
 * Whether the game currently counts a keyboard multiplier key, as a three-valued answer.
 *
 * Pinned `vars.js:keyMultiplier` multiplies by 10, 25, and 100 for whichever of three mappings the
 * page reports as held, and `main.js:keydown` decides "held" by comparing the event's `key` or its
 * `keyCode` strictly against `global.settings.keyMap[k]`. The mappings are player-configurable
 * strings or numbers, so the comparison is made against the captured value as configured rather
 * than against an assumed set of modifier names. `mKeys` is the game's own gate and is read for
 * truthiness, as upstream reads it.
 *
 * A caller that only needs to stand down when a multiplier is certainly held collapses `unknown` to
 * false. A caller about to mutate through a native multiplier closure must fail closed on it: the
 * capture answers `undefined` when the page never delivered a key state, which proves nothing.
 */
import type { GameKeyStateReader } from "../../ports/game-key-state.ts";
import { isRecord, readProperty } from "../validation.ts";

/** The three mappings `keyMultiplier` reads; `q` is a queue modifier and never multiplies. */
const MULTIPLIER_KEY_MAPPINGS: readonly string[] = Object.freeze([
  "x10",
  "x25",
  "x100",
]);

export type CapturedMultiplierKeyAnswer = "none-held" | "one-held" | "unknown";

export function readCapturedMultiplierKeys(
  root: unknown,
  keyState: GameKeyStateReader | undefined,
): CapturedMultiplierKeyAnswer {
  const settings = readProperty(root, "settings");
  if (!readProperty(settings, "mKeys")) return "none-held";
  if (keyState === undefined) return "unknown";
  const keyMap = readProperty(settings, "keyMap");
  if (!isRecord(keyMap)) return "unknown";
  let answer: CapturedMultiplierKeyAnswer = "none-held";
  for (const mapping of MULTIPLIER_KEY_MAPPINGS) {
    const configured = keyMap[mapping];
    // The event key is always a string or a key code, so no other configured value can match it.
    if (typeof configured !== "string" && typeof configured !== "number")
      continue;
    const pressed = keyState.readPressed(configured);
    if (pressed === true) return "one-held";
    if (pressed === undefined) answer = "unknown";
  }
  return answer;
}
