import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { format } from "prettier";
import { fileURLToPath, pathToFileURL } from "node:url";

const experimentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryDirectory = resolve(experimentDirectory, "..");
const pinnedGame =
  "pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f";

function readJson(relativePath) {
  return JSON.parse(
    readFileSync(resolve(repositoryDirectory, relativePath), "utf8"),
  );
}

function fileSha256(relativePath) {
  return createHash("sha256")
    .update(readFileSync(resolve(repositoryDirectory, relativePath)))
    .digest("hex");
}

function summarizeJobAvailability(events, jobId) {
  const rowAt = (event) =>
    event.jobCatalog?.find((job) => job.id === jobId) ?? null;
  const first = events[0];
  let unlockedEventCount = 0;
  let newUnlockTransitions = 0;
  let rowEntryTransitions = 0;
  for (const event of events) {
    if (rowAt(event)?.unlocked === true) unlockedEventCount++;
  }
  for (let index = 1; index < events.length; index++) {
    const prior = rowAt(events[index - 1]);
    const current = rowAt(events[index]);
    if (prior === null && current !== null) rowEntryTransitions++;
    if (prior?.unlocked !== true && current?.unlocked === true)
      newUnlockTransitions++;
  }
  return {
    eventCount: events.length,
    firstPeriod: first?.period ?? null,
    lastPeriod: events.at(-1)?.period ?? null,
    rowAtFirstEvent: rowAt(first),
    unlockedEventCount,
    rowEntryTransitions,
    newUnlockTransitions,
  };
}

function countOwnedJobRows(points) {
  return points.filter((point) =>
    Object.keys(point).some((key) =>
      /job|construction|generation|queue|research/i.test(key),
    ),
  ).length;
}

