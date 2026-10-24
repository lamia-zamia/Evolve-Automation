import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as prettier from "prettier";

import { createCapturedCostConflictReader } from "../src/adapters/evolve/captured-cost-conflict.ts";
import { findCostConflict } from "../src/domain/cost-conflicts.ts";
import {
  initialBuildLoopState,
  planBuildCompetition,
  planBuildConflict,
  planBuildGate,
} from "../src/domain/progression/build/build.ts";
import { isKnowledgeGated } from "../src/domain/progression/build/building-weighting.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tracePath = path.join(
  root,
  "experiments/p41-reservation-correctness-trace.json",
);
const outputPath = path.join(
  root,
  "experiments/p41-reservation-gate-comparison.json",
);
const traceText = await readFile(tracePath, "utf8");
const trace = JSON.parse(traceText);
const events = trace.traceEvents;
const hash = (value) => createHash("sha256").update(value).digest("hex");

function event(type, candidateKey) {
  return events.find(
    (entry) =>
      entry.type === type &&
      (entry.input?.candidate?.candidateKey === candidateKey ||
        entry.input?.candidateKey === candidateKey),
  );
}

const quarryKey = "city-rock_quarry";
const housingKey = "city-basic_housing";
const quarryOrder = event("candidate-order", quarryKey);
const housingOrder = event("candidate-order", housingKey);
const quarryAffordability = event("candidate-affordability", quarryKey);
const housingAffordability = event("candidate-affordability", housingKey);
const quarryRaw = event("cost-conflict", quarryKey);
const housingRaw = event("cost-conflict", housingKey);
const housingBuildGate = event("build-conflict-plan", housingKey);
const housingCompetition = event("build-competition-plan", housingKey);

for (const [name, value] of Object.entries({
  quarryOrder,
  housingOrder,
  quarryAffordability,
  housingAffordability,
  quarryRaw,
  housingRaw,
  housingBuildGate,
  housingCompetition,
})) {
  assert.ok(value, `P40 trace is missing ${name}`);
}

const originalNative = housingRaw.input.reservationSources.nativeQueue;
const originalScript = housingRaw.input.reservationSources.scriptReservations;
const holdings = Object.fromEntries(
  Object.entries(quarryRaw.input.holdings).map(([id, resource]) => [
    id,
    resource.currentQuantity,
  ]),
);
assert.deepEqual(holdings, {
  Lumber: 50,
  Stone: 10,
});

const candidates = {
  [quarryKey]: { ...quarryOrder.input, ...quarryOrder.output },
  [housingKey]: { ...housingOrder.input, ...housingOrder.output },
};
const affordability = {
  [quarryKey]: quarryAffordability.output.affordable,
  [housingKey]: housingAffordability.output.affordable,
};
const knowledgeGate = housingBuildGate.input.knowledgeGate;
const replayHousingCompetition = housingCompetition.output;
const comparisonTargets = (scenario, key) => {
  const nativeTargets = scenario.reservations.nativeQueue.targets;
  const scriptTargets = scenario.reservations.scriptReservations.targets;
  return [...nativeTargets, ...scriptTargets].filter(
    (target) => target.name !== key,
  );
};

function makeResourceSource() {
  return {
    readResources(ids) {
      return {
        resources: new Map(
          [...ids].map((id) => [
            id,
            {
              present: Object.hasOwn(holdings, id),
              unlocked: Object.hasOwn(holdings, id),
              amount: holdings[id] ?? 0,
              max: 500,
              rateOfChange: 0,
              storageRatio: (holdings[id] ?? 0) / 500,
            },
          ]),
        ),
      };
    },
  };
}

