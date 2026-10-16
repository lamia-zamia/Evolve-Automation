import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const toolsDir =
  process.env.EA_TOOLS_DIR ??
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../Evolve-Automation/tools",
  );
const { createChromiumRunner, parseSave } = await import(
  pathToFileURL(resolve(toolsDir, "chromium-evolve-runner.mjs")).href
);

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2)
  args.set(process.argv[index], process.argv[index + 1]);
const required = (name) => {
  const value = args.get(`--${name}`);
  if (!value) throw new Error(`missing --${name}`);
  return resolve(value);
};
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const settingsPath = required("settings");
const settings = await readFile(settingsPath, "utf8");
const tickRate = JSON.parse(settings).tickRate ?? 8;
const scenarios = [
  { name: "early", save: required("early") },
  { name: "mid", save: required("mid") },
  { name: "late", save: required("late") },
];
const variants = [
  {
    name: "A",
    game: required("game"),
    bundle: required("a-bundle"),
  },
  {
    name: "B",
    game: required("game"),
    bundle: required("b-bundle"),
  },
  {
    name: "B2",
    game: required("game"),
    bundle: required("b2-bundle"),
  },
  {
    name: "B3",
    game: required("game"),
    bundle: required("b3-bundle"),
  },
  {
    name: "C",
    game: required("c-game"),
    bundle: required("c-bundle"),
  },
];
const repeats = Number(args.get("--repeats") ?? 6);
const warmup = Number(args.get("--warmup") ?? 400);
const periods = Number(args.get("--periods") ?? 800);
const pass = args.get("--pass") ?? "cpu";
const selectedScenario = args.get("--scenario");
const selectedScenarios = selectedScenario
  ? scenarios.filter((scenario) => scenario.name === selectedScenario)
  : scenarios;
const outputPath = required("out");
const records = [];
const persistProgress = async () => {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify({ runner: "chromium-exact", pass, records }, null, 2)}\n`,
  );
};

for (let repetition = 0; repetition < repeats; repetition += 1) {
  for (const scenario of selectedScenarios) {
    const arms = [...variants];
    if ((repetition + scenarios.indexOf(scenario)) % 2 !== 0) arms.reverse();
    for (const variant of arms) {
      const runner = await createChromiumRunner({
        game: variant.game,
        upstream: "D:/work/Evolve-DeadSpace",
      });
      let session;
      try {
        session = await runner.openSession({
          bundle: variant.bundle,
          save: parseSave(await readFile(scenario.save, "utf8")),
          settings,
          seed: 42,
          ...(pass === "latency" ? { callbackProfile: true } : {}),
        });
        const startState = await session.readState();
        await session.advance(warmup);
        if (pass === "latency") {
          await session.advance(periods);
          const diagnostics = await session.diagnostics();
          const cycleDurations = diagnostics.callbackDurationsMs
            .filter(
              (sample) =>
                sample.period > warmup &&
                sample.period <= warmup + periods &&
                sample.period % tickRate === 0,
            )
            .map((sample) => sample.durationMs)
            .sort((left, right) => left - right);
          const percentile = (p) =>
            cycleDurations[
              Math.min(
                cycleDurations.length - 1,
                Math.ceil(cycleDurations.length * p) - 1,
              )
            ] ?? null;
          records.push({
            pass,
            repetition: repetition + 1,
            scenario: scenario.name,
            variant: variant.name,
            periods,
            workTicks: cycleDurations.length,
            p50Ms: percentile(0.5),
            p95Ms: percentile(0.95),
            p99Ms: percentile(0.99),
            counts: diagnostics.counts,
            endDay: (await session.readState()).stats?.days,
          });
          await persistProgress();
          console.log(JSON.stringify(records.at(-1)));
          continue;
        }
        const before = await session.metrics();
        const cpuBefore = await runner.processCpu();
        const started = performance.now();
        await session.advance(periods);
        const wallMs = performance.now() - started;
        const cpuAfter = await runner.processCpu();
        const after = await session.metrics();
        const diagnostics = await session.diagnostics();
        const rendererCpuSec = cpuAfter
          .filter((entry) => entry.type === "renderer")
          .reduce(
            (sum, entry) =>
              sum +
              entry.cpuSec -
              (cpuBefore.find((prior) => prior.id === entry.id)?.cpuSec ?? 0),
            0,
          );
        records.push({
          pass: "cpu",
          repetition: repetition + 1,
          scenario: scenario.name,
          variant: variant.name,
          periods,
          workTicks: periods / tickRate,
          rendererCpuSec: Number(rendererCpuSec.toFixed(4)),
          cpuMsPerWorkTick: Number(
            ((rendererCpuSec * 1000) / (periods / tickRate)).toFixed(3),
          ),
          taskDurationSec: Number(
            (after.TaskDuration - before.TaskDuration).toFixed(4),
          ),
          wallMs: Number(wallMs.toFixed(1)),
          startDay: startState.stats?.days,
          endDay: (await session.readState()).stats?.days,
          counts: diagnostics.counts,
          observedWorkTicks: diagnostics.workTicks,
        });
        await persistProgress();
      } finally {
        await session?.close();
        await runner.close();
      }
      console.log(JSON.stringify(records.at(-1)));
    }
  }
}

const snapshot = await readFile(required("game"));
const report = {
  runner: "chromium-exact",
  seed: 42,
  gameSnapshot: required("game"),
  gameSnapshotSha256: sha256(snapshot),
  settingsPath,
  settingsSha256: sha256(settings),
  saveSha256: Object.fromEntries(
    await Promise.all(
      scenarios.map(async (scenario) => [
        scenario.name,
        sha256(await readFile(scenario.save)),
      ]),
    ),
  ),
  repeats,
  warmup,
  periods,
  pass,
  records,
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`wrote ${outputPath}`);
