/**
 * Whether automation should stop spending Money to finish the Inflation challenge, read from the
 * captured game root rather than the compatibility game object.
 *
 * The challenge is won by holding a fixed Money total at once, so the assist stops every Money
 * purchase for the last stretch before that total is reachable. Upstream decides the achievement
 * requirement in its own `alevel()`; it is reconstructed here from the captured race traits
 * because that method is not part of the captured surface.
 *
 * Anything the root cannot answer — no Inflation run, no Money resource, an unreadable achievement
 * bag — means "do not save", which is the behaviour of a run that is not on the challenge at all.
 */

import { shouldSaveInflationMoney } from "../../../../domain/economy/resources/inflation-assist.ts";
import { finite, isRecord, readProperty } from "../../../validation.ts";

const INFLATION_CHALLENGE_MONEY = 25e10;
const ACHIEVEMENT_LEVEL_TRAITS = Object.freeze([
  "no_plasmid",
  "no_trade",
  "no_craft",
  "no_crispr",
  "weak_mastery",
  "nerfed",
  "badgenes",
]);

/** The suffix upstream appends to an achievement key for the run's universe. */
function achievementAffix(universe: unknown): string | undefined {
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

export function readCapturedInflationSaveMoney(
  root: unknown,
  settings: Record<PropertyKey, unknown>,
): boolean {
  try {
    const assist = settings["inflationChallengeAssist"];
    if (assist !== undefined && typeof assist !== "boolean") return false;
    if (assist !== true) return false;

    const race = readProperty(root, "race");
    if (!isRecord(race)) return false;
    const inflation = race["inflation"];
    if (
      inflation === undefined ||
      inflation === false ||
      typeof inflation !== "number" ||
      !Number.isFinite(inflation)
    ) {
      return false;
    }

    const money = readProperty(readProperty(root, "resource"), "Money");
    if (!isRecord(money)) return false;

    const saveMinutes = finite(settings["inflationChallengeSaveMinutes"]);
    if (saveMinutes === undefined) return false;
    const currentMoney = finite(money["amount"]);
    const maxMoney = finite(money["max"]);
    const moneyRate = finite(money["diff"]);
    if (
      currentMoney === undefined ||
      maxMoney === undefined ||
      moneyRate === undefined
    ) {
      return false;
    }

    const stats = readProperty(root, "stats");
    const achievements = readProperty(stats, "achieve");
    const wheelbarrow = readProperty(achievements, "wheelbarrow");
    const affix = achievementAffix(readProperty(race, "universe"));
    if (!isRecord(stats) || !isRecord(achievements) || affix === undefined) {
      return false;
    }
    if (
      wheelbarrow !== undefined &&
      wheelbarrow !== null &&
      !isRecord(wheelbarrow)
    ) {
      return false;
    }
    const rawStar = readProperty(wheelbarrow, affix);
    const wheelbarrowStar =
      rawStar === undefined || rawStar === null ? 0 : finite(rawStar);
    if (wheelbarrowStar === undefined || wheelbarrowStar < 0) return false;

    let achievementLevel = 1;
    for (const trait of ACHIEVEMENT_LEVEL_TRAITS) {
      if (race[trait]) achievementLevel += 1;
    }
    achievementLevel = Math.min(achievementLevel, 5);

    return shouldSaveInflationMoney({
      active:
        wheelbarrowStar < achievementLevel &&
        readProperty(race, "inflation") !== false,
      saveMinutes,
      money: {
        targetMoney: INFLATION_CHALLENGE_MONEY,
        currentMoney,
        maxMoney,
        moneyRate,
      },
    });
  } catch {
    return false;
  }
}
