/** Bonus a Shrine built right now would raise, or `null` outside any phase. */
type ShrineBonus = "morale" | "metal" | "know" | "tax" | "rotating" | null;

type ShrineLevels = {
  morale: number;
  metal: number;
  know: number;
  tax: number;
};

type ShrineGame = {
  global: {
    race: Record<string, unknown>;
    city: {
      calendar: { moon: number };
      /** Only created for a magnificent race, so absent for every other run. */
      shrine?: ShrineLevels;
    };
  };
};

type ShrineIntelligenceDependencies = {
  getGame: () => ShrineGame;
  getSettings: () => { buildingShrineType: string };
};

// The moon phase the Shrine's own action reads: the quarter boundaries build a
// rotating-effect Shrine instead of raising one of the four counters.
function shrineBonusForMoon(moon: number): ShrineBonus {
  if (moon > 0 && moon < 7) return "morale";
  if (moon > 7 && moon < 14) return "metal";
  if (moon > 14 && moon < 21) return "know";
  if (moon > 21) return "tax";
  if (moon === 0 || moon === 7 || moon === 14 || moon === 21) return "rotating";
  return null;
}

export function createShrineIntelligence({
  getGame,
  getSettings,
}: ShrineIntelligenceDependencies) {
  // Whether a Shrine built right now would raise a bonus other than the
  // configured one. The whole answer is the same for every Shrine candidate, so
  // it is one question about the run rather than about a candidate.
  //
  // The race and setting checks gate the rest, and the absent-shrine check is
  // needed because this is sampled once per phase rather than only when a Shrine
  // candidate is weighted: `global.city.shrine` exists only for a magnificent
  // race, and only once its city carries the counters.
  function shrineBonusUnwanted(): boolean {
    const wanted = getSettings().buildingShrineType;
    if (wanted === "any" || !getGame().global.race["magnificent"]) {
      return false;
    }
    const city = getGame().global.city;
    const shrine = city.shrine;
    if (shrine === undefined) {
      return false;
    }
    const offered = shrineBonusForMoon(city.calendar.moon);
    if (wanted !== "equally") {
      return wanted !== offered;
    }
    // A rotating Shrine has no counter to be behind, so it is never the one an
    // equal spread is missing.
    if (offered === null || offered === "rotating") {
      return true;
    }
    const lowest = Math.min(
      shrine.morale,
      shrine.metal,
      shrine.know,
      shrine.tax,
    );
    return shrine[offered] !== lowest;
  }

  return { shrineBonusUnwanted };
}
