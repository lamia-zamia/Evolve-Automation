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
const p12g = JSON.parse(
  await readFile(
    path.join(tmp, "p12g-controlled-production-marginal.json"),
    "utf8",
  ),
);
const settingsPath = path.join(
  root,
  "test-artifacts/benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json",
);
const savePath = path.join(
  root,
  "test-artifacts/benchmark/slice0/saves/stage2f-fixed-progression-export.json",
);
const settings = {
  ...JSON.parse(await readFile(settingsPath, "utf8")),
  autoResearch: true,
  autoSmelter: true,
};
const startSave = parseSave(await readFile(savePath, "utf8"));
const snapshotSidecar = JSON.parse(
  await readFile(
    path.join(root, "test-artifacts/game/evolve-deadspace.js.json"),
    "utf8",
  ),
);
assert.equal(
  snapshotSidecar.sourceRef,
  "db38e2af831907d49aeb5348d678d8d8745d6c3f",
);
assert.equal(p12g.reachableCapture.period, 1784);

const metadata = (
  await readFile(path.join(root, "src/userscript.meta.js"), "utf8")
).trimEnd();
const observerPrelude = `
window.__EA_TEST_HOOKS__ = { ...(window.__EA_TEST_HOOKS__ ?? {}) };
window.__EA_TEST_HOOKS__.observeSmelterPlanForTest = (input, decision, demand, observation) => {
  const start = window.__EA_RUNNER__.nativeNow();
  const snapshot = window.P13BSmelter.createCapturedSmelterIncumbentSnapshot(input, decision, demand, observation);
  const state = window.__P13B ?? { constructions: 0, buildMs: [] };
  state.snapshot = snapshot;
  state.constructions++;
  state.buildMs.push(window.__EA_RUNNER__.nativeNow() - start);
  if (!state.p12gBoundary && demand.requestedSteel >= 1000 && input.steelCount < 1 && decision.smeltAdjustments?.some((item) => item.productionId === "Steel" && item.delta > 0)) { state.p12gBoundary = snapshot; state.awaitingBoundaryPostcondition = true; }
  window.__P13B = state;
};
window.__EA_TEST_HOOKS__.observeSmelterOutcomeForTest = (outcome, observation, postcondition) => {
  if (window.__P13B) { window.__P13B.outcome = outcome; window.__P13B.postcondition = postcondition; if (window.__P13B.awaitingBoundaryPostcondition) { window.__P13B.p12gBoundaryOutcome = outcome; window.__P13B.p12gBoundaryPostcondition = postcondition; window.__P13B.awaitingBoundaryPostcondition = false; } }
};`;
async function buildBundle(name, observe) {
  const result = await esbuild.build({
    absWorkingDir: root,
    entryPoints: ["src/main.ts"],
    bundle: true,
    write: false,
    banner: { js: `${metadata}${observe ? observerPrelude : ""}` },
    platform: "browser",
    target: ["esnext"],
    define: {
      "globalThis.__EA_TEST_SURFACE_ENABLED__": "true",
      __EA_TEST_SURFACE_ENABLED__: "true",
    },
    minifySyntax: true,
    treeShaking: true,
  });
  const file = path.join(tmp, `p13b-${name}.user.js`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, result.outputFiles[0].contents);
  return file;
}

const [baselineBundle, observedBundle, helper] = await Promise.all([
  buildBundle("G", false),
  buildBundle("S", true),
  esbuild.build({
    absWorkingDir: root,
    entryPoints: ["src/adapters/evolve/economy/production/captured-smelter.ts"],
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    globalName: "P13BSmelter",
    target: ["esnext"],
    define: {
      "globalThis.__EA_TEST_SURFACE_ENABLED__": "true",
      __EA_TEST_SURFACE_ENABLED__: "true",
    },
    treeShaking: true,
  }),
]);
const helperText = helper.outputFiles[0].text;
const hash = (value) => createHash("sha256").update(value).digest("hex");

function rendererCpu(rows) {
  return rows
    .filter((row) => row.type === "renderer")
    .reduce((sum, row) => sum + row.cpuSec, 0);
}

