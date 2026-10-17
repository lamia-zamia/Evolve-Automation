import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import { CAPTURED_AUTOMATION_BUILDING_BINDINGS } from "../src/adapters/evolve/progression/build/captured-building-bindings.generated.ts";
import { CAPTURED_BUILD_REGIONS } from "../src/adapters/evolve/progression/build/captured-building-metadata.ts";
import { readCapturedBuildingUnlockStateRecords } from "../src/adapters/evolve/progression/build/captured-building-unlock-observation.ts";
import { createCapturedBuildingUnlocks } from "../src/adapters/evolve/progression/build/captured-building-unlocks.ts";

const observations = Number(process.env.P5_OBSERVATIONS ?? 25);
if (!Number.isInteger(observations) || observations < 1 || observations > 100) {
  throw new Error("P5_OBSERVATIONS must be an integer from 1 through 100");
}

const allBindings = [...CAPTURED_AUTOMATION_BUILDING_BINDINGS];
let availabilityEvaluations = 0;
const structuresByBinding = new Map(
  allBindings.map((binding) => {
    const separator = binding.indexOf("-");
    const region = binding.slice(0, separator);
    const struct = binding.slice(separator + 1);
    return [
      binding,
      [
        Object.freeze({
          actionId: binding,
          entryKey: `${region}:${struct}`,
          region,
          struct,
        }),
      ],
    ];
  }),
);
const root = {};
root.tech = { high_tech: 0 };
for (const binding of allBindings) {
  const separator = binding.indexOf("-");
  const region = binding.slice(0, separator);
  const struct = binding.slice(separator + 1);
  root[region] ??= {};
  root[region][struct] = Object.freeze({ count: 1, on: 1 });
}
const nativeStructures = Object.freeze(
  allBindings.map((binding) => {
    const separator = binding.indexOf("-");
    const region = binding.slice(0, separator);
    const struct = binding.slice(separator + 1);
    return Object.freeze({
      actionId: binding,
      entryKey: `${region}:${struct}`,
      region,
      sector: region,
      struct,
      ownsPowered: false,
      readAvailability: () => {
        availabilityEvaluations += 1;
        return { kind: "value", value: true };
      },
      readPowerRequirements: () => ({ kind: "absent" }),
      readSwitchable: () => ({ kind: "value", value: true }),
    });
  }),
);

const scenarios = [
  { name: "city", regions: new Set(["city"]) },
  {
    name: "city-space-interstellar-portal",
    regions: new Set(["city", "space", "interstellar", "portal"]),
  },
  { name: "all-supported", regions: new Set(CAPTURED_BUILD_REGIONS) },
];

function bindingsFor(regions) {
  return new Set(
    allBindings.filter((binding) =>
      regions.has(binding.slice(0, binding.indexOf("-"))),
    ),
  );
}

function inspect(rootValue, bindings) {
  let rootRegionReads = 0;
  const countedRoot = new Proxy(rootValue, {
    get(target, key, receiver) {
      if (typeof key === "string" && key in target) rootRegionReads += 1;
      return Reflect.get(target, key, receiver);
    },
  });
  const records = readCapturedBuildingUnlockStateRecords(
    countedRoot,
    structuresByBinding,
    bindings,
  );
  return { records, rootRegionReads };
}

const report = {
  boundedObservations: observations,
  totalManagedBindings: allBindings.length,
  scenarios: [],
};

for (const scenario of scenarios) {
  const requestedBindings = bindingsFor(scenario.regions);
  const full = inspect(root, new Set(allBindings));
  const narrow = inspect(root, requestedBindings);
  const expectedRequestedRecords = new Map(
    [...full.records].filter(([binding]) => requestedBindings.has(binding)),
  );
  assert.deepEqual(narrow.records, expectedRequestedRecords);

  const startFull = performance.now();
  let fullReads = 0;
  for (let index = 0; index < observations; index += 1) {
    fullReads += inspect(root, new Set(allBindings)).rootRegionReads;
  }
  const fullMs = performance.now() - startFull;

  const startNarrow = performance.now();
  let narrowReads = 0;
  for (let index = 0; index < observations; index += 1) {
    narrowReads += inspect(root, requestedBindings).rootRegionReads;
  }
  const narrowMs = performance.now() - startNarrow;

  let rootRegionReads = 0;
  let structureCatalogReads = 0;
  availabilityEvaluations = 0;
  const rootForReader = new Proxy(root, {
    get(target, key, receiver) {
      if (typeof key === "string" && scenario.regions.has(key))
        rootRegionReads += 1;
      return Reflect.get(target, key, receiver);
    },
  });
  const reader = createCapturedBuildingUnlocks({
    rootState: {
      readRoot: () => rootForReader,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    mechanics: {
      readStructures: () => {
        structureCatalogReads += 1;
        return nativeStructures;
      },
    },
  });
  const startOffer = performance.now();
  let catalog;
  for (let index = 0; index < observations; index += 1) {
    catalog = reader.read(scenario.regions);
  }
  const offerMs = performance.now() - startOffer;
  assert.equal(catalog.unlocked.size, requestedBindings.size);
  assert.equal(catalog.switches.size, requestedBindings.size);
  assert.equal(availabilityEvaluations, requestedBindings.size * observations);

  report.scenarios.push({
    feature: "captured Building policy",
    phase: "current native offer observation / state-record resolution",
    requestedRegions: [...scenario.regions],
    totalBindingCount: allBindings.length,
    requestedBindingCount: requestedBindings.size,
    stateRecordsInspectedPerObservation: {
      allRegions: full.records.size,
      requestedRegions: narrow.records.size,
    },
    rootRegionReadsPerObservation: {
      allRegions: full.rootRegionReads,
      requestedRegions: narrow.rootRegionReads,
    },
    availabilityEvaluationsPerObservation:
      availabilityEvaluations / observations,
    availabilityEvaluation:
      "synthetic readAvailability stub, not upstream callbacks",
    capturedBuildingStateReadsPerObservation: catalog.switches.size,
    structureCatalogReadsPerObservation: structureCatalogReads / observations,
    structureIndexReuse:
      "stable structure array; one index build per reader instance",
    rootRegionAddressReadsPerObservation: rootRegionReads / observations,
    catalogConsumed:
      "unlocked catalog size asserted against requested binding count",
    rootIdentity: "synthetic-immutable-fixture-root",
    epoch: 0,
    controlIdentity: "generated-native-binding-catalog-v1",
    interveningMutation: false,
    repeatedReadCount: observations,
    repeatedStateAddressReads: {
      allRegions: fullReads,
      requestedRegions: narrowReads,
    },
    diagnosticWallMs: { allRegions: fullMs, requestedRegions: narrowMs },
    fullOfferDiagnosticWallMs: offerMs,
  });
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
