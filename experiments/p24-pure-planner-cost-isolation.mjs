import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { createBuildOptions } from "../build-config.mjs";
import {
  createChromiumRunner,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const savePath = path.join(
  root,
  "test-artifacts/benchmark/slice0/saves/mad-tech-offered-blocked.json",
);
const settingsPath = path.join(
  root,
  "test-artifacts/benchmark/slice0/settings/current-full.json",
);
const outputPath = path.join(
  root,
  "experiments/p24-pure-planner-cost-isolation-evidence.json",
);
const runBundlePath = path.join(
  root,
  "test-artifacts/benchmark/tmp/p24-test-surface.user.js",
);
const controlBundlePath = path.join(
  root,
  "test-artifacts/benchmark/tmp/p24-control-test-surface.user.js",
);
const seed = 42;
const epoch = Date.parse("2026-09-21T00:00:00.000Z");
const periods = 800;
const hash = (value) => createHash("sha256").update(value).digest("hex");
function replaceOnce(source, needle, replacement) {
  const first = source.indexOf(needle);
  assert.notEqual(
    first,
    -1,
    `P24 transform anchor missing: ${needle.slice(0, 90)}`,
  );
  assert.equal(
    source.indexOf(needle, first + needle.length),
    -1,
    `P24 transform anchor is ambiguous: ${needle.slice(0, 90)}`,
  );
  return `${source.slice(0, first)}${replacement}${source.slice(first + needle.length)}`;
}
const summarize = (samples) => {
  const sorted = samples.toSorted((left, right) => left - right);
  const quantile = (q) => sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)];
  return sorted.length === 0
    ? null
    : {
        sampleCount: sorted.length,
        p50Ms: Number(quantile(0.5).toFixed(5)),
        p95Ms: Number(quantile(0.95).toFixed(5)),
        p99Ms: Number(quantile(0.99).toFixed(5)),
        maximumMs: Number(sorted.at(-1).toFixed(5)),
      };
};

