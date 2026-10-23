import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createChromiumRunner,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fixturePath = path.join(
  root,
  "test-artifacts/benchmark/slice0/saves/p18-standard-human-fixture.txt",
);
const settingsPath = path.join(
  root,
  "experiments/p18-standard-human-settings.json",
);
const bundlePath = path.join(
  root,
  "test-artifacts/benchmark/tmp/p31/p30.user.js",
);
const evidencePath = path.join(
  root,
  "experiments/p20-1-construction-allocation-authority-evidence.json",
);
const [fixtureText, settingsText, bundleBytes, evidence] = await Promise.all([
  readFile(fixturePath, "utf8"),
  readFile(settingsPath, "utf8"),
  readFile(bundlePath),
  readFile(evidencePath, "utf8").then(JSON.parse),
]);
const sample = evidence.candidate.constructionOwnerEvidence.find(
  (entry) => entry.period === 5000,
);
assert.ok(sample, "retained P20.1 pre-Gather authority sample is missing");
assert.equal(sample.phase, "pre-Gather");

const runner = await createChromiumRunner();
const session = await runner.openSession({
  bundle: bundlePath,
  save: parseSave(fixtureText),
  settings: JSON.parse(settingsText),
  seed: 44,
  epoch: Date.parse("2026-09-21T00:00:00.000Z"),
});
const results = [];
const iterationCount = 20_000;
try {
  await session.advance(100);
  for (let repeat = 1; repeat <= 7; repeat++) {
    const [before, metricsBefore] = await Promise.all([
      runner.processCpu(),
      session.metrics(),
    ]);
    const result = await session.evaluate(
      (event, iterations) => {
        const current = () => {
          const targetId = event.targetId;
          const sameCost = (left, right) =>
            JSON.stringify(left) === JSON.stringify(right);
          const shortage = event.materialShortage ?? {};
          const capacity = event.obtainableCapacity ?? {};
          const bindings = event.gatherControlBindings ?? {};
          const positiveShortage = ["Lumber", "Stone"].some(
            (id) => Number(shortage[id] ?? 0) > 0,
          );
          const capacityAvailable = ["Lumber", "Stone"].every(
            (id) =>
              Number(shortage[id] ?? 0) <= 0 ||
              Number(capacity[id] ?? 0) >= Number(shortage[id]),
          );
          const gatherBindingsCurrent = ["Lumber", "Stone"].every((id) =>
            Number(shortage[id] ?? 0) <= 0
              ? true
              : Number.isSafeInteger(bindings[id]?.generation),
          );
          const authorityCurrent =
            event.publicationCurrent === true &&
            event.publicationWorkCycleId + 1 === event.workCycleId &&
            event.rootGeneration ===
              event.publicationAuthority?.rootGeneration &&
            event.progressionGeneration ===
              event.publicationAuthority?.progressionGeneration &&
            event.targetId === event.publishedTargetId &&
            sameCost(event.requestPrice, event.publicationPrice) &&
            sameCost(event.requestPrice, event.nativePrice) &&
            event.requestPool === event.publicationPool &&
            event.requestPool === event.nativePool;
          const controlsAndReservationsCurrent =
            event.queuesEmpty === true &&
            event.permissions?.autoBuild === true &&
            event.permissions?.controlAction === true &&
            event.competingClaims === false &&
            gatherBindingsCurrent;
          const budgetsExplicit =
            Number.isSafeInteger(event.perCycleBudget) &&
            event.perCycleBudget > 0 &&
            Number.isSafeInteger(event.perEpisodeBudget) &&
            event.perEpisodeBudget >= event.perCycleBudget &&
            Number.isSafeInteger(event.perEpisodeBudget) &&
            Number.isSafeInteger(event.perTotalBudget) &&
            event.perTotalBudget >= event.perEpisodeBudget;
          return (
            typeof targetId === "string" &&
            targetId.startsWith("city-") &&
            positiveShortage &&
            capacityAvailable &&
            authorityCurrent &&
            controlsAndReservationsCurrent &&
            budgetsExplicit
          );
        };
        // P20.2's retained limits are explicit ceilings, not a spending policy.
        event.perCycleBudget = 5;
        event.perEpisodeBudget = 80;
        event.perTotalBudget = 140;
        const started = performance.now();
        let authorized = 0;
        for (let index = 0; index < iterations; index++)
          if (current()) authorized += 1;
        return {
          elapsedMs: performance.now() - started,
          authorized,
          iterations,
        };
      },
      sample,
      iterationCount,
    );
    const [after, metricsAfter] = await Promise.all([
      runner.processCpu(),
      session.metrics(),
    ]);
    const beforeById = new Map(before.map((row) => [row.id, row]));
    const rendererCpuSec = after
      .filter((row) => row.type === "renderer")
      .reduce(
        (sum, row) => sum + row.cpuSec - (beforeById.get(row.id)?.cpuSec ?? 0),
        0,
      );
    results.push({
      repeat,
      ...result,
      rendererCpuSec: Number(rendererCpuSec.toFixed(6)),
      taskDurationSec: Number(
        (metricsAfter.TaskDuration - metricsBefore.TaskDuration).toFixed(6),
      ),
      incrementalNativeProbes: 0,
      incrementalCapturePasses: 0,
    });
  }
} finally {
  await session.close();
  await runner.close();
}

const report = {
  experiment: "P31 test-only shadow authority microprofile",
  sourceObservation: {
    evidencePath: path.relative(root, evidencePath),
    period: sample.period,
    phase: sample.phase,
    workCycleId: sample.workCycleId,
    publicationWorkCycleId: sample.publicationWorkCycleId,
    targetId: sample.targetId,
    requestPrice: sample.requestPrice,
    shortage: sample.materialShortage,
    capacity: sample.obtainableCapacity,
  },
  fixtureSha256: hash(fixtureText),
  settingsSha256: hash(JSON.stringify(JSON.parse(settingsText))),
  bundleSha256: hash(bundleBytes),
  iterationCount,
  results,
};
console.log(JSON.stringify(report));
