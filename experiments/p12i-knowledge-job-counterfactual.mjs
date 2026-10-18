import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import {
  createChromiumRunner,
  decodeExport,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";
import {
  P12G_PINNED_COMMIT,
  validateP12GCapture,
} from "./p12g-capture-contract.mjs";
import { readCapturedJobStrategyPair } from "../src/adapters/evolve/civic/captured-job-strategy.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gamePath = path.join(root, "test-artifacts/game/evolve-deadspace.js");
const bundlePath = path.join(
  root,
  "test-artifacts/benchmark/tmp/p12g-test.user.js",
);
const productionBundlePath = path.join(root, "evolve_automation.user.js");
const capturePath = path.join(
  root,
  "test-artifacts/benchmark/tmp/p12h-reviewed-capture.json",
);
const settingsPath = path.join(
  root,
  "test-artifacts/benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json",
);
const savePath = path.join(
  root,
  "test-artifacts/benchmark/slice0/saves/stage2f-fixed-progression-export.json",
);
const outputPath = path.join(
  root,
  "test-artifacts/benchmark/tmp/p12i-knowledge-job-counterfactual.json",
);
const reportPath = path.join(
  root,
  "experiments/p12i-knowledge-job-counterfactual.md",
);
const seed = 42;
const epoch = "2026-09-21T00:00:00.000Z";
const horizon = 100;
const hash = (value) => createHash("sha256").update(value).digest("hex");

function activeAssignments(state) {
  return Object.fromEntries(
    Object.entries(state.civic)
      .filter(
        ([, job]) =>
          job &&
          typeof job === "object" &&
          Number.isFinite(job.workers) &&
          job.workers > 0,
      )
      .map(([id, job]) => [id, { workers: job.workers, maximum: job.max }]),
  );
}

const [
  gameBytes,
  bundleBytes,
  productionBundleBytes,
  saveText,
  settingsText,
  captureText,
] = await Promise.all([
  readFile(gamePath),
  readFile(bundlePath),
  readFile(productionBundlePath),
  readFile(savePath, "utf8"),
  readFile(settingsPath, "utf8"),
  readFile(capturePath, "utf8"),
]);
const capture = JSON.parse(captureText);
const settings = {
  ...JSON.parse(settingsText),
  autoResearch: true,
  autoSmelter: true,
};
const gameHash = hash(gameBytes);
const bundleHash = hash(bundleBytes);
const productionBundleHash = hash(productionBundleBytes);
const saveHash = hash(saveText);
const harnessHash = hash(
  Buffer.concat(
    await Promise.all(
      [
        path.join(root, "experiments/p12g-controlled-production-marginal.mjs"),
        path.join(root, "experiments/p12g-capture-contract.mjs"),
        path.join(root, "tools/chromium-evolve-runner.mjs"),
        path.join(root, "tools/chromium/bridge.js"),
        path.join(root, "tools/chromium/page-server.mjs"),
        path.join(root, "tools/chromium/chrome.mjs"),
      ].map((file) => readFile(file)),
    ),
  ),
);
assert.equal(capture.inputs?.pinnedUpstreamCommit, P12G_PINNED_COMMIT);
assert.equal(capture.inputs?.gameSnapshotSha256, gameHash);
assert.equal(capture.inputs?.testBundleSha256, bundleHash);
assert.equal(capture.inputs?.startingSaveSha256, saveHash);
assert.equal(capture.inputs?.seed, seed);
assert.equal(capture.inputs?.epoch, epoch);
assert.equal(
  capture.inputs?.effectiveSettingsSha256,
  hash(JSON.stringify(settings)),
);
assert.equal(capture.inputs?.testHarnessSha256, harnessHash);
validateP12GCapture(capture, capture.inputs);

const savedState = decodeExport(capture.exportSave);
const savedJobs = Object.fromEntries(
  Object.entries(savedState.civic)
    .filter(
      ([, job]) =>
        job && typeof job === "object" && Number.isFinite(job.workers),
    )
    .map(([id, job]) => [
      id,
      {
        workers: job.workers,
        maximum: job.max,
        displayed: job.display,
        managed:
          settings[`job_${id}`] === true ||
          (settings[`job_${id}`] === undefined && settings.autoJobs === true),
      },
    ]),
);
const unemployed = savedJobs.unemployed?.workers;
const scientist = savedJobs.scientist;
const initialFood = savedState.resource.Food;
const initialKnowledge = savedState.resource.Knowledge;
const offer = capture.currentOfferEvidence.offer;
const targetPrice = offer.cost.Knowledge;
const sourceProvenance = {
  pinnedCommit: capture.inputs.pinnedUpstreamCommit,
  gameSnapshotSha256: gameHash,
  captureSha256: capture.exportSaveSha256,
  capturePeriod: capture.period,
  offer: {
    actionId: offer.elementId,
    generation: offer.generation,
    cost: offer.cost,
  },
  assignments: savedJobs,
  totalPopulation: savedState.race.zonePop,
  currentFood: { amount: initialFood.amount, capacity: initialFood.max },
  currentKnowledge: {
    amount: initialKnowledge.amount,
    capacity: initialKnowledge.max,
  },
  normalJobsPermission: settings.autoJobs === true,
  normalResearchPermission: settings.autoResearch === true,
  scientistJobPermission: settings.job_scientist === true,
};
const targetAtCapacity =
  scientist !== undefined &&
  scientist.maximum >= 0 &&
  scientist.workers >= scientist.maximum;
const hasIdleWorker = Number.isFinite(unemployed) && unemployed > 0;

const runner = await createChromiumRunner({
  game: gamePath,
  upstream: "D:/work/Evolve-DeadSpace",
});

async function replay(id, selectedBundle = bundlePath) {
  const session = await runner.openSession({
    bundle: selectedBundle,
    save: parseSave(capture.exportSave),
    settings,
    seed,
    epoch,
    nativeTrace: true,
    perf: true,
  });
  const samples = [];
  try {
    await session.evaluate(() => {
      const hooks = window.__EA_TEST_HOOKS__;
      if (!hooks) return;
      hooks.p12iJobTrace = [];
      hooks.observeJobsTrace = (event) => {
        const { root: _root, currentRoot: _currentRoot, ...safe } = event;
        hooks.p12iJobTrace.push(safe);
      };
      hooks.readPeriodForTest = () => window.__EA_RUNNER__.periods();
    });
    await session.advance(10);
    const beforeMetrics = await session.metrics();
    for (let elapsed = 1; elapsed <= horizon; elapsed += 1) {
      await session.advance(1);
      const [state, diagnostics, evidence] = await Promise.all([
        session.readState(),
        session.diagnostics(),
        session.evaluate(() => {
          const hooks = window.__EA_TEST_HOOKS__;
          return {
            jobs: hooks?.p12iJobTrace ?? [],
            catalog: hooks?.readCurrentResearchCatalog?.(
              "tech-steel_containers",
            ),
            ownerEvents: hooks?.researchOwnerSelectionEvents ?? [],
            period: window.__EA_RUNNER__.periods(),
            civic: Object.fromEntries(
              Object.entries(window.global?.civic ?? {})
                .filter(
                  ([, job]) =>
                    job &&
                    typeof job === "object" &&
                    Number.isFinite(job.workers),
                )
                .map(([jobId, job]) => [
                  jobId,
                  {
                    workers: job.workers,
                    maximum: job.max,
                    displayed: job.display,
                  },
                ]),
            ),
          };
        }),
      ]);
      const resources = Object.fromEntries(
        Object.entries(state.resource ?? {}).flatMap(([resourceId, value]) =>
          Number.isFinite(value?.amount)
            ? [
                [
                  resourceId,
                  {
                    amount: value.amount,
                    capacity: Number.isFinite(value.max) ? value.max : null,
                  },
                ],
              ]
            : [],
        ),
      );
      const targetOffer = evidence.catalog?.offers?.find(
        (row) => row.elementId === offer.elementId,
      );
      samples.push({
        period: evidence.period,
        resources,
        scientist: evidence.civic.scientist,
        offer: targetOffer,
        ownerEvents: evidence.ownerEvents,
        nativeInvocations: diagnostics.nativeInvocations ?? [],
        controlUsage: diagnostics.controlUsage,
        randomCalls: diagnostics.randomCalls,
        workTicks: diagnostics.workTicks,
        jobsTraceCount: evidence.jobs.length,
        latestJobsTrace: evidence.jobs.at(-1),
      });
    }
    const afterMetrics = await session.metrics();
    const exportedSave = await session.exportSave();
    return {
      id,
      initialResources: sourceProvenance.currentKnowledge,
      samples,
      export: exportedSave,
      finalAssignments: activeAssignments(decodeExport(exportedSave)),
      finalState: await session.readState(),
      finalDiagnostics: await session.diagnostics(),
      rendererTaskDurationSec:
        afterMetrics.TaskDuration - beforeMetrics.TaskDuration,
      rendererScriptDurationSec:
        afterMetrics.ScriptDuration - beforeMetrics.ScriptDuration,
      workTicks: (await session.diagnostics()).workTicks,
    };
  } finally {
    await session.close();
  }
}

try {
  const baseline = await replay("A");
  const repeated = await replay("A/A");
  const production = await replay("production", productionBundlePath);
  const sameExports = baseline.export === repeated.export;
  const sameInvocations =
    JSON.stringify(
      baseline.samples.map((sample) => sample.nativeInvocations),
    ) ===
    JSON.stringify(repeated.samples.map((sample) => sample.nativeInvocations));
  const sameResources =
    JSON.stringify(baseline.samples.map((sample) => sample.resources)) ===
    JSON.stringify(repeated.samples.map((sample) => sample.resources));
  const productionParity = {
    sameExports: baseline.export === production.export,
    sameResources:
      JSON.stringify(baseline.samples.map((sample) => sample.resources)) ===
      JSON.stringify(production.samples.map((sample) => sample.resources)),
    sameFinalAssignments:
      JSON.stringify(baseline.finalAssignments) ===
      JSON.stringify(production.finalAssignments),
    productionInvocationCaptureAvailable: production.samples.some(
      (sample) => sample.nativeInvocations.length > 0,
    ),
  };
  const targetInvocations =
    baseline.finalDiagnostics.nativeInvocations?.filter(
      ({ elementId }) => elementId === offer.elementId,
    ) ?? [];
  const jobTraceEvents = baseline.samples
    .filter(
      (sample, index, values) =>
        index === 0 ||
        sample.jobsTraceCount !== values[index - 1].jobsTraceCount,
    )
    .flatMap((sample) =>
      sample.latestJobsTrace === undefined ? [] : [sample.latestJobsTrace],
    );
  const nativeJobControlCalls = jobTraceEvents.flatMap(
    (event) => event.invocations ?? [],
  );
  const syntheticPair = {
    id: "p12i-pure-cost-only",
    goalId: "research-action",
    targetJob: "scientist",
    sourceJob: "quarry_worker",
    targetPermitted: true,
    targetControlBound: true,
    targetAvailable: true,
    baseline: {
      initialStateKey: "same-save",
      validityEpoch: "same-epoch",
      rootStable: true,
      controlStable: true,
      productionWindow: 10,
      jobsBefore: { scientist: 0, quarry_worker: 1 },
      jobsAfter: { scientist: 0, quarry_worker: 1 },
      resources: [
        {
          resourceId: "Knowledge",
          poolId: "city",
          amountBefore: 100,
          amountAfter: 110,
          capacityBefore: 1000,
          capacityAfter: 1000,
        },
      ],
    },
    intervention: {
      initialStateKey: "same-save",
      validityEpoch: "same-epoch",
      rootStable: true,
      controlStable: true,
      productionWindow: 10,
      jobsBefore: { scientist: 0, quarry_worker: 1 },
      jobsAfter: { scientist: 1, quarry_worker: 0 },
      resources: [
        {
          resourceId: "Knowledge",
          poolId: "city",
          amountBefore: 100,
          amountAfter: 120,
          capacityBefore: 1000,
          capacityAfter: 1000,
        },
      ],
    },
  };
  const marginalStart = performance.now();
  for (let index = 0; index < 1000; index += 1)
    readCapturedJobStrategyPair(syntheticPair);
  const pureMarginalEvaluationMs = (performance.now() - marginalStart) / 1000;
  const output = {
    inputs: {
      pinnedUpstreamCommit: P12G_PINNED_COMMIT,
      gameSnapshotSha256: gameHash,
      startingSaveSha256: saveHash,
      effectiveSettingsSha256: hash(JSON.stringify(settings)),
      testBundleSha256: bundleHash,
      productionBundleSha256: productionBundleHash,
      seed,
      epoch,
      captureExportSha256: capture.exportSaveSha256,
    },
    sourceProvenance,
    targetAtCapacity,
    hasIdleWorker,
    repeatedBaseline: { sameExports, sameInvocations, sameResources },
    ordinaryProductionParity: productionParity,
    researchActionInvocations: targetInvocations,
    performance: {
      aRendererTaskDurationSec: baseline.rendererTaskDurationSec,
      aaRendererTaskDurationSec: repeated.rendererTaskDurationSec,
      productionRendererTaskDurationSec: production.rendererTaskDurationSec,
      aRendererScriptDurationSec: baseline.rendererScriptDurationSec,
      aaRendererScriptDurationSec: repeated.rendererScriptDurationSec,
      workTicks: baseline.workTicks,
      diagnosticJobTraceEvents: baseline.samples.at(-1)?.jobsTraceCount ?? 0,
      pureSyntheticMarginalEvaluationMs: pureMarginalEvaluationMs,
      resourceSamplesPerArm: baseline.samples.length,
      nativeJobControlCalls: nativeJobControlCalls.reduce(
        (total, call) => total + call.count,
        0,
      ),
      nativeJobControlGenerations: [
        ...new Set(nativeJobControlCalls.map((call) => call.generation)),
      ],
      nativeJobControlEvents: nativeJobControlCalls,
    },
    arms: { baseline, repeated, production },
  };
  assert.equal(sameExports, true, "identical native baseline exports diverged");
  assert.equal(
    sameInvocations,
    true,
    "identical native baseline invocation sequences diverged",
  );
  assert.equal(
    sameResources,
    true,
    "identical native baseline resource trajectories diverged",
  );
  assert.deepEqual(
    productionParity,
    {
      sameExports: true,
      sameResources: true,
      sameFinalAssignments: true,
      productionInvocationCaptureAvailable: false,
    },
    "ordinary production bundle diverged from A on observable state",
  );
  assert.ok(
    targetAtCapacity,
    "P12I requires a reachable Scientist state at native capacity to stop safely",
  );
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(output, null, 2) + "\n");

  const activeJobs = Object.fromEntries(
    Object.entries(savedJobs).filter(([, job]) => job.workers > 0),
  );
  const baselineResearchInvocationPeriods = [
    ...new Set(targetInvocations.map(({ period }) => period)),
  ];
  const thresholdSamples = baseline.samples
    .filter((sample) => [40, 60, 61, 70, 71].includes(sample.period))
    .map((sample) => ({
      period: sample.period,
      Knowledge: sample.resources.Knowledge.amount,
      Steel: sample.resources.Steel.amount,
      Food: sample.resources.Food.amount,
    }));
  const md = `# P12I — Knowledge job counterfactual against Research timing

## Decision

**C — Intervention cannot be evaluated.** The verified starting state has no idle worker and the native Scientist job is already at its captured maximum. The existing native controls cannot represent the requested one-worker transfer into that job from this state without changing capacity or removing an assigned worker. No source assignment was selected because the existing Jobs owner is enabled and the capture does not establish an unprotected source. No B mutation was attempted.

## Pinned starting state and native policy

- Pinned game: \`${P12G_PINNED_COMMIT}\`; game snapshot SHA-256 \`${gameHash}\`.
- P12G reachable capture (P12H verified contract) period ${capture.period}; export SHA-256 \`${capture.exportSaveSha256}\`; seed ${seed}; epoch \`${epoch}\`.
- Research offer \`${offer.elementId}\`, generation ${offer.generation}, current native price ${JSON.stringify(offer.cost)}. Starting Knowledge ${initialKnowledge.amount} / ${initialKnowledge.max}; Food ${initialFood.amount} / ${initialFood.max}.
- Jobs permission \`autoJobs=${settings.autoJobs}\`; Scientist permission \`job_scientist=${settings.job_scientist}\`; Research permission \`autoResearch=${settings.autoResearch}\`.
- Scientist assignment ${scientist?.workers ?? "unknown"} / native maximum ${scientist?.maximum ?? "unknown"}; unemployed workers ${unemployed ?? "unknown"}. Other staffed assignments: ${JSON.stringify(activeJobs)}.
- Competing Construction demand at capture: ${JSON.stringify(capture.currentDemandEvidence.value)}. Normal Jobs settings enabled both ordinary Jobs and Craftsmen management.
- The A/A Food stock remained at its 437,445 capacity through the 100 sampled periods. A capped stock trajectory does not identify gross Food production and consumption; with no B arm, Food sustainability under reassignment was not measured.
- No direct Scientist production formula was copied. Pinned \`src/jobs.js\` defines its job impact/description; Knowledge acquisition effects depend on separate native action/building logic and all arm effects require paired stock changes.

## A/A baseline stability

Two exact Chromium sessions restored identical P12G saves with identical settings, seed, epoch, game and test bundle. Ordinary Jobs, Research, Construction and production remained enabled. Results: exports ${sameExports ? "matched" : "differed"}; ordered native invocation sequences ${sameInvocations ? "matched" : "differed"}; per-period resource stocks ${sameResources ? "matched" : "differed"}. Each arm sampled ${baseline.samples.length} periods; final active assignments matched: ${JSON.stringify(baseline.finalAssignments)}.

An exact ordinary production-bundle session used the same starting save, settings, seed, epoch and pinned game. Compared with instrumented A: exports ${productionParity.sameExports ? "matched" : "differed"}; per-period resource stocks ${productionParity.sameResources ? "matched" : "differed"}; final job assignments ${productionParity.sameFinalAssignments ? "matched" : "differed"}. This establishes observed production-state parity for the full sampled horizon. The runner exposes exact native invocation tracing through its test-hook callback, which the ordinary production bundle does not expose, so invocation-sequence parity cannot be asserted across those bundles; exact action traces remain available for A/A and from the verified P12H replay.

The baseline native Jobs owner invoked captured controls in generation ${output.performance.nativeJobControlGenerations.join(", ") || "unknown"}; its first observed changed assignment was ${JSON.stringify(jobTraceEvents[0]?.decision?.assignmentChanges ?? [])}. These are normal owner actions, not the P12I intervention. The native Scientist control was not invoked; its target had no worker headroom.

The pinned P12H replay independently records Steel sufficient by period 40, Knowledge crossing 9,000 in (60, 70], a fresh native affordability observation at period 70, and the ordinary Research invocation at period 72. Its action price was 9,000 Knowledge and 250 Steel. Those identities remain fixture evidence only.

## Why no B arm ran

Scientist was already at its captured native cap (${scientist?.workers}/${scientist?.maximum}); unemployment was ${unemployed}. A source transfer would have to displace a currently assigned worker. With \`autoJobs=true\`, normal Jobs remained the owner and could restore the source/target allocation; no source was proven safe or unconstrained, and the required one-worker target assignment had no native headroom. Increasing a Knowledge capacity through construction, changing Jobs policy, or stealing from an active job would add a second intervention and would not answer this isolated test.

Therefore there is no matched B trajectory, no measured \`readCapturedJobStrategyPair()\` marginal, and no intervention call/generation to report. The capture establishes Scientist availability and assignment/capacity but does not provide a safe source worker. A controlled transfer cannot be represented safely under the requested starting-state constraints.

## Strategy comparison and general criterion

The generic \`assessProductionInterventionEvidence()\` reports resource scarcity separately from the final observed purchase threshold, requires current paired evidence and a positive measured target-resource effect before timing classification, and keeps collateral losses visible. Unknown collateral authority or external commitments keep \`forecastComplete=false\`; they do not erase observed earlier-action evidence. This pure evaluator grants no spending authority. No observed marginal exists here, so \`compareGoalStrategies()\` cannot produce a meaningful intervention candidate for P12I; its current Research requirement and unknown external commitments remain unresolved.

## Performance

- Exact A/A renderer TaskDuration: ${baseline.rendererTaskDurationSec.toFixed(3)}s / ${repeated.rendererTaskDurationSec.toFixed(3)}s; ordinary production-bundle baseline: ${production.rendererTaskDurationSec.toFixed(3)}s. Test-bundle ScriptDuration: ${baseline.rendererScriptDurationSec.toFixed(4)}s / ${repeated.rendererScriptDurationSec.toFixed(4)}s. TaskDuration is the timing authority.
- ${baseline.samples.length} one-period resource/offer observations per arm, with no forced native Research draw; sampled threshold stocks: ${JSON.stringify(thresholdSamples)}. Distinct target action invocation period(s): ${JSON.stringify(baselineResearchInvocationPeriods)}.
- ${baseline.samples.at(-1)?.jobsTraceCount ?? 0} diagnostic Jobs trace events per A arm. Their grouped native worker-control calls total ${output.performance.nativeJobControlCalls} at generation(s) ${output.performance.nativeJobControlGenerations.join(", ") || "unknown"}; the repeated baseline has an identical full invocation sequence. The runner added no Jobs catalog reads beyond the ordinary owner; its 100-per-arm Research catalog samples are diagnostic reads.
- Pure \`readCapturedJobStrategyPair()\` cost: ${pureMarginalEvaluationMs.toFixed(6)} ms/call on a synthetic valid pair (1,000 calls). This is evaluator timing only; no empirical P12I marginal was produced.
- No P12D.1 advisory graph was run. Diagnostic tracing was confined to these isolated runner sessions; no production scheduler or userscript behavior was added.

## Evidence limits

P12I did not compare A/A/B because the required native target allocation is unavailable at the verified state. No claim is made that an earlier Research purchase would shorten terminal MAD time. The next valid attempt needs a separate verified capture with Scientist headroom and either an idle worker or an explicitly permitted source whose displacement is measured and not protected by the current Jobs policy.
`;
  await writeFile(reportPath, md);
  console.log(
    JSON.stringify(
      {
        outputPath,
        reportPath,
        sameExports,
        sameInvocations,
        sameResources,
        targetAtCapacity,
        hasIdleWorker,
      },
      null,
      2,
    ),
  );
} finally {
  await runner.close();
}