const [saveText, settings, gameText, productionBundle] = await Promise.all([
  readFile(savePath, "utf8"),
  readFile(settingsPath, "utf8").then(JSON.parse),
  readFile(path.join(root, "test-artifacts/game/evolve-deadspace.js")),
  readFile(path.join(root, "evolve_automation.user.js")),
]);
const metadata = (
  await readFile(path.join(root, "src/userscript.meta.js"), "utf8")
).trimEnd();
const buildOptions = createBuildOptions({
  root,
  outfile: runBundlePath,
  banner: { js: `${metadata}\n\n// P24 test-surface measurement build.` },
  plugins: [
    {
      name: "p24-test-only-jobs-timing",
      setup(build) {
        build.onLoad(
          { filter: /src[\\/]application[\\/]jobs\.ts$/ },
          async (args) => {
            let source = await readFile(args.path, "utf8");
            source = replaceOnce(
              source,
              "  const decision = planJobs(dependencies.reader.readCycle(craftOnly));",
              `  const captureStartedAt = __eaP24Now();
  const input = dependencies.reader.readCycle(craftOnly);
  const planningStartedAt = __eaP24Now();
  const decision = planJobs(input);
  __eaP24Observe({ kind: "plan-timing", path: craftOnly ? "craftsmen-only" : "ordinary", captureMs: planningStartedAt - captureStartedAt, planningMs: __eaP24Now() - planningStartedAt, input, decision });`,
            );
            source = replaceOnce(
              source,
              "  const outcome = dependencies.executor.execute(decision);",
              `  const executionStartedAt = __eaP24Now();
  const outcome = dependencies.executor.execute(decision);
  __eaP24Observe({ kind: "execution-timing", path: craftOnly ? "craftsmen-only" : "ordinary", executionMs: __eaP24Now() - executionStartedAt, outcome: outcome.status, input, decision });`,
            );
            source = `const __eaP24Now = () => typeof globalThis.eaDiagnosticsNow === "function" ? globalThis.eaDiagnosticsNow() : globalThis.performance.now();
const __eaP24Observe = (event) => { const hook = globalThis.__EA_TEST_HOOKS__?.observeJobsTrace; if (typeof hook === "function") hook(event); };\n${source}`;
            return { contents: source, loader: "ts" };
          },
        );
        build.onLoad(
          {
            filter:
              /src[\\/]adapters[\\/]evolve[\\/]civic[\\/]captured-ordinary-jobs\.ts$/,
          },
          async (args) => {
            let source = await readFile(args.path, "utf8");
            source = `const __eaP24AdapterNow = () => typeof globalThis.eaDiagnosticsNow === "function" ? globalThis.eaDiagnosticsNow() : globalThis.performance.now();
const __eaP24AdapterObserve = (event) => { const hook = globalThis.__EA_TEST_HOOKS__?.observeJobsTrace; if (typeof hook === "function") hook(event); };\n${source}`;
            source = replaceOnce(
              source,
              "      const expected = planJobs(session.input);",
              `      const validationStartedAt = __eaP24AdapterNow();
      const expected = planJobs(session.input);
      __eaP24AdapterObserve({ kind: "plan-timing", path: "ordinary-execution-validation", captureMs: 0, planningMs: __eaP24AdapterNow() - validationStartedAt, input: session.input, decision: expected });`,
            );
            source = replaceOnce(
              source,
              "  const prepare = () => {\n    const generation = ++prepareGeneration;",
              "  const prepare = () => {\n    const prepareStartedAt = __eaP24AdapterNow();\n    const generation = ++prepareGeneration;",
            );
            source = replaceOnce(
              source,
              `    const decision = measure("jobs.full.plan", () => {
      tally.count("jobs.full.planCalls");
      return planJobs(sampled.input);
    });`,
              `    const planningStartedAt = __eaP24AdapterNow();
    const decision = measure("jobs.full.plan", () => {
      tally.count("jobs.full.planCalls");
      return planJobs(sampled.input);
    });
    __eaP24AdapterObserve({ kind: "plan-timing", path: "full", captureMs: planningStartedAt - prepareStartedAt, planningMs: __eaP24AdapterNow() - planningStartedAt, input: sampled.input, decision });`,
            );
            return { contents: source, loader: "ts" };
          },
        );
        build.onLoad(
          { filter: /src[\\/]bootstrap[\\/]captured-runtime-control\.ts$/ },
          async (args) => {
            const source = replaceOnce(
              await readFile(args.path, "utf8"),
              "    const outcome = runPreparedJobsAutomation(prepared, publishSpaceMinerPlan);",
              `    const executionStartedAt = typeof globalThis.eaDiagnosticsNow === "function" ? globalThis.eaDiagnosticsNow() : globalThis.performance.now();
    const outcome = runPreparedJobsAutomation(prepared, publishSpaceMinerPlan);
    const hooks = readProperty(settingsHostWindow, "__EA_TEST_HOOKS__");
    const trace = readProperty(hooks, "observeJobsTrace");
    if (typeof trace === "function") trace({ kind: "execution-timing", path: "full", executionMs: (typeof globalThis.eaDiagnosticsNow === "function" ? globalThis.eaDiagnosticsNow() : globalThis.performance.now()) - executionStartedAt, outcome: outcome.status, input, decision: prepared.decision });`,
            );
            return { contents: source, loader: "ts" };
          },
        );
      },
    },
  ],
});
buildOptions.define["globalThis.__EA_TEST_SURFACE_ENABLED__"] = "true";
buildOptions.define.__EA_TEST_SURFACE_ENABLED__ = "true";
await esbuild.build(buildOptions);
const testBundle = await readFile(runBundlePath);
const controlBuildOptions = createBuildOptions({
  root,
  outfile: controlBundlePath,
  banner: { js: `${metadata}\n\n// P24 uninstrumented test-surface control.` },
});
controlBuildOptions.define["globalThis.__EA_TEST_SURFACE_ENABLED__"] = "true";
controlBuildOptions.define.__EA_TEST_SURFACE_ENABLED__ = "true";
await esbuild.build(controlBuildOptions);

const plannerBundle = await esbuild.build({
  absWorkingDir: root,
  stdin: {
    contents:
      'import { planJobs } from "./src/domain/civic/jobs.ts"; globalThis.__P24_PLAN_JOBS__ = planJobs;',
    resolveDir: root,
    sourcefile: "p24-planner-probe.ts",
    loader: "ts",
  },
  bundle: true,
  format: "iife",
  globalName: "P24PlannerModule",
  platform: "browser",
  target: "esnext",
  write: false,
});
const plannerProbeSource = plannerBundle.outputFiles[0].text;

