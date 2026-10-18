import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const toolsRoot = resolve(
  process.env.P8_TOOLS_ROOT ?? "D:/work/Evolve-Automation/tools",
);
const { createChromiumRunner, parseSave } = await import(
  pathToFileURL(resolve(toolsRoot, "chromium-evolve-runner.mjs"))
);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const option = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : process.argv[index + 1];
};
const phase = option("phase", "calibrate");
const out = resolve(
  option("out", `test-artifacts/perf-profile/p8-${phase}.json`),
);
const configPath = resolve(
  option("config", "test-artifacts/perf-profile/p8-frozen-doses.json"),
);
const bundle = resolve(option("bundle", "evolve_automation.user.js"));
const game = resolve(option("game", "test-artifacts/game/evolve-deadspace.js"));
const upstream = resolve(option("upstream", "D:/work/Evolve-DeadSpace"));
const settingsPath = resolve(
  option(
    "settings",
    "test-artifacts/benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json",
  ),
);
const saves = {
  late: resolve(
    option(
      "late-save",
      "test-artifacts/benchmark/slice0/saves/deadspace-late-2026-10-12.txt",
    ),
  ),
  mid: resolve(
    option(
      "mid-save",
      "test-artifacts/benchmark/slice0/saves/stage2f-through-7600-export.json",
    ),
  ),
};
const periods = 1000;
const warmup = 600;
const baseCalibrationIterations = 30_000_000;
const calibrationRepeats = 3;
const doses = [2, 5, 10];
const expectedBundleSha =
  "517642d0c647c29b28795e7ff7acd4a4ddedd4a0b3435a85602935e7336cf1e7";
const expectedGameRef = "db38e2af831907d49aeb5348d678d8d8745d6c3f";
const bundleSha = sha256(await readFile(bundle));
const gameBytes = await readFile(game);
const gameSha = sha256(gameBytes);
const gameMetadata = JSON.parse(await readFile(`${game}.json`, "utf8"));
const settingsBytes = await readFile(settingsPath);
const settings = JSON.parse(settingsBytes);
settings.autoPrestige = false;
const settingsSha = sha256(JSON.stringify(settings));
if (bundleSha !== expectedBundleSha)
  throw new Error(`Unexpected P7 bundle ${bundleSha}`);
if (gameMetadata.sourceRef !== expectedGameRef)
  throw new Error(`Unexpected game ref ${gameMetadata.sourceRef}`);
if (!["calibrate", "detect", "replicate10"].includes(phase))
  throw new Error("--phase must be calibrate, detect, or replicate10");

const parsedSaves = Object.fromEntries(
  await Promise.all(
    Object.entries(saves).map(async ([name, path]) => [
      name,
      {
        value: parseSave(await readFile(path, "utf8")),
        sha256: sha256(await readFile(path)),
      },
    ]),
  ),
);

function rendererSnapshot(processes) {
  return processes
    .filter((entry) => entry.type === "renderer")
    .map(({ id, cpuSec }) => ({ id, cpuSec }));
}

function rendererDelta(before, after) {
  const previous = new Map(before.map((entry) => [entry.id, entry.cpuSec]));
  return after.reduce(
    (total, entry) => total + entry.cpuSec - (previous.get(entry.id) ?? 0),
    0,
  );
}

