import assert from "node:assert/strict";

import {
  assessRetirementPreparation,
  isRetirementAssistActive,
} from "../src/domain/progression/prestige/retirement-prep.ts";
import { formatRetirementShortfalls } from "../src/application/retirement-prep.ts";
import {
  legacyRetirementAssistActive,
  legacyRetirementPreparationMissing,
} from "./test-support/legacy-retirement-prep.mjs";

const numberString = (amount) => `${amount / 1_000_000}M`;

const thresholds = Object.freeze({
  fusionGenerators: 20,
  factories: 18,
  scienceLabs: 11,
  graphene: 200_000_000,
});

// --- Assist-active decision -------------------------------------------------
const assistCases = [];
for (const assistEnabled of [true, false]) {
  for (const truepath of [true, false]) {
    for (const retirePrestige of [true, false]) {
      for (const isolationResearched of [true, false]) {
        assistCases.push({
          assistEnabled,
          truepath,
          retirePrestige,
          isolationResearched,
        });
      }
    }
  }
}
for (const input of assistCases) {
  assert.equal(
    isRetirementAssistActive(input),
    legacyRetirementAssistActive(input),
    `assist mismatch: ${JSON.stringify(input)}`,
  );
}
assert.equal(
  isRetirementAssistActive({
    assistEnabled: true,
    truepath: true,
    retirePrestige: true,
    isolationResearched: false,
  }),
  true,
);
assert.equal(
  isRetirementAssistActive({
    assistEnabled: true,
    truepath: true,
    retirePrestige: true,
    isolationResearched: true,
  }),
  false,
  "Isolation Protocol ends preparation",
);

// --- Preparation shortfalls -------------------------------------------------
function makePrep(overrides = {}) {
  return {
    fusionGenerators: { name: "Fusion Generator", count: 20 },
    factories: { name: "Factory", count: 18 },
    scienceLabs: { name: "Disease Lab", count: 11 },
    graphene: {
      name: "Graphene",
      currentQuantity: 200_000_000,
      maxQuantity: 250_000_000,
    },
    thresholds,
    ...overrides,
  };
}

const prepCases = [
  makePrep(),
  makePrep({ fusionGenerators: { name: "Fusion Generator", count: 19 } }),
  makePrep({ factories: { name: "Factory", count: 0 } }),
  makePrep({ scienceLabs: { name: "Disease Lab", count: 10 } }),
  makePrep({
    graphene: { name: "Graphene", currentQuantity: 150e6, maxQuantity: 150e6 },
  }),
  makePrep({
    graphene: { name: "Graphene", currentQuantity: 150e6, maxQuantity: 250e6 },
  }),
  makePrep({
    fusionGenerators: { name: "Fusion Generator", count: 0 },
    factories: { name: "Factory", count: 0 },
    scienceLabs: { name: "Disease Lab", count: 0 },
    graphene: { name: "Graphene", currentQuantity: 0, maxQuantity: 0 },
  }),
];
for (const input of prepCases) {
  const modern = formatRetirementShortfalls(
    assessRetirementPreparation(input),
    numberString,
  );
  assert.deepEqual(
    modern,
    legacyRetirementPreparationMissing(input, numberString),
    `missing mismatch: ${JSON.stringify(input)}`,
  );
}

// Exact characterized strings: storage shortfall wins over stockpile.
assert.deepEqual(
  formatRetirementShortfalls(
    assessRetirementPreparation(
      makePrep({
        fusionGenerators: { name: "Fusion Generator", count: 19 },
        graphene: {
          name: "Graphene",
          currentQuantity: 150e6,
          maxQuantity: 150e6,
        },
      }),
    ),
    numberString,
  ),
  ["Fusion Generator 19/20", "Graphene storage 150M/200M"],
);
assert.deepEqual(
  formatRetirementShortfalls(
    assessRetirementPreparation(
      makePrep({
        graphene: {
          name: "Graphene",
          currentQuantity: 150e6,
          maxQuantity: 250e6,
        },
      }),
    ),
    numberString,
  ),
  ["Graphene stockpile 150M/200M"],
);
assert.deepEqual(
  assessRetirementPreparation(makePrep()),
  [],
  "a fully prepared plan reports nothing missing",
);

console.log("Retirement preparation domain tests passed");