const runner = await createChromiumRunner();
async function run({ bundle, observe }) {
  const session = await runner.openSession({
    bundle,
    save: parseSave(saveText),
    settings,
    seed,
    epoch,
    perf: true,
    nativeTrace: true,
  });
  try {
    if (observe) {
      await session.evaluate((source) => {
        const script = document.createElement("script");
        script.textContent = source;
        document.documentElement.appendChild(script);
        script.remove();
        window.__p24Events = [];
        window.__p24Input = undefined;
        const observeJobsTrace = (event) => {
          if (event.kind !== "plan-timing" && event.kind !== "execution-timing")
            return;
          const input = event.input;
          const decision = event.decision;
          let changedAssignments = null;
          if (decision !== null && decision !== undefined) {
            const jobs = new Map(input.jobs.map((job) => [job.token, job]));
            changedAssignments = decision.assignments.filter((assignment) => {
              const job = jobs.get(assignment.jobToken);
              return (
                job !== undefined &&
                (assignment.workers !== job.workers ||
                  assignment.servants !== job.servants)
              );
            }).length;
          }
          window.__p24Events.push({
            kind: event.kind,
            path: event.path,
            captureMs: event.captureMs,
            planningMs: event.planningMs,
            executionMs: event.executionMs,
            outcome: event.outcome,
            nullDecision: decision === null,
            changedAssignments,
            input,
          });
          if (
            window.__p24Input === undefined &&
            event.kind === "plan-timing" &&
            event.path === "full" &&
            changedAssignments > 0
          )
            window.__p24Input = input;
        };
        window.__EA_TEST_HOOKS__ = {
          ...window.__EA_TEST_HOOKS__,
          observeJobsTrace,
        };
      }, plannerProbeSource);
    }
    await session.advance(periods);
    const [diagnostics, state, exportSave, observed] = await Promise.all([
      session.diagnostics(),
      session.readState(),
      session.exportSave(),
      observe
        ? session.evaluate(() => ({
            events: window.__p24Events,
            input: window.__p24Input,
          }))
        : undefined,
    ]);
    let transfer = null;
    let microbenchmark = null;
    if (observe && observed.input !== undefined) {
      const cloneMeasurement = await session.evaluate(() => {
        const inputs = window.__p24Events
          .filter(
            (event) =>
              event.kind === "plan-timing" && event.input !== undefined,
          )
          .map((event) => event.input);
        const now = () =>
          typeof globalThis.eaDiagnosticsNow === "function"
            ? globalThis.eaDiagnosticsNow()
            : globalThis.performance.now();
        const samples = [];
        const sizes = [];
        for (const input of inputs) {
          sizes.push(new TextEncoder().encode(JSON.stringify(input)).length);
          for (let index = 0; index < 5; index += 1) {
            const started = now();
            structuredClone(input);
            samples.push(now() - started);
          }
        }
        return {
          inputCount: inputs.length,
          jsonUtf8Bytes: sizes,
          samples,
        };
      });
      const payloadSizes = cloneMeasurement.jsonUtf8Bytes.toSorted(
        (left, right) => left - right,
      );
      transfer = {
        structuredCloneCompatible: true,
        capturedInputCount: cloneMeasurement.inputCount,
        jsonUtf8Bytes: {
          minimum: payloadSizes[0],
          p50: payloadSizes[Math.floor(payloadSizes.length / 2)],
          maximum: payloadSizes.at(-1),
        },
        structuredCloneInPage: summarize(cloneMeasurement.samples),
      };
      microbenchmark = await session.evaluate(() => {
        const input = window.__p24Input;
        const plan = globalThis.__P24_PLAN_JOBS__;
        const now = () =>
          typeof globalThis.eaDiagnosticsNow === "function"
            ? globalThis.eaDiagnosticsNow()
            : globalThis.performance.now();
        const runs = [];
        for (let warm = 0; warm < 100; warm += 1) plan(input);
        for (let run = 0; run < 5; run += 1) {
          const started = now();
          for (let index = 0; index < 1000; index += 1) plan(input);
          runs.push((now() - started) / 1000);
        }
        return {
          label:
            "artificial repeated-input compute-throughput measurement; not per-cycle savings",
          invocationsPerRun: 1000,
          runP50Ms: runs.toSorted((a, b) => a - b)[2],
          runsMsPerInvocation: runs,
        };
      });
    }
    return {
      bundleSha256: hash(await readFile(bundle)),
      workTicks: diagnostics.workTicks,
      randomCalls: diagnostics.randomCalls,
      controlUsage: diagnostics.controlUsage,
      nativeInvocationSha256: hash(
        JSON.stringify(diagnostics.nativeInvocations),
      ),
      nativeInvocationCount: diagnostics.nativeInvocations.length,
      stateSha256: hash(JSON.stringify(state)),
      exportSha256: hash(exportSave),
      events: observed?.events ?? [],
      transfer,
      microbenchmark,
    };
  } finally {
    await session.close();
  }
}

