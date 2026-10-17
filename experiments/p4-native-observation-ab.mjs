import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const option = (name, fallback) => {
  const index = process.argv.findIndex((value) => value === `--${name}`);
  return index < 0 ? fallback : process.argv[index + 1];
};
const baseline = resolve(
  option("baseline", "test-artifacts/perf-profile/p4-baseline.user.js"),
);
const candidate = resolve(option("candidate", "evolve_automation.user.js"));
const game = resolve(option("game", "test-artifacts/game/evolve-deadspace.js"));
const settingsPath = resolve(
  option(
    "settings",
    "test-artifacts/benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json",
  ),
);
const scenarios = {
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
const periods = Number(option("periods", "1000"));
const warmup = Number(option("warmup", "600"));
const pairs = Number(option("pairs", "4"));
const out = resolve(option("out", "test-artifacts/perf-profile/p4-ab.json"));
const settings = JSON.parse(await readFile(settingsPath, "utf8"));
settings.autoPrestige = false;
const { createChromiumRunner, parseSave } = await import(
  pathToFileURL(resolve(root, "tools/chromium-evolve-runner.mjs"))
);

const hash = (value) => createHash("sha256").update(value).digest("hex");
function rendererCpu(rows) {
  return rows
    .filter((row) => row.type === "renderer")
    .reduce((sum, row) => sum + row.cpuSec, 0);
}
function usageCounts(usage) {
  return Object.fromEntries(
    Object.entries(usage ?? {}).map(([key, value]) => [
      key,
      value.returned ?? 0,
    ]),
  );
}
function stableState(value, path = "") {
  if (Array.isArray(value))
    return value.map((entry, index) => stableState(entry, `${path}.${index}`));
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => {
        const address = `${path}.${key}`;
        return (
          address !== ".stats.current" && address !== ".city.market.mtrade"
        );
      })
      .map(([key, entry]) => [key, stableState(entry, `${path}.${key}`)]),
  );
}

const runner = await createChromiumRunner({ game });
const results = [];
try {
  for (const [scenario, savePath] of Object.entries(scenarios)) {
    const save = parseSave(await readFile(savePath, "utf8"));
    for (let pair = 0; pair < pairs; pair += 1) {
      const order =
        pair % 2 === 0 ? ["baseline", "candidate"] : ["candidate", "baseline"];
      for (const label of order) {
        const bundle = label === "baseline" ? baseline : candidate;
        const session = await runner.openSession({
          bundle,
          save,
          settings,
          seed: 42,
        });
        try {
          await session.advance(warmup);
          const cpuBefore = rendererCpu(await runner.processCpu());
          const metricsBefore = await session.metrics();
          await session.advance(periods);
          const cpuAfter = rendererCpu(await runner.processCpu());
          const metricsAfter = await session.metrics();
          const state = await session.readState();
          const exportText = await session.exportSave();
          const diagnostics = await session.diagnostics();
          const controlUsage = usageCounts(diagnostics.controlUsage);
          results.push({
            scenario,
            pair,
            order: order.join("-"),
            bundle: label,
            rendererCpuSec: Number((cpuAfter - cpuBefore).toFixed(3)),
            taskDurationSec: Number(
              (metricsAfter.TaskDuration - metricsBefore.TaskDuration).toFixed(
                3,
              ),
            ),
            workTicks: diagnostics.workTicks,
            errors: diagnostics.counts,
            events: diagnostics.events,
            onCapCalls: Object.entries(controlUsage)
              .filter(([key]) => key.endsWith(".on_cap"))
              .reduce((sum, [, count]) => sum + count, 0),
            controlUsage,
            exportSha256: hash(exportText),
            stableStateSha256: hash(JSON.stringify(stableState(state))),
            gameDay: state?.stats?.days ?? state?.stats?.day ?? null,
          });
        } finally {
          await session.close();
        }
      }
    }
  }
} finally {
  await runner.close();
}

const report = {
  game,
  gameSha256: hash(await readFile(game)),
  baseline: { path: baseline, sha256: hash(await readFile(baseline)) },
  candidate: { path: candidate, sha256: hash(await readFile(candidate)) },
  settings: settingsPath,
  savePaths: scenarios,
  seed: 42,
  warmup,
  periods,
  pairs,
  alternatingOrder: true,
  results,
};
await writeFile(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  JSON.stringify(
    { out, runs: results.length, bundle: report.candidate.sha256 },
    null,
    2,
  ),
);
