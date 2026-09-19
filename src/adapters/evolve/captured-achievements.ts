/**
 * The captured runtime's one reader for achievement stars.
 *
 * The game answers this with `poly.universeAffix()` plus `global.stats.achieve[id][affix]`, and
 * `universeAffix` is module-lexical — so the affix itself is one of the few game rules the capture
 * has to restate. It lives here and nowhere else: the pacifist guard and planet selection both
 * call this rather than carrying a switch each.
 *
 * Mirrors `universeAffix()` in `src/functions.js` at the port reference commit.
 */

import { isRecord, readProperty } from "../validation.ts";

function finiteStar(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

/** The per-universe key an achievement's star levels are stored under. */
export function readCapturedUniverseAffix(root: unknown): string | undefined {
  const universe = readProperty(readProperty(root, "race"), "universe");
  if (typeof universe !== "string") return undefined;
  switch (universe) {
    case "evil":
      return "e";
    case "antimatter":
      return "a";
    case "heavy":
      return "h";
    case "micro":
      return "m";
    case "magic":
      return "mg";
    default:
      return "l";
  }
}

/**
 * The star level earned for `achievementId` in the current universe.
 *
 * An absent achievement entry, and a present entry with no star for this universe, are both zero —
 * the game creates those entries lazily. `undefined` means the state could not be read at all,
 * which a caller must treat as unknown rather than as "not earned".
 */
export function readCapturedAchievementStar(
  root: unknown,
  achievementId: string,
): number | undefined {
  const achievement = readProperty(
    readProperty(readProperty(root, "stats"), "achieve"),
    achievementId,
  );
  const affix = readCapturedUniverseAffix(root);
  if (achievement === undefined || achievement === null) return 0;
  if (!isRecord(achievement) || affix === undefined) return undefined;
  const star = readProperty(achievement, affix);
  return star === undefined || star === null ? 0 : finiteStar(star);
}

/** Whether `achievementId` is already earned at `starLevel` or better. */
export function isCapturedAchievementUnlocked(
  root: unknown,
  achievementId: string,
  starLevel: number,
): boolean | undefined {
  const star = readCapturedAchievementStar(root, achievementId);
  return star === undefined ? undefined : star >= starLevel;
}
