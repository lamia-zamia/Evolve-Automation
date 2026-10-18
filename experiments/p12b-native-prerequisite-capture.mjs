import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

import {
  createChromiumRunner,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";
import { createEffectiveCapturedTechPrerequisiteSnapshot } from "../src/adapters/evolve/progression/research/captured-tech-applicability.ts";
import { planNativeResearchPrerequisites } from "../src/domain/progression/research-prerequisite-planning.ts";
import { classifyMandatoryNativeResearchObligations } from "../src/domain/progression/research-prerequisite-obligations.ts";
import { evaluateResearchGoalCandidates } from "../src/domain/progression/research-goal-candidates.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const savePath = path.join(
  root,
  "test-artifacts/benchmark/slice0/saves/stage2f-fixed-progression-export.json",
);
const settingsPath = path.join(
  root,
  "test-artifacts/benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json",
);
const gamePath = path.join(root, "test-artifacts/game/evolve-deadspace.js");
const tmp = path.join(root, "test-artifacts/benchmark/tmp");
const outputPath = process.argv
  .find((value) => value.startsWith("--out="))
  ?.slice(6);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const baselineCommit = "a69d615f09cd012caddd0235d70ce036ea1dda53";
const seed = 42;
const epoch = "2026-09-21T00:00:00.000Z";
const periods = 200;

const baselineBundle = execFileSync(
  "git",
  ["show", `${baselineCommit}:evolve_automation.user.js`],
  { cwd: root, maxBuffer: 8 * 1024 * 1024 },
);
const candidateBundle = await readFile(
  path.join(root, "evolve_automation.user.js"),
);
assert.equal(
  hash(baselineBundle),
  "517642d0c647c29b28795e7ff7acd4a4ddedd4a0b3435a85602935e7336cf1e7",
);
assert.notEqual(hash(candidateBundle), hash(baselineBundle));
await writeFile(path.join(tmp, "p12b-baseline.user.js"), baselineBundle);
await writeFile(path.join(tmp, "p12b-candidate.user.js"), candidateBundle);
const saveText = await readFile(savePath, "utf8");
const sourceSettingsText = await readFile(settingsPath, "utf8");
const settings = { ...JSON.parse(sourceSettingsText), autoResearch: true };
const diagnosticSettings = {
  ...settings,
  autoBuild: false,
  autoResearch: false,
  autoJobs: false,
  autoCraftsmen: false,
  autoCraft: false,
  autoFactory: false,
  autoStorage: false,
  autoPrestige: false,
};
const metadata = (
  await readFile(path.join(root, "src/userscript.meta.js"), "utf8")
).trimEnd();
const testBundle = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["src/main.ts"],
  bundle: true,
  write: false,
  banner: {
    js: `${metadata}\n\nif (globalThis.__EA_TEST_HOOKS__) globalThis.__EA_TEST_HOOKS__ = { ...globalThis.__EA_TEST_HOOKS__ };\n// Generated for P12B read-only prerequisite capture.`,
  },
  platform: "browser",
  target: ["esnext"],
  define: {
    "globalThis.__EA_TEST_SURFACE_ENABLED__": "true",
    __EA_TEST_SURFACE_ENABLED__: "true",
  },
  minifySyntax: true,
  treeShaking: true,
});
await writeFile(
  path.join(tmp, "p12b-candidate-test.user.js"),
  testBundle.outputFiles[0].contents,
);

const runner = await createChromiumRunner({ game: gamePath });

