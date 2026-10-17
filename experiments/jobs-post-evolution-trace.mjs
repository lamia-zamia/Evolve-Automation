import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  createChromiumRunner,
  decodeExport,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const bundle = resolve(root, "evolve_automation.user.js");
const bundleBytes = await readFile(bundle);
const bundleText = bundleBytes.toString("utf8");
const bundleIdentity = createHash("sha256").update(bundleBytes).digest("hex");
for (const marker of [
  "captureCompletedTechConditionsDuring",
  "researchConditionGateCompromised",
  "researchConditionGateObserveRegistry",
]) {
  assert.equal(
    bundleText.includes(marker),
    false,
    `ordinary bundle omits ${marker}`,
  );
}
const esbuild = await import(
  pathToFileURL(resolve(root, "node_modules/esbuild/lib/main.js"))
);
const traceBundle = resolve(root, "test-artifacts/local/jobs-trace.user.js");
await mkdir(resolve(root, "test-artifacts/local"), { recursive: true });
const traceBuild = await esbuild.build({
  absWorkingDir: root,
  entryPoints: [resolve(root, "src/main.ts")],
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  target: ["esnext"],
  define: {
    "globalThis.__EA_TEST_SURFACE_ENABLED__": "true",
    __EA_TEST_SURFACE_ENABLED__: "true",
    __EA_RESEARCH_CONDITION_GATE_ENABLED__: "false",
  },
  minifySyntax: true,
  treeShaking: true,
  logLevel: "silent",
});
const metadata = bundleText.slice(0, bundleText.indexOf("\n\n"));
const installJobsTrace = () => {
  const storageKey = "__EA_JOBS_TRACE__";
  const initial = () => ({
    events: [],
    counts: {},
    occurrences: {},
    lastJobsPeriod: -1,
    lastJobsPhases: [],
    phaseCounts: {},
    duplicateJobsPeriods: [],
    nativeInvocations: 0,
    successfulPostconditions: 0,
    changedAssignments: 0,
    lastPeriod: -1,
    workTick: 0,
    nextRootId: 1,
  });
  const read = () => {
    try {
      return (
        JSON.parse(sessionStorage.getItem(storageKey) ?? "null") ?? initial()
      );
    } catch {
      return initial();
    }
  };
  const trace = read();
  const rootIds = new WeakMap();
  const rootIdentity = (root) => {
    if (
      (typeof root !== "object" && typeof root !== "function") ||
      root === null
    )
      return null;
    let id = rootIds.get(root);
    if (id === undefined) {
      id = `${window.__EA_RUNNER__?.loads?.() ?? 0}:${trace.nextRootId++}`;
      rootIds.set(root, id);
    }
    return id;
  };
  const advanceJobsTick = () => {
    const period = window.__EA_RUNNER__?.periods?.() ?? null;
    if (period !== trace.lastPeriod) {
      trace.workTick++;
      trace.lastPeriod = period;
    }
    return period;
  };
  const persist = () => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(trace));
    } catch {
      // The bounded test trace must not affect game behavior if storage is unavailable.
    }
  };
  const hooks = (window.__EA_TEST_HOOKS__ ??= {});
  hooks.observeJobsAutomation = (phase, outcome) => {
    advanceJobsTick();
    const period = window.__EA_RUNNER__?.periods?.() ?? null;
    if (period !== trace.lastJobsPeriod) {
      trace.lastJobsPeriod = period;
      trace.lastJobsPhases = [];
    }
    trace.phaseCounts[phase] = (trace.phaseCounts[phase] ?? 0) + 1;
    const phases = trace.lastJobsPhases;
    phases.push({ phase, status: outcome?.status ?? null });
    if (
      phases.some(({ phase: name }) => name === "autoJobs") &&
      phases.some(
        ({ phase: name }) => name === "autoJobs with autoCraftsmen",
      ) &&
      !trace.duplicateJobsPeriods.includes(period) &&
      trace.duplicateJobsPeriods.length < 32
    ) {
      trace.duplicateJobsPeriods.push(period);
    }
  };
  hooks.observeJobsTrace = (event) => {
    const period = advanceJobsTick();
    const capture = window[Symbol.for("evolve-automation.page-capture")];
    const code = event.failureCode;
    trace.counts[code] = (trace.counts[code] ?? 0) + 1;
    trace.nativeInvocations += (event.invocations ?? []).reduce(
      (total, invocation) => total + (invocation.count ?? 1),
      0,
    );
    if (code === "jobs-assignment-postcondition-succeeded") {
      trace.successfulPostconditions++;
      trace.changedAssignments += event.actual?.changedAssignments?.length ?? 0;
    }
    const occurrence = {
      workTick: trace.workTick,
      period,
      gameDay: event.root?.stats?.days ?? null,
    };
    const keyState = window.__EA_RUNNER__?.diagnostics?.()?.keyState;
    const multiplierEnabled = event.root?.settings?.mKeys === true;
    const multiplierLatches = {
      x10: capture?.keyState?.readMultiplierLatch?.("x10"),
      x25: capture?.keyState?.readMultiplierLatch?.("x25"),
      x100: capture?.keyState?.readMultiplierLatch?.("x100"),
    };
    const latchesKnown = Object.values(multiplierLatches).every(
      (value) => typeof value === "boolean",
    );
    const clickMultiplier = !multiplierEnabled
      ? 1
      : !latchesKnown
        ? null
        : (multiplierLatches.x10 ? 10 : 1) *
          (multiplierLatches.x25 ? 25 : 1) *
          (multiplierLatches.x100 ? 100 : 1);
    const occurrences = (trace.occurrences[code] ??= []);
    if (occurrences.length < 32) occurrences.push(occurrence);
    const traceKey =
      code === "jobs-assignment-postcondition-succeeded" &&
      (trace.counts["full-jobs-controls-not-ready"] ?? 0) > 0
        ? `${code}:after-controls-not-ready`
        : code;
    if (!trace.events.some((event) => event.traceKey === traceKey)) {
      const { root, currentRoot, ...detail } = event;
      trace.events.push({
        traceKey,
        ...detail,
        ...occurrence,
        clickMultiplier,
        multiplierLatches,
        keyState,
        gameSettings: {
          mKeys: root?.settings?.mKeys ?? null,
          keyMap: root?.settings?.keyMap ?? null,
        },
        species: root?.race?.species ?? null,
        reset: root?.stats?.reset ?? null,
        rootIdentity: rootIdentity(root),
        currentRootIdentity: rootIdentity(currentRoot),
      });
    }
    persist();
  };
  window.addEventListener("beforeunload", persist, { once: true });
};
await writeFile(
  traceBundle,
  `${metadata}\n\n;(${installJobsTrace.toString()})();\n\n${traceBuild.outputFiles[0].text}`,
  "utf8",
);

