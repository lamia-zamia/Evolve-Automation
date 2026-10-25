import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { format } from "prettier";

import {
  decodeExport,
  parseSave,
  createChromiumRunner,
} from "../tools/chromium-evolve-runner.mjs";
import { runBundleAudit } from "./p50-diagnostic-bundle-audit.mjs";
import { runP49Proof } from "./p49-jobs-admission-evidence.mjs";

const experimentDirectory = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
);
const repositoryRoot = resolve(experimentDirectory, "..");
const bundleRoot = resolve(repositoryRoot, "test-artifacts/p50/bundles");
const baselineBundle = resolve(bundleRoot, "before/evolve_automation.user.js");
const afterBundle = resolve(bundleRoot, "after/evolve_automation.user.js");
const p49TestBundle = resolve(
  repositoryRoot,
  "test-artifacts/local/evolve_automation.test-surface.user.js",
);
const periodsPerArm = 400;
const snapshotPeriods = [200, 400];
const seed = 44;
const epoch = "2026-09-21T00:00:00.000Z";
const positiveCheckpointPeriod = 250;
const p19AuthorizationId = "p19-human-candidate-1";
const readCounterPattern = /^(jobs\.full\.|demand\.sample\.|action-cost\.)/;

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function summarizeAssignments(state) {
  const civic = state?.civic ?? {};
  const ordinaryJobs = Object.entries(civic)
    .filter(([, value]) => value !== null && typeof value === "object")
    .filter(([, value]) => typeof value.job === "string")
    .map(([id, value]) => [id, value.workers ?? null, value.assigned ?? null])
    .toSorted(([left], [right]) => String(left).localeCompare(String(right)));
  const foundry = state?.city?.foundry;
  const foundryWorkers =
    foundry !== null && typeof foundry === "object"
      ? Object.entries(foundry)
          .filter(([, value]) => typeof value === "number")
          .toSorted(([left], [right]) => left.localeCompare(right))
      : null;
  return { ordinaryJobs, foundryWorkers };
}

