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
const numeric = (name, fallback) => Number(args.get(`--${name}`) ?? fallback);
const pass = args.get("--pass") ?? "cpu";
if (pass !== "cpu" && pass !== "latency")
  throw new Error("--pass must be cpu or latency");

const game = required("game");
const settings = await readFile(required("settings"), "utf8");
const tickRate = JSON.parse(settings).tickRate ?? 8;
const scenarios = [
  ["early", required("early")],
  ["mid", required("mid")],
  ["late", required("late")],
];
const arms = [
  ["A", required("a-bundle")],
  ["B2", required("b2-bundle")],
];
const repeats = numeric("repeats", 6);
const warmup = numeric("warmup", 400);
const periods = numeric("periods", 1600);
if (repeats < 6 || periods / tickRate < 100)
  throw new Error("use at least six pairs and 100 measured work ticks per arm");

const records = [];
for (const [scenario, savePath] of scenarios) {
  const save = parseSave(await readFile(savePath, "utf8"));
  for (let repetition = 0; repetition < repeats; repetition += 1) {
    const order = repetition % 2 === 0 ? arms : [...arms].reverse();
    for (const [arm, bundle] of order) {
      const runner = await createChromiumRunner({
        game,
        upstream: "D:/work/Evolve-DeadSpace",
      });
      let session;
      try {
        session = await runner.openSession({
          bundle,
          save,
          settings,
          seed: 42,
          ...(pass === "latency" ? { callbackProfile: true } : {}),
        });
        await session.advance(warmup);
        const before = pass === "cpu" ? await session.metrics() : undefined;
        const cpuBefore =
          pass === "cpu" ? await runner.processCpu() : undefined;
        await session.advance(periods);
        const diagnostics = await session.diagnostics();
        if (pass === "cpu") {
          const after = await session.metrics();
          const cpuAfter = await runner.processCpu();
          const rendererCpuSec = cpuAfter
            .filter((entry) => entry.type === "renderer")
            .reduce(
              (sum, entry) =>
                sum +
                entry.cpuSec -
                (cpuBefore?.find((prior) => prior.id === entry.id)?.cpuSec ??
                  0),
              0,
            );
          records.push({
            pass,
            scenario,
            pair: repetition + 1,
            arm,
            workTicks: periods / tickRate,
            rendererCpuMsPerTick:
              (rendererCpuSec * 1000) / (periods / tickRate),
            taskDurationMs:
              ((after.TaskDuration ?? 0) - (before?.TaskDuration ?? 0)) * 1000,
            // Native draw counts require the separate instrumented trace pass.
            researchDrawCount: null,
            gateInvocationCount: null,
            descriptorInstallCount: null,
            descriptorRestorationCount: null,
            gateFallbackCount: null,
          });
        } else {
          const cycleSamples = diagnostics.callbackDurationsMs
            .filter(
              (sample) =>
                sample.period > warmup &&
                sample.period <= warmup + periods &&
                sample.period % tickRate === 0,
            )
            .map((sample) => sample.durationMs)
            .sort((left, right) => left - right);
          const percentile = (p) =>
            cycleSamples[
              Math.min(
                cycleSamples.length - 1,
                Math.ceil(cycleSamples.length * p) - 1,
              )
            ] ?? null;
          records.push({
            pass,
            scenario,
            pair: repetition + 1,
            arm,
            workTicks: cycleSamples.length,
            p50Ms: percentile(0.5),
            p95Ms: percentile(0.95),
            p99Ms: percentile(0.99),
            maxMs: cycleSamples.at(-1) ?? null,
          });
        }
      } finally {
        await session?.close();
        await runner.close();
      }
      console.log(JSON.stringify(records.at(-1)));
    }
  }
}

const output = required("out");
const pairs = [];
for (const [scenario] of scenarios) {
  for (let pair = 1; pair <= repeats; pair += 1) {
    const a = records.find(
      (record) =>
        record.scenario === scenario &&
        record.pair === pair &&
        record.arm === "A",
    );
    const b2 = records.find(
      (record) =>
        record.scenario === scenario &&
        record.pair === pair &&
        record.arm === "B2",
    );
    if (a === undefined || b2 === undefined) continue;
    if (pass === "cpu") {
      pairs.push({
        scenario,
        pair,
        rendererCpuDeltaMsPerTick:
          b2.rendererCpuMsPerTick - a.rendererCpuMsPerTick,
        rendererCpuSavingPercent:
          ((a.rendererCpuMsPerTick - b2.rendererCpuMsPerTick) /
            a.rendererCpuMsPerTick) *
          100,
        taskDurationDeltaMs: b2.taskDurationMs - a.taskDurationMs,
      });
    } else {
      pairs.push({
        scenario,
        pair,
        p50DeltaMs: b2.p50Ms - a.p50Ms,
        p95DeltaMs: b2.p95Ms - a.p95Ms,
        p99DeltaMs: b2.p99Ms - a.p99Ms,
        maxDeltaMs: b2.maxMs - a.maxMs,
      });
    }
  }
}
await mkdir(dirname(output), { recursive: true });
await writeFile(
  output,
  `${JSON.stringify(
    {
      runner: "exact chromium",
      game,
      seed: 42,
      warmup,
      periods,
      repeats,
      tickRate,
      pass,
      pairs,
      records,
    },
    null,
    2,
  )}\n`,
);
