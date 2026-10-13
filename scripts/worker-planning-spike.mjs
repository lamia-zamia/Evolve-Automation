import path from "node:path";
import { fileURLToPath } from "node:url";

import * as esbuild from "esbuild";
import { findChrome, launchChrome } from "../tools/chromium/chrome.mjs";
import { planNativeResearchPrerequisites } from "../src/domain/progression/research-prerequisite-planning.ts";
import {
  researchGoalOfferIdentity,
  RESEARCH_GOAL_CANDIDATES_TASK,
} from "../src/adapters/browser/research-goal-candidates-worker.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workerBuild = await esbuild.build({
  absWorkingDir: root,
  entryPoints: [
    "src/adapters/browser/research-goal-candidates-worker-entry.ts",
  ],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "esnext",
  write: false,
  logLevel: "silent",
});
const workerSource = workerBuild.outputFiles[0]?.text;
if (workerSource === undefined) throw new Error("Worker bundle was empty");

const harnessSource = `
import { createPlanningScheduler } from "./src/application/planning-worker.ts";
import { evaluateResearchGoalCandidates } from "./src/domain/progression/research-goal-candidates.ts";
import { createEmbeddedPlanningWorker } from "./src/adapters/browser/planning-worker.ts";
import { decodeResearchGoalCandidateResponse } from "./src/adapters/browser/research-goal-candidates-worker.ts";
globalThis.__EA_WORKER_SPIKE__ = async ({ source, input, identity, iterations }) => {
  const timings = new Map();
  const recordTiming = (phase, durationMs) => {
    const values = timings.get(phase) ?? [];
    values.push(durationMs);
    timings.set(phase, values);
  };
  const memoryBefore = performance.memory?.usedJSHeapSize ?? null;
  const snapshotStartedAt = performance.now();
  const encodedSnapshot = JSON.stringify(input);
  const snapshotPreparationMs = performance.now() - snapshotStartedAt;
  const snapshotBytes = new TextEncoder().encode(encodedSnapshot).byteLength;
  const syncStartedAt = performance.now();
  let synchronousDecision;
  for (let index = 0; index < iterations; index += 1)
    synchronousDecision = evaluateResearchGoalCandidates(input);
  const synchronousTotalMs = performance.now() - syncStartedAt;
  const startupStartedAt = performance.now();
  const started = await createEmbeddedPlanningWorker(source, globalThis);
  const workerStartupMs = performance.now() - startupStartedAt;
  if (started.status !== "ready") return { status: "unavailable", workerStartupMs, detail: started };
  let resolveResponse;
  let rejectResponse;
  const scheduler = createPlanningScheduler({
    worker: started.worker,
    decodeResponse: decodeResearchGoalCandidateResponse,
    onResponse: (response) => {
      if (response.outcome.kind === "diagnostic") rejectResponse(new Error(response.outcome.message));
      else resolveResponse(response);
    },
    onDiagnostic: (code, detail) => rejectResponse?.(new Error(code + ": " + detail)),
    nowMs: () => performance.now(),
    recordTiming,
  });
  const workerStartedAt = performance.now();
  let workerDecision;
  for (let index = 0; index < iterations; index += 1) {
    const responsePromise = new Promise((resolve, reject) => {
      resolveResponse = resolve;
      rejectResponse = reject;
    });
    scheduler.submit({ ...identity, snapshotVersion: identity.snapshotVersion + index }, input);
    const response = await responsePromise;
    workerDecision = response.outcome.value;
  }
  const workerRoundTripTotalMs = performance.now() - workerStartedAt;
  globalThis.__EA_WORKER_SPIKE_CLOSE__ = () => scheduler.close();
  const samples = Object.fromEntries([...timings].map(([name, values]) => [name, values]));
  return {
    status: "ready",
    iterations,
    snapshotPreparationMs,
    snapshotBytes,
    synchronousTotalMs,
    synchronousPerCallMs: synchronousTotalMs / iterations,
    workerStartupMs,
    workerRoundTripTotalMs,
    workerRoundTripPerCallMs: workerRoundTripTotalMs / iterations,
    resultEquivalent: JSON.stringify(synchronousDecision) === JSON.stringify(workerDecision),
    memoryBefore,
    memoryAfter: performance.memory?.usedJSHeapSize ?? null,
    timingSamples: samples,
    discarded: scheduler.readDiscardedCount(),
  };
};
`;
const harnessBuild = await esbuild.build({
  absWorkingDir: root,
  stdin: {
    contents: harnessSource,
    resolveDir: root,
    sourcefile: "worker-planning-spike-harness.js",
    loader: "js",
  },
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "esnext",
  write: false,
  logLevel: "silent",
});
const harness = harnessBuild.outputFiles[0]?.text;
if (harness === undefined) throw new Error("Browser harness bundle was empty");