const save = parseSave(
  await readFile(
    resolve(
      root,
      "test-artifacts/benchmark/slice0/saves/deadspace-late-2026-10-12.txt",
    ),
    "utf8",
  ),
);
const rawSettings = JSON.parse(
  await readFile(
    resolve(root, "test-artifacts/benchmark/slice0/settings/mad-disabled.json"),
    "utf8",
  ),
);
const settings = JSON.stringify({
  ...rawSettings,
  autoPrestige: true,
  autoEvolution: true,
  autoResearch: true,
  autoBuild: true,
  buildingAlwaysClick: false,
  evolutionQueue: [],
  evolutionQueueEnabled: false,
});

const games = [
  {
    label: "pinned DeadSpace",
    path: resolve(root, "test-artifacts/game/evolve-deadspace.js"),
    upstream: "D:/work/Evolve-DeadSpace",
    commit: "db38e2af831907d49aeb5348d678d8d8745d6c3f",
  },
];

function currentNativeState() {
  const capture = window[Symbol.for("evolve-automation.page-capture")];
  const state = capture?.rootState?.readRoot?.();
  const civic = state?.civic;
  const servants = state?.race?.servants;
  const jobs = Object.entries(civic ?? {})
    .filter(([id, job]) => job && typeof job === "object" && job.job === id)
    .map(([id, job]) => ({ id, workers: job.workers, assigned: job.assigned }));
  const jobControls = (capture?.controls?.capturedElementIds?.() ?? [])
    .filter((id) => /job|servant|farmer|craft/i.test(id))
    .map((id) => ({
      id,
      methods: [...(capture.controls.resolve(id)?.methods ?? [])],
    }));
  return {
    loads: window.__EA_RUNNER__?.loads?.() ?? null,
    species: state?.race?.species ?? null,
    reset: state?.stats?.reset ?? null,
    day: state?.stats?.days ?? null,
    multiplierLatch: {
      x10: capture?.keyState?.readMultiplierLatch?.("x10") ?? null,
      x25: capture?.keyState?.readMultiplierLatch?.("x25") ?? null,
      x100: capture?.keyState?.readMultiplierLatch?.("x100") ?? null,
    },
    RNA: state?.resource?.RNA?.amount ?? null,
    DNA: state?.resource?.DNA?.amount ?? null,
    jobs: {
      defaultJobId: civic?.d_job ?? null,
      workers: jobs,
      defaultWorkers: civic?.[civic?.d_job]?.workers ?? null,
      servantPool: servants
        ? {
            maximum: servants.max ?? null,
            used: servants.used ?? null,
            jobs: { ...servants.jobs },
          }
        : null,
      craftsmen: civic?.craftsman?.workers ?? null,
      foundry: Object.fromEntries(
        Object.entries(state?.city?.foundry ?? {}).filter(
          ([, value]) => typeof value === "number",
        ),
      ),
    },
    jobControls,
  };
}

