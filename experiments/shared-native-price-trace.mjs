import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import {
  createChromiumRunner,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index < 0 ? fallback : args[index + 1];
};
const saveName = option("save", "late");
const savePath = option(
  "save-path",
  `${root}test-artifacts/benchmark/slice0/saves/deadspace-late-2026-10-12.txt`,
);
const settingsPath = option(
  "settings",
  `${root}test-artifacts/benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json`,
);
const outputPath = option(
  "out",
  `${root}test-artifacts/perf-profile/shared-price-trace-${saveName}.json`,
);
const warmupPeriods = Number(option("warmup", "600"));
const samplePeriods = Number(option("periods", "120"));
const maxCycles = Number(option("cycles", "8"));
const reusePairs = [
  ["pre-Gather demand", "pre-Gather demand"],
  ["autoBuild", "autoBuild"],
  ["construction saving discovery", "pre-Gather demand"],
  ["construction saving discovery", "autoStorage"],
  ["pre-Gather demand", "autoStorage"],
  ["construction saving discovery", "autoBuild"],
  ["pre-Gather demand", "autoBuild"],
  ["autoBuild", "autoFactory"],
  ["autoFactory", "autoJobs with autoCraftsmen"],
];
function summarize(events, timerOverheadMedianMs) {
  const byConsumerAndAction = new Map();
  for (const event of events) {
    const key = `${event.phase}\u0000${event.actionId}`;
    const samples = byConsumerAndAction.get(key) ?? [];
    samples.push(event.nativeDurationMs);
    byConsumerAndAction.set(key, samples);
  }
  const actionCosts = [...byConsumerAndAction].map(([key, samples]) => {
    const [consumer, actionId] = key.split("\u0000");
    const adjusted = samples
      .filter(Number.isFinite)
      .map((duration) => Math.max(0, duration - timerOverheadMedianMs));
    const sorted = [...adjusted].sort((left, right) => left - right);
    return {
      consumer,
      actionId,
      probes: samples.length,
      meanNativeProbeMs:
        adjusted.length === 0
          ? null
          : adjusted.reduce((total, value) => total + value, 0) /
            adjusted.length,
      medianNativeProbeMs:
        sorted.length === 0 ? null : sorted[Math.floor(sorted.length / 2)],
      totalNativeProbeMs: adjusted.reduce((total, value) => total + value, 0),
    };
  });
  const eventLookup = new Map();
  for (const event of events) {
    const cycleKey = `${event.cycle}\u0000${event.actionId}`;
    const candidates = eventLookup.get(cycleKey) ?? [];
    candidates.push(event);
    eventLookup.set(cycleKey, candidates);
  }
  const workCycles = new Set(events.map((event) => event.cycle)).size;
  const positiveDurationSteps = events
    .map((event) => event.nativeDurationMs)
    .filter((duration) => Number.isFinite(duration) && duration > 0)
    .sort((left, right) => left - right);
  const estimatedReuseSavings = reusePairs.map(([source, destination]) => {
    let matchedRequests = 0;
    let estimatedSavedMs = 0;
    const actionIds = new Set();
    let genuinePlayerQueueMutations = 0;
    let temporaryProbePrefixChanges = 0;
    let nativePriceOrPoolChanges = 0;
    let trackedAuthorityEpochChanges = 0;
    let rootReplacements = 0;
    let queueArrayReplacements = 0;
    for (const destinationEvent of events) {
      if (destinationEvent.phase !== destination) continue;
      const candidates =
        eventLookup.get(
          `${destinationEvent.cycle}\u0000${destinationEvent.actionId}`,
        ) ?? [];
      const sourceEvent = [...candidates]
        .reverse()
        .find(
          (event) =>
            event.phase === source &&
            event.sequence < destinationEvent.sequence,
        );
      if (
        sourceEvent === undefined ||
        !Number.isFinite(destinationEvent.nativeDurationMs)
      )
        continue;
      matchedRequests += 1;
      actionIds.add(destinationEvent.actionId);
      estimatedSavedMs += Math.max(
        0,
        destinationEvent.nativeDurationMs - timerOverheadMedianMs,
      );
      if (
        JSON.stringify(sourceEvent.playerQueueState) !==
        JSON.stringify(destinationEvent.playerQueueState)
      )
        genuinePlayerQueueMutations += 1;
      if (
        JSON.stringify(sourceEvent.effectiveQueuePrefix) !==
        JSON.stringify(destinationEvent.effectiveQueuePrefix)
      )
        temporaryProbePrefixChanges += 1;
      if (
        JSON.stringify({ cost: sourceEvent.cost, pool: sourceEvent.pool }) !==
        JSON.stringify({
          cost: destinationEvent.cost,
          pool: destinationEvent.pool,
        })
      )
        nativePriceOrPoolChanges += 1;
      if (sourceEvent.actionCostEpoch !== destinationEvent.actionCostEpoch)
        trackedAuthorityEpochChanges += 1;
      if (sourceEvent.rootId !== destinationEvent.rootId) rootReplacements += 1;
      if (sourceEvent.queueId !== destinationEvent.queueId)
        queueArrayReplacements += 1;
    }
    return {
      source,
      destination,
      matchingRequests: matchedRequests,
      distinctActionIds: actionIds.size,
      estimatedSavedMs,
      estimatedSavedMsPerWorkTick:
        workCycles === 0 ? 0 : estimatedSavedMs / workCycles,
      genuinePlayerQueueMutations,
      temporaryProbePrefixChanges,
      nativePriceOrPoolChanges,
      trackedAuthorityEpochChanges,
      rootReplacements,
      queueArrayReplacements,
      authorityOutsideTrackedEpoch: "unknown",
    };
  });
  return {
    workCycles,
    actionCosts,
    estimatedReuseSavings,
    observedPositiveDurationQuantumMs: positiveDurationSteps[0] ?? 0,
  };
}
const metadata = (
  await readFile(`${root}src/userscript.meta.js`, "utf8")
).trimEnd();
const hook = `
window.__EA_TEST_HOOKS__ = window.__EA_TEST_HOOKS__ || {};
(() => {
  const events = [];
  const identities = new WeakMap();
  const playerQueues = new WeakMap();
  let nextIdentity = 1;
  let firstCycle;
  let armed = false;
  let currentContext = { cycle: 0, phase: "runtime-setup", actionCostEpoch: 0 };
  window.__EA_TEST_HOOKS__.captureNativePriceQueue = (queue, snapshot) => { playerQueues.set(queue, snapshot); };
  window.__EA_TEST_HOOKS__.readNativePriceQueue = queue => playerQueues.get(queue) || [];
  const identity = value => {
    if ((typeof value !== "object" && typeof value !== "function") || value === null) return null;
    let id = identities.get(value);
    if (id === undefined) { id = nextIdentity++; identities.set(value, id); }
    return id;
  };
  const row = value => {
    if (!value || typeof value !== "object") return value;
    return { id: value.id, action: value.action, type: value.type, q: value.q, qs: value.qs };
  };
  const nativeNow = () => window.__EA_RUNNER__.nativeNow();
  const callbackDurations = [];
  const timerOverheads = [];
  for (let index = 0; index < 512; index += 1) {
    const startedAt = nativeNow();
    timerOverheads.push(nativeNow() - startedAt);
  }
  timerOverheads.sort((left, right) => left - right);
  const timerOverheadMedianMs = timerOverheads[Math.floor(timerOverheads.length / 2)];
  let previousByAction = new Map();
  window.__EA_TEST_HOOKS__.setNativePriceContext = context => { currentContext = context; };
  window.__EA_TEST_HOOKS__.recordNativePriceRequest = event => {
    if (!armed) return;
    const callbackStartedAt = nativeNow();
    firstCycle ??= currentContext.cycle;
    if (currentContext.cycle >= firstCycle + ${maxCycles}) return;
    const rootId = identity(event.root);
    const queueId = identity(event.queue);
    const playerQueueState = event.playerQueueState.map(row);
    const effectiveQueuePrefix = event.effectiveQueuePrefix.map(row);
    const temporaryProbePrefix = effectiveQueuePrefix.slice(playerQueueState.length);
    const price = event.price;
    const previous = previousByAction.get(event.actionId);
    const nativePricePoolChanged = previous !== undefined && JSON.stringify(previous.price) !== JSON.stringify(price);
    const playerQueueMutation = previous !== undefined && JSON.stringify(previous.playerQueueState) !== JSON.stringify(playerQueueState);
    const trackedEpochChanged = previous !== undefined && previous.actionCostEpoch !== event.actionCostEpoch;
    events.push({
      sequence: events.length,
      cycle: currentContext.cycle,
      phase: currentContext.phase,
      actionCostEpoch: currentContext.actionCostEpoch,
      rootId,
      queueId,
      playerQueueState,
      effectiveQueuePrefix,
      temporaryProbeInsertionCount: temporaryProbePrefix.length,
      temporaryProbeIds: temporaryProbePrefix.map(item => item?.id),
      actionId: event.actionId,
      caller: event.caller,
      available: price !== undefined,
      cost: price?.cost,
      pool: price?.pool,
      nativeDurationMs: event.nativeDurationMs,
      failure: event.failure,
      previousCycle: previous?.cycle,
      previousPhase: previous?.phase,
      observedChangesSincePrevious: previous === undefined ? null : {
        genuinePlayerQueueMutation: playerQueueMutation,
        temporaryProbePrefixChanged: JSON.stringify(previous.effectiveQueuePrefix) !== JSON.stringify(effectiveQueuePrefix),
        nativePriceOrPoolChanged: nativePricePoolChanged,
        trackedAuthorityEpochChanged: trackedEpochChanged,
        rootChanged: previous.rootId !== rootId,
        queueChanged: previous.queueId !== queueId,
      },
      uncoveredAuthority: "unknown",
    });
    const callbackDurationMs = Math.max(
      0,
      nativeNow() - callbackStartedAt - timerOverheadMedianMs,
    );
    events.at(-1).traceCallbackDurationMs = callbackDurationMs;
    callbackDurations.push(callbackDurationMs);
    previousByAction.set(event.actionId, {
      cycle: currentContext.cycle,
      phase: currentContext.phase,
      actionCostEpoch: currentContext.actionCostEpoch,
      rootId,
      queueId,
      playerQueueState,
      effectiveQueuePrefix,
      price,
    });
  };
  window.__EA_PRICE_TRACE__ = {
    arm: () => { armed = true; firstCycle = undefined; events.length = 0; previousByAction = new Map(); },
    read: () => events.slice(),
    timerOverheadMedianMs,
    timerOverheadP95Ms: timerOverheads[Math.floor(timerOverheads.length * 0.95)],
    readCallbackCalibration: () => {
      const sorted = [...callbackDurations].sort((left, right) => left - right);
      return {
        totalMs: callbackDurations.reduce((total, duration) => total + duration, 0),
        meanMs: callbackDurations.length === 0
          ? 0
          : callbackDurations.reduce((total, duration) => total + duration, 0) / callbackDurations.length,
        p95Ms: sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length * 0.95)],
      };
    },
  };
})();`;
const bundlePath = `${root}test-artifacts/perf-profile/shared-price-trace.user.js`;
await mkdir(dirname(bundlePath), { recursive: true });
await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["src/main.ts"],
  outfile: bundlePath,
  bundle: true,
  banner: {
    js: `${metadata}\n\n// Test-only bounded native price attribution.\n${hook}`,
  },
  charset: "utf8",
  format: "iife",
  legalComments: "inline",
  logLevel: "warning",
  platform: "browser",
  target: ["esnext"],
  define: {
    "globalThis.__EA_TEST_SURFACE_ENABLED__": "true",
    __EA_TEST_SURFACE_ENABLED__: "true",
  },
  minifySyntax: true,
  treeShaking: true,
  plugins: [
    {
      name: "shared-price-trace-context",
      setup(build) {
        build.onLoad(
          { filter: /captured-runtime-control/ },
          async ({ path }) => {
            const source = await readFile(path, "utf8");
            const marker =
              "  const runPhase = <T>(name: string, body: () => T): T | undefined => {\n    try {\n";
            const contextUpdate =
              '  const runPhase = <T>(name: string, body: () => T): T | undefined => {\n    const traceHooks = readProperty(settingsHostWindow, "__EA_TEST_HOOKS__");\n    const setNativePriceContext = readProperty(traceHooks, "setNativePriceContext");\n    if (typeof setNativePriceContext === "function") Reflect.apply(setNativePriceContext, traceHooks, [{ cycle: automationCycle, phase: name, actionCostEpoch }]);\n    try {\n';
            if (!source.includes(marker))
              throw new Error(
                "Price trace context injection point was not found",
              );
            return {
              contents: source.replace(marker, contextUpdate),
              loader: "ts",
            };
          },
        );
      },
    },
  ],
});

