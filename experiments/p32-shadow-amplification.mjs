import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateConstructionAllocationShadow } from "../src/bootstrap/construction-allocation-shadow.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const livePath = path.join(
  root,
  "experiments/p32-live-allocation-authority-evidence.json",
);
const outputPath = path.join(
  root,
  "experiments/p32-shadow-amplification-evidence.json",
);
const liveText = await readFile(livePath, "utf8");
const live = JSON.parse(liveText);
const source = live.recentRecords.at(-1);
assert.ok(source, "live pre-Gather diagnostic record is required");
const liveInput = {
  ...source,
  currentRootGeneration: source.rootGeneration,
  currentProgressionGeneration: source.progressionGeneration,
};
const syntheticPositiveInput = {
  orderingGeneration: 1,
  phase: "pre-Gather",
  workCycleId: 1,
  rootGeneration: 0,
  progressionGeneration: "fixture-generation",
  currentRootGeneration: 0,
  currentProgressionGeneration: "fixture-generation",
  target: {
    id: "city-farm",
    pool: "anywhere",
    cost: { Lumber: 20, Stone: 10, Money: 30 },
  },
  currentTarget: {
    id: "city-farm",
    pool: "anywhere",
    cost: { Money: 30, Stone: 10, Lumber: 20 },
  },
  resources: {
    Lumber: { amount: 21, max: 200 },
    Stone: { amount: 0, max: 200 },
    Money: { amount: 30, max: 10_000 },
  },
  permissions: { autoBuild: true, gatherEnabled: true },
  controls: {
    target: { methods: ["action"], generation: 1 },
    Lumber: { methods: ["action"], generation: 1 },
    Stone: { methods: ["action"], generation: 1 },
  },
  queues: { build: [], research: [] },
  reservations: { status: "clear" },
  handoff: { observed: true, active: false },
  claims: [],
  budgets: { perCycle: 5, perTargetEpisode: 80, totalEpisode: 140 },
};

function measure(input, repetitions) {
  const started = process.hrtime.bigint();
  let accepted = 0;
  let rejected = 0;
  let reasonCount = 0;
  for (let index = 0; index < repetitions; index += 1) {
    const result = evaluateConstructionAllocationShadow(input);
    if (result.authorized) accepted += 1;
    else rejected += 1;
    reasonCount += result.reasons.length;
  }
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  return { repetitions, elapsedMs, accepted, rejected, reasonCount };
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

const repetitions = [10_000, 30_000, 90_000];
const measurements = {};
for (const [name, input] of [
  ["live-missing-target", liveInput],
  ["synthetic-complete-positive", syntheticPositiveInput],
]) {
  const batches = repetitions.map((count) =>
    Array.from({ length: 5 }, () => measure(input, count)),
  );
  measurements[name] = batches.map((runs) => ({
    repetitions: runs[0].repetitions,
    medianElapsedMs: median(runs.map((run) => run.elapsedMs)),
    runs,
    elapsedPerEvaluationMs:
      median(runs.map((run) => run.elapsedMs)) / runs[0].repetitions,
  }));
}
assert.equal(evaluateConstructionAllocationShadow(liveInput).authorized, false);
assert.equal(
  evaluateConstructionAllocationShadow(syntheticPositiveInput).authorized,
  true,
);
const report = {
  sourceEvidenceSha256: createHash("sha256").update(liveText).digest("hex"),
  method:
    "Five diagnostic batches at 10k, 30k, and 90k repetitions; no game advancement or native action. The positive input is synthetic and is not production-overhead evidence.",
  measurements,
};
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report)}\n`);