function summarizeCatalog(catalog) {
  const definitions = catalog?.definitions ?? [];
  const offers = catalog?.offers ?? [];
  const offerIds = new Set(offers.map((offer) => offer.elementId));
  const observations = definitions.flatMap(
    (definition) => definition.computedRequirements ?? [],
  );
  const statusCounts = Object.groupBy(observations, (entry) => entry.status);
  return {
    enabled: catalog?.captureEnabled === true,
    current: catalog?.current === true,
    source: catalog?.source,
    captureElapsedMs: catalog?.captureElapsedMs,
    gatherMode: catalog?.gatherMode ?? "unset",
    rootGeneration: catalog?.rootGeneration,
    progressionEpoch: catalog?.progressionEpoch,
    offerObservationIds: [
      ...new Set(offers.map((offer) => offer.offerObservationId)),
    ],
    bindingFresh:
      catalog?.current === true &&
      offers.every((offer) => offer.generation >= 0),
    offerBindingGenerations: [
      ...new Set(offers.map((offer) => offer.generation)),
    ],
    definitions: definitions.length,
    offeredActions: offers.length,
    nativeCallbacksObserved: observations.some(
      (entry) => entry.nativeCallCount > 0,
    ),
    nativeCalls: observations.reduce(
      (sum, entry) => sum + entry.nativeCallCount,
      0,
    ),
    validatedComputedObservations: observations.filter(
      (entry) =>
        entry.status === "observed" &&
        entry.complete &&
        entry.validation === "valid",
    ).length,
    computedStatuses: Object.fromEntries(
      Object.entries(statusCounts).map(([status, entries]) => [
        status,
        entries.length,
      ]),
    ),
    captureGenerations: [
      ...new Set(observations.map((entry) => entry.captureGeneration)),
    ],
    missingCallbackActionIds: observations
      .filter((entry) => entry.status === "missing")
      .map((entry) => entry.actionId),
    callbackRestoration:
      catalog?.current === true && catalog?.objectKeysRestored === true
        ? "passed"
        : "failed-or-unavailable",
    unofferedComputedActionIds: definitions
      .filter(
        (definition) =>
          !offerIds.has(definition.actionId) &&
          (definition.computedRequirements?.length ?? 0) > 0,
      )
      .map((definition) => definition.actionId),
    computedRequirements: observations,
    targetMadRequirementStatus:
      definitions.find((definition) => definition.actionId === "tech-mad")
        ?.computedRequirements?.[0]?.status ?? "no-computed-observation",
    targetMadPrerequisites: definitions.find(
      (definition) => definition.actionId === "tech-mad",
    )?.computedRequirements?.[0]?.requirements,
    targetMadEligibility: definitions.find(
      (definition) => definition.actionId === "tech-mad",
    )?.eligibility,
    madTargetCondition: catalog?.madTargetCondition,
    resultCompleteness: {
      complete: observations.filter(
        (entry) =>
          entry.status === "observed" &&
          entry.complete &&
          entry.validation === "valid",
      ).length,
      partial: observations.filter((entry) => entry.status === "missing")
        .length,
      invalid: observations.filter((entry) =>
        ["invalid", "threw", "absent", "inconsistent"].includes(entry.status),
      ).length,
      unavailable:
        catalog?.captureEnabled === true && catalog?.current !== true
          ? 1
          : catalog?.captureEnabled === true
            ? 0
            : 1,
    },
    madTargetCondition: catalog?.madTargetCondition,
  };
}