async function sampleArm(runner, scenario, addedIterations, index, mode) {
  const session = await runner.openSession({
    bundle,
    save: parsedSaves[scenario].value,
    settings,
    seed: 42,
  });
  await session.advance(warmup);
  const beforeMetrics = await session.metrics();
  const beforeProcesses = rendererSnapshot(await runner.processCpu());
  const started = performance.now();
  const execution = await session.evaluate(
    async ({ count, iterations }) => {
      const startPeriod = window.__EA_RUNNER__.periods();
      await window.__EA_RUNNER__.advance(count);
      let value = 0x13579bdf;
      for (let index = 0; index < iterations; index += 1) {
        value =
          (Math.imul(value ^ (index + (index >>> 7)), 1664525) + 1013904223) |
          0;
      }
      if (iterations > 0)
        window.__EA_P8_WORK_RESULT__ =
          (window.__EA_P8_WORK_RESULT__ ?? 0) ^ value;
      return {
        startPeriod,
        endPeriod: window.__EA_RUNNER__.periods(),
        iterations,
        result: value,
      };
    },
    { count: periods, iterations: addedIterations },
  );
  const runtimeEvaluateWallMs = performance.now() - started;
  const afterMetrics = await session.metrics();
  const afterProcesses = rendererSnapshot(await runner.processCpu());
  const exported = await session.exportSave();
  const diagnostics = await session.diagnostics();
  const row = {
    index,
    mode,
    scenario,
    dosePercent: addedIterations === 0 ? 0 : undefined,
    addedIterations,
    runtimeEvaluateWallMs,
    rendererCpuSec: rendererDelta(beforeProcesses, afterProcesses),
    rendererTaskSec: afterMetrics.TaskDuration - beforeMetrics.TaskDuration,
    rendererScriptSecReferenceOnly:
      afterMetrics.ScriptDuration - beforeMetrics.ScriptDuration,
    rendererPidsBefore: beforeProcesses,
    rendererPidsAfter: afterProcesses,
    periodsBefore: execution.startPeriod,
    periodsAfter: execution.endPeriod,
    exportSha256: sha256(exported),
    controlUsage: diagnostics.usage ?? diagnostics.controlUsage ?? null,
    diagnostics,
    workResult: execution.result,
  };
  await session.close();
  return row;
}

async function createRunner() {
  return createChromiumRunner({ game, upstream });
}

const metadata = {
  phase,
  createdAt: new Date().toISOString(),
  bundle: { path: bundle, sha256: bundleSha },
  game: { path: game, sha256: gameSha, sourceRef: gameMetadata.sourceRef },
  tools: {
    root: toolsRoot,
    runnerCommit: "fb141c709bc019c99b9933f5974e80c5e43f825a",
  },
  settings: {
    path: settingsPath,
    sourceSha256: sha256(settingsBytes),
    normalizedSha256: settingsSha,
    autoPrestige: false,
  },
  fixtures: Object.fromEntries(
    Object.entries(parsedSaves).map(([name, save]) => [
      name,
      { path: saves[name], sha256: save.sha256 },
    ]),
  ),
  seed: 42,
  warmupPeriods: warmup,
  measuredPeriods: periods,
  dosesPercent: doses,
};