function runCandidate(scenario, key) {
  const captured = candidates[key];
  const buildCandidate = {
    key,
    weighting: captured.weighting,
    cost: captured.cost,
    ignored: false,
    important: captured.important,
    knowledge: captured.knowledge,
    ...(captured.pool === null ? {} : { pool: captured.pool }),
  };
  const setup = {
    candidates: [buildCandidate],
    consumptionMode: "unlimited",
    buildIfStorageFull: false,
    ignoreZeroRate: false,
    saveWhiteholeGems: false,
    knowledgeGate,
  };
  const reader = createCapturedCostConflictReader({
    resources: makeResourceSource(),
    reservations: {
      readReservations: () => scenario.reservations.nativeQueue,
    },
    additionalReservations: {
      readReservations: () => scenario.reservations.scriptReservations,
    },
  });
  const raw = reader.evaluate(buildCandidate.cost, buildCandidate.pool, key);
  const gateSample = planBuildGate(
    setup,
    0,
    { affordable: affordability[key] },
    initialBuildLoopState(),
  );
  const conflict =
    raw.status === "conflict"
      ? {
          unavailable: false,
          targetNames: raw.conflict.targetNames,
          resourceNames: raw.conflict.resourceNames,
          targetCause: raw.conflict.targetCause,
        }
      : raw.status === "unavailable"
        ? {
            unavailable: true,
            targetNames: [],
            resourceNames: [],
            targetCause: "",
          }
        : null;
  const conflictPlan =
    gateSample.kind === "conflict-check"
      ? planBuildConflict(setup, 0, {
          conflict,
          important: buildCandidate.important,
        })
      : null;
  const knowledgeExceptionApplicable =
    conflict !== null &&
    !conflict.unavailable &&
    buildCandidate.knowledge &&
    conflict.targetCause === "Saving" &&
    isKnowledgeGated(knowledgeGate);
  let competitionPlan = null;
  if (conflictPlan?.kind === "proceed" && key === quarryKey) {
    // Quarry was captured at index 0, so it has no higher competitor.
    competitionPlan = planBuildCompetition(
      setup,
      0,
      { affordability: {}, resources: {} },
      gateSample.state,
    );
  }
  return {
    candidate: {
      key,
      orderingIndex: captured.orderingIndex,
      weighting: captured.weighting,
      cost: captured.cost,
      affordable: affordability[key],
      important: captured.important,
      knowledge: captured.knowledge,
      pool: captured.pool,
    },
    reservationTargetsAfterSameTargetExclusion: comparisonTargets(
      scenario,
      key,
    ),
    holdings,
    rawConflict: raw,
    importantOverrideUsed: buildCandidate.important && raw.status !== "none",
    knowledgeExceptionApplicable,
    knowledgeExceptionUsed:
      knowledgeExceptionApplicable && conflictPlan?.kind === "proceed",
    pureBuildGate: {
      affordability: gateSample.kind,
      conflict: conflictPlan?.kind ?? "not-reached",
      executableBuildDecision:
        competitionPlan?.kind === "build" ? competitionPlan.decision : null,
      competition:
        competitionPlan?.kind ??
        (conflictPlan?.kind === "proceed"
          ? "not-evaluated-insufficient-order-context"
          : "not-reached"),
    },
  };
}

const farmTarget = originalScript.targets.find(
  (target) => target.name === "city-farm" && target.cause === "Saving",
);
assert.ok(farmTarget, "P40 trace is missing the completed Farm reserve");

const scenarios = [
  {
    id: "A",
    name: "Historical",
    status: "observed P40 input",
    reservations: {
      nativeQueue: originalNative,
      scriptReservations: originalScript,
    },
  },
  {
    id: "B",
    name: "No previous-cycle saving reserve",
    status: "counterfactual; Farm commitment retained in reality",
    reservations: {
      nativeQueue: originalNative,
      scriptReservations: {
        ...originalScript,
        targets: originalScript.targets.filter(
          (target) => target !== farmTarget,
        ),
      },
    },
  },
  {
    id: "C",
    name: "Explicit current-Quarry reservation",
    status:
      "unapproved diagnostic proposal; not a Construction-owner commitment",
    reservations: {
      nativeQueue: originalNative,
      scriptReservations: {
        ...originalScript,
        targets: [
          ...originalScript.targets.filter((target) => target !== farmTarget),
          {
            name: quarryKey,
            cause: "Saving",
            cost: { Lumber: 50, Stone: 10 },
          },
        ],
      },
    },
  },
].map((scenario) => {
  const candidates = {
    quarry: runCandidate(scenario, quarryKey),
    housing: runCandidate(scenario, housingKey),
  };
  if (scenario.id === "A") {
    candidates.housing.pureBuildGate.competition =
      replayHousingCompetition.kind;
    candidates.housing.pureBuildGate.executableBuildDecision =
      replayHousingCompetition.decision;
    candidates.housing.pureBuildGate.competitionEvidence =
      "captured P40 pure planner output";
  }
  if (scenario.id === "B") {
    candidates.housing.pureBuildGate.possibleLaterCandidate = true;
    candidates.housing.pureBuildGate.competitionEvidence =
      "not evaluated after a hypothetical Quarry decision; the captured historical competition used unchanged pre-action inputs";
  }
  return {
    ...scenario,
    reservationInputs: scenario.reservations,
    candidates,
    nativeActionExecuted: scenario.id === "A" ? housingKey : null,
  };
});

assert.equal(scenarios[0].candidates.quarry.rawConflict.status, "conflict");
assert.equal(scenarios[0].candidates.housing.rawConflict.status, "none");
assert.equal(scenarios[1].candidates.quarry.pureBuildGate.conflict, "proceed");
assert.equal(scenarios[1].candidates.quarry.pureBuildGate.competition, "build");
assert.equal(scenarios[1].candidates.housing.pureBuildGate.conflict, "proceed");
assert.equal(scenarios[2].candidates.quarry.rawConflict.status, "none");
assert.equal(scenarios[2].candidates.housing.rawConflict.status, "conflict");

