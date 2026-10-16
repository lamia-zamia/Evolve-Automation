import type { ChallengeGroup } from "../domain/progression/evolution/evolution.ts";
import {
  evolutionChallengeCandidates,
  hasLandedSomewhere,
  planEvolutionCells,
  planEvolutionGenusSelection,
  planEvolutionTarget,
  planEvolutionTreeClick,
  planImitation,
  planResourceAccumulation,
  shouldEvolve,
} from "../domain/progression/evolution/evolution.ts";
import type { EvolutionExecutor, EvolutionReader } from "../ports/evolution.ts";

export interface EvolutionCycleDependencies {
  readonly reader: EvolutionReader;
  readonly executor: EvolutionExecutor;
  /** Already-migrated sub-compositions run before the landing gate. */
  readonly runUniverseSelection: () => void;
  readonly runPlanetSelection: () => void;
  readonly challengeGroups: readonly ChallengeGroup[];
}

function actionUnavailable(
  outcome: boolean | import("../ports/evolution.ts").EvolutionActionOutcome,
): boolean {
  return (
    typeof outcome !== "boolean" &&
    (outcome.status === "unavailable" ||
      outcome.status === "failed" ||
      outcome.status === "root-replaced")
  );
}

function actionChanged(
  outcome: boolean | import("../ports/evolution.ts").EvolutionActionOutcome,
): boolean {
  return (
    outcome === true ||
    (typeof outcome !== "boolean" &&
      outcome.status === "invoked" &&
      outcome.stateChanged)
  );
}

/**
 * Runs one autoEvolution cycle. The phases mirror the legacy factory exactly:
 * species gate, universe/planet sub-compositions, landing gate, target
 * selection (with a queued-settings reload), challenge activation, RNA/DNA
 * accumulation, the evolution-tree click, cell upgrades, and imitation — each
 * returning early where the legacy code returned to let the game re-render.
 */
export function runEvolution(dependencies: EvolutionCycleDependencies): void {
  const {
    reader,
    executor,
    runUniverseSelection,
    runPlanetSelection,
    challengeGroups,
  } = dependencies;

  if (!shouldEvolve(reader.sampleSpecies())) {
    return;
  }

  runUniverseSelection();
  runPlanetSelection();

  if (!hasLandedSomewhere(reader.sampleLandingGate())) {
    return;
  }
  if (reader.evolutionActionsReady?.() === false) return;

  if (!reader.hasStoredTarget()) {
    executor.loadQueuedSettings();
    const decision = planEvolutionTarget(reader.sampleTargetSelection());
    if (decision.kind === "wait") {
      return;
    }
    executor.commitTarget(decision.id, decision.name);
  }

  const groupIds = challengeGroups
    .map((group) => group.members[0]?.id)
    .filter((id): id is string => id !== undefined);
  const enabled = reader.sampleChallengeEnabled(groupIds);
  for (const candidate of evolutionChallengeCandidates(
    challengeGroups,
    enabled,
  )) {
    if (reader.sampleRaceTrait(candidate.trait) !== 1) {
      const clicked = executor.clickEvolution(candidate.id);
      if (actionUnavailable(clicked)) return;
      if (actionChanged(clicked) && candidate.cycleEnding) {
        return;
      }
    }
  }

  // DeadSpace's final menu contains only `evolution-s-*` imitation rows. Handle that menu before
  // the ordinary tree/cell phases so the configured imitation is selected rather than whichever
  // imitation row happens to be first in the DOM.
  const finalMenuImitation = reader.sampleImitation();
  if (finalMenuImitation.evoFinalMenu) {
    const imitation = planImitation(finalMenuImitation);
    if (imitation.kind === "click") {
      const outcome = executor.clickImitation(imitation.imitateRace);
      if (
        outcome === false ||
        (typeof outcome !== "boolean" && outcome.status === "failed")
      ) {
        executor.logImitationUnavailable(imitation.imitateRace);
      }
    } else if (imitation.kind === "log-no-race") {
      executor.logImitationNoRace();
    }
    return;
  }

  const targetId = reader.storedTargetId();
  if (targetId === null) {
    throw new TypeError("evolution target missing after selection phase");
  }

  const costs = reader.sampleCosts(targetId);
  const accumulation = executor.accumulateResources(
    planResourceAccumulation(costs.maxRna, costs.maxDna, {
      rnaCurrent: costs.rnaCurrent,
      rnaMax: costs.rnaMax,
      dnaCurrent: costs.dnaCurrent,
      dnaMax: costs.dnaMax,
    }),
  );
  if (accumulation !== undefined && accumulation !== "complete") return;

  const genusPlan = planEvolutionGenusSelection(
    reader.sampleEvolutionGenusSelection(targetId),
  );
  if (genusPlan.kind === "click") {
    // A genus action changes the game-owned tech selection. Require that exact postcondition before
    // the next action phase; a stale/redrawn control is never permission to try another genus.
    const outcome = executor.clickEvolution(genusPlan.actionId);
    if (
      !actionChanged(outcome) ||
      actionUnavailable(outcome) ||
      reader.sampleEvolutionGenusSelection(targetId).selectedGenus !==
        genusPlan.genus
    ) {
      return;
    }
    return;
  }

  const treePlan = planEvolutionTreeClick(reader.sampleEvolutionTree(targetId));
  if (treePlan.kind === "click") {
    const outcome = executor.clickEvolution(treePlan.id);
    if (actionUnavailable(outcome) || actionChanged(outcome)) {
      return;
    }
  }

  const cellClicks = planEvolutionCells(
    reader.sampleCells(),
    costs.maxRna,
    costs.maxDna,
  );
  for (const id of cellClicks) {
    const outcome = executor.clickEvolution(id);
    if (!actionChanged(outcome) && typeof outcome !== "boolean") return;
  }

  const imitation = planImitation(reader.sampleImitation());
  if (imitation.kind === "click") {
    const outcome = executor.clickImitation(imitation.imitateRace);
    if (
      outcome === false ||
      (typeof outcome !== "boolean" && outcome.status === "failed")
    ) {
      executor.logImitationUnavailable(imitation.imitateRace);
    }
  } else if (imitation.kind === "log-no-race") {
    executor.logImitationNoRace();
  }
}
