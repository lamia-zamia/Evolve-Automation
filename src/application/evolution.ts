import type { ChallengeGroup } from "../domain/evolution.ts";
import {
  evolutionChallengeCandidates,
  hasLandedSomewhere,
  planEvolutionCells,
  planEvolutionTarget,
  planEvolutionTreeClick,
  planImitation,
  planResourceAccumulation,
  shouldEvolve,
} from "../domain/evolution.ts";
import type { EvolutionExecutor, EvolutionReader } from "../ports/evolution.ts";

export interface EvolutionCycleDependencies {
  readonly reader: EvolutionReader;
  readonly executor: EvolutionExecutor;
  /** Already-migrated sub-compositions run before the landing gate. */
  readonly runUniverseSelection: () => void;
  readonly runPlanetSelection: () => void;
  readonly challengeGroups: readonly ChallengeGroup[];
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
      if (clicked && candidate.cycleEnding) {
        return;
      }
    }
  }

  const targetId = reader.storedTargetId();
  if (targetId === null) {
    throw new TypeError("evolution target missing after selection phase");
  }

  const costs = reader.sampleCosts(targetId);
  executor.accumulateResources(
    planResourceAccumulation(costs.maxRna, costs.maxDna, {
      rnaCurrent: costs.rnaCurrent,
      rnaMax: costs.rnaMax,
      dnaCurrent: costs.dnaCurrent,
      dnaMax: costs.dnaMax,
    }),
  );

  const treePlan = planEvolutionTreeClick(reader.sampleEvolutionTree(targetId));
  if (treePlan.kind === "click" && executor.clickEvolution(treePlan.id)) {
    return;
  }

  for (const id of planEvolutionCells(
    reader.sampleCells(),
    costs.maxRna,
    costs.maxDna,
  )) {
    executor.clickEvolution(id);
  }

  const imitation = planImitation(reader.sampleImitation());
  if (imitation.kind === "click") {
    if (!executor.clickImitation(imitation.imitateRace)) {
      executor.logImitationUnavailable(imitation.imitateRace);
    }
  } else if (imitation.kind === "log-no-race") {
    executor.logImitationNoRace();
  }
}