const definitions = [
  {
    actionId: "tech-terminal",
    grantTechnology: "terminal",
    grantLevel: 1,
    prerequisites: {
      kind: "declared",
      requirements: [{ technologyId: "ore", requiredLevel: 1 }],
    },
    hasNativeCondition: false,
    routeRestrictions: undefined,
    restrictions: [],
  },
  {
    actionId: "tech-ore",
    grantTechnology: "ore",
    grantLevel: 1,
    prerequisites: { kind: "declared", requirements: [] },
    hasNativeCondition: false,
    routeRestrictions: undefined,
    restrictions: [],
  },
  {
    actionId: "tech-luxury",
    grantTechnology: "luxury",
    grantLevel: 1,
    prerequisites: { kind: "declared", requirements: [] },
    hasNativeCondition: false,
    routeRestrictions: undefined,
    restrictions: [],
  },
];
const offers = [
  {
    actionId: "tech-ore",
    grantTechnology: "ore",
    grantLevel: 1,
    index: 0,
    generation: 4,
    cost: { Knowledge: 100 },
    nativeAffordable: true,
    resourceAffordable: true,
    hasCostConflict: false,
    hasExplicitExclusion: false,
  },
  {
    actionId: "tech-luxury",
    grantTechnology: "luxury",
    grantLevel: 1,
    index: 1,
    generation: 8,
    cost: { Knowledge: 25 },
    nativeAffordable: true,
    resourceAffordable: true,
    hasCostConflict: false,
    hasExplicitExclusion: false,
  },
];
const graph = planNativeResearchPrerequisites({
  targetActionId: "tech-terminal",
  definitions,
  grantLevels: new Map([
    ["terminal", 0],
    ["ore", 0],
    ["luxury", 0],
  ]),
  offeredActionIds: new Set(offers.map(({ actionId }) => actionId)),
  offerGenerations: new Map(
    offers.map(({ actionId, generation }) => [actionId, generation]),
  ),
  cycle: 12,
  progressionEpoch: "run:5",
  rootGeneration: 3,
  maxDepth: 12,
  maxActions: 40,
});
const input = {
  goalId: "prestige:mad",
  targetActionId: "tech-terminal",
  goalSatisfied: false,
  graph,
  cycle: 12,
  progressionEpoch: "run:5",
  rootGeneration: 3,
  offers,
  baselineSelectedActionId: "tech-luxury",
};
const identity = {
  task: RESEARCH_GOAL_CANDIDATES_TASK,
  rootGeneration: 3,
  progressionEpoch: "run:5",
  offerIdentity: researchGoalOfferIdentity(input),
  snapshotVersion: 1,
};