function evaluatePlanner(catalog) {
  if (
    !catalog?.current ||
    catalog.definitions === undefined ||
    catalog.offers === undefined
  )
    return {
      status: "unavailable",
      reason: "current catalog evidence unavailable",
    };
  const context = {
    rootGeneration: catalog.rootGeneration,
    progressionEpoch: catalog.progressionEpoch,
  };
  const snapshot = createEffectiveCapturedTechPrerequisiteSnapshot(
    catalog.definitions,
    context,
  );
  const grantLevels = new Map(catalog.grantLevels ?? []);
  const applicability = new Map(catalog.applicability ?? []);
  const offers = catalog.offers;
  const offerGenerations = new Map(
    offers.map((offer) => [offer.elementId, offer.generation]),
  );
  const graph = planNativeResearchPrerequisites({
    targetActionId: "tech-mad",
    definitions: snapshot.definitions,
    grantLevels,
    offeredActionIds: new Set(offers.map((offer) => offer.elementId)),
    offerGenerations,
    cycle: 0,
    progressionEpoch: context.progressionEpoch,
    rootGeneration: context.rootGeneration,
    maxDepth: 16,
    maxActions: 256,
    applicabilityByActionId: applicability,
  });
  const obligations = classifyMandatoryNativeResearchObligations(graph, {
    targetCurrentlyEligible: catalog.madTargetCondition === "eligible",
    definitions: snapshot.definitions,
    grantLevels,
    applicabilityByActionId: applicability,
    offeredActionIds: new Set(offers.map((offer) => offer.elementId)),
  });
  const evaluation = evaluateResearchGoalCandidates({
    goalId: "prestige:mad",
    targetActionId: "tech-mad",
    goalSatisfied: graph.targetStatus === "satisfied",
    graph,
    cycle: 0,
    progressionEpoch: context.progressionEpoch,
    rootGeneration: context.rootGeneration,
    obligations,
    offers: offers.map((offer, index) => ({
      actionId: offer.elementId,
      grantTechnology: offer.grantTechnology,
      grantLevel: offer.grantLevel,
      index,
      generation: offer.generation,
      cost: offer.cost,
      nativeAffordable: offer.nativeAffordable,
      resourceAffordable: undefined,
      hasCostConflict: undefined,
      hasExplicitExclusion: undefined,
    })),
    baselineSelectedActionId: undefined,
  });
  const requirementStatuses = Object.groupBy(
    graph.requirements,
    (gate) => gate.status,
  );
  const targetDefinition = snapshot.definitions?.find(
    (definition) => definition.actionId === "tech-mad",
  );
  const targetRequirementIds = new Set(
    targetDefinition?.prerequisites.kind === "declared"
      ? targetDefinition.prerequisites.requirements.map(
          ({ technologyId, requiredLevel }) =>
            `research:${technologyId}:${requiredLevel}`,
        )
      : [],
  );
  return {
    snapshotDefinitions: snapshot.definitions?.length,
    computedEffectiveDefinitions: snapshot.definitions?.filter((definition) =>
      catalog.definitions
        .find((source) => source.actionId === definition.actionId)
        ?.computedRequirements?.some(
          (entry) =>
            entry.rootGeneration === context.rootGeneration &&
            entry.progressionEpoch === context.progressionEpoch &&
            entry.status === "observed" &&
            entry.complete &&
            entry.validation === "valid",
        ),
    ).length,
    graph: {
      targetStatus: graph.targetStatus,
      dependencyEvidence: graph.dependencyEvidence,
      actionableFrontier: graph.actionableFrontier,
      requirementCount: graph.requirements.length,
      requirementStatusCounts: Object.fromEntries(
        Object.entries(requirementStatuses).map(([status, entries]) => [
          status,
          entries.length,
        ]),
      ),
      targetRequirements: targetDefinition?.prerequisites,
      directRequirementGates: graph.requirements.filter((gate) =>
        targetRequirementIds.has(gate.id),
      ),
      terminalAction: graph.actions.find(
        (action) => action.actionId === "tech-mad",
      ),
      unavailableFacts: graph.unavailableFacts,
      freshnessCurrent:
        graph.freshness.rootGeneration === context.rootGeneration &&
        graph.freshness.progressionEpoch === context.progressionEpoch &&
        graph.freshness.offerGenerations?.length === offers.length,
    },
    obligations: {
      status: obligations.status,
      mandatoryActionIds: obligations.mandatoryActionIds,
      alternativeGroups: obligations.alternativeGroups,
      reasons: obligations.reasons,
    },
    frontierSelection: evaluation.frontierSelection,
    candidateCount: evaluation.candidates.length,
  };
}

