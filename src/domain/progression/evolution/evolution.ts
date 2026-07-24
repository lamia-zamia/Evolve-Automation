/**
 * Pure decision logic for the autoEvolution command slice.
 *
 * The legacy factory interleaved live reads, sub-composition calls
 * (universe/planet selection), settings reloads, and clicks whose results
 * decided whether the cycle returned early. Like autoBuild, the application
 * runner drives the phases one at a time and samples live game state at the
 * exact moments the legacy code read it; every planner here is a pure function
 * over an immutable phase view.
 */

/** Challenge ids whose activation ends the cycle to let the game re-render. */
export const CYCLE_ENDING_CHALLENGES: readonly string[] = Object.freeze([
  "junker",
  "sludge",
  "ultra_sludge",
  "warlord",
]);

export function shouldEvolve(species: string): boolean {
  return species === "protoplasm";
}

export interface EvolutionLandingGate {
  readonly universe: string | null;
  readonly seeded: boolean;
  readonly chose: boolean;
}

/**
 * Legacy waited before running any evolution logic until a universe and planet
 * were locked in: bigbang is still choosing, and a seeded universe has not
 * committed a planet until `chose` is set.
 */
export function hasLandedSomewhere(
  gate: Readonly<EvolutionLandingGate>,
): boolean {
  if (gate.universe === "bigbang") {
    return false;
  }
  if (gate.seeded && !gate.chose) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Target selection
// ---------------------------------------------------------------------------

export interface RaceView {
  readonly id: string;
  /** Race.getWeighting(); locked races return -1. */
  readonly weighting: number;
  /** Race.getHabitability(); 0 when the race cannot be evolved here. */
  readonly habitability: number;
  /** The game's race evolution action is unlocked in the current run. */
  readonly evolvable: boolean;
  /** Race.genus (game.races[id].type). */
  readonly genus: string;
  /** Race.name, used only for the log line. */
  readonly name: string;
}

export interface TargetSelectionInput {
  /** Races in the legacy Object.values(races) iteration order. */
  readonly races: readonly RaceView[];
  readonly userEvolutionTarget: string;
  readonly massExtinction: boolean;
  readonly queueEnabled: boolean;
  readonly queueLength: number;
  readonly queueRepeat: boolean;
  readonly evolutionAttempts: number;
}

export type TargetSelectionDecision =
  | { readonly kind: "wait" }
  | { readonly kind: "target"; readonly id: string; readonly name: string };

function raceById(
  races: readonly RaceView[],
  id: string,
): RaceView | undefined {
  return races.find((race) => race.id === id);
}

function isReachable(race: RaceView): boolean {
  return race.habitability > 0 && race.evolvable;
}

export function planEvolutionTarget(
  input: Readonly<TargetSelectionInput>,
): TargetSelectionDecision {
  let target: RaceView | undefined;

  if (input.userEvolutionTarget === "auto") {
    // Weightings are stable within a cycle, so sorting the sampled values
    // reproduces the legacy repeated getWeighting() sort. An achievement or
    // planet can make a race look suitable even when its race action is not
    // unlocked for this run, so those candidates must not enter the ranking.
    const byWeighting = input.races
      .filter(isReachable)
      .sort((a, b) => b.weighting - a.weighting);
    if (input.massExtinction) {
      // With Mass Extinction every unlocked race is reachable; take the best.
      target = byWeighting[0];
    } else {
      // Otherwise commit to the genus with the greatest total weight.
      const genusList = byWeighting
        .map((race) => race.genus)
        .filter((genus, index, all) => all.indexOf(genus) === index);
      const genusWeights = genusList.map(
        (genus) =>
          [
            genus,
            byWeighting
              .filter((race) => race.genus === genus)
              .map((race) => race.weighting)
              .reduce((sum, next) => sum + next),
          ] as const,
      );
      const bestGenus = [...genusWeights].sort((a, b) => b[1] - a[1])[0]![0];
      target = byWeighting.find((race) => race.genus === bestGenus);
    }
  } else {
    // Auto achievements disabled: honour the user-specified race if reachable.
    const userRace = raceById(input.races, input.userEvolutionTarget);
    if (userRace && isReachable(userRace)) {
      target = userRace;
    }
  }

  // Nothing chosen yet but a queue is pending; wait for it to advance.
  if (
    target === undefined &&
    input.queueEnabled &&
    input.queueLength > 0 &&
    (!input.queueRepeat || input.evolutionAttempts < input.queueLength)
  ) {
    return Object.freeze({ kind: "wait" });
  }

  // Final fallback: a reachable custom race, else the Entish default.
  if (target === undefined) {
    const custom = raceById(input.races, "custom");
    if (custom && isReachable(custom)) {
      target = custom;
    } else {
      const entish = raceById(input.races, "entish");
      target = entish && isReachable(entish) ? entish : undefined;
    }
  }

  if (target === undefined) {
    return Object.freeze({ kind: "wait" });
  }
  return Object.freeze({ kind: "target", id: target.id, name: target.name });
}

// ---------------------------------------------------------------------------
// Challenge activation
// ---------------------------------------------------------------------------

export interface ChallengeGroup {
  readonly members: readonly { readonly id: string; readonly trait: string }[];
}

export interface ChallengeCandidate {
  readonly id: string;
  readonly trait: string;
  /** Activating this challenge ends the cycle after a successful click. */
  readonly cycleEnding: boolean;
}

/**
 * The flat, ordered list of challenge actions the legacy loop would attempt:
 * every member of an enabled challenge group, in group-then-member order.
 * The runner samples the live trait for each candidate before clicking.
 */
export function evolutionChallengeCandidates(
  groups: readonly ChallengeGroup[],
  enabled: Readonly<Record<string, boolean>>,
): readonly ChallengeCandidate[] {
  const candidates: ChallengeCandidate[] = [];
  for (const group of groups) {
    const groupId = group.members[0]?.id;
    if (groupId === undefined || enabled[groupId] !== true) {
      continue;
    }
    for (const member of group.members) {
      candidates.push(
        Object.freeze({
          id: member.id,
          trait: member.trait,
          cycleEnding: CYCLE_ENDING_CHALLENGES.includes(member.id),
        }),
      );
    }
  }
  return Object.freeze(candidates);
}

// ---------------------------------------------------------------------------
// Resource accumulation
// ---------------------------------------------------------------------------

export interface EvolutionResourceLevels {
  readonly rnaCurrent: number;
  readonly rnaMax: number;
  readonly dnaCurrent: number;
  readonly dnaMax: number;
}

export interface ResourceAccumulationPlan {
  /** rna.action() call count for the DNA-conversion pass. */
  readonly rnaForDna: number;
  /** dna.action() call count. */
  readonly dnaForEvolution: number;
  /** rna.action() call count for the final evolution pass. */
  readonly rnaForEvolution: number;
  /** Script-side currentQuantity bookkeeping after the actions run. */
  readonly newRna: number;
  readonly newDna: number;
}

/**
 * Reproduces the legacy RNA/DNA gather math verbatim, including its reliance on
 * plain arithmetic (negative counts collapse to no-op loops; NaN maxima fall
 * through the Math.min chain exactly as before).
 */
export function planResourceAccumulation(
  maxRna: number,
  maxDna: number,
  levels: Readonly<EvolutionResourceLevels>,
): ResourceAccumulationPlan {
  const dnaForEvolution = Math.min(
    maxDna - levels.dnaCurrent,
    levels.dnaMax - levels.dnaCurrent,
    levels.rnaMax / 2,
  );
  const rnaForDna = Math.min(
    dnaForEvolution * 2 - levels.rnaCurrent,
    levels.rnaMax - levels.rnaCurrent,
  );
  const rnaRemaining = levels.rnaCurrent + rnaForDna - dnaForEvolution * 2;
  const rnaForEvolution = Math.min(
    maxRna - rnaRemaining,
    levels.rnaMax - rnaRemaining,
  );
  return Object.freeze({
    rnaForDna,
    dnaForEvolution,
    rnaForEvolution,
    newRna: rnaRemaining + rnaForEvolution,
    newDna: levels.dnaCurrent + dnaForEvolution,
  });
}

// ---------------------------------------------------------------------------
// Evolution-tree click
// ---------------------------------------------------------------------------

export interface EvolutionTreeAction {
  readonly id: string;
  readonly unlocked: boolean;
  /** The action is a challenge whose trait is already active on the race. */
  readonly activeChallenge: boolean;
}

export type EvolutionTreePlan =
  { readonly kind: "click"; readonly id: string } | { readonly kind: "none" };

/**
 * Legacy scanned the target's evolution tree, skipping already-active
 * challenges, and stopped at the first unlocked action: it clicked it (ending
 * the cycle on success) or broke to the cell upgrades if it was unlocked but
 * not yet affordable. That first unlocked non-active-challenge action is the
 * only click candidate.
 */
export function planEvolutionTreeClick(
  tree: readonly EvolutionTreeAction[],
): EvolutionTreePlan {
  for (const action of tree) {
    if (!action.unlocked) {
      continue;
    }
    if (action.activeChallenge) {
      continue;
    }
    return Object.freeze({ kind: "click", id: action.id });
  }
  return Object.freeze({ kind: "none" });
}

// ---------------------------------------------------------------------------
// Cell upgrades
// ---------------------------------------------------------------------------

export interface EvolutionCellCounts {
  readonly mitochondriaCount: number;
  readonly eukaryoticCellCount: number;
  readonly nucleusCount: number;
  readonly organellesCount: number;
  readonly rnaMax: number;
  readonly dnaMax: number;
}

/**
 * The unconditional cell-upgrade clicks at the tail of the legacy cycle, in
 * order. Each condition is evaluated against the single pre-phase snapshot,
 * matching the legacy sequential ifs (no earlier click changes a later test).
 * maxRna/maxDna are carried from the earlier cost sample.
 */
export function planEvolutionCells(
  input: Readonly<EvolutionCellCounts>,
  maxRna: number,
  maxDna: number,
): readonly string[] {
  const clicks: string[] = [];
  if (
    input.mitochondriaCount < 1 ||
    input.rnaMax < maxRna ||
    input.dnaMax < maxDna
  ) {
    clicks.push("mitochondria");
  }
  if (input.eukaryoticCellCount < 1 || input.dnaMax < maxDna) {
    clicks.push("eukaryotic_cell");
  }
  if (input.rnaMax < maxRna) {
    clicks.push("membrane");
  }
  if (input.nucleusCount < 10) {
    clicks.push("nucleus");
  }
  if (input.organellesCount < 10) {
    clicks.push("organelles");
  }
  return Object.freeze(clicks);
}

// ---------------------------------------------------------------------------
// Imitation
// ---------------------------------------------------------------------------

export interface ImitationInput {
  readonly evoFinalMenu: boolean;
  /** An imitation action `s-${imitateRace}` exists for the setting. */
  readonly imitationExists: boolean;
  readonly imitateRace: string;
}

export type ImitationPlan =
  | { readonly kind: "skip" }
  | { readonly kind: "click"; readonly imitateRace: string }
  | { readonly kind: "log-no-race" };

/**
 * Legacy only touched imitation on the final evolution menu: it clicked the
 * selected race's imitation (warning if the click failed) or warned that no
 * imitation race was selected. The failed-click warning is decided by the
 * runner from the click result.
 */
export function planImitation(input: Readonly<ImitationInput>): ImitationPlan {
  if (!input.evoFinalMenu) {
    return Object.freeze({ kind: "skip" });
  }
  if (!input.imitationExists) {
    return Object.freeze({ kind: "log-no-race" });
  }
  return Object.freeze({ kind: "click", imitateRace: input.imitateRace });
}