const executable = findChrome();
const launched = await launchChrome({
  executablePath: executable,
  headless: true,
});
try {
  const page = await launched.browser.newPage();
  const workerTargets = [];
  launched.browser.on("targetcreated", (target) => {
    if (target.type() === "worker" && target.url().startsWith("blob:"))
      workerTargets.push(target);
  });
  await page.goto("https://evolvebeta.github.io/Evolve/", {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page.addScriptTag({ content: harness });
  const result = await page.evaluate(
    (request) => globalThis.__EA_WORKER_SPIKE__(request),
    { source: workerSource, input, identity, iterations: 40 },
  );
  if (result.status !== "ready")
    throw new Error(`Embedded worker unavailable: ${JSON.stringify(result)}`);

  let workerHeap = null;
  let workerHeapError = null;
  const target = workerTargets.at(-1);
  if (target !== undefined) {
    try {
      const session = await target.createCDPSession();
      await session.send("Runtime.enable");
      const usage = await session.send("Runtime.getHeapUsage");
      workerHeap = usage.usedSize;
      await session.detach();
    } catch (error) {
      workerHeapError = String(error);
    }
  }
  const summarize = (values) => {
    const sorted = [...values].sort((left, right) => left - right);
    if (sorted.length === 0) return null;
    const percentile = (ratio) =>
      sorted[Math.min(sorted.length - 1, Math.ceil(ratio * sorted.length) - 1)];
    return {
      count: sorted.length,
      mean: Number(
        (sorted.reduce((sum, value) => sum + value, 0) / sorted.length).toFixed(
          4,
        ),
      ),
      p50: Number(percentile(0.5).toFixed(4)),
      p95: Number(percentile(0.95).toFixed(4)),
      max: Number(sorted.at(-1).toFixed(4)),
    };
  };
  const timingSummaries = Object.fromEntries(
    Object.entries(result.timingSamples).map(([name, values]) => [
      name,
      summarize(values),
    ]),
  );
  const workerTargetInventory = launched.browser
    .targets()
    .filter((entry) => entry.type() === "worker")
    .map((entry) => ({ type: entry.type(), url: entry.url() }));
  const pageWorkerInventory = await Promise.all(
    page.workers().map(async (worker) => ({
      url: worker.url(),
      memory: await worker
        .evaluate(() => ({
          available: typeof performance.memory !== "undefined",
          usedBytes: performance.memory?.usedJSHeapSize ?? null,
        }))
        .catch(() => null),
    })),
  );
  const userAgentMemory = await page
    .evaluate(async () => {
      if (typeof performance.measureUserAgentSpecificMemory !== "function")
        return null;
      try {
        return (await performance.measureUserAgentSpecificMemory()).bytes;
      } catch {
        return null;
      }
    })
    .catch(() => null);
  await page.evaluate(() => globalThis.__EA_WORKER_SPIKE_CLOSE__?.());

  let pageReloadTerminatedPlanningWorker = false;
  let pageReloadTestError = null;
  let reloadPage;
  try {
    reloadPage = await launched.browser.newPage();
    await reloadPage.goto("https://evolvebeta.github.io/Evolve/", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await reloadPage.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const workerUrl = URL.createObjectURL(
            new Blob(["self.onmessage = () => self.postMessage('ready')"], {
              type: "text/javascript",
            }),
          );
          const worker = new globalThis.Worker(workerUrl);
          globalThis.__EA_RELOAD_WORKER__ = worker;
          const timeout = setTimeout(
            () => reject(new Error("Reload probe worker startup timed out")),
            5_000,
          );
          worker.onmessage = () => {
            clearTimeout(timeout);
            resolve(true);
          };
          worker.onerror = (event) => {
            clearTimeout(timeout);
            reject(new Error(event.message));
          };
          worker.postMessage("ready");
        }),
    );
    const reloadPlanningWorker = reloadPage
      .workers()
      .find((worker) => worker.url().startsWith("blob:"));
    if (reloadPlanningWorker === undefined)
      throw new Error("Reload probe worker handle was not visible");
    await reloadPage.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
    pageReloadTerminatedPlanningWorker = await Promise.race([
      reloadPlanningWorker
        .evaluate(() => true)
        .then(() => false)
        .catch(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 5_000)),
    ]);
  } catch (error) {
    pageReloadTestError = String(error);
  } finally {
    await reloadPage?.close();
  }
  const report = {
    host: "https://evolvebeta.github.io/Evolve/",
    browser: launched.version,
    workerSourceBytes: Buffer.byteLength(workerSource),
    workerHeapBytes: workerHeap,
    workerHeapError,
    workerTargetInventory,
    pageWorkerInventory,
    userAgentMemoryBytes: userAgentMemory,
    pageReloadTerminatedPlanningWorker,
    pageReloadTestError,
    ...result,
    timingSummaries,
    timingSamples: undefined,
  };
  console.log(JSON.stringify(report, null, 2));
} finally {
  await launched.close();
}