async function run(label, bundle, captureEnabled = false, diagnostic = false) {
  const session = await runner.openSession({
    bundle,
    save: parseSave(saveText),
    settings: diagnostic ? diagnosticSettings : settings,
    seed,
    epoch,
    perf: true,
    forwardPerfSummary: true,
    nativeTrace: true,
  });
  try {
    const captureWallStart = performance.now();
    const catalog = diagnostic
      ? await session.evaluate((enable) => {
          const hooks = window.__EA_TEST_HOOKS__;
          const originalObjectKeys = Object.keys;
          if (enable) hooks.computedResearchRequirementsCapture = true;
          const captureStarted = performance.now();
          const result = hooks.readCurrentResearchCatalog("tech-mad", true);
          const captureElapsedMs = performance.now() - captureStarted;
          hooks.computedResearchRequirementsCapture = false;
          return {
            ...result,
            captureEnabled: enable,
            captureElapsedMs,
            objectKeysRestored: Object.keys === originalObjectKeys,
            gatherMode: hooks.gatherIntervention?.resourceClaimMode ?? "unset",
          };
        }, captureEnabled)
      : undefined;
    const diagnosticWallMs = diagnostic
      ? performance.now() - captureWallStart
      : undefined;
    if (diagnostic)
      assert.equal(catalog?.current, true, `${label} catalog must be fresh`);
    if (diagnostic && captureEnabled)
      assert.ok(
        (catalog?.definitions ?? []).some(
          (definition) => (definition.computedRequirements ?? []).length > 0,
        ),
        "explicit request must capture native computed requirements",
      );
    await session.advance(periods);
    const state = await session.readState();
    const diagnostics = await session.diagnostics();
    const counts = Object.create(null);
    const phases = Object.create(null);
    for (const [, summary, counters] of diagnostics.perfSummaries ?? []) {
      for (const [name, counter] of Object.entries(counters ?? {}))
        counts[name] = (counts[name] ?? 0) + counter.total;
      for (const [name, phase] of Object.entries(summary ?? {})) {
        if (
          !name.startsWith("research.computed-requirements") &&
          !name.startsWith("goal.mad.")
        )
          continue;
        const prior = phases[name] ?? { count: 0, totalMs: 0, maxMs: 0 };
        phases[name] = {
          count: prior.count + phase.count,
          totalMs: prior.totalMs + phase.totalMs,
          maxMs: Math.max(prior.maxMs, phase.maxMs),
        };
      }
    }
    return {
      label,
      stateHash: hash(JSON.stringify(state)),
      state,
      controlUsage: diagnostics.controlUsage,
      nativeInvocations: diagnostics.nativeInvocations,
      counts: diagnostics.counts,
      workTicks: diagnostics.workTicks,
      researchDrawCounts: Object.fromEntries(
        Object.entries(counts).filter(
          ([name]) =>
            name.startsWith("research.observation.") ||
            name === "discovery.actual-draw research-catalog",
        ),
      ),
      phases,
      catalog: diagnostic ? summarizeCatalog(catalog) : undefined,
      planner:
        diagnostic && catalog?.current ? evaluatePlanner(catalog) : undefined,
      captureElapsedMs: catalog?.captureElapsedMs,
      diagnosticWallMs,
      runtimeEvaluation: diagnostic
        ? await session.evaluate(() => {
            const evaluation =
              window.__EA_TEST_HOOKS__?.researchGoalCandidateEvaluation;
            return evaluation === undefined
              ? undefined
              : {
                  frontierSelection: evaluation.frontierSelection,
                  candidates: evaluation.candidates.map(
                    ({
                      actionId,
                      relevance,
                      dependencyRelation,
                      pathApplicability,
                      frontierTime,
                    }) => ({
                      actionId,
                      relevance,
                      dependencyRelation,
                      pathApplicability,
                      frontierTime,
                    }),
                  ),
                };
          })
        : undefined,
    };
  } finally {
    await session.close();
  }
}

