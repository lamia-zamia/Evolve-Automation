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
import type {
  EvolutionCycleTrace,
  EvolutionExecutor,
  EvolutionReader,
} from "../ports/evolution.ts";

declare const __EA_TEST_SURFACE_ENABLED__: boolean;

export interface EvolutionCycleDependencies {
  readonly reader: EvolutionReader;
  readonly executor: EvolutionExecutor;
  /** Already-migrated sub-compositions run before the landing gate. */
  readonly runUniverseSelection: () => void;
  readonly runPlanetSelection: () => void;
  readonly challengeGroups: readonly ChallengeGroup[];
  readonly trace?: (event: EvolutionCycleTrace) => void;
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
  const trace = dependencies.trace;
  const returned = (
    stage: string,
    reason: string,
    details?: Readonly<Record<string, unknown>>,
  ) => {
    if (
      (typeof __EA_TEST_SURFACE_ENABLED__ === "undefined" ||
        __EA_TEST_SURFACE_ENABLED__ === true) &&
      trace !== undefined
    )
      trace({ stage, reason, ...(details === undefined ? {} : { details }) });
  };

  const species = reader.sampleSpecies();
  if (
    (typeof __EA_TEST_SURFACE_ENABLED__ === "undefined" ||
      __EA_TEST_SURFACE_ENABLED__ === true) &&
    trace !== undefined
  )
    trace({ stage: "entered", details: { species } });
  if (!shouldEvolve(species)) {
    returned("species-gate", "not-protoplasm", { species });
    return;
  }

  runUniverseSelection();
  runPlanetSelection();

  const landingGate = reader.sampleLandingGate();
  const landed = hasLandedSomewhere(landingGate);
  if (
    (typeof __EA_TEST_SURFACE_ENABLED__ === "undefined" ||
      __EA_TEST_SURFACE_ENABLED__ === true) &&
    trace !== undefined
  )
    trace({ stage: "landing-gate", details: { ...landingGate, landed } });
  if (!landed) {
    returned("landing-gate", "not-landed", { ...landingGate });
    return;
  }

  let newlyCommitted = false;
  if (!reader.hasStoredTarget()) {
    executor.loadQueuedSettings();
    const decision = planEvolutionTarget(reader.sampleTargetSelection());
    if (decision.kind === "wait") {
      returned("target-selection", "planner-wait");
      return;
    }
    executor.commitTarget(decision.id, decision.name);
    newlyCommitted = true;
  }
  if (
    (typeof __EA_TEST_SURFACE_ENABLED__ === "undefined" ||
      __EA_TEST_SURFACE_ENABLED__ === true) &&
    trace !== undefined
  )
    trace({
      stage: "target",
      details: {
        id: reader.storedTargetId(),
        newlyCommitted,
      },
    });

