import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

import {
  createChromiumRunner,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = path.join(root, "test-artifacts/benchmark/tmp");
const savePath = path.join(
  root,
  "test-artifacts/benchmark/slice0/saves/stage2f-fixed-progression-export.json",
);
const settingsPath = path.join(
  root,
  "test-artifacts/benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json",
);
const save = parseSave(await readFile(savePath, "utf8"));
const settings = {
  ...JSON.parse(await readFile(settingsPath, "utf8")),
  autoResearch: true,
  autoSmelter: true,
};
const seed = 42;
const epoch = "2026-09-21T00:00:00.000Z";
const warmupPeriods = 1784;
const windowPeriods = 80;
const expectedGameSnapshotSha256 =
  "05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7";
const digest = (value) => createHash("sha256").update(value).digest("hex");
const metadata = (
  await readFile(path.join(root, "src/userscript.meta.js"), "utf8")
).trimEnd();
const makePrelude = () => `
globalThis.__EA_TEST_HOOKS__ = { ...(globalThis.__EA_TEST_HOOKS__ ?? {}) };
const __p13h = { enabled: false, events: [], callbackMs: [] };
const __p13hHooks = globalThis.__EA_TEST_HOOKS__;
__p13hHooks.captureResearchOwnerEvidenceForTest = false;
__p13hHooks.observeResearchOwnerEvidenceForTest = (event) => {
  if (__p13h.enabled) {
    const started = performance.now();
    __p13h.events.push(event);
    __p13h.callbackMs.push(performance.now() - started);
  }
};
__p13hHooks.setP13HObservation = (enabled) => {
  __p13h.enabled = Boolean(enabled);
  __p13h.events = [];
  __p13h.callbackMs = [];
  __p13hHooks.captureResearchOwnerEvidenceForTest = __p13h.enabled;
};
__p13hHooks.readP13HEvidence = () => ({ events: __p13h.events, callbackMs: __p13h.callbackMs });`;
await mkdir(tmp, { recursive: true });
async function buildBundle() {
  const built = await esbuild.build({
    absWorkingDir: root,
    entryPoints: ["src/main.ts"],
    bundle: true,
    write: false,
    banner: { js: `${metadata}\n${makePrelude()}` },
    platform: "browser",
    target: ["esnext"],
    define: {
      "globalThis.__EA_TEST_SURFACE_ENABLED__": "true",
      __EA_TEST_SURFACE_ENABLED__: "true",
    },
    minifySyntax: true,
    treeShaking: true,
  });
  const bundlePath = path.join(tmp, "p13h-research-owner-evidence.user.js");
  await writeFile(bundlePath, built.outputFiles[0].contents);
  return { bundlePath, bundleSha256: digest(built.outputFiles[0].contents) };
}

const runner = await createChromiumRunner({
  game: path.join(root, "test-artifacts/game/evolve-deadspace.js"),
});
assert.equal(
  runner.inputs.gameSnapshot.sha256,
  expectedGameSnapshotSha256,
  "runner game snapshot differs from the pinned P12G/P13D snapshot",
);
const sessions = [];
const bundle = await buildBundle();
async function runMode(observe) {
  const session = await runner.openSession({
    bundle: bundle.bundlePath,
    save,
    settings,
    seed,
    epoch,
    perf: false,
    nativeTrace: true,
  });
  sessions.push(session);
  await session.advance(warmupPeriods);
  await session.evaluate((enabled) => {
    window.__EA_TEST_HOOKS__.setP13HObservation(enabled);
  }, observe);
  const before = await session.exportSave();
  const diagnosticsBefore = await session.diagnostics();
  const metricsBefore = await session.metrics();
  await session.advance(windowPeriods);
  const metricsAfter = await session.metrics();
  const after = await session.exportSave();
  const diagnosticsAfter = await session.diagnostics();
  const evidence = await session.evaluate(() =>
    window.__EA_TEST_HOOKS__.readP13HEvidence(),
  );
  const runtimeState = await session.evaluate(() => ({
    hooksEnabled: window.__EA_TEST_HOOKS__.captureResearchOwnerEvidenceForTest,
    settings: JSON.parse(localStorage.getItem("settings") ?? "{}"),
    period: window.__EA_RUNNER__.periods(),
    lastSelection: window.__EA_TEST_HOOKS__.researchOwnerSelectionLast,
  }));
  const selections = await session.evaluate(
    () => window.__EA_TEST_HOOKS__.researchOwnerSelectionEvents ?? [],
  );
  const nativeInvocations = diagnosticsAfter.nativeInvocations ?? [];
  const invocationsBefore = diagnosticsBefore.nativeInvocations ?? [];
  return {
    mode: observe ? "O" : "G",
    before: digest(before),
    after: digest(after),
    invocations: nativeInvocations.slice(invocationsBefore.length),
    randomCallsBefore: diagnosticsBefore.randomCalls,
    randomCallsAfter: diagnosticsAfter.randomCalls,
    controlUsageBefore: diagnosticsBefore.controlUsage,
    controlUsageAfter: diagnosticsAfter.controlUsage,
    taskDurationDeltaSec:
      metricsAfter.TaskDuration - metricsBefore.TaskDuration,
    scriptDurationDeltaSec:
      metricsAfter.ScriptDuration - metricsBefore.ScriptDuration,
    evidence,
    runtimeState,
    selections: selections.slice(),
    bundleSha256: bundle.bundleSha256,
  };
}

try {
  const baseline = await runMode(false);
  const observed = await runMode(true);
  assert.deepEqual(
    baseline.evidence.events,
    [],
    "disabled observer must not publish events",
  );
  assert.equal(baseline.before, observed.before, "window exports differ");
  assert.equal(baseline.after, observed.after, "ordinary exports differ");
  assert.deepEqual(
    baseline.invocations,
    observed.invocations,
    "native invocation order changed",
  );
  assert.equal(
    baseline.randomCallsAfter - baseline.randomCallsBefore,
    observed.randomCallsAfter - observed.randomCallsBefore,
    "random-call count changed",
  );
  assert.deepEqual(
    baseline.controlUsageAfter,
    observed.controlUsageAfter,
    "native control usage changed",
  );

  const drawEvents = observed.evidence.events.filter(
    (event) => event.kind === "draw",
  );
  const selectionEvents = observed.evidence.events.filter(
    (event) => event.kind === "selection",
  );
  const resultEvents = observed.evidence.events.filter(
    (event) => event.kind === "result",
  );
  const readEvents = observed.evidence.events.filter(
    (event) => event.kind === "read",
  );
  const currentOffers = drawEvents.flatMap((event) => event.offers ?? []);
  const affordable = currentOffers.filter((offer) => offer.nativeAffordable);
  const unaffordable = currentOffers.filter((offer) => !offer.nativeAffordable);
  const diagnosticCallbackTotalMs = observed.evidence.callbackMs.reduce(
    (sum, elapsed) => sum + elapsed,
    0,
  );
  const diagnosticCallbackMaxMs = Math.max(0, ...observed.evidence.callbackMs);
  const output = {
    schema: "p13h-research-owner-evidence-v1",
    repository: {
      branch: "deadspace",
      startingHead: "c36f91e97f5f5edfa43b2a16e4407586e5cb6b74",
    },
    game: {
      sourceRef: "db38e2af831907d49aeb5348d678d8d8745d6c3f",
      snapshotSha256: runner.inputs.gameSnapshot.sha256,
    },
    inputs: {
      save: path.relative(root, savePath).replaceAll("\\", "/"),
      settings: path.relative(root, settingsPath).replaceAll("\\", "/"),
      saveSha256: digest(await readFile(savePath)),
      settingsSha256: digest(await readFile(settingsPath)),
      seed,
      epoch,
      warmupPeriods,
      windowPeriods,
      bundleSha256: observed.bundleSha256,
    },
    counts: {
      researchDrawsAdded: 0,
      catalogScansAdded: 0,
      researchInvocationsAdded: 0,
      smelterInvocationsAdded: 0,
      dependencyTraversalsAdded: 0,
      crossTickPollingAdded: 0,
      observedResearchDraws: drawEvents.length,
      observedSelectionCallbacks: selectionEvents.length,
      observedResultCallbacks: resultEvents.length,
      observedOwnerReads: readEvents.length,
      offeredRowsInResearchDraws: currentOffers.length,
      nativeAffordableRowsInResearchDraws: affordable.length,
      nativeUnaffordableRowsInResearchDraws: unaffordable.length,
      nativeOfferMembershipIncompleteDraws: drawEvents.filter(
        (event) => event.offerMembership === "unknown",
      ).length,
      observedPolicyExcludedReaderCandidates: readEvents
        .flatMap((event) => event.input.techs)
        .filter((tech) => tech.exclusionEvidence === "excluded").length,
      observedUnavailableExclusionReaderCandidates: readEvents
        .flatMap((event) => event.input.techs)
        .filter((tech) => tech.exclusionEvidence === "unavailable").length,
      diagnosticCallbackTotalMs,
      diagnosticCallbackMaxMs,
    },
    runnerState: {
      observationHooksEnabled: observed.runtimeState.hooksEnabled,
      autoResearch: observed.runtimeState.settings.autoResearch,
      autoSmelter: observed.runtimeState.settings.autoSmelter,
      masterScriptToggle: observed.runtimeState.settings.masterScriptToggle,
      endPeriod: observed.runtimeState.period,
      lastOwnerSelection: observed.runtimeState.lastSelection,
    },
    observations: drawEvents.map((draw) => {
      const selection = selectionEvents.find(
        (event) => event.publication.cycle === draw.cycle,
      );
      const ownerRead = readEvents.find((event) => event.cycle === draw.cycle)
        ?.input.techs;
      const offerSetIdentity = draw.offers?.[0]?.offerSetIdentity;
      return {
        cycle: draw.cycle,
        rootGeneration: draw.rootGeneration,
        progressionGeneration: draw.progressionGeneration,
        offerMembership: draw.offerMembership,
        actionId: selection?.publication.actionId,
        ownerQueueEvidence: selection?.publication.queueEvidence,
        targetEligibility: selection?.publication.targetEligibility,
        selectedPrefix: selection?.publication.observed.map((tech) => ({
          actionId: tech.actionId,
          nativeAffordable: tech.nativeAffordable,
          resourceAffordable: tech.resourceAffordable,
          observedResources: tech.observedResources,
          reservation: tech.reservation,
          exclusion: tech.exclusion,
        })),
        ownerRead: ownerRead?.map((tech) => ({
          actionId: tech.id,
          ownerAffordable: tech.affordable,
          nativeAffordable: tech.nativeAffordable,
          resourceAffordable: tech.resourceAffordable,
          observedResources: tech.observedResources,
          reservation: tech.costConflictEvidence,
          exclusion: tech.exclusionEvidence,
        })),
        ordinaryOwnerSelection:
          selection?.publication.actionId ?? "no-affordable-eligible-selection",
        offerObservationId: draw.offers?.[0]?.offerObservationId,
        offerSetIdentitySha256:
          offerSetIdentity === undefined ? undefined : digest(offerSetIdentity),
        offers: (draw.offers ?? []).map((offer) => ({
          actionId: offer.elementId,
          cost: offer.cost,
          nativeAffordableAtDraw: offer.nativeAffordable,
          bindingGeneration: offer.generation,
        })),
        result: resultEvents.find((result) => result.cycle === draw.cycle),
      };
    }),
    parity: {
      identicalExports: baseline.after === observed.after,
      identicalResearchAndSmelterInvocationOrder:
        JSON.stringify(baseline.invocations) ===
        JSON.stringify(observed.invocations),
      identicalRandomCalls:
        baseline.randomCallsAfter - baseline.randomCallsBefore ===
        observed.randomCallsAfter - observed.randomCallsBefore,
      identicalControlUsage:
        JSON.stringify(baseline.controlUsageAfter) ===
        JSON.stringify(observed.controlUsageAfter),
      baselineExportSha256: baseline.after,
      observedExportSha256: observed.after,
      invocationCount: observed.invocations.length,
    },
    cost: {
      observerWindowTaskDurationSec: observed.taskDurationDeltaSec,
      baselineWindowTaskDurationSec: baseline.taskDurationDeltaSec,
      observerWindowScriptDurationSec: observed.scriptDurationDeltaSec,
      baselineWindowScriptDurationSec: baseline.scriptDurationDeltaSec,
      additionalTaskDurationSec:
        observed.taskDurationDeltaSec - baseline.taskDurationDeltaSec,
      additionalScriptDurationSec:
        observed.scriptDurationDeltaSec - baseline.scriptDurationDeltaSec,
      researchDrawObserverCallbackTotalMs: diagnosticCallbackTotalMs,
      researchDrawObserverCallbackMaxMs: diagnosticCallbackMaxMs,
      rendererCpuGate:
        "unresolved; this bounded replay is not the full 2% factorial",
    },
  };
  await writeFile(
    path.join(tmp, "p13h-research-owner-evidence.json"),
    `${JSON.stringify(output, null, 2)}\n`,
  );
  console.log(
    JSON.stringify({
      counts: output.counts,
      parity: output.parity,
      cost: output.cost,
      observations: output.observations.map((observation) => ({
        cycle: observation.cycle,
        offerObservationId: observation.offerObservationId,
        offerCount: observation.offers.length,
        selection: observation.ordinaryOwnerSelection,
        result: observation.result?.disposition,
      })),
    }),
  );
} finally {
  await Promise.all(sessions.map((session) => session.close()));
  await runner.close();
}
