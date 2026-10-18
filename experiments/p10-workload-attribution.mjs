import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const option = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : process.argv[index + 1];
};
const fixtureRoot = resolve(
  root,
  option("fixtures", process.env.EA_FIXTURE_ROOT ?? "test-artifacts"),
);
const fixtureNames = ["late", "mid"];
const inputPath = (name, fallback) => {
  const path = option(name, fallback);
  return isAbsolute(path) ? path : resolve(fixtureRoot, path);
};
const pricePattern = inputPath(
  "prices",
  "perf-profile/p10-price-{fixture}.json",
);
const buildingPath = inputPath(
  "building",
  "perf-profile/p10-building-observations.json",
);
const samplePath = inputPath(
  "samples",
  "perf-profile/p10-sample-lifecycle.json",
);
const outputPath = resolve(
  root,
  option("out", "test-artifacts/perf-profile/p10-attribution-summary.json"),
);

const featureByPhase = new Map([
  ["construction saving discovery", "Construction"],
  ["pre-Gather demand", "Construction"],
  ["autoStorage", "Storage"],
  ["autoBuild", "Build"],
  ["autoFactory", "Factory"],
  ["autoJobs with autoCraftsmen", "Jobs/Craftsmen"],
  ["autoCraft", "Craft"],
  ["autoResearch", "Research"],
]);
const consumersByPhase = new Map([
  ["construction saving discovery", ["Construction ordering"]],
  [
    "pre-Gather demand",
    [
      "Construction demand",
      "Storage demand",
      "Build reservation",
      "Factory weighting",
      "Jobs/Craftsmen weighting",
    ],
  ],
  ["autoStorage", ["Storage allocation"]],
  ["autoBuild", ["Build execution and reservation"]],
  ["autoFactory", ["Factory weighting"]],
  ["autoJobs with autoCraftsmen", ["Jobs/Craftsmen weighting"]],
  ["autoResearch", ["Research offers / progression"]],
]);
const phaseFeature = (phase) => featureByPhase.get(phase) ?? "unknown";

const readJson = async (path) => {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(
        `Required P10 input not found: ${path}. Set EA_FIXTURE_ROOT or pass --fixtures, --prices, --building, or --samples.`,
        { cause: error },
      );
    }
    throw error;
  }
};
const traceByFixture = new Map();
for (const fixture of fixtureNames) {
  const path = pricePattern.replace("{fixture}", fixture);
  traceByFixture.set(fixture, await readJson(path));
}
const building = await readJson(buildingPath);
const samples = await readJson(samplePath);
assert.deepEqual(
  building.fixtures.map(({ name }) => name),
  fixtureNames,
  "Building probe fixture order must match the price traces",
);
assert.deepEqual(
  samples.fixtures.map(({ name }) => name),
  fixtureNames,
  "Sample lifecycle fixture order must match the price traces",
);