const productionFixCommit = execFileSync(
  "git",
  [
    "log",
    "-1",
    "--format=%H",
    "--",
    "src/adapters/evolve/captured-cost-conflict.ts",
  ],
  { cwd: root, encoding: "utf8" },
).trim();
const productionBaselineSource = execFileSync(
  "git",
  ["show", "990946a5:src/adapters/evolve/captured-cost-conflict.ts"],
  { cwd: root, encoding: "utf8" },
);
const output = {
  experiment: "P41 reservation correctness and p720 counterfactual",
  schemaVersion: 1,
  pinnedGame: trace.pinnedGame,
  productionSourceChange: {
    path: "src/adapters/evolve/captured-cost-conflict.ts",
    baselineCommit: "990946a5",
    baselineSha256: hash(productionBaselineSource),
    fixedCommit: productionFixCommit,
    fixedSha256: hash(
      await readFile(
        path.join(root, "src/adapters/evolve/captured-cost-conflict.ts"),
      ),
    ),
    behavior:
      "Missing holdings now return status unavailable. Construction already maps that status into an unavailable BuildConflictView; no valid reservation arithmetic or owner policy changed.",
  },
  exactReplayTraceSha256: hash(traceText),
  capturedInputs: {
    holdings,
    candidates,
    affordability,
    knowledgeGate,
    historicalNativeQueue: originalNative,
    historicalScriptReservations: originalScript,
    completedFarmReservation: farmTarget,
    replayHistoricalHousingCompetition: replayHousingCompetition,
  },
  replayParity: {
    decision: trace.decision,
    stops: {
      p36At688: {
        control: (({ period, reason, targetId, shortage }) => ({
          period,
          reason,
          targetId,
          shortage,
        }))(trace.purchasePath.p36StopAt688.control),
        traced: (({ period, reason, targetId, shortage }) => ({
          period,
          reason,
          targetId,
          shortage,
        }))(trace.purchasePath.p36StopAt688.traced),
        equal: trace.replayNeutrality.p688StopEqual,
      },
      p38At728: {
        control: (({ period, reason, clicks, remainingClicks }) => ({
          period,
          reason,
          clicks,
          remainingClicks,
        }))(trace.purchasePath.p728Stop.control),
        traced: (({ period, reason, clicks, remainingClicks }) => ({
          period,
          reason,
          clicks,
          remainingClicks,
        }))(trace.purchasePath.p728Stop.traced),
        equal: trace.replayNeutrality.p728StopEqual,
      },
    },
    actions: {
      native: {
        counts: trace.replayNeutrality.nativeActionCounts,
        sequenceEqual: trace.replayNeutrality.nativeActionSequenceEqual,
      },
      housingAt720: {
        counts: trace.replayNeutrality.housingActionCountAt720,
        equal: trace.replayNeutrality.candidatePurchasesEqual,
      },
      p38Gather: {
        controlCount: trace.purchasePath.p38GatherActions.controlCount,
        tracedCount: trace.purchasePath.p38GatherActions.tracedCount,
        exact: trace.purchasePath.p38GatherActions.exact,
        sequenceSha256: hash(
          JSON.stringify(trace.purchasePath.p38GatherActions.events),
        ),
      },
    },
    checkpoints: {
      buildingCountsAndResources:
        trace.replayNeutrality
          .buildingCountsAndResourcesEqualAtEveryRetainedCheckpoint,
      researchGrants:
        trace.replayNeutrality.researchGrantsEqualAtEveryRetainedCheckpoint,
      jobsAllocations:
        trace.replayNeutrality.jobsAllocationsEqualAtEveryRetainedCheckpoint,
      controlUsage:
        trace.replayNeutrality.controlUsageEqualAtEveryRetainedCheckpoint,
      rng: trace.replayNeutrality.rngEqualAtEveryRetainedCheckpoint,
      exportedSaveHashes:
        trace.replayNeutrality.exportedSaveHashesEqualAtEveryRetainedCheckpoint,
    },
    p10000: {
      finalExportSha256Equal: trace.replayNeutrality.p10000FinalExportHashEqual,
      finalRngEqual: trace.replayNeutrality.p10000FinalRngEqual,
    },
    performance: trace.performance,
    sourceReadsAdded: trace.provenance.sourceReadsAdded,
  },
  scenarios,
  interpretation: {
    historicalNativePurchase: "Housing purchased at p720 in the exact replay",
    scenarioB: {
      quarry: "Pure Build permits Quarry under the captured pre-action inputs",
      housing:
        "Housing passes its reservation gate and remains a possible later candidate on the captured snapshot; no sequential action is simulated",
      nativePurchase:
        "Not predicted. If Quarry succeeds first at captured cost, 50 Lumber and 10 Stone are consumed, leaving Housing unaffordable at the captured 23 Lumber price",
    },
    scenarioC: {
      quarry: "Same-target exclusion removes Quarry's own hypothetical reserve",
      housing: "Housing is blocked by the hypothetical Quarry Saving reserve",
      authority:
        "This reservation is unapproved and is not an actual Construction-owner commitment",
    },
    importantOverride:
      "The observed Quarry and Housing candidates are both non-important. Build's existing important override remains capable of bypassing known and unavailable conflicts.",
  },
};

await writeFile(
  outputPath,
  await prettier.format(JSON.stringify(output), { parser: "json" }),
);
console.log(`Wrote ${path.relative(root, outputPath)}`);