const save = parseSave(await readFile(savePath, "utf8"));
const settings = JSON.parse(await readFile(settingsPath, "utf8"));
settings.autoPrestige = false;
const runner = await createChromiumRunner();
try {
  const session = await runner.openSession({
    bundle: bundlePath,
    save,
    settings,
    seed: 42,
  });
  try {
    await session.advance(warmupPeriods);
    await session.evaluate(() => window.__EA_PRICE_TRACE__.arm());
    const traceStartedAt = performance.now();
    await session.advance(samplePeriods);
    const traceAdvanceWallMs = performance.now() - traceStartedAt;
    const events = await session.evaluate(() =>
      window.__EA_PRICE_TRACE__.read(),
    );
    const timerCalibration = await session.evaluate(() => ({
      medianMs: window.__EA_PRICE_TRACE__.timerOverheadMedianMs,
      p95Ms: window.__EA_PRICE_TRACE__.timerOverheadP95Ms,
      callbackCalibration: window.__EA_PRICE_TRACE__.readCallbackCalibration(),
    }));
    const timingSummary = summarize(events, timerCalibration.medianMs);
    timingSummary.instrumentationOverhead = {
      timerPairMedianMs: timerCalibration.medianMs,
      timerPairP95Ms: timerCalibration.p95Ms,
      observedPositiveDurationQuantumMs:
        timingSummary.observedPositiveDurationQuantumMs,
      traceCallbackTotalMs: timerCalibration.callbackCalibration.totalMs,
      traceCallbackMeanMsPerProbe: timerCalibration.callbackCalibration.meanMs,
      traceCallbackP95Ms: timerCalibration.callbackCalibration.p95Ms,
      measurementMethod:
        "native runner clock; per-probe timer pair is subtracted from native duration; callback work is measured separately; host wall comparisons are noisy diagnostics only",
    };
    const traceExport = await session.exportSave();
    const traceDiagnostics = await session.diagnostics();
    const baseline = await runner.openSession({
      bundle: `${root}evolve_automation.user.js`,
      save,
      settings,
      seed: 42,
    });
    let behavioralParity;
    try {
      await baseline.advance(warmupPeriods);
      const baselineStartedAt = performance.now();
      await baseline.advance(samplePeriods);
      const baselineAdvanceWallMs = performance.now() - baselineStartedAt;
      const baselineExport = await baseline.exportSave();
      const baselineDiagnostics = await baseline.diagnostics();
      behavioralParity = {
        exportIdentical: baselineExport === traceExport,
        controlUsageIdentical:
          JSON.stringify(baselineDiagnostics.controlUsage) ===
          JSON.stringify(traceDiagnostics.controlUsage),
        baselineBuildQueueSetData:
          baselineDiagnostics.controlUsage?.buildQueue?.setData,
        traceBuildQueueSetData:
          traceDiagnostics.controlUsage?.buildQueue?.setData,
        traceAdvanceWallMs,
        baselineAdvanceWallMs,
        hostWallOverheadPercent:
          (traceAdvanceWallMs / baselineAdvanceWallMs - 1) * 100,
      };
    } finally {
      await baseline.close();
    }
    const report = {
      saveName,
      periods: samplePeriods,
      maxCycles,
      bundle: session.bundle,
      gameSnapshot: runner.inputs.gameSnapshot,
      behavioralParity,
      timerCalibration,
      timingSummary,
      events,
    };
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 1)}\n`);
    console.log(
      JSON.stringify({
        outputPath,
        requests: events.length,
        cycles: [...new Set(events.map((event) => event.cycle))],
        estimatedReuseSavings: timingSummary.estimatedReuseSavings,
        hostWallOverheadPercent: behavioralParity.hostWallOverheadPercent,
      }),
    );
  } finally {
    await session.close();
  }
} finally {
  await runner.close();
}