try {
  const upstreamCommit = execFileSync(
    "git",
    [
      "-C",
      runner.inputs.upstream,
      "rev-parse",
      `${runner.inputs.gameSnapshot.commit}^{commit}`,
    ],
    { encoding: "utf8" },
  ).trim();
  assert.equal(upstreamCommit, "db38e2af831907d49aeb5348d678d8d8745d6c3f");
  const baseline = await run(
    "production-baseline",
    path.join(tmp, "p12b-baseline.user.js"),
  );
  const candidate = await run(
    "production-candidate",
    path.join(tmp, "p12b-candidate.user.js"),
  );
  const existingMode = await run(
    "p12a-existing-mode",
    path.join(tmp, "p12b-candidate-test.user.js"),
    false,
    true,
  );
  const independentCapture = await run(
    "explicit-independent-capture",
    path.join(tmp, "p12b-candidate-test.user.js"),
    true,
    true,
  );
  assert.deepEqual(
    candidate.state,
    baseline.state,
    "ordinary production exported saves must match",
  );
  assert.deepEqual(
    candidate.controlUsage,
    baseline.controlUsage,
    "ordinary production native control usage must match",
  );
  assert.deepEqual(
    candidate.nativeInvocations,
    baseline.nativeInvocations,
    "ordinary production invocation order must match",
  );
  assert.deepEqual(
    candidate.researchDrawCounts,
    baseline.researchDrawCounts,
    "ordinary production Research draw counts must match",
  );
  assert.equal(
    existingMode.stateHash,
    independentCapture.stateHash,
    "explicit capture must preserve the exported save relative to P12A observation mode",
  );
  assert.equal(
    hash(JSON.stringify(existingMode.nativeInvocations)),
    hash(JSON.stringify(independentCapture.nativeInvocations)),
    "independent capture must preserve test-surface native invocation order",
  );
  assert.equal(
    hash(JSON.stringify(existingMode.controlUsage)),
    hash(JSON.stringify(independentCapture.controlUsage)),
    "independent capture must preserve test-surface control usage",
  );
  assert.equal(
    independentCapture.nativeInvocations.some(
      (entry) =>
        entry.elementId.startsWith("tech-") && entry.method === "action",
    ),
    false,
    "independent capture must not invoke a Research purchase",
  );
  assert.equal(
    independentCapture.catalog?.gatherMode,
    "unset",
    "independent capture must not configure Gather intervention",
  );
  assert.equal(existingMode.catalog?.enabled, false);
  assert.equal(
    existingMode.catalog?.validatedComputedObservations ?? 0,
    0,
    "P12A mode must reproduce the zero-capture result",
  );
  assert.ok(
    independentCapture.catalog?.nativeCallbacksObserved,
    "explicit capture must observe native callbacks",
  );
  const capturedById = new Map(
    independentCapture.catalog.computedRequirements.map((entry) => [
      entry.actionId,
      entry,
    ]),
  );
  assert.deepEqual(
    capturedById.get("tech-lasers")?.requirements,
    [
      { technologyId: "high_tech", requiredLevel: 8 },
      { technologyId: "supercollider", requiredLevel: 1 },
      { technologyId: "space", requiredLevel: 3 },
      { technologyId: "elerium", requiredLevel: 1 },
    ],
    "the standard pinned Stage 3F fixture must retain native Lasers requirements",
  );
  assert.deepEqual(
    capturedById.get("tech-quantum_computing")?.requirements,
    [
      { technologyId: "high_tech", requiredLevel: 10 },
      { technologyId: "nano", requiredLevel: 1 },
    ],
    "the standard pinned Stage 3F fixture must retain native Quantum Computing requirements",
  );
  const report = {
    runner: "tools/chromium-evolve-runner.mjs",
    upstreamCommit,
    snapshotCommit: runner.inputs.gameSnapshot.commit,
    inputs: {
      saveSha256: hash(saveText),
      settingsSha256: hash(JSON.stringify(settings)),
      periods,
      seed,
      epoch,
    },
    identities: {
      baselineCommit,
      baselineSha256: hash(baselineBundle),
      candidateSha256: hash(candidateBundle),
      candidateTestSha256: hash(testBundle.outputFiles[0].contents),
    },
    productionParity: {
      exportedSaveSha256: baseline.stateHash,
      baselineAndCandidateEqual: baseline.stateHash === candidate.stateHash,
      controlUsageEqual:
        JSON.stringify(baseline.controlUsage) ===
        JSON.stringify(candidate.controlUsage),
      orderedNativeInvocationsEqual:
        JSON.stringify(baseline.nativeInvocations) ===
        JSON.stringify(candidate.nativeInvocations),
      researchDrawCountsEqual:
        JSON.stringify(baseline.researchDrawCounts) ===
        JSON.stringify(candidate.researchDrawCounts),
      baselineResearchDrawCounts: baseline.researchDrawCounts,
      candidateResearchDrawCounts: candidate.researchDrawCounts,
    },
    existingP12AMode: {
      catalog: existingMode.catalog,
      frontier: existingMode.runtimeEvaluation?.frontierSelection,
      planner: existingMode.planner,
    },
    explicitIndependentCapture: {
      catalog: independentCapture.catalog,
      planner: independentCapture.planner,
      captureCallWallMs: independentCapture.diagnosticWallMs,
      explicitlyForcedDiagnosticDraws: 1,
      stateHash: independentCapture.stateHash,
      statePreservedAgainstP12AMode:
        independentCapture.stateHash === existingMode.stateHash,
      nativeInvocationsEqualToP12AMode:
        hash(JSON.stringify(independentCapture.nativeInvocations)) ===
        hash(JSON.stringify(existingMode.nativeInvocations)),
      controlUsageEqualToP12AMode:
        hash(JSON.stringify(independentCapture.controlUsage)) ===
        hash(JSON.stringify(existingMode.controlUsage)),
      researchActionInvocations: independentCapture.nativeInvocations.filter(
        (entry) =>
          entry.elementId.startsWith("tech-") && entry.method === "action",
      ),
    },
    p12aDiagnosticObservation: {
      captureCallWallMs: existingMode.diagnosticWallMs,
      explicitlyForcedDiagnosticDraws: 1,
      stateHash: existingMode.stateHash,
    },
    ordinaryRunDiagnostics: {
      baseline: baseline.phases,
      candidate: candidate.phases,
      candidateTestWorkTicks: existingMode.workTicks,
    },
  };
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (outputPath === undefined) process.stdout.write(output);
  else await writeFile(path.resolve(outputPath), output);
} finally {
  await runner.close();
}