async function runCell(runner, mode, order) {
  const session = await runner.openSession({
    bundle: mode === "G" ? baselineBundle : observedBundle,
    save: startSave,
    settings,
    seed: 42,
    epoch: "2026-09-21T00:00:00.000Z",
    perf: true,
    callbackProfile: true,
    nativeTrace: true,
  });
  try {
    await session.page.addScriptTag({ content: helperText });
    await session.advance(1784);
    if (mode === "S") {
      const boundary = await session.evaluate(
        () => window.__P13B?.p12gBoundary ?? null,
      );
      assert.ok(
        boundary,
        "the same-cycle P12G Steel/Construction plan must be captured during warm-up",
      );
    }
    const observerStart =
      mode === "S"
        ? await session.evaluate(() => ({
            count: window.__P13B?.constructions ?? 0,
            buildSamples: window.__P13B?.buildMs.length ?? 0,
          }))
        : undefined;
    const cpuBefore = rendererCpu(await runner.processCpu());
    const before = await session.metrics();
    const sampleStarted = performance.now();
    await session.advance(800);
    const sampleMs = performance.now() - sampleStarted;
    const after = await session.metrics();
    const cpuAfter = rendererCpu(await runner.processCpu());
    const diagnostics = await session.diagnostics();
    const stateHash = hash(await session.exportSave());
    const shadow = await session.evaluate(() => window.__P13B ?? null);
    const hookDebug =
      mode === "S"
        ? await session.evaluate(() => ({
            planObserver:
              typeof window.__EA_TEST_HOOKS__?.observeSmelterPlanForTest,
            outcomeObserver:
              typeof window.__EA_TEST_HOOKS__?.observeSmelterOutcomeForTest,
            readPlan: typeof window.__EA_TEST_HOOKS__?.readSmelterPlanForTest,
            periods: window.__EA_RUNNER__.periods(),
          }))
        : undefined;
    let comparison;
    if (mode === "S" && shadow?.p12gBoundary) {
      comparison = await session.evaluate(() => {
        const started = window.__EA_RUNNER__.nativeNow();
        const value = window.P13BSmelter.compareCapturedSmelterSteelDemand(
          window.__P13B.p12gBoundary,
          10,
        );
        return { value, elapsedMs: window.__EA_RUNNER__.nativeNow() - started };
      });
    }
    const worktickMs = (diagnostics.callbackDurationsMs ?? [])
      .filter(
        (item) =>
          item.period > 1784 && item.period <= 2584 && item.period % 8 === 0,
      )
      .map((item) => item.durationMs);
    return {
      mode,
      order,
      periods: diagnostics.periods,
      workTicks: diagnostics.workTicks,
      measuredWorkTicks: worktickMs.length,
      sampleMs,
      rendererCpuSec: Math.max(0, cpuAfter - cpuBefore),
      taskDurationSec: after.TaskDuration - before.TaskDuration,
      scriptDurationSec: after.ScriptDuration - before.ScriptDuration,
      worktickMs,
      stateHash,
      controlUsage: diagnostics.controlUsage,
      invocations: diagnostics.nativeInvocations ?? [],
      randomCalls: diagnostics.randomCalls,
      errors: diagnostics.events.filter((event) =>
        ["pageerror", "rejection"].includes(event.kind),
      ),
      observer:
        mode === "S" && shadow
          ? {
              planPublications: shadow.constructions - observerStart.count,
              snapshotBuildMs: shadow.buildMs.slice(observerStart.buildSamples),
              p12gBoundary: {
                demand: shadow.p12gBoundary.demand,
                plan: shadow.p12gBoundary.decision,
                commands: shadow.p12gBoundary.commands,
                controlGeneration: shadow.p12gBoundary.controlGeneration,
                progressionGeneration:
                  shadow.p12gBoundary.progressionGeneration,
                input: shadow.p12gBoundary.input,
                unavailableAuthority: shadow.p12gBoundary.unavailableAuthority,
                outcome: shadow.p12gBoundaryOutcome,
                postcondition: shadow.p12gBoundaryPostcondition,
              },
              latestOutcome: shadow.outcome,
              latestPostcondition: shadow.postcondition,
              snapshotUnavailableAuthority:
                shadow.snapshot?.unavailableAuthority,
              comparison,
              extraProgressionGenerationReads:
                shadow.constructions - observerStart.count,
              extraReadInputCalls: 0,
              extraDemandReads: 0,
              extraPlannerCalls: 0,
              extraNativeControlCalls: 0,
              extraResearchDraws: 0,
              extraFullCatalogScans: 0,
            }
          : undefined,
      hookDebug,
    };
  } finally {
    await session.close();
  }
}

const runner = await createChromiumRunner();
let cells;
try {
  cells = [];
  for (const [order, sequence] of [
    ["G-then-S", ["G", "S"]],
    ["S-then-G", ["S", "G"]],
  ]) {
    for (const mode of sequence) cells.push(await runCell(runner, mode, order));
  }
} finally {
  await runner.close();
}

const baselines = cells.filter((item) => item.mode === "G");
for (const cell of cells) {
  const baseline = baselines.find((item) => item.order === cell.order);
  assert.equal(cell.periods, 2584);
  assert.equal(cell.stateHash, baseline.stateHash);
  assert.deepEqual(cell.controlUsage, baseline.controlUsage);
  assert.equal(cell.randomCalls, baseline.randomCalls);
  assert.deepEqual(cell.errors, []);
  assert.deepEqual(cell.invocations, baseline.invocations);
}
const result = {
  decision: "correctness-and-overhead-observation",
  pinnedGame: p12g.inputs.pinnedGame,
  saveSha256: p12g.reachableCapture.saveSha256,
  settingsSha256: p12g.inputs.settingsSha256,
  gameSnapshotSha256: p12g.inputs.gameSnapshotSha256,
  periodsPerCell: 800,
  baselineBundleSha256: hash(await readFile(baselineBundle)),
  observerBundleSha256: hash(await readFile(observedBundle)),
  helperBundleSha256: hash(helperText),
  chromiumVersion: runner.browser.version,
  cells: cells.map(({ invocations, ...cell }) => ({
    ...cell,
    invocationCount: invocations.length,
    researchActionInvocations: invocations.filter(
      (item) => item.elementId === "iResearch",
    ).length,
  })),
};
const outputPath = path.join(tmp, "p13b-smelter-incumbent-authority.json");
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
assert.equal(
  cells
    .filter((item) => item.mode === "S")
    .every(
      (item) => item.observer?.planPublications === item.measuredWorkTicks,
    ),
  true,
);
process.stdout.write(
  JSON.stringify(
    {
      outputPath,
      cells: cells.map(
        ({
          mode,
          order,
          rendererCpuSec,
          taskDurationSec,
          measuredWorkTicks,
        }) => ({
          mode,
          order,
          rendererCpuSec,
          taskDurationSec,
          measuredWorkTicks,
        }),
      ),
    },
    null,
    2,
  ) + "\n",
);