const fixtures = [];
for (const fixture of fixtureNames) {
  const price = traceByFixture.get(fixture);
  const buildingFixture = building.fixtures.find(
    (entry) => entry.name === fixture,
  );
  const sampleFixture = samples.fixtures.find(
    (entry) => entry.name === fixture,
  );
  assert.ok(buildingFixture);
  assert.ok(sampleFixture);
  assert.equal(price.inputs.seed, 42);
  assert.equal(price.inputs.warmup, 600);
  assert.equal(price.inputs.periods, 1000);
  assert.equal(price.behavioralParity.productionBundle.exportIdentical, true);
  assert.equal(
    price.behavioralParity.productionBundle.nativeControlUsageIdentical,
    true,
  );
  assert.equal(
    price.behavioralParity.productionBundle
      .nonPriceNativeInvocationSequenceIdentical,
    true,
  );
  assert.equal(buildingFixture.workticks, 125);
  assert.equal(buildingFixture.pageErrors, 0);

  const nativePrices = new Map();
  for (const event of price.events) {
    const phase = event.phase;
    const feature = featureByPhase.get(phase) ?? "unknown";
    const key = `${phase}\u0000${event.probeKind}`;
    const row = nativePrices.get(key) ?? {
      initiatingFeature: feature,
      operation: "native price computation",
      nativeControl: "buildQueue.setData",
      phase,
      consumers: consumersByPhase.get(phase) ?? ["unknown"],
      workticks: new Set(),
      probes: 0,
      unavailable: 0,
      failed: 0,
      authoritativeGameMutation: false,
    };
    row.workticks.add(event.cycle);
    row.probes += 1;
    if (event.outcome === "unavailable") row.unavailable += 1;
    if (event.outcome === "failed") row.failed += 1;
    nativePrices.set(key, row);
  }

  const priceOperations = [...nativePrices.values()].map((row) => ({
    ...row,
    workticks: row.workticks.size,
  }));
  const setDataProbes = priceOperations.reduce(
    (sum, row) => sum + row.probes,
    0,
  );
  assert.equal(setDataProbes, price.summary.nativeProbes);

  const actionAttempts =
    buildingFixture.nativeControlInvocationMethods.action ?? 0;
  const demandSamples = {};
  const demandInvalidations = {};
  for (const event of sampleFixture.events) {
    if (event.operation === "demand-sample-construction") {
      demandSamples[event.owner] = (demandSamples[event.owner] ?? 0) + 1;
    } else if (event.operation === "demand-invalidation") {
      const key = `${event.phase} (price authority may change: ${event.actionCostsMayChange})`;
      demandInvalidations[key] = (demandInvalidations[key] ?? 0) + 1;
    }
  }
  const candidateSetEvents = sampleFixture.events.filter(
    (event) => event.operation === "build-candidate-set",
  );
  const resourceViewReads = Object.entries(sampleFixture.counts)
    .filter(([key]) => key.endsWith("\u0000resource-view-read"))
    .reduce((sum, [, count]) => sum + count, 0);
  const domLookups = Object.entries(sampleFixture.counts)
    .filter(([key]) => key.includes("\u0000dom\u0000"))
    .map(([key, calls]) => {
      const [phase, , method] = key.split("\u0000");
      return {
        initiatingFeature:
          "unknown: phase context does not prove DOM-call origin",
        phaseOwner: phaseFeature(phase),
        operation: "DOM selector / id lookup",
        method,
        phase,
        calls,
        authoritativeGameMutation: false,
      };
    });
  const observedControls = new Map();
  for (const observation of buildingFixture.observations) {
    for (const event of observation.interveningEvents ?? []) {
      if (event.kind !== "native-control-invoke" || event.method === "setData")
        continue;
      const key = `${event.phase}\u0000${event.elementId}\u0000${event.method}`;
      const row = observedControls.get(key) ?? {
        initiatingFeature: featureByPhase.get(event.phase) ?? "unknown",
        operation: "native control invocation",
        nativeControl: `${event.elementId}.${event.method}`,
        phase: event.phase,
        invocations: 0,
        authoritativeGameMutation:
          event.method === "action" ? "unknown" : false,
      };
      row.invocations += 1;
      observedControls.set(key, row);
    }
  }
  const buildingOperation = {
    initiatingFeature: "shared Building consumers",
    operation: "current Building/catalog observations",
    nativeControl: "structure.readAvailability",
    observations: buildingFixture.observationCount,
    availabilityEvaluations: buildingFixture.nativeAvailabilityEvaluations,
    consumers: [
      ...new Set(
        Object.entries(buildingFixture.perPhase)
          .filter(([, count]) => count > 0)
          .map(([phase]) => phase),
      ),
    ],
    authoritativeGameMutation: false,
    incomplete: buildingFixture.incompleteObservations,
  };

  fixtures.push({
    name: fixture,
    input: {
      seed: price.inputs.seed,
      autoPrestige: false,
      warmupPeriods: price.inputs.warmup,
      measuredPeriods: price.inputs.periods,
      measuredWorkticks: price.summary.workTicks,
    },
    parity: price.behavioralParity,
    nativePriceOperations: priceOperations,
    nativeControlOperations: [...observedControls.values()],
    domLookups,
    buildingOperation,
    nativeControlCounts: {
      byMethod: buildingFixture.nativeControlInvocationMethods,
      observerWindowOperations: [...observedControls.values()],
      actionAttempts,
      actionMutationOutcome:
        "unknown: a returned native action callback does not prove authoritative state changed",
    },
    sampleLifecycle: {
      demandSampleConstructions: demandSamples,
      demandSampleConstructionTotal: Object.values(demandSamples).reduce(
        (sum, count) => sum + count,
        0,
      ),
      demandInvalidations,
      demandInvalidationTotal: Object.values(demandInvalidations).reduce(
        (sum, count) => sum + count,
        0,
      ),
      resourceViewReads,
      buildCandidateSetRuns: candidateSetEvents.length,
      buildCandidateCount: candidateSetEvents.reduce(
        (sum, event) => sum + event.candidates,
        0,
      ),
      candidateCountsBySetSize: candidateSetEvents.reduce((counts, event) => {
        counts[event.candidates] = (counts[event.candidates] ?? 0) + 1;
        return counts;
      }, {}),
      policyBuildOperation:
        "current Building/catalog observations are counted separately above; other policy object constructors are not counted as a single operation",
    },
    otherMeasuredWork: {
      resourceViewReads: resourceViewReads,
      demandSampleBuildsAndInvalidations: {
        constructions: Object.values(demandSamples).reduce(
          (sum, count) => sum + count,
          0,
        ),
        invalidations: Object.values(demandInvalidations).reduce(
          (sum, count) => sum + count,
          0,
        ),
      },
      buildCandidateSets: candidateSetEvents.length,
      buildCandidates: candidateSetEvents.reduce(
        (sum, event) => sum + event.candidates,
        0,
      ),
      otherPolicyObjectConstructions:
        "not emitted by this probe; Building observations are counted separately",
      domDiscoveryAndRedraw:
        "swapTab method totals are included in P6 nativeControlCounts; query/redraw subcalls are source-profile estimates",
    },
  });
}

const report = {
  scope:
    "test-only deterministic attribution; never a renderer CPU savings estimate",
  operationCounting:
    "Each P9 price event is counted once at probePrice; nested setData work is not added as another price event. Consumers are separate labels and are never summed into feature totals.",
  sourceData: {
    priceTrace: pricePattern,
    buildingTrace: buildingPath,
    sampleTrace: samplePath,
  },
  fixtures,
};
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      outputPath,
      fixtures: fixtures.map(({ name, input, buildingOperation }) => ({
        name,
        input,
        buildingOperation,
      })),
    },
    null,
    2,
  ),
);