const reports = [];
for (const game of games) {
  const runner = await createChromiumRunner({
    game: game.path,
    upstream: game.upstream,
  });
  let session;
  try {
    session = await runner.openSession({
      bundle: traceBundle,
      save,
      settings,
      seed: 42,
      perf: true,
      snapshotAt: [43, 51],
    });
    await session.page.mouse.move(1, 1);
    const initial = await session.evaluate(currentNativeState);
    await session.advance(43);
    await session.page.mouse.move(2, 2);
    await session.advance(8);
    await session.page.mouse.move(3, 3);
    for (let completed = 51; completed < 6000; completed += 100) {
      await session.advance(Math.min(100, 6000 - completed));
      await session.page.mouse.move(3 + (completed % 90), 4);
    }
    const final = await session.evaluate(currentNativeState);
    const snapshots = await session.snapshots();
    const protoplasm = decodeExport(snapshots[43].exportSave);
    const evolved = decodeExport(snapshots[51].exportSave);
    const diagnostics = await session.diagnostics();
    const usageAtEvolution = snapshots[51].controlUsage;
    const usage = diagnostics.controlUsage;
    const jobsTrace = await session.evaluate(() => {
      const trace = JSON.parse(
        sessionStorage.getItem("__EA_JOBS_TRACE__") ?? "null",
      );
      return {
        events: trace?.events ?? [],
        counts: { ...(trace?.counts ?? {}) },
        phaseCounts: { ...(trace?.phaseCounts ?? {}) },
        duplicateJobsPeriods: trace?.duplicateJobsPeriods ?? [],
        nativeInvocations: trace?.nativeInvocations ?? 0,
        successfulPostconditions: trace?.successfulPostconditions ?? 0,
        changedAssignments: trace?.changedAssignments ?? 0,
        occurrences: Object.fromEntries(
          Object.entries(trace?.occurrences ?? {}).map(([code, ticks]) => [
            code,
            { count: trace.counts[code] ?? 0, workTicks: ticks },
          ]),
        ),
      };
    });
    const count = (counts, key) => counts?.[key]?.returned ?? 0;
    const madCalls = {
      arm: count(usage, "mad.arm"),
      launch: count(usage, "mad.launch"),
    };
    const evolutionCalls = {
      humanoid: count(usage, "evolution-humanoid.action"),
      human: count(usage, "evolution-human.action"),
    };
    const constructionCallsAfterHuman = Object.fromEntries(
      Object.entries(usage)
        .filter(([key]) => /^city-.+\.action$/.test(key))
        .map(([key, calls]) => [
          key,
          Math.max(0, calls.returned - count(usageAtEvolution, key)),
        ])
        .filter(([, calls]) => calls > 0),
    );
    const report = {
      game: { label: game.label, commit: game.commit, path: game.path },
      bundle: { path: bundle, sha256: bundleIdentity },
      initial,
      snapshots: {
        protoplasm: {
          period: 43,
          species: protoplasm.race?.species ?? null,
          RNA: protoplasm.resource?.RNA?.amount ?? null,
          DNA: protoplasm.resource?.DNA?.amount ?? null,
        },
        human: {
          period: 51,
          species: evolved.race?.species ?? null,
          reset: evolved.stats?.reset ?? null,
        },
      },
      final,
      madCalls,
      evolutionCalls,
      constructionCallsAfterHuman,
      workTicks: diagnostics.workTicks,
      jobsAutomation: {
        phaseCounts: jobsTrace.phaseCounts,
        duplicateJobsPeriods: jobsTrace.duplicateJobsPeriods,
        nativeInvocations: jobsTrace.nativeInvocations,
        successfulPostconditions: jobsTrace.successfulPostconditions,
        changedAssignments: jobsTrace.changedAssignments,
      },
      jobsTrace,
      errors: diagnostics.events
        .filter((event) =>
          ["error", "pageerror", "rejection"].includes(event.kind),
        )
        .map(({ kind, text }) => ({ kind, text })),
      assertions: {
        resetIncreasedExactlyOnce: final.reset - initial.reset === 1,
        oneNewDocument: final.loads - initial.loads === 1,
        protoplasmInitialized:
          protoplasm.race?.species === "protoplasm" &&
          protoplasm.resource?.RNA !== undefined &&
          protoplasm.resource?.DNA !== undefined,
        nativeHumanoidAndHumanInvoked:
          evolutionCalls.humanoid > 0 && evolutionCalls.human > 0,
        speciesHuman: final.species === "human",
        civilizationConstructionAfterHuman:
          Object.keys(constructionCallsAfterHuman).length > 0,
        automationContinuedAfterEvolution:
          Object.keys(constructionCallsAfterHuman).length > 0,
      },
    };
    for (const [name, passed] of Object.entries(report.assertions)) {
      assert.equal(passed, true, `${game.label}: ${name}`);
    }
    assert.equal(madCalls.arm, 1, `${game.label}: MAD arm called once`);
    assert.equal(madCalls.launch, 1, `${game.label}: MAD launch called once`);
    reports.push(report);
  } finally {
    await session?.close();
    await runner.close();
  }
}

