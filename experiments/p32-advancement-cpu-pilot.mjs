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
const fixturePath = path.join(
  root,
  "test-artifacts/benchmark/slice0/saves/p18-standard-human-fixture.txt",
);
const settingsPath = path.join(
  root,
  "experiments/p18-standard-human-settings.json",
);
const gamePath = path.join(root, "test-artifacts/game/evolve-deadspace.js");
const metadataPath = path.join(root, "src/userscript.meta.js");
const bundlePath = path.join(
  root,
  "test-artifacts/benchmark/tmp/p32-advancement-cpu-pilot.user.js",
);
const outputPath = path.join(
  root,
  "experiments/p32-advancement-cpu-pilot-evidence.json",
);
const epoch = "2026-09-21T00:00:00.000Z";
const seed = 44;
const warmup = 100;
const measuredPeriods = 1_000;
const repeats = 3;
const hash = (value) => createHash("sha256").update(value).digest("hex");
const [fixtureText, settingsText, metadata, gameBytes] = await Promise.all([
  readFile(fixturePath, "utf8"),
  readFile(settingsPath, "utf8"),
  readFile(metadataPath, "utf8"),
  readFile(gamePath),
]);
const settings = JSON.parse(settingsText);
await mkdir(path.dirname(bundlePath), { recursive: true });
const build = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["src/main.ts"],
  bundle: true,
  write: false,
  banner: {
    js: `${metadata.trimEnd()}\nwindow.__EA_TEST_HOOKS__ = { ...(window.__EA_TEST_HOOKS__ ?? {}), gatherIntervention: {}, constructionAllocationShadowBudgets: { perCycle: 5, perTargetEpisode: 80, totalEpisode: 140 } };`,
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
await writeFile(bundlePath, build.outputFiles[0].contents);

const runner = await createChromiumRunner({ game: gamePath });
const sessions = [];
const cpuDelta = (before, after) => {
  const previous = new Map(before.map((row) => [row.id, row.cpuSec]));
  return after
    .filter((row) => row.type === "renderer")
    .reduce((sum, row) => sum + row.cpuSec - (previous.get(row.id) ?? 0), 0);
};
async function run(injected, targetMs = 0) {
  const save = parseSave(fixtureText);
  save.settings.expose = true;
  const session = await runner.openSession({
    bundle: bundlePath,
    save,
    settings,
    seed,
    epoch,
    nativeTrace: false,
  });
  sessions.push(session);
  try {
    await session.advance(warmup);
    if (injected)
      await session.evaluate((durationMs) => {
        const hooks = window.__EA_TEST_HOOKS__;
        hooks.p32InjectedWorkload = { calls: 0, elapsedMs: 0, checksum: 0 };
        hooks.p32GameAdvanceWorkload = () => {
          const stats = hooks.p32InjectedWorkload;
          const started = window.__EA_RUNNER__.nativeNow();
          let value = stats.checksum;
          while (window.__EA_RUNNER__.nativeNow() - started < durationMs) {
            for (let i = 1; i <= 200; i += 1)
              value = (value + Math.imul(i, i + value)) | 0;
          }
          stats.calls += 1;
          stats.elapsedMs += window.__EA_RUNNER__.nativeNow() - started;
          stats.checksum = value;
        };
      }, targetMs);
    const beforeWorkCycles = await session.evaluate(
      () => window.__EA_TEST_HOOKS__?.p32LiveAuthoritySummary?.evaluations ?? 0,
    );
    const [cpuBefore, metricsBefore] = await Promise.all([
      runner.processCpu(),
      session.metrics(),
    ]);
    await session.advance(measuredPeriods);
    const [cpuAfter, metricsAfter] = await Promise.all([
      runner.processCpu(),
      session.metrics(),
    ]);
    const afterWorkCycles = await session.evaluate(
      () => window.__EA_TEST_HOOKS__?.p32LiveAuthoritySummary?.evaluations ?? 0,
    );
    const workload = await session.evaluate(
      () => window.__EA_TEST_HOOKS__?.p32InjectedWorkload ?? null,
    );
    return {
      injected,
      targetMsPerWorkCycle: targetMs,
      periods: await session.periods(),
      workCycles: afterWorkCycles - beforeWorkCycles,
      rendererCpuSec: cpuDelta(cpuBefore, cpuAfter),
      taskDurationSec: metricsAfter.TaskDuration - metricsBefore.TaskDuration,
      scriptDurationSec:
        metricsAfter.ScriptDuration - metricsBefore.ScriptDuration,
      workload,
    };
  } finally {
    await session.close();
  }
}

const pairs = [];
try {
  for (let repeat = 0; repeat < repeats; repeat += 1) {
    const control = await run(false);
    const targetMsPerWorkCycle =
      (control.rendererCpuSec * 1_000 * 0.02) / control.workCycles;
    const treatment = await run(true, targetMsPerWorkCycle);
    pairs.push({
      repeat: repeat + 1,
      targetWorkPercent: 2,
      control,
      treatment,
      rendererCpuIncreasePercent:
        ((treatment.rendererCpuSec - control.rendererCpuSec) /
          control.rendererCpuSec) *
        100,
      taskDurationIncreasePercent:
        ((treatment.taskDurationSec - control.taskDurationSec) /
          control.taskDurationSec) *
        100,
    });
  }
} finally {
  await Promise.all(sessions.map((session) => session.close()));
  await runner.close();
}
const report = {
  fixtureSha256: hash(fixtureText),
  settingsSha256: hash(JSON.stringify(settings)),
  gameSha256: hash(gameBytes),
  bundleSha256: hash(build.outputFiles[0].contents),
  method:
    "Identical test-surface bundle and fixture. Each matched pair measures renderer CPU and CDP task time only while the game advances; treatment burns 2% of its control's renderer CPU distributed over that run's observed work cycles.",
  warmupPeriods: warmup,
  measuredPeriods,
  pairs,
};
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report)}\n`);
