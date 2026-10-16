import { readFile, writeFile } from "node:fs/promises";
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

const input = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || process.argv[index + 1] === undefined)
    throw new Error(`missing --${name}`);
  return resolve(process.argv[index + 1]);
};
const settingsPath = input("settings");
const settings = JSON.parse(await readFile(settingsPath, "utf8"));
const scenarios = [
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
    name: "condition-gate",
    game: input("baseline-game"),
    bundle: input("condition-gate-bundle"),
  },
  {
    name: "skip-completed",
    game: input("experimental-game"),
    bundle: input("experimental-bundle"),
  },
];
const repeats = Number(
  process.argv[process.argv.indexOf("--repeats") + 1] ?? 4,
);
const records = [];
const percentile = (values, p) =>
  values[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)] ?? null;

for (let repetition = 0; repetition < repeats; repetition += 1) {
  for (const scenario of scenarios) {
    const order =
      (repetition + scenarios.indexOf(scenario)) % 2 === 0
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
          save,
          settings,
          bundle: variant.bundle,
          seed: 42,
          callbackProfile: true,
        });
        await session.advance(400);
        await session.advance(800);
        const samples = (await session.diagnostics()).callbackDurationsMs
          .filter(
            (sample) =>
              sample.period > 400 &&
              sample.period <= 1200 &&
              sample.period % settings.tickRate === 0,
          )
          .map((sample) => sample.durationMs)
          .sort((left, right) => left - right);
        records.push({
          repetition: repetition + 1,
          scenario: scenario.name,
          variant: variant.name,
          periods: 800,
          workTicks: samples.length,
          p50Ms: percentile(samples, 0.5),
          p95Ms: percentile(samples, 0.95),
          p99Ms: percentile(samples, 0.99),
          maxMs: samples.at(-1) ?? null,
          totalWorkCycleMs: Number(
            samples.reduce((sum, sample) => sum + sample, 0).toFixed(2),
          ),
        });
      } finally {
        await session?.close();
        await runner.close();
      }
      console.log(JSON.stringify(records.at(-1)));
    }
  }
}
await writeFile(
  input("out"),
  `${JSON.stringify({ seed: 42, settingsPath, repeats, records }, null, 2)}\n`,
);
