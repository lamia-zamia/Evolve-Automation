import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  createChromiumRunner,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";

const root = new URL("../", import.meta.url);
const path = (relative) => new URL(relative, root);
const savePath = "test-artifacts/benchmark/tmp/p14-postfix2-fresh-50000.txt";
const settingsPath =
  "test-artifacts/benchmark/slice0/settings/current-full.json";
const gamePath = "test-artifacts/game/evolve-deadspace.js";
const bundlePath = "evolve_automation.user.js";
const outPath =
  "experiments/p15-standard-bootstrap-gather-policy-comparison.json";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const [saveText, settingsText, gameText, bundleText, runnerText, bridgeText] =
  await Promise.all([
    readFile(path(savePath)),
    readFile(path(settingsPath), "utf8"),
    readFile(path(gamePath)),
    readFile(path(bundlePath)),
    readFile(path("tools/chromium-evolve-runner.mjs")),
    readFile(path("tools/chromium/bridge.js")),
  ]);
const baseSettings = JSON.parse(settingsText);
const save = parseSave(saveText.toString("utf8"));
const arms = [
  { id: "A-current-full", settings: baseSettings },
  {
    id: "B-building-always-click",
    settings: { ...baseSettings, buildingAlwaysClick: true },
  },
];
const horizon = 5000;
const sampleStep = 100;
const runner = await createChromiumRunner({
  game: fileURLToPath(path(gamePath)),
});
const sessions = [];
try {
  for (const arm of arms) {
    sessions.push(
      await runner.openSession({
        bundle: fileURLToPath(path(bundlePath)),
        save,
        settings: arm.settings,
        seed: 42,
      }),
    );
  }
  const results = await Promise.all(
    sessions.map(async (session, index) => {
      const arm = arms[index];
      const start = await session.readState();
      const checkpoints = [];
      let firstSundialAt;
      let currentPeriod = await session.periods();
      if (arm.id === "B-building-always-click") {
        firstSundialAt = await session.evaluate(async () => {
          const runner = window.__EA_RUNNER__;
          for (let steps = 0; steps < 5000; steps += 1) {
            const advanced = await runner.advance(1);
            if (advanced.stopped || advanced.reloading) return null;
            const count =
              runner.diagnostics().controlUsage["tech-sundial.action"]
                ?.returned ?? 0;
            if (count > 0) return runner.periods();
          }
          return null;
        });
        currentPeriod = await session.periods();
      }
      while (currentPeriod < horizon) {
        const toNextCheckpoint = sampleStep - (currentPeriod % sampleStep || 0);
        const step = Math.min(toNextCheckpoint, horizon - currentPeriod);
        await session.advance(step);
        currentPeriod += step;
        const state = await session.readState();
        const tech = state.tech ?? {};
        if (currentPeriod % 500 === 0)
          checkpoints.push({
            periods: currentPeriod,
            day: state.stats?.days,
            tech,
            stock: Object.fromEntries(
              ["Food", "Lumber", "Stone", "Chrysotile", "Knowledge"].map(
                (id) => [id, state.resource?.[id]?.amount],
              ),
            ),
            population: Object.values(state.race?.zonePop ?? {}).reduce(
              (total, quantity) => total + Number(quantity || 0),
              0,
            ),
            starved: state.stats?.starved,
            died: state.stats?.died,
            activeJobs: Object.fromEntries(
              Object.entries(state.civic ?? {})
                .filter(([, job]) => Number(job?.workers) > 0)
                .map(([id, job]) => [id, job.workers]),
            ),
            market: state.city?.market,
            quarry: state.city?.quarry,
          });
      }
      const [end, diagnostics, exported] = await Promise.all([
        session.readState(),
        session.diagnostics(),
        session.exportSave(),
      ]);
      const controlUsage = diagnostics.controlUsage ?? {};
      const gatherCalls = Object.fromEntries(
        Object.entries(controlUsage).filter(([id]) =>
          [
            "undefined-food.action",
            "city-food.action",
            "city-lumber.action",
            "city-stone.action",
            "undefined-stone.action",
            "city-chrysotile.action",
            "city-slaughter.action",
          ].includes(id),
        ),
      );
      const researchCalls = Object.fromEntries(
        Object.entries(controlUsage).filter(([id]) =>
          /tech-|research/i.test(id),
        ),
      );
      return {
        id: arm.id,
        settings: { buildingAlwaysClick: arm.settings.buildingAlwaysClick },
        start: {
          universe: start.race?.universe,
          species: start.race?.species,
          primitive: start.tech?.primitive,
          stock: Object.fromEntries(
            ["Food", "Lumber", "Stone", "Chrysotile", "Knowledge"].map((id) => [
              id,
              start.resource?.[id]?.amount,
            ]),
          ),
        },
        firstSundialAt,
        final: {
          periods: horizon,
          day: end.stats?.days,
          tech: end.tech,
          stock: Object.fromEntries(
            ["Food", "Lumber", "Stone", "Chrysotile", "Knowledge"].map((id) => [
              id,
              end.resource?.[id]?.amount,
            ]),
          ),
          population: Object.values(end.race?.zonePop ?? {}).reduce(
            (total, quantity) => total + Number(quantity || 0),
            0,
          ),
          starved: end.stats?.starved,
          died: end.stats?.died,
          activeJobs: Object.fromEntries(
            Object.entries(end.civic ?? {})
              .filter(([, job]) => Number(job?.workers) > 0)
              .map(([id, job]) => [id, job.workers]),
          ),
          market: end.city?.market,
          quarry: end.city?.quarry,
        },
        checkpoints,
        gatherCalls,
        researchCalls,
        controlUsage,
        diagnostics,
        exportSha256: hash(exported),
      };
    }),
  );
  const evidence = {
    experiment: "P15 phase 2 existing-policy comparison",
    runner: "chromium-exact",
    periodsPerCheckpoint: sampleStep,
    horizon,
    seed: 42,
    inputs: {
      savePath,
      saveSha256: hash(saveText),
      settingsPath,
      settingsSha256: hash(settingsText),
      gamePath,
      gameSha256: hash(gameText),
      bundlePath,
      bundleSha256: hash(bundleText),
      runnerSha256: hash(runnerText),
      bridgeSha256: hash(bridgeText),
    },
    results,
  };
  await writeFile(path(outPath), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        outPath,
        inputs: evidence.inputs,
        results: results.map(
          ({ id, firstSundialAt, final, gatherCalls, researchCalls }) => ({
            id,
            firstSundialAt,
            final,
            gatherCalls,
            researchCalls,
          }),
        ),
      },
      null,
      2,
    ),
  );
} finally {
  await Promise.all(sessions.map((session) => session.close()));
  await runner.close();
}
