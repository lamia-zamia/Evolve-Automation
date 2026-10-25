import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildP47Evidence } from "../../experiments/p47-allocator-entrypoint-evidence.mjs";

const evidence = buildP47Evidence();
const committedEvidence = JSON.parse(
  readFileSync(
    new URL(
      "../../experiments/p47-allocator-entrypoint-evidence.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

assert.deepEqual(committedEvidence, evidence);
assert.equal(
  evidence.pinnedGame,
  "pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f",
);
assert.equal(evidence.decision.code, "C");
assert.equal(evidence.candidates[0].standardHuman.periods, 10000);
assert.equal(
  evidence.candidates[0].standardHuman.candidateUnlockTransitionsObserved,
  null,
);
assert.equal(
  evidence.candidates[0].standardHuman
    .candidateUnlockTransitionObservationStatus,
  "not-recorded-at-cycle-level",
);
assert.equal(
  evidence.candidates[0].standardHuman.nativeQuarryPurchaseObserved,
  false,
);
assert.equal(
  evidence.candidates[0].standardHuman.assignedQuarryWorkerAtAnyCheckpoint,
  false,
);
assert.equal(
  evidence.candidates[0].p43PostInterventionArms[0].eventCount,
  1161,
);
assert.equal(
  evidence.candidates[0].p43PostInterventionArms[0].newUnlockTransitions,
  0,
);
assert.equal(
  evidence.candidates[0].p43PostInterventionArms[0].rowAtFirstEvent.unlocked,
  true,
);
assert.equal(
  evidence.retainedDiagnosticBoundaries.p43.addedNativeFoodObservations,
  1161,
);
assert.equal(
  evidence.retainedDiagnosticBoundaries.p43.addedControlGenerationReads,
  2322,
);
assert.equal(evidence.candidates[0].lateGame.unlockTransitions, null);
assert.equal(
  evidence.candidates[0].lateGame.status,
  "unmeasurable-from-retained-owner-publications",
);
assert.equal(
  evidence.candidates[0].lateGame.p45SourceTimeline,
  "experiments/p43-food-safe-jobs-timeline.json",
);
assert.equal(evidence.candidates[0].lateGame.p45SourceArm, "P43 B");
assert.equal(evidence.candidates[1].p40Boundary.currentWorkCycleId, 90);
assert.equal(evidence.candidates[1].p40Boundary.completedPublicationId, 89);
assert.equal(
  evidence.candidates[1].p40Boundary.historicalReservationTarget,
  "city-farm",
);
assert.equal(
  evidence.candidates[1].p40Boundary.currentConstructionTarget,
  "city-rock_quarry",
);
assert.equal(evidence.runtimeProof.status, "not-run-no-qualified-trigger");
assert.equal(evidence.runtimeProof.pureEvaluationTimeMs, null);
assert.equal(evidence.runtimeProof.additionalNativeCatalogReads, null);
assert.equal(evidence.parityCoverage.nativeParityFixturePresent, false);
assert.equal(
  evidence.retainedDiagnosticBoundaries.p37.objectivePlayerSelected,
  false,
);
assert.equal(
  evidence.retainedDiagnosticBoundaries.p37.executionAuthority,
  "none",
);
assert.equal(
  evidence.retainedDiagnosticBoundaries.p42.noExecutionSpendingAuthority,
  true,
);

console.log(
  "P47 trigger qualification and cost-evidence boundary checks passed",
);
