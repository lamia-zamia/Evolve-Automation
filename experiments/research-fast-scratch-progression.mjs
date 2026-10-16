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
  { name: "early", savePath: input("early") },
  { name: "mid", savePath: input("mid") },
  { name: "late", savePath: input("late") },
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
const warmup = 400;
const checkpointPeriods = [1000, 2000, 3000, 4000];
const reports = [];

function summarize(state, initialTech, offers) {
  const tech = state.tech ?? {};
  const techChanges = Object.entries(tech)
    .filter(([id, level]) => level !== initialTech[id])
    .map(([id, level]) => ({ id, from: initialTech[id] ?? 0, to: level }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const numeric = (value) =>
    typeof value === "number" && Number.isFinite(value);
  const resources = Object.fromEntries(
    Object.entries(state.resource ?? {})
      .filter(([, resource]) => numeric(resource?.amount))
      .map(([id, resource]) => [id, resource.amount]),
  );
  const buildingCounts = {};
  for (const area of [
    "city",
    "space",
    "interstellar",
    "portal",
    "tauceti",
    "eden",
    "underground",
    "surface",
  ]) {
    for (const [id, value] of Object.entries(state[area] ?? {})) {
      if (numeric(value)) buildingCounts[`${area}.${id}`] = value;
      else if (numeric(value?.count))
        buildingCounts[`${area}.${id}`] = value.count;
    }
  }
  return {
    day: state.stats?.days,
    reset: state.stats?.reset,
    species: state.race?.species,
    techCount: Object.keys(tech).length,
    techChanges,
    milestones: Object.fromEntries(
      [
        "mad",
        "blackhole",
        "ascend",
        "portals",
        "bioseed",
        "cataclysm",
        "universes",
      ].map((key) => [key, state.stats?.[key]]),
    ),
    resources,
    emptyResources: Object.entries(state.resource ?? {})
      .filter(
        ([, resource]) => numeric(resource?.amount) && resource.amount <= 0,
      )
      .map(([id]) => id),
    shortages: {
      starved: state.stats?.starved,
      totalStarved: state.stats?.tstarved,
      died: state.stats?.died,
    },
    buildingCounts,
    queue: state.queue,
    researchQueue: state.r_queue,
    city: state.city,
    offers,
  };
}

for (let repetition = 0; repetition < 1; repetition += 1) {
  for (const scenario of scenarios) {
    const order =
      scenarios.indexOf(scenario) % 2 === 0
        ? variants
        : [...variants].reverse();
    for (const variant of order) {
      const save = parseSave(await readFile(scenario.savePath, "utf8"));
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
        await session.advance(warmup);
        const initial = await session.readState();
        const initialTech = { ...initial.tech };
        await session.evaluate(() => {
          window.__EA_RESEARCH_DRAW_TRACE__ = {
            draws: 0,
            offers: 0,
            completed: 0,
            callbackCount: 0,
            completedCallbackMs: 0,
            latestOffers: [],
          };
        });
        let previous = 0;
        const checkpoints = [];
        for (const checkpoint of checkpointPeriods) {
          const previousCheckpoint = previous;
          await session.advance(checkpoint - previous);
          previous = checkpoint;
          const sample = await session.evaluate(() => ({
            trace: { ...window.__EA_RESEARCH_DRAW_TRACE__ },
          }));
          const cycleSamples = (await session.diagnostics()).callbackDurationsMs
            .filter(
              (entry) =>
                entry.period > warmup + previousCheckpoint &&
                entry.period <= warmup + checkpoint &&
                entry.period % settings.tickRate === 0,
            )
            .map((entry) => entry.durationMs)
            .sort((left, right) => left - right);
          const percentile = (p) =>
            cycleSamples[
              Math.min(
                cycleSamples.length - 1,
                Math.ceil(cycleSamples.length * p) - 1,
              )
            ] ?? null;
          checkpoints.push({
            periods: checkpoint,
            runnerPeriod: await session.periods(),
            ...summarize(
              await session.readState(),
              initialTech,
              sample.trace.latestOffers,
            ),
            workCycleMs: {
              count: cycleSamples.length,
              p50: percentile(0.5),
              p95: percentile(0.95),
              p99: percentile(0.99),
              max: cycleSamples.at(-1) ?? null,
            },
            trace: {
              researchDraws: sample.trace.draws,
              offeredRows: sample.trace.offers,
              completedTechsClassified: sample.trace.completed,
              completedCallbacks: sample.trace.callbackCount,
              completedCallbackMs: Number(
                sample.trace.completedCallbackMs.toFixed(2),
              ),
            },
          });
        }
        const diagnostics = await session.diagnostics();
        const measuredCycles = diagnostics.callbackDurationsMs.filter(
          (sample) =>
            sample.period > warmup &&
            sample.period <= warmup + checkpointPeriods.at(-1) &&
            sample.period % settings.tickRate === 0,
        );
        reports.push({
          scenario: scenario.name,
          variant: variant.name,
          warmup,
          measuredPeriods: checkpointPeriods.at(-1),
          checkpoints,
          totalMeasuredWorkCycleMs: Number(
            measuredCycles
              .reduce((sum, sample) => sum + sample.durationMs, 0)
              .toFixed(2),
          ),
          workCycleSamples: measuredCycles.length,
          randomCalls: diagnostics.randomCalls,
          thrownControlCalls: Object.values(diagnostics.controlUsage).reduce(
            (sum, entry) => sum + entry.threw,
            0,
          ),
          diagnostics: {
            counts: diagnostics.counts,
            controlUsage: diagnostics.controlUsage,
            events: diagnostics.events,
          },
        });
      } finally {
        await session?.close();
        await runner.close();
      }
      console.log(`${scenario.name} ${variant.name} complete`);
    }
  }
}

await writeFile(
  input("out"),
  `${JSON.stringify({ seed: 42, settingsPath, reports }, null, 2)}\n`,
);
