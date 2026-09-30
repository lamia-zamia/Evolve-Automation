import assert from "node:assert/strict";

import { createCapturedPowerReader } from "../src/adapters/evolve/economy/production/captured-power-reader.ts";

function structure(entryKey, region, struct) {
  return {
    entryKey,
    region,
    sector: region === "city" ? "city" : "spc_home",
    struct,
    actionId: `${region}-${struct}`,
    readTitle: () => ({ kind: "value", value: struct }),
    readPowered: () => ({ kind: "value", value: 1 }),
    readFuel: () => ({ kind: "absent" }),
    readFuelAdjustmentRequested: () => ({ kind: "absent" }),
    readSupport: () => ({ kind: "absent" }),
    readSupportTypes: () => ({ kind: "absent" }),
    readSupportValue: () => ({ kind: "absent" }),
    readSupportProvider: () => ({ kind: "absent" }),
    readSupportTopology: () => ({
      kind: "value",
      value: {
        anchorEntryKey: null,
        unlimited: false,
        enabled: { kind: "value", value: true },
      },
    }),
    readSupportFuel: () => ({ kind: "absent" }),
    readSupportFuelAdjustmentDisabled: () => ({ kind: "absent" }),
    readPowerLimit: () => ({ kind: "absent" }),
    readPowerBalancer: () => ({ kind: "absent" }),
  };
}

const cityMill = structure("city:mill", "city", "mill");
const spaceMill = structure("spc_home:mill", "space", "mill");
const root = {
  city: { mill: { count: 2, on: 1 } },
  space: { mill: { count: 5, on: 4 } },
  power: [],
  support: {},
};
const structures = [cityMill, spaceMill];
const mechanics = {
  readStructures: () => structures,
  readPowerOrder: () => ({ kind: "value", value: [] }),
  readSupportOrder: () => ({ kind: "value", value: [] }),
  readProductionBreakdown: () => ({ production: {}, consumption: {} }),
};
const reader = createCapturedPowerReader({
  rootState: { readRoot: () => root },
  mechanics,
  readRuntimeOptions: () => ({
    settings: {
      showGalactic: true,
      limitPowered: false,
      autoFleet: false,
      crewReserve: 0,
    },
    debug: false,
    consumptionBalanceMinimum: 0.8,
  }),
  readWarnings: () => [],
});

assert.equal(
  reader.readStateOn("city:mill"),
  1,
  "state reads resolve the complete captured key when short struct ids repeat",
);
assert.equal(reader.readStateOn("spc_home:mill"), 4);
assert.throws(() => reader.readStateOn("mill"), /binding mill is unavailable/);

assert.equal(
  createCapturedPowerReader({
    rootState: { readRoot: () => undefined },
    mechanics,
    readRuntimeOptions: () => undefined,
    readWarnings: () => [],
  }).readCycle(),
  undefined,
  "a cycle without a live root remains unavailable",
);
assert.equal(
  createCapturedPowerReader({
    rootState: { readRoot: () => root },
    mechanics: {
      ...mechanics,
      readPowerOrder: () => ({ kind: "invalid" }),
    },
    readRuntimeOptions: () => ({
      settings: {
        showGalactic: true,
        limitPowered: false,
        autoFleet: false,
        crewReserve: 0,
      },
      debug: false,
      consumptionBalanceMinimum: 0.8,
    }),
    readWarnings: () => [],
  }).readCycle(),
  undefined,
  "invalid captured order makes the cycle unavailable instead of approximating it",
);
