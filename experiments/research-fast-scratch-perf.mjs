import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const toolsDir =
  process.env.EA_TOOLS_DIR ??
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../Evolve-Automation/tools",
  );
const { createChromiumRunner, parseSave } = await import(
  pathToFileURL(resolve(toolsDir, "chromium-evolve-runner.mjs")).href
);

const input = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || process.argv[index + 1] === undefined)
    throw new Error(`missing --${name}`);
  return resolve(process.argv[index + 1]);
};

const settingsPath = input("settings");
const settings = await readFile(settingsPath, "utf8");
const tickRate = JSON.parse(settings).tickRate ?? 8;
const cases = [
  { name: "early", save: input("early") },
  { name: "mid", save: input("mid") },
  { name: "late", save: input("late") },
];
const variants = [
  {
    name: "baseline",
    game: input("baseline-game"),
    bundle: input("baseline-bundle"),
  },
  {
    name: "skip-completed",
    game: input("experimental-game"),
    bundle: input("experimental-bundle"),
  },
];
const argValue = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : Number(process.argv[index + 1]);
};
const repeats = argValue("repeats", 4);
const warmup = argValue("warmup", 400);
const periods = argValue("periods", 800);
const records = [];

for (let repetition = 0; repetition < repeats; repetition += 1) {
  for (const scenario of cases) {
    const order =
      (repetition + cases.indexOf(scenario)) % 2 === 0
        ? variants
        : [...variants].reverse();
    for (const variant of order) {
      const save = parseSave(await readFile(scenario.save, "utf8"));
      const runner = await createChromiumRunner({
        game: variant.game,
        upstream: "D:/work/Evolve-DeadSpace",
      });
      let session;
      try {
        session = await runner.openSession({
          bundle: variant.bundle,
          save,
          settings,
          seed: 42,
        });
        await session.advance(warmup);
        const before = await session.metrics();
        const cpuBefore = await runner.processCpu();
        const started = performance.now();
        await session.advance(periods);
        const wallMs = performance.now() - started;
        const cpuAfter = await runner.processCpu();
        const after = await session.metrics();
        const cpuSec = cpuAfter
          .filter((entry) => entry.type === "renderer")
          .reduce(
            (sum, entry) =>
              sum +
              entry.cpuSec -
              (cpuBefore.find((prior) => prior.id === entry.id)?.cpuSec ?? 0),
            0,
          );
        const diagnostics = await session.diagnostics();
        records.push({
          repetition: repetition + 1,
          scenario: scenario.name,
          variant: variant.name,
          periods,
          warmup,
          workTicks: periods / tickRate,
          rendererCpuSec: Number(cpuSec.toFixed(3)),
          taskDurationSec: Number(
            (after.TaskDuration - before.TaskDuration).toFixed(3),
          ),
          wallMs: Number(wallMs.toFixed(1)),
          endDay: (await session.readState()).stats?.days,
          randomCalls: diagnostics.randomCalls,
          errors: diagnostics.counts,
          controlUsage: diagnostics.controlUsage,
        });
      } finally {
        await session?.close();
        await runner.close();
      }
      console.log(JSON.stringify(records.at(-1)));
    }
  }
}

const report = {
  runner: "chromium-exact",
  seed: 42,
  settingsPath,
  repeats,
  warmup,
  periods,
  records,
};
await writeFile(input("out"), `${JSON.stringify(report, null, 2)}\n`);

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  console.log(`wrote ${input("out")}`);
}