try {
  const baseline = await run({ bundle: controlBundlePath, observe: false });
  const measured = await run({ bundle: runBundlePath, observe: true });
  assert.equal(measured.workTicks, 100);
  assert.equal(measured.randomCalls, baseline.randomCalls);
  assert.equal(
    measured.nativeInvocationSha256,
    baseline.nativeInvocationSha256,
  );
  assert.equal(measured.stateSha256, baseline.stateSha256);
  assert.equal(measured.exportSha256, baseline.exportSha256);
  const plans = measured.events.filter((event) => event.kind === "plan-timing");
  const executions = measured.events.filter(
    (event) => event.kind === "execution-timing",
  );
  const planningMs = plans.map((event) => event.planningMs);
  const captureMs = plans.map((event) => event.captureMs);
  const fullExecutionMs = executions
    .filter((event) => event.path === "full")
    .map((event) => event.executionMs);
  assert.equal(plans.length, 100);
  assert.equal(executions.length, 100);
  const report = {
    stage: "P24 test-surface pure planner cost isolation",
    fixture:
      "test-artifacts/benchmark/slice0/saves/mad-tech-offered-blocked.json",
    settings: "test-artifacts/benchmark/slice0/settings/current-full.json",
    saveSha256: hash(saveText),
    settingsSha256: hash(JSON.stringify(settings)),
    gameSnapshotSha256: hash(gameText),
    productionBundleSha256: hash(productionBundle),
    testSurfaceBundleSha256: hash(testBundle),
    controlTestSurfaceBundleSha256: baseline.bundleSha256,
    chromium: runner.browser.version,
    seed,
    epoch: new Date(epoch).toISOString(),
    periods,
    baseline: {
      mode: "same test-surface build without P24 timing transforms",
      workTicks: baseline.workTicks,
      randomCalls: baseline.randomCalls,
      nativeInvocationCount: baseline.nativeInvocationCount,
      nativeInvocationSha256: baseline.nativeInvocationSha256,
      stateSha256: baseline.stateSha256,
      exportSha256: baseline.exportSha256,
    },
    instrumentationParity: {
      workTicks: measured.workTicks,
      randomCalls: measured.randomCalls,
      nativeInvocationCount: measured.nativeInvocationCount,
      nativeInvocationSha256: measured.nativeInvocationSha256,
      stateSha256: measured.stateSha256,
      exportSha256: measured.exportSha256,
      exactParity: true,
    },
    jobs: {
      path: "full",
      invocationCount: plans.length,
      capture: summarize(captureMs),
      purePlanning: summarize(planningMs),
      execution: summarize(fullExecutionMs),
      totalOwnerEstimate: summarize(
        plans.map(
          (event, index) =>
            event.captureMs + event.planningMs + fullExecutionMs[index],
        ),
      ),
      nullDecisionCount: plans.filter((event) => event.nullDecision).length,
      noAssignmentChangeCount: plans.filter(
        (event) => !event.nullDecision && event.changedAssignments === 0,
      ).length,
      changedDecisionCount: plans.filter(
        (event) => event.changedAssignments > 0,
      ).length,
      planningFractionOfMeasuredSegments: Number(
        (
          planningMs.reduce((a, b) => a + b, 0) /
          plans.reduce(
            (total, event, index) =>
              total +
              event.captureMs +
              event.planningMs +
              fullExecutionMs[index],
            0,
          )
        ).toFixed(6),
      ),
      theoreticalMainThreadCallbackRemovalFraction: Number(
        (
          planningMs.reduce((a, b) => a + b, 0) /
          plans.reduce(
            (total, event, index) =>
              total +
              event.captureMs +
              event.planningMs +
              fullExecutionMs[index],
            0,
          )
        ).toFixed(6),
      ),
      captureAndPlanningSameOwnerCallback: true,
      nextDecisionDeadline:
        "before the current synchronous autoJobs with autoCraftsmen owner returns and before later owners run",
      delayedDecisionSemantics:
        "not established; settings, prices, resources, controls and preceding-owner mutations can change",
      plannerTransferability:
        "JobsCycleInput and JobsDecision are structured-clone-compatible records of primitives and arrays; planJobs only computes over the input and creates local Maps. It does not depend on DOM/native objects or closures.",
      resultAuthority: [
        "prepared generation must remain current and the one-shot prepared execution must not have been consumed",
        "captured game root identity must remain unchanged",
        "native multiplier latch must be none-latched",
        "current catalog, settings, and full Jobs input must still match the captured snapshot",
        "required current native control methods must be available",
        "native assignment must pass the existing postcondition before the owner publishes coherent plan state",
      ],
      otherPolicyChecks: [
        "Jobs settings determine whether the combined full path or split ordinary/craftsmen paths own the cycle",
        "current demand and building-price observations contribute to foundry policy capture",
        "a successful ordinary plan publishes the prospective Space Miner cap for later owners",
      ],
    },
    transfer: measured.transfer,
    artificialMicrobenchmark: measured.microbenchmark,
    samples: measured.events.map(({ input, ...event }) => event),
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        outputPath,
        jobs: report.jobs,
        transfer: report.transfer,
        artificialMicrobenchmark: report.artificialMicrobenchmark,
      },
      null,
      2,
    ),
  );
} finally {
  await runner.close();
}