export function buildP47Evidence() {
  const p37 = readJson("experiments/p37-economic-goal-dependencies.json");
  const p38 = readJson(
    "experiments/p38-quarry-production-validation-evidence.json",
  );
  const p38Jobs = readJson(
    "experiments/p38-quarry-production-validation-jobs.json",
  );
  const p38Production = readJson(
    "experiments/p38-quarry-production-validation-production.json",
  );
  const p39 = readJson(
    "experiments/p39-cross-owner-economic-coordination-evidence.json",
  );
  const p40 = readJson(
    "experiments/p40-construction-reservation-gate-trace.json",
  );
  const p41 = readJson("experiments/p41-reservation-correctness-trace.json");
  const p42 = readJson(
    "experiments/p42-construction-priority-counterfactual-evidence.json",
  );
  const p43 = readJson("experiments/p43-food-safe-jobs-timeline.json");
  const p43Evidence = readJson("experiments/p43-food-safe-jobs-evidence.json");
  const p44 = readJson(
    "experiments/p44-food-infrastructure-feasibility-matrix.json",
  );
  const p45 = readJson("experiments/p45-food-stock-timeline.json");
  const p46 = readJson("experiments/p46-renderer-cpu-readiness-evidence.json");

  const p38AfterP688 = p38.arms[0].checkpoints.filter(
    (checkpoint) => checkpoint.period >= 688,
  );
  const standardHuman = {
    source: "P38 native Standard/Human replay, matched to P18",
    fixturePath: p38.fixturePath,
    fixtureSha256: p38.fixtureSha256,
    settingsPath: p38.settingsPath,
    periods: p38.arms[0].periods,
    ordinaryJobsExecutions: Object.fromEntries(
      p38.arms.map((arm) => [
        arm.arm,
        p38.performance[arm.arm]?.ordinaryJobsExecutions ?? null,
      ]),
    ),
    quarryWorkerAtCapturedP688Input:
      p38Jobs.capturedP688Planner.quarryWorker === null
        ? "no-live-row"
        : "row-present",
    postP688CheckpointCount: p38AfterP688.length,
    postP688CheckpointPeriods: p38AfterP688.map(
      (checkpoint) => checkpoint.period,
    ),
    nativeQuarryPurchaseObserved: p38Production.quarryPurchase.observed,
    assignedQuarryWorkerAtAnyCheckpoint:
      p38Production.ordinaryAutoJobs.assignedQuarryWorkerAtAnyCheckpoint,
    candidateUnlockTransitionsObserved: null,
    candidateUnlockTransitionObservationStatus: "not-recorded-at-cycle-level",
    triggerScope:
      "P38 reports no native Quarry purchase or assignment through p10000 and the captured p688 Jobs input has no Quarry Worker row. It does not retain a cycle-by-cycle Jobs catalog stream, so transition frequency is not measured.",
  };

  const p43Arms = ["armA", "armB"].map((armId) => {
    const arm = p43[armId];
    return {
      arm: armId,
      provenance:
        "P43 Jobs trace starts after P42's test-only Construction priority substitution and P38's test-authorized Gather sequence.",
      ...summarizeJobAvailability(arm.events, "quarry_worker"),
    };
  });

  const lateFixturePath =
    "test-artifacts/benchmark/slice0/saves/mad-tech-offered-blocked.json";
  const nativeParityFixturePath =
    "test-artifacts/benchmark/settings/baseline-tuned.json";
  const p45JobOwnerPointCount = countOwnedJobRows(p45.points);

  const evidenceInputs = [
    "experiments/p37-economic-goal-dependencies.json",
    "experiments/p38-quarry-production-validation-evidence.json",
    "experiments/p38-quarry-production-validation-jobs.json",
    "experiments/p38-quarry-production-validation-production.json",
    "experiments/p39-cross-owner-economic-coordination-evidence.json",
    "experiments/p40-construction-reservation-gate-trace.json",
    "experiments/p41-reservation-correctness-trace.json",
    "experiments/p42-construction-priority-counterfactual-evidence.json",
    "experiments/p43-food-safe-jobs-timeline.json",
    "experiments/p43-food-safe-jobs-evidence.json",
    "experiments/p44-food-infrastructure-feasibility-matrix.json",
    "experiments/p45-food-stock-timeline.json",
    "experiments/p46-renderer-cpu-readiness-evidence.json",
  ];

  return {
    schema: "p47-allocator-entrypoint-feasibility-v1",
    pinnedGame,
    decision: {
      code: "C",
      name: "No defensible trigger",
      rationale:
        "Retained native Standard/Human evidence does not establish a natural Quarry Worker unlock: P38 has no live row at p688 and no native Quarry purchase or assignment through p10000, but it does not retain a cycle-by-cycle Jobs catalog stream. P43 starts with the row already unlocked after a test-only Construction intervention, and the late-game owner publication history is absent. JobsCycleInput also lacks the cross-owner work-cycle and generation envelope needed to qualify a trigger at a synchronous coordinator boundary.",
    },
    candidates: [
      {
        id: "newly-unlocked-quarry-worker-row",
        status: "not-established",
        observation: "Captured Jobs catalog row availability",
        proposedCondition:
          "A Quarry Worker row becomes newly unlocked in the prepared Jobs publication, compared only with the immediately preceding Jobs owner publication.",
        standardHuman,
        p43PostInterventionArms: p43Arms,
        lateGame: {
          fixturePath: lateFixturePath,
          fixturePresent: existsSync(
            resolve(repositoryDirectory, lateFixturePath),
          ),
          boundedPeriods: p46.callbackGcDiagnostic.totalPeriods,
          p45SourceTimeline: p45.sourceTimeline,
          p45SourceArm: p45.arm,
          p45FoodTimelinePoints: p45.points.length,
          p45PointsContainingJobsConstructionGenerationQueueOrResearchFields:
            p45JobOwnerPointCount,
          preparedJobsPublicationCount: null,
          unlockTransitions: null,
          status: "unmeasurable-from-retained-owner-publications",
        },
        qualificationBlockers: [
          "P38 captured no live Quarry Worker row at p688 and reports no native Quarry purchase or assignment through p10000, but it does not retain a cycle-by-cycle Jobs catalog stream from which to count unlock transitions.",
          "P43 first observes Quarry Worker already unlocked at p720; the preceding availability change is outside the Jobs trace and follows a test-only Construction priority substitution.",
          "P43's later job assignment changes are not new unlocks and cannot serve as entry-point triggers.",
          "P45 retains food-stock points without Jobs, Construction, queue, or owner-generation identities; P46's bounded late-game profile retains no prepared Jobs catalog stream.",
          "Production JobsCycleInput does not carry a work-cycle ID, root generation, progression generation, or control generations for the captured rows.",
        ],
      },
      {
        id: "construction-saving-target-change",
        status: "rejected-as-coordinator-trigger",
        source: "Construction completed intent and ordering",
        p40Boundary: {
          currentWorkCycleId: p40.purchasePath.p720.ownerDecision.workCycleId,
          completedPublicationId:
            p40.purchasePath.p720.ownerDecision.input.publishedWorkCycleId,
          historicalReservationTarget:
            p40.purchasePath.p720.savingReservation.output.target.name,
          currentConstructionTarget:
            p40.purchasePath.p720.candidateOrder[0].input.candidateKey,
        },
        reason:
          "P40 proves the previous completed Construction intent and current Construction ordering are distinct publications. P43's later target changes are treatment-linked and do not create a same-cycle Jobs request.",
      },
      {
        id: "resource-demand-change",
        status: "rejected-as-coordinator-trigger",
        source: "Memoized diagnostic demand sample",
        reason:
          "Demand is computed lazily once per demand epoch and invalidated at cycle start or relevant mutation. The sample mixes owner-derived demand and reservations, carries no common owner publication identity, and does not express a player-selected goal or allocation request.",
      },
      {
        id: "native-queue-change",
        status: "rejected-as-coordinator-trigger",
        source: "Captured native Build and Research queues",
        reason:
          "Queue entries are explicit player commitments and are read when reservation sampling runs, but the queue source emits no independent owner event or shared owner-generation envelope for the Jobs boundary.",
      },
      {
        id: "jobs-owner-request",
        status: "not-present",
        source: "Jobs onCoherentPlan callback",
        reason:
          "The callback reports an already prepared and successfully executed ordinary Jobs decision. It is not an independent request to coordinate or spend.",
      },
    ],
    retainedDiagnosticBoundaries: {
      p37: {
        objectivePlayerSelected: p37.objective.playerSelected,
        executionAuthority: p37.objective.executionAuthority,
      },
      p39: {
        decision: p39.decision,
        authority:
          "Cross-owner economic coordination remains diagnostic; worker commitments and a Construction-owned spending contract are incomplete.",
      },
      p41: {
        evidence: "experiments/p41-reservation-correctness.md",
        correction:
          "Unavailable holdings or incomplete reservation evidence fail closed; this P47 audit changes no P41 behavior.",
      },
      p42: {
        purpose: p42.authority.purpose,
        noExecutionSpendingAuthority:
          p42.authority.noExecutionSpendingAuthority,
      },
      p43: {
        addedNativeFoodObservations:
          p43Evidence.performance.nativeFoodObservationCount,
        addedControlGenerationReads:
          p43Evidence.performance.nativeControlGenerationReads,
        addedFoodBreakdownReadsPerJobsCycle:
          p43Evidence.performance.addedFoodBreakdownReadsPerJobsCycle,
        source:
          "P43 trace includes additional Food/root/control observations; those observations are excluded from a zero-new-capture P47 proof.",
      },
      p44: {
        workerCommitments: p44.authority.workerCommitments,
        authority:
          "Formula-backed Food projections do not establish the live set of worker commitments.",
      },
      p46: {
        rendererCpuGate: "unresolved",
        detectsCalibratedTwoPercentEffect:
          p46.analysis.measurementReadiness.detectsCalibratedTwoPercentEffect,
      },
    },
    runtimeProof: {
      status: "not-run-no-qualified-trigger",
      productionBehaviorChanged: false,
      coordinatorContractImplemented: false,
      baselineCoordinatorEvaluations: null,
      triggeredCoordinatorEvaluations: null,
      activationCheckTimeMs: null,
      pureEvaluationTimeMs: null,
      inputPreparationTimeMs: null,
      inputCopyBytes: null,
      totalSynchronousCallbackIncrementMs: null,
      maximumPerCycleIncrementMs: null,
      additionalNativeCatalogReads: null,
      additionalNativePriceReads: null,
      additionalNativeResourceReads: null,
      additionalControlResolutionsOrCapabilityProbes: null,
      retainedDiagnosticMemoryBytes: null,
      reason:
        "Stage 2 did not establish a genuine qualified trigger. Stages 3–5 were gated off; null values mean not measured, not zero.",
      rendererCpuGate: "unresolved; no P47 CPU comparison was run",
    },
    parityCoverage: {
      status: "not-run-stage-4-gated-off",
      nativeParityFixturePath: nativeParityFixturePath,
      nativeParityFixturePresent: existsSync(
        resolve(repositoryDirectory, nativeParityFixturePath),
      ),
      priorCoverageLimitation:
        "P46 recorded the missing baseline-tuned native-parity settings fixture; this report preserves that existing limitation and does not create replacement evidence.",
    },
    sourceEvidence: Object.fromEntries(
      evidenceInputs.map((relativePath) => [
        relativePath,
        { sha256: fileSha256(relativePath) },
      ]),
    ),
  };
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const outputPath = resolve(
    experimentDirectory,
    "p47-allocator-entrypoint-evidence.json",
  );
  const output = await format(
    `${JSON.stringify(buildP47Evidence(), null, 2)}\n`,
    { parser: "json" },
  );
  writeFileSync(outputPath, output);
  console.log(`Wrote ${outputPath}`);
}
