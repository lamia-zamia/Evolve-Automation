import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  advanceContinuation,
  allocationValidityToken,
  makeRepresentativeInput,
  planSynchronously,
  startContinuation,
} from "./p11-bounded-planner.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const tracePath = resolve(
  root,
  "test-artifacts/perf-profile/p10-sample-lifecycle.json",
);
const outPath = resolve(
  root,
  "test-artifacts/perf-profile/p11-bounded-planner-replay.json",
);
const source = JSON.parse(await readFile(tracePath, "utf8"));
const budgets = [16, 64, 256];
const fixtures = [];

for (const fixture of source.fixtures) {
  assert.equal(fixture.seed, 42);
  assert.equal(fixture.autoPrestige, false);
  assert.equal(fixture.warmupPeriods, 600);
  assert.equal(fixture.measuredPeriods, 1000);
  assert.equal(fixture.workticks, 125);
  const sets = fixture.events.filter(
    (event) => event.operation === "build-candidate-set",
  );
  assert.equal(sets.length, 125);
  const candidateCount = sets[0].candidates;
  assert.ok(sets.every((event) => event.candidates === candidateCount));
  assert.ok(
    sets.every(
      (event) =>
        Array.isArray(event.candidateRows) &&
        event.candidateRows.length === candidateCount,
    ),
    "P11 needs full sampled Construction candidates",
  );
  const resourceFrequency = new Map();
  for (const event of sets)
    for (const row of event.candidateRows)
      for (const id of Object.keys(row.cost ?? {})) {
        const scope = row.pool === undefined ? id : `${id}@${row.pool}`;
        resourceFrequency.set(scope, (resourceFrequency.get(scope) ?? 0) + 1);
      }
  const resourceIds = [...resourceFrequency]
    .sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )
    .slice(0, 3)
    .map(([id]) => id);
  const mutationEvents = fixture.events.filter((event) => {
    if (event.operation !== "demand-invalidation") return false;
    const cause = (event.caller ?? "").split("\n")[2] ?? "";
    return !cause.includes("at runCycle (");
  });
  const invalidationByCycle = new Map();
  for (const event of mutationEvents) {
    const cause = (event.caller ?? "").split("\n")[2] ?? "";
    const reason = cause.includes("invalidateDemandSettings")
      ? "settings"
      : "mutation-or-authority";
    const reasons = invalidationByCycle.get(event.cycle) ?? new Set();
    reasons.add(reason);
    invalidationByCycle.set(event.cycle, reasons);
  }
  const runs = [];
  for (const budget of budgets) {
    let input;
    let oracle;
    let continuation;
    let valid = false;
    let completedPlans = 0;
    let restartedPlans = 0;
    let invalidWorkticks = 0;
    let currentRunTicks = 0;
    let maxConsecutive = 0;
    let totalConsecutive = 0;
    let slices = 0;
    let totalEvaluations = 0;
    let allPublishedValid = true;
    let sliceTimeMs = 0;
    const reasons = Object.create(null);
    for (let tick = 0; tick < 125; tick += 1) {
      const cycle = sets[tick].cycle;
      const rows = sets[tick].candidateRows;
      const nextInput = makeRepresentativeInput(
        candidateCount,
        0,
        rows,
        resourceIds,
      );
      const eventCycle = cycle - 1;
      const invalidationReasons = invalidationByCycle.get(eventCycle);
      const tokenChanged =
        input !== undefined &&
        JSON.stringify(input.candidates) !==
          JSON.stringify(nextInput.candidates);
      if (invalidationReasons || tokenChanged) {
        if (continuation || valid) restartedPlans += 1;
        continuation = startContinuation(nextInput);
        valid = false;
        currentRunTicks = 0;
        for (const reason of invalidationReasons)
          reasons[reason] = (reasons[reason] ?? 0) + 1;
        if (tokenChanged)
          reasons["candidate/price-snapshot"] =
            (reasons["candidate/price-snapshot"] ?? 0) + 1;
      }
      input = nextInput;
      oracle = planSynchronously(input);
      if (continuation === undefined && !valid)
        continuation = startContinuation(input);
      if (!valid) {
        const start = performance.now();
        const result = advanceContinuation(input, continuation, budget);
        sliceTimeMs += performance.now() - start;
        slices += 1;
        totalEvaluations += result.evaluations;
        currentRunTicks += 1;
        totalConsecutive += 1;
        maxConsecutive = Math.max(maxConsecutive, currentRunTicks);
        if (result.status === "incomplete") continuation = result.continuation;
        else {
          assert.equal(result.status, "completed");
          assert.deepEqual(result.plan, oracle.plan);
          allPublishedValid &&=
            allocationValidityToken(input) === continuation.token;
          valid = true;
          continuation = undefined;
          completedPlans += 1;
          currentRunTicks = 0;
        }
      }
      if (!valid) invalidWorkticks += 1;
    }
    runs.push({
      budget,
      candidateEvaluationsPerPlan: candidateCount,
      slicesToComplete: Math.ceil(candidateCount / budget),
      completedPlans,
      restartedPlans,
      invalidationReasons: reasons,
      consecutivePlanningWorkticksMax: maxConsecutive,
      consecutivePlanningWorkticksMean:
        slices === 0
          ? 0
          : totalConsecutive / Math.max(1, completedPlans + restartedPlans),
      workticksWithoutValidResult: invalidWorkticks,
      completedPlanValidAtPublication: allPublishedValid,
      evaluations: totalEvaluations,
      perSliceElapsedMsDiagnostic: {
        total: sliceTimeMs,
        average: slices ? sliceTimeMs / slices : 0,
      },
      oracleMatch: true,
    });
  }
  fixtures.push({
    name: fixture.name,
    seed: fixture.seed,
    autoPrestige: fixture.autoPrestige,
    warmupPeriods: fixture.warmupPeriods,
    measuredPeriods: fixture.measuredPeriods,
    workticks: fixture.workticks,
    observedBuildCandidateCounts: [
      ...new Set(sets.map((event) => event.candidates)),
    ],
    evaluatedResourceConstraints: resourceIds,
    reservationInputs:
      "held at a 20% hard reserve per selected resource; P10 did not capture reservation totals per tick",
    observedNonRoutineInvalidationEvents: mutationEvents.length,
    observedInvalidationWorkticks: invalidationByCycle.size,
    parity: fixture.parity,
    runs,
  });
}

const report = {
  sourceTrace:
    "P10 exact Chromium runner lifecycle capture (same snapshot/settings/seed)",
  gameSnapshot: source.gameSnapshot,
  model: {
    basis:
      "Construction/AutoBuild one-choice weighted candidate gate; top 3 observed cost resources; hard reservation constraints",
    policyStatus:
      "captured candidate rows and native cost vectors; resource/reservation limits are controlled test values because P10 did not capture them per tick. The future autonomous-allocation policy remains unspecified.",
    complexity:
      "O(C*R) candidate-resource checks, C=observed candidates, R=3 selected resources; one candidate evaluation is one budget unit",
  },
  fixtures,
};
await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      outPath,
      fixtures: fixtures.map(
        ({
          name,
          observedBuildCandidateCounts,
          observedNonRoutineInvalidationEvents,
          runs,
        }) => ({
          name,
          observedBuildCandidateCounts,
          observedNonRoutineInvalidationEvents,
          runs,
        }),
      ),
    },
    null,
    2,
  ),
);
