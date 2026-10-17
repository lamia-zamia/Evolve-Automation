import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const option = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : process.argv[index + 1];
};
const toolsRoot = resolve(process.env.EA_TOOLS_ROOT ?? `${root}tools`);
const { createChromiumRunner, parseSave } = await import(
  pathToFileURL(resolve(toolsRoot, "chromium-evolve-runner.mjs"))
);
const scenarioArg = option("scenario", "both");
const scenarios = {
  late: {
    savePath:
      "D:/work/Evolve-Automation/test-artifacts/benchmark/slice0/saves/deadspace-late-2026-10-12.txt",
    name: "late-many-owners",
  },
  mid: {
    savePath:
      "D:/work/Evolve-Automation/test-artifacts/benchmark/slice0/saves/stage2f-through-7600-export.json",
    name: "mid-pre-space",
  },
};
const settingsPath =
  "D:/work/Evolve-Automation/test-artifacts/benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json";
const bundle = resolve(root, "evolve_automation.user.js");
const game =
  "D:/work/Evolve-Automation/test-artifacts/game/evolve-deadspace.js";
const periods = Number(option("periods", "1000"));
const warmup = Number(option("warmup", "600"));
const repeats = Number(option("repeats", "2"));
const profile = option("profile", "false") === "true";
const outPath = resolve(
  option(
    "out",
    `${root}test-artifacts/perf-profile/p1-native-cost-${profile ? "profile" : "baseline"}.json`,
  ),
);
const selectedScenarios =
  scenarioArg === "both" ? Object.keys(scenarios) : [scenarioArg];
if (selectedScenarios.some((name) => !(name in scenarios)))
  throw new Error(`Unknown scenario: ${scenarioArg}`);

const settings = JSON.parse(await readFile(settingsPath, "utf8"));
// Keep the late-game fixture stationary across matched windows; autoPrestige resets it at p849.
settings.autoPrestige = false;
const runner = await createChromiumRunner({ game });
const runs = [];
try {
  for (const scenarioName of selectedScenarios) {
    const scenario = scenarios[scenarioName];
    const saveText = await readFile(scenario.savePath, "utf8");
    for (let repeat = 0; repeat < repeats; repeat += 1) {
      const session = await runner.openSession({
        bundle,
        save: parseSave(saveText),
        settings,
        seed: 42,
        perf: profile,
        callbackProfile: profile,
        forwardPerfSummary: profile,
      });
      try {
        await session.advance(warmup);
        const cpuBefore = await runner.processCpu();
        const metricsBefore = await session.metrics();
        await session.advance(periods);
        const metricsAfter = await session.metrics();
        const cpuAfter = await runner.processCpu();
        const [exported, diagnostics] = await Promise.all([
          session.exportSave(),
          session.diagnostics(),
        ]);
        const state = await session.readState();
        const rendererDelta = new Map(
          cpuBefore
            .filter((entry) => entry.type === "renderer")
            .map((entry) => [entry.id, entry.cpuSec]),
        );
        const rendererCpuSec = cpuAfter
          .filter((entry) => entry.type === "renderer")
          .reduce(
            (total, entry) =>
              total + entry.cpuSec - (rendererDelta.get(entry.id) ?? 0),
            0,
          );
        runs.push({
          scenario: scenario.name,
          repeat,
          periods,
          warmup,
          seed: 42,
          instrumentation: profile ? "phase-and-callback" : "none",
          rendererCpuSec: Number(rendererCpuSec.toFixed(2)),
          taskDurationSec: Number(
            (metricsAfter.TaskDuration - metricsBefore.TaskDuration).toFixed(3),
          ),
          exportSha256: await crypto.subtle
            .digest("SHA-256", new TextEncoder().encode(exported))
            .then((hash) =>
              [...new Uint8Array(hash)]
                .map((byte) => byte.toString(16).padStart(2, "0"))
                .join(""),
            ),
          day: state.stats?.days,
          resetCount: state.stats?.reset,
          controlUsage: diagnostics.controlUsage,
          counts: diagnostics.counts,
          workTicks: diagnostics.workTicks,
          perfSummaries: diagnostics.perfSummaries,
          callbackDurationsMs: diagnostics.callbackDurationsMs,
          dialogs: diagnostics.dialogs,
        });
      } finally {
        await session.close();
      }
    }
  }
} finally {
  await runner.close();
}

const report = {
  runner: "chromium-exact",
  inputs: {
    ...runner.inputs,
    bundle,
    game,
    settingsPath,
    autoPrestigeOverride: false,
    periods,
    warmup,
    repeats,
    seed: 42,
    instrumentation: profile ? "phase-and-callback" : "none",
  },
  browser: runner.browser,
  runs,
};
await import("node:fs/promises").then(({ mkdir }) =>
  mkdir(dirname(outPath), { recursive: true }),
);
await writeFile(outPath, `${JSON.stringify(report, null, 1)}\n`);
console.log(
  JSON.stringify(
    {
      outPath,
      runs: runs.map(
        ({
          scenario,
          repeat,
          rendererCpuSec,
          taskDurationSec,
          day,
          resetCount,
          exportSha256,
        }) => ({
          scenario,
          repeat,
          rendererCpuSec,
          taskDurationSec,
          day,
          resetCount,
          exportSha256,
        }),
      ),
    },
    null,
    1,
  ),
);
