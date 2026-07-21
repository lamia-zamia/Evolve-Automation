/**
 * Pure calculations behind the per-tick planning refresh (updateState). The application runner owns
 * the effectful order; these functions own the arithmetic and the goal-transition classification so
 * they can be unit-tested in isolation.
 */

/** Inputs the goal-transition branch is decided from, sampled before any evolution check runs. */
export interface GoalTransitionSnapshot {
  readonly species: string | undefined;
  readonly goal: string;
  readonly day: number;
  /** race.slow || race.hyper — the traits whose first day still needs an evolution re-check. */
  readonly slow: boolean;
  readonly hyper: boolean;
  /** settingsRaw.triggers.length; only consulted when leaving evolution. */
  readonly triggerCount: number;
}

export type GoalTransition =
  | { readonly kind: "force-evolution" }
  | { readonly kind: "resolve-leaving"; readonly rebuildTriggers: boolean }
  | { readonly kind: "day1-fallback" }
  | { readonly kind: "proceed" };

/**
 * Classifies which evolution-goal branch this tick takes. `resolve-leaving` and `day1-fallback` both
 * require the runner to observe checkEvolutionResult() before proceeding; the other two do not.
 */
export function planGoalTransition(
  snapshot: GoalTransitionSnapshot,
): GoalTransition {
  if (snapshot.species === "protoplasm") {
    return { kind: "force-evolution" };
  }
  if (snapshot.goal === "Evolution") {
    return {
      kind: "resolve-leaving",
      rebuildTriggers: snapshot.triggerCount > 0,
    };
  }
  // Fallback for a page reload right after evolution: on day 1 the slow/hyper/junker races are
  // re-checked even though the goal is already Standard.
  if (
    snapshot.day === 1 &&
    (snapshot.slow || snapshot.hyper || snapshot.species === "junker")
  ) {
    return { kind: "day1-fallback" };
  }
  return { kind: "proceed" };
}

/**
 * Rolling 11-sample money-income window: drop the oldest sample, refill up to 11 with the current
 * rate, and take the median as the 6th of the sorted samples. Returns fresh values; the caller
 * writes them back.
 */
export function computeMoneyWindow(
  incomes: readonly number[],
  rate: number,
): { readonly incomes: number[]; readonly median: number } {
  const next = incomes.slice(1);
  for (let i = next.length; i < 11; i++) {
    next.push(rate);
  }
  // The window is always refilled to 11 samples, so the 6th sorted entry always exists.
  const median = [...next].sort((a, b) => a - b)[5] ?? 0;
  return { incomes: next, median };
}

/**
 * Hell tower height: starts at 1000 and shrinks by (rank * 2 + 2) for each raised pillar, with a
 * floor of 250. Mirrors the "const towerSize" block in the game's portal.js.
 */
export function computeTowerSize(
  pillars: Readonly<Record<string, number>> | undefined,
): number {
  let towerSize = 1000;
  if (pillars) {
    for (const pillar in pillars) {
      if (pillars[pillar]) {
        towerSize -= pillars[pillar] * 2 + 2;
      }
    }
  }
  return towerSize < 250 ? 250 : towerSize;
}

/**
 * White-hole stabilisation is detected by exotic mass going down, not by any game event. `current`
 * is the already-coerced exotic mass (absent stellar engine reads as 0, matching legacy `?? 0`).
 */
export function evaluateStabilise(
  current: number,
  lastExoticMass: number,
): { readonly stabilised: boolean; readonly lastExoticMass: number } {
  return { stabilised: current < lastExoticMass, lastExoticMass: current };
}
