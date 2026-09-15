import { isRecord, readProperty } from "../validation.ts";

/** The flags `alevel()` counts, in the game's own order. */
const ASCENSION_CHALLENGE_FLAGS: readonly string[] = Object.freeze([
  "no_plasmid",
  "no_trade",
  "no_craft",
  "no_crispr",
  "weak_mastery",
  "nerfed",
  "badgenes",
]);

/**
 * The game's `alevel()`: one plus the challenges taken, capped at five. It lives in the game's
 * achievement module rather than on any state it exposes, but every input is a flag on the race
 * bag, so the captured root answers it exactly.
 */
export function readCapturedAscensionLevel(root: unknown): number | undefined {
  const race = readProperty(root, "race");
  if (!isRecord(race)) return undefined;
  let level = 1;
  for (const flag of ASCENSION_CHALLENGE_FLAGS) {
    if (readProperty(race, flag)) level++;
  }
  return level > 5 ? 5 : level;
}