  const groupIds = challengeGroups
    .map((group) => group.members[0]?.id)
    .filter((id): id is string => id !== undefined);
  const enabled = reader.sampleChallengeEnabled(groupIds);
  if (
    (typeof __EA_TEST_SURFACE_ENABLED__ === "undefined" ||
      __EA_TEST_SURFACE_ENABLED__ === true) &&
    trace !== undefined
  )
    trace({
      stage: "challenge-configuration",
      details: { enabledIds: groupIds.filter((id) => enabled[id] === true) },
    });
  for (const candidate of evolutionChallengeCandidates(
    challengeGroups,
    enabled,
  )) {
    const active = reader.sampleRaceTrait(candidate.trait) === 1;
    if (active) {
      if (
        (typeof __EA_TEST_SURFACE_ENABLED__ === "undefined" ||
          __EA_TEST_SURFACE_ENABLED__ === true) &&
        trace !== undefined
      )
        trace({
          stage: "challenge",
          details: { id: candidate.id, enabled: true, availability: "active" },
        });
      continue;
    }
    const availability = reader.sampleChallengeActionAvailability(candidate.id);
    if (availability === "not-offered") {
      if (
        (typeof __EA_TEST_SURFACE_ENABLED__ === "undefined" ||
          __EA_TEST_SURFACE_ENABLED__ === true) &&
        trace !== undefined
      )
        trace({
          stage: "challenge",
          details: { id: candidate.id, enabled: true, availability },
        });
      continue;
    }
    if (availability === "stale") {
      returned("challenge", "visible-action-binding-stale", {
        id: candidate.id,
      });
      return;
    }
    const clicked = executor.clickEvolution(candidate.id);
    if (
      (typeof __EA_TEST_SURFACE_ENABLED__ === "undefined" ||
        __EA_TEST_SURFACE_ENABLED__ === true) &&
      trace !== undefined
    )
      trace({
        stage: "challenge",
        details: {
          id: candidate.id,
          enabled: true,
          availability,
          outcome: clicked,
        },
      });
    if (
      typeof clicked !== "boolean" &&
      (clicked.status === "unavailable" || clicked.status === "root-replaced")
    ) {
      returned("challenge", clicked.status, { id: candidate.id, availability });
      return;
    }
    if (typeof clicked !== "boolean" && clicked.status === "failed") continue;
    if (actionChanged(clicked) && candidate.cycleEnding) {
      returned("challenge", "cycle-ending-challenge-activated", {
        id: candidate.id,
      });
      return;
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
    returned("final-menu-imitation", "final-menu-handled");
    return;
  }

  const targetId = reader.storedTargetId();
  if (targetId === null) {
    throw new TypeError("evolution target missing after selection phase");
  }

  const costs = reader.sampleCosts(targetId);
  if (
    (typeof __EA_TEST_SURFACE_ENABLED__ === "undefined" ||
      __EA_TEST_SURFACE_ENABLED__ === true) &&
    trace !== undefined
  )
    trace({ stage: "costs", details: { targetId, ...costs } });
  const accumulationPlan = planResourceAccumulation(
    costs.maxRna,
    costs.maxDna,
    {
      rnaCurrent: costs.rnaCurrent,
      rnaMax: costs.rnaDisplay ? costs.rnaMax : costs.rnaCurrent,
      dnaCurrent: costs.dnaCurrent,
      dnaMax: costs.dnaDisplay ? costs.dnaMax : costs.dnaCurrent,
    },
  );
  if (
    (typeof __EA_TEST_SURFACE_ENABLED__ === "undefined" ||
      __EA_TEST_SURFACE_ENABLED__ === true) &&
    trace !== undefined
  )
    trace({ stage: "resource-plan", details: { ...accumulationPlan } });
  const accumulation = executor.accumulateResources(accumulationPlan);
  if (
    (typeof __EA_TEST_SURFACE_ENABLED__ === "undefined" ||
      __EA_TEST_SURFACE_ENABLED__ === true) &&
    trace !== undefined
  )
    trace({
      stage: "resource-actions",
      details: {
        ...accumulationPlan,
        outcome: accumulation ?? "legacy-complete",
      },
    });
  if (accumulation !== undefined && accumulation !== "complete") {
    returned("resource-actions", accumulation);
    return;
  }

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
      returned("genus-selection", "action-not-confirmed", {
        id: genusPlan.actionId,
        outcome,
      });
      return;
    }
    returned("genus-selection", "selection-confirmed", {
      id: genusPlan.actionId,
    });
    return;
  }

  if (
    (typeof __EA_TEST_SURFACE_ENABLED__ === "undefined" ||
      __EA_TEST_SURFACE_ENABLED__ === true) &&
    trace !== undefined
  ) {
    const cellSample = reader.sampleCells();
    trace({
      stage: "cell-upgrade-plan",
      details: {
        when: "before-tree-action",
        input: cellSample,
        candidates: planEvolutionCells(cellSample, costs.maxRna, costs.maxDna),
      },
    });
  }

  const treePlan = planEvolutionTreeClick(reader.sampleEvolutionTree(targetId));
  if (
    (typeof __EA_TEST_SURFACE_ENABLED__ === "undefined" ||
      __EA_TEST_SURFACE_ENABLED__ === true) &&
    trace !== undefined
  )
    trace({ stage: "evolution-tree-plan", details: { ...treePlan } });
  if (treePlan.kind === "click") {
    const outcome = executor.clickEvolution(treePlan.id);
    if (
      (typeof __EA_TEST_SURFACE_ENABLED__ === "undefined" ||
        __EA_TEST_SURFACE_ENABLED__ === true) &&
      trace !== undefined
    ) {
      trace({
        stage: "evolution-tree-action-outcome",
        details: {
          id: treePlan.id,
          outcome,
          species: reader.sampleSpecies(),
          cells: reader.sampleCells(),
          resources: reader.sampleCosts(targetId),
        },
      });
    }
    if (actionUnavailable(outcome) || actionChanged(outcome)) {
      returned(
        "evolution-tree",
        actionUnavailable(outcome) ? "action-unavailable" : "action-invoked",
        {
          id: treePlan.id,
          outcome,
        },
      );
      return;
    }
  }

  const cellClicks = planEvolutionCells(
    reader.sampleCells(),
    costs.maxRna,
    costs.maxDna,
  );
  if (
    (typeof __EA_TEST_SURFACE_ENABLED__ === "undefined" ||
      __EA_TEST_SURFACE_ENABLED__ === true) &&
    trace !== undefined
  )
    trace({ stage: "cell-upgrade-plan", details: { candidates: cellClicks } });
  for (const id of cellClicks) {
    const outcome = executor.clickEvolution(id);
    if (!actionChanged(outcome) && typeof outcome !== "boolean") {
      returned("cell-upgrade", "action-not-confirmed", { id, outcome });
      return;
    }
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
  returned("cycle-complete", "no-early-return");
}