let report;
if (phase === "calibrate") {
  report = { ...metadata, calibrations: {} };
  for (const scenario of ["late", "mid"]) {
    const runner = await createRunner();
    try {
      const baseline = await sampleArm(
        runner,
        scenario,
        0,
        `${scenario}-baseline`,
        "calibration",
      );
      const calibrationSession = await runner.openSession({
        bundle,
        save: parsedSaves[scenario].value,
        settings,
        seed: 42,
      });
      await calibrationSession.advance(warmup);
      await calibrationSession.evaluate((iterations) => {
        let value = 0x2468ace0;
        for (let index = 0; index < 200_000; index += 1)
          value = (Math.imul(value ^ index, 1103515245) + 12345) | 0;
        window.__EA_P8_WORK_RESULT__ = value;
      }, 200_000);
      const calibrations = [];
      for (let repeat = 0; repeat < calibrationRepeats; repeat += 1) {
        const beforeMetrics = await calibrationSession.metrics();
        const beforeProcesses = rendererSnapshot(await runner.processCpu());
        const started = performance.now();
        const result = await calibrationSession.evaluate((iterations) => {
          let value = 0x13579bdf;
          for (let index = 0; index < iterations; index += 1) {
            value =
              (Math.imul(value ^ (index + (index >>> 7)), 1664525) +
                1013904223) |
              0;
          }
          window.__EA_P8_WORK_RESULT__ =
            (window.__EA_P8_WORK_RESULT__ ?? 0) ^ value;
          return value;
        }, baseCalibrationIterations);
        const wallMs = performance.now() - started;
        const afterMetrics = await calibrationSession.metrics();
        const afterProcesses = rendererSnapshot(await runner.processCpu());
        calibrations.push({
          repeat,
          iterations: baseCalibrationIterations,
          result,
          wallMs,
          rendererCpuSec: rendererDelta(beforeProcesses, afterProcesses),
          taskDurationSec:
            afterMetrics.TaskDuration - beforeMetrics.TaskDuration,
          rendererPidsBefore: beforeProcesses,
          rendererPidsAfter: afterProcesses,
        });
      }
      await calibrationSession.close();
      const rates = calibrations
        .map((entry) => baseCalibrationIterations / entry.rendererCpuSec)
        .sort((a, b) => a - b);
      const iterationsPerCpuSecond = rates[Math.floor(rates.length / 2)];
      const doseIterations = Object.fromEntries(
        doses.map((dose) => [
          dose,
          Math.round(
            ((baseline.rendererCpuSec * dose) / 100) * iterationsPerCpuSecond,
          ),
        ]),
      );
      report.calibrations[scenario] = {
        baseline,
        calibrations,
        iterationsPerCpuSecond,
        doseIterations,
      };
    } finally {
      await runner.close();
    }
  }
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(
    configPath,
    `${JSON.stringify({ frozenAt: report.createdAt, bundleSha256: bundleSha, gameSha256: gameSha, fixtures: report.calibrations }, null, 2)}\n`,
  );
  report.frozenConfigPath = configPath;
} else {
  const frozen = JSON.parse(await readFile(configPath, "utf8"));
  if (frozen.bundleSha256 !== bundleSha || frozen.gameSha256 !== gameSha)
    throw new Error(
      "Frozen calibration does not match this bundle and game snapshot",
    );
  report = {
    ...metadata,
    frozenConfigPath: configPath,
    frozenCalibrationAt: frozen.frozenAt,
    runs: [],
  };
  for (const scenario of ["late", "mid"]) {
    const persistentRunner = await createRunner();
    try {
      const doseOrder =
        phase === "replicate10"
          ? [10]
          : scenario === "late"
            ? [2, 5, 10]
            : [10, 5, 2];
      for (const [doseIndex, dose] of doseOrder.entries()) {
        const iterations = frozen.fixtures[scenario].doseIterations[dose];
        const positiveFirst =
          phase === "replicate10" ? true : doseIndex % 2 !== 0;
        const persistentOrder = positiveFirst
          ? [iterations, 0]
          : [0, iterations];
        const pairOrder =
          persistentOrder[0] === 0 ? "control-first" : "positive-first";
        for (const [position, count] of persistentOrder.entries()) {
          report.runs.push(
            await sampleArm(
              persistentRunner,
              scenario,
              count,
              `${scenario}-persistent-${dose}-${position}`,
              "persistent",
            ),
          );
          report.runs.at(-1).dosePercent = dose;
          report.runs.at(-1).order = pairOrder;
          report.runs.at(-1).pair = `${scenario}-persistent-${dose}`;
        }
      }
    } finally {
      await persistentRunner.close();
    }
    for (const dose of phase === "replicate10" ? [10] : doses) {
      const runner = await createRunner();
      try {
        const iterations = frozen.fixtures[scenario].doseIterations[dose];
        const persistentFirst =
          (scenario === "late" ? [2, 5, 10] : [10, 5, 2]).indexOf(dose) % 2 ===
          0;
        const reverse =
          phase === "replicate10" ? !persistentFirst : persistentFirst;
        const order = reverse ? [iterations, 0] : [0, iterations];
        const pairOrder = order[0] === 0 ? "control-first" : "positive-first";
        for (const [position, count] of order.entries()) {
          report.runs.push(
            await sampleArm(
              runner,
              scenario,
              count,
              `${scenario}-fresh-${dose}-${position}`,
              "fresh-process-block",
            ),
          );
          report.runs.at(-1).dosePercent = dose;
          report.runs.at(-1).order = pairOrder;
          report.runs.at(-1).pair = `${scenario}-fresh-${dose}`;
        }
      } finally {
        await runner.close();
      }
    }
  }
}

await mkdir(dirname(out), { recursive: true });
await writeFile(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      phase,
      out,
      configPath: phase === "calibrate" ? configPath : undefined,
      runs: report.runs?.length,
      scenarios: Object.keys(report.calibrations ?? {}),
    },
    null,
    2,
  ),
);