const traceReportPath = resolve(
  root,
  "test-artifacts/local/jobs-post-evolution-trace-report.json",
);
await writeFile(
  traceReportPath,
  JSON.stringify(
    { bundle: { path: bundle, sha256: bundleIdentity }, reports },
    null,
    2,
  ),
  "utf8",
);
console.log(
  JSON.stringify(
    {
      traceReportPath,
      reports: reports.map(({ game, jobsTrace, workTicks, assertions }) => ({
        game,
        workTicks,
        assertions,
        events: jobsTrace.counts,
        jobsAutomation: {
          phaseCounts: jobsTrace.phaseCounts,
          duplicateJobsPeriods: jobsTrace.duplicateJobsPeriods,
          nativeInvocations: jobsTrace.nativeInvocations,
          successfulPostconditions: jobsTrace.successfulPostconditions,
          changedAssignments: jobsTrace.changedAssignments,
        },
        firstEvents: jobsTrace.events.map((event) => ({
          traceKey: event.traceKey,
          failureCode: event.failureCode,
          path: event.path,
          workTick: event.workTick,
          period: event.period,
          gameDay: event.gameDay,
          missing: event.missing,
          pools: event.pools,
          decision: event.decision,
          expected: event.expected,
          actual: event.actual,
          invocations: event.invocations,
          clickMultiplier: event.clickMultiplier,
          keyState: event.keyState,
          gameSettings: event.gameSettings,
          expected: event.expected,
          actual: event.actual,
          invocations: event.invocations,
        })),
      })),
    },
    null,
    2,
  ),
);