function summarizeControlUsage(usage) {
  return Object.fromEntries(
    Object.entries(usage ?? {}).toSorted(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}

function aggregatePerformanceCounts(summaries) {
  const result = {};
  for (const summary of summaries ?? [])
    for (const [name, value] of Object.entries(summary[2] ?? {}))
      result[name] = (result[name] ?? 0) + Number(value.total ?? 0);
  return Object.fromEntries(
    Object.entries(result).toSorted(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}

async function replayP19Checkpoint() {
  const fixturePath = resolve(
    repositoryRoot,
    "test-artifacts/benchmark/slice0/saves/p18-standard-human-fixture.txt",
  );
  const settingsPath = resolve(
    repositoryRoot,
    "experiments/p18-standard-human-settings.json",
  );
  const saveText = readFileSync(fixturePath, "utf8");
  const settingsText = readFileSync(settingsPath, "utf8");
  const settings = JSON.parse(settingsText);
  assert.equal(parseSave(saveText).settings?.expose, false);
  assert.notEqual(settings.expose, true);
  assert.equal(settings.autoJobs, true);
  assert.equal(settings.autoCraftsmen, true);

  const runner = await createChromiumRunner({ headless: true });
  const session = await runner.openSession({
    bundle: p49TestBundle,
    save: parseSave(saveText),
    settings,
    seed,
    epoch,
    perf: true,
    nativeTrace: true,
    forwardPerfSummary: true,
  });
  try {
    await session.evaluate((authorizationId) => {
      const hooks = window.__EA_TEST_HOOKS__;
      hooks.gatherIntervention = {
        civilizationBootstrap: { authorized: true, authorizationId },
        constructionHandoffEnabled: true,
        civilizationBootstrapObserver(event) {
          hooks.civilizationBootstrapEvents.push({
            period: window.__EA_RUNNER__?.periods?.() ?? null,
            ...event,
          });
        },
        civilizationHandoffObserver(event) {
          hooks.civilizationHandoffEvents.push({
            period: window.__EA_RUNNER__?.periods?.() ?? null,
            ...event,
          });
        },
      };
    }, p19AuthorizationId);
    await session.advance(positiveCheckpointPeriod);
    const diagnostics = await session.diagnostics();
    const exportedSave = await session.exportSave();
    const state = decodeExport(exportedSave);
    const events = await session.evaluate(() => ({
      bootstrap: window.__EA_TEST_HOOKS__?.civilizationBootstrapEvents ?? [],
      handoff: window.__EA_TEST_HOOKS__?.civilizationHandoffEvents ?? [],
    }));
    const p19Evidence = JSON.parse(
      readFileSync(
        resolve(
          repositoryRoot,
          "experiments/p19-civilization-bootstrap-evidence.json",
        ),
        "utf8",
      ),
    );
    const retainedCheckpoint = p19Evidence.candidate.checkpoints.find(
      (entry) => entry.period === positiveCheckpointPeriod,
    );
    assert.ok(retainedCheckpoint);
    assert.equal(diagnostics.periods, positiveCheckpointPeriod);
    assert.equal(diagnostics.captureComplete, true);
    assert.equal(state.race?.species, "human");
    assert.ok((state.resource?.[state.race.species]?.amount ?? 0) > 0);
    assert.equal(state.settings?.expose, false);
    assert.equal(
      summarizeControlUsage(diagnostics.controlUsage)["undefined-stone.action"]
        ?.returned,
      20,
    );
    assert.equal(events.bootstrap.length, 10);
    assert.equal(events.handoff.length, 10);
    assert.equal(
      state.resource?.[state.race.species]?.amount,
      retainedCheckpoint.population,
    );
    assert.deepEqual(state.tech, retainedCheckpoint.tech);

    return {
      id: "standard-human-p19-p250-positive-population",
      saveText: exportedSave,
      settings,
      saveSha256: sha256(exportedSave),
      settingsSha256: sha256(settingsText),
      fixtureSha256: sha256(saveText),
      period: diagnostics.periods,
      population: state.resource[state.race.species].amount,
      p19Interventions: {
        authorizationId: p19AuthorizationId,
        bootstrapGatherActions: events.bootstrap.length,
        constructionHandoffGatherActions: events.handoff.length,
        totalStoneGatherActions:
          summarizeControlUsage(diagnostics.controlUsage)[
            "undefined-stone.action"
          ]?.returned ?? 0,
      },
    };
  } finally {
    await session.close();
    await runner.close();
  }
}

function summarizeProductionRun({
  bundlePath,
  fixture,
  diagnostics,
  snapshots,
  state,
  exportedSave,
}) {
  const performanceCounts = aggregatePerformanceCounts(
    diagnostics.perfSummaries,
  );
  const checkpoints = Object.fromEntries(
    snapshotPeriods.map((period) => {
      const snapshot = snapshots[period];
      assert.ok(snapshot, `${fixture.id} missed period ${period}`);
      const stateAtCheckpoint = decodeExport(snapshot.exportSave);
      return [
        period,
        {
          exportSha256: sha256(snapshot.exportSave),
          stateSha256: sha256(JSON.stringify(stateAtCheckpoint)),
          constructionResearchSha256: sha256(
            JSON.stringify({
              construction: stateAtCheckpoint.city ?? null,
              research: stateAtCheckpoint.tech ?? null,
            }),
          ),
          rngCalls: snapshot.randomCalls,
          rngState: snapshot.rngState,
          controlUsage: summarizeControlUsage(snapshot.controlUsage),
          assignments: summarizeAssignments(stateAtCheckpoint),
        },
      ];
    }),
  );
  const nativeInvocations = diagnostics.nativeInvocations ?? [];
  const selectedReads = Object.fromEntries(
    Object.entries(performanceCounts).filter(([name]) =>
      readCounterPattern.test(name),
    ),
  );
  return {
    bundleSha256: sha256(readFileSync(bundlePath)),
    inputHashes: {
      save: fixture.saveSha256 ?? sha256(fixture.saveText),
      settings:
        fixture.settingsSourceSha256 ??
        sha256(JSON.stringify(fixture.settings)),
    },
    periods: diagnostics.periods,
    workTicks: diagnostics.workTicks,
    nativeInvocations: {
      count: nativeInvocations.length,
      orderedTraceSha256: sha256(JSON.stringify(nativeInvocations)),
      first: nativeInvocations[0] ?? null,
      last: nativeInvocations.at(-1) ?? null,
    },
    controlUsage: summarizeControlUsage(diagnostics.controlUsage),
    checkpoints,
    constructionResearchFinalSha256: sha256(
      JSON.stringify({
        construction: state.city ?? null,
        research: state.tech ?? null,
      }),
    ),
    finalStateSha256: sha256(JSON.stringify(state)),
    finalExportSha256: sha256(exportedSave),
    finalRngCalls: diagnostics.randomCalls,
    finalRngState: diagnostics.rngState,
    readCounters: selectedReads,
    allPerformanceCounts: performanceCounts,
    errors: {
      page: diagnostics.counts.pageerror ?? 0,
      rejected: diagnostics.counts.rejection ?? 0,
      loop: diagnostics.counts.loopError ?? 0,
      dialogs: diagnostics.dialogs.length,
    },
  };
}

async function runProductionArm({ runner, bundlePath, fixture }) {
  const session = await runner.openSession({
    bundle: bundlePath,
    save: parseSave(fixture.saveText),
    settings: fixture.settings,
    seed,
    epoch,
    perf: true,
    nativeTrace: true,
    forwardPerfSummary: true,
    snapshotAt: snapshotPeriods,
  });
  try {
    await session.advance(periodsPerArm);
    const diagnostics = await session.diagnostics();
    const snapshots = await session.snapshots();
    const state = await session.readState();
    const exportedSave = await session.exportSave();
    assert.equal(diagnostics.periods, periodsPerArm);
    assert.equal(diagnostics.captureComplete, true);
    return summarizeProductionRun({
      bundlePath,
      fixture,
      diagnostics,
      snapshots,
      state,
      exportedSave,
    });
  } finally {
    await session.close();
  }
}

function compareProductionRuns(before, after, fixtureId) {
  for (const key of [
    "periods",
    "workTicks",
    "nativeInvocations",
    "controlUsage",
    "checkpoints",
    "constructionResearchFinalSha256",
    "finalStateSha256",
    "finalExportSha256",
    "finalRngCalls",
    "finalRngState",
    "readCounters",
    "allPerformanceCounts",
    "errors",
  ])
    assert.deepEqual(
      after[key],
      before[key],
      `${fixtureId} production ${key} changed after diagnostic isolation`,
    );
}

async function runProductionParity(positiveFixture) {
  const lateGame = {
    id: "late-game-mad-tech-offered-blocked",
    saveText: readFileSync(
      resolve(
        repositoryRoot,
        "test-artifacts/benchmark/slice0/saves/mad-tech-offered-blocked.json",
      ),
      "utf8",
    ),
    settings: JSON.parse(
      readFileSync(
        resolve(
          repositoryRoot,
          "test-artifacts/benchmark/slice0/settings/current-full.json",
        ),
        "utf8",
      ),
    ),
    saveSha256: null,
    settingsSourceSha256: null,
  };
  lateGame.saveSha256 = sha256(lateGame.saveText);
  lateGame.settingsSourceSha256 = sha256(
    readFileSync(
      resolve(
        repositoryRoot,
        "test-artifacts/benchmark/slice0/settings/current-full.json",
      ),
      "utf8",
    ),
  );
  assert.equal(lateGame.settings.autoJobs, true);
  assert.equal(lateGame.settings.autoCraftsmen, true);
  const fixtures = [lateGame, positiveFixture];
  const runner = await createChromiumRunner({ headless: true });
  try {
    const results = [];
    for (const fixture of fixtures) {
      const before = await runProductionArm({
        runner,
        bundlePath: baselineBundle,
        fixture,
      });
      const after = await runProductionArm({
        runner,
        bundlePath: afterBundle,
        fixture,
      });
      compareProductionRuns(before, after, fixture.id);
      results.push({ fixture: fixture.id, before, after });
    }
    return {
      status: "bounded production parity passed",
      periodsPerArm,
      seed,
      epoch,
      snapshotPeriods,
      treatmentActionsAdded: [],
      fixtures: results,
    };
  } finally {
    await runner.close();
  }
}

function summarizeDiagnosticCost(p49Evidence) {
  const metrics = [
    "maxRequestPresenceCheckMs",
    "maxInputProjectionMs",
    "maxEnvelopeConstructionMs",
    "maxAdmissionPredicateMs",
    "maxAdditionalSynchronousCallbackMs",
  ];
  const arms = [];
  for (const fixture of p49Evidence.results)
    for (const [arm, run] of Object.entries(fixture.runs))
      arms.push({ fixture: fixture.fixture, arm, ...run.observationCosts });
  const maximums = Object.fromEntries(
    metrics.map((metric) => [
      metric,
      Math.max(0, ...arms.map((arm) => arm[metric] ?? 0)),
    ]),
  );
  return { arms, maximums };
}

export async function runP50Evidence() {
  const audit = await runBundleAudit();
  const p49TestSurface = await runP49Proof();
  assert.ok(existsSync(p49TestBundle));
  const positiveFixture = await replayP19Checkpoint();
  const productionParity = await runProductionParity(positiveFixture);
  const cost = summarizeDiagnosticCost(p49TestSurface);

  return {
    schema: "p50-diagnostic-bundle-isolation-evidence-v1",
    pinnedGame: "pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f",
    audit,
    testSurfaceP49: {
      status: p49TestSurface.parity.status,
      evidence: p49TestSurface,
      boundedSynchronousCost: cost,
      independentRendererCpuGate: "unresolved; no renderer CPU pass is claimed",
    },
    productionParity,
    p19CheckpointProvenance: {
      id: positiveFixture.id,
      saveSha256: positiveFixture.saveSha256,
      settingsSha256: positiveFixture.settingsSha256,
      sourceFixtureSha256: positiveFixture.fixtureSha256,
      period: positiveFixture.period,
      population: positiveFixture.population,
      interventions: positiveFixture.p19Interventions,
      treatmentArmsAddedGatherPurchasesOrWorkerOverrides: false,
    },
    nativeTimerCoverage: {
      status: "limited-existing-fixture-missing",
      fixturePath: "test-artifacts/benchmark/settings/baseline-tuned.json",
      fixturePresent: existsSync(
        resolve(
          repositoryRoot,
          "test-artifacts/benchmark/settings/baseline-tuned.json",
        ),
      ),
    },
  };
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const evidence = await runP50Evidence();
  const outputPath = resolve(
    experimentDirectory,
    "p50-diagnostic-bundle-isolation-evidence.json",
  );
  writeFileSync(
    outputPath,
    await format(`${JSON.stringify(evidence, null, 2)}\n`, { parser: "json" }),
  );
  console.log(`Wrote ${outputPath}`);
}
