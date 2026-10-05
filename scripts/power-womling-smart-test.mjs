import assert from "node:assert/strict";
import {
  EMPTY_POWER_AUTOMATION_STATE,
  planPowerCycle,
} from "../src/domain/economy/production/power.ts";

const building = (rule) => ({
  index: 0,
  id: rule.kind,
  binding: rule.kind,
  count: 50,
  stateOn: 0,
  powered: 0,
  autoMaximum: 50,
  tab: "tauceti",
  smartCategory: true,
  smartEnabled: true,
  crewShip: false,
  crewValueRank: 1,
  singleState: false,
  ignorePositivePowerCap: false,
  skipGroup: "none",
  extraDescription: "",
  consumptions: [],
  supportChanges: [],
  produces: [],
  fleetMaximum: null,
  rule,
});

const cycle = {
  powerUnlocked: true,
  powerResourceId: "Power",
  powerCurrent: 100,
  powerMaximum: 100,
  replicatorAvailable: false,
  fasting: false,
  hungryRace: false,
  banquetStateOn: 0,
  debug: false,
  consumptionBalanceMinimum: 1,
  civilianPopulation: 200,
  currentCrew: 0,
  settings: {
    showGalactic: true,
    limitPowered: false,
    autoFleet: false,
    crewReserve: 0,
  },
  resources: [
    {
      id: "Power",
      title: "Power",
      currentQuantity: 100,
      maxQuantity: 100,
      rateOfChange: 0,
      storageRatio: 1,
      unlocked: true,
      useful: true,
      income: 0,
    },
  ],
  supports: [],
  buildings: [],
  lake: { enabled: false },
  spire: { available: false },
};

const cap = (rule) => {
  const operations = planPowerCycle(
    { ...cycle, buildings: [building(rule)] },
    EMPTY_POWER_AUTOMATION_STATE,
  ).decision.operations;
  return operations.find((operation) => operation.kind === "adjust-building")
    ?.amount;
};

assert.equal(
  cap({ kind: "womling-farm", supportMaximum: 100, cropPerFarm: 20 }),
  5,
);
assert.equal(cap({ kind: "womling-overseer", requiredBuildings: 3 }), 3);
assert.equal(cap({ kind: "womling-fun", requiredBuildings: 4 }), 4);
assert.equal(
  cap({ kind: "tau-mining-pit", populationMaximum: 200, workersPerPit: 8 }),
  25,
);
assert.equal(
  cap({ kind: "tau-mining-pit", populationMaximum: 200, workersPerPit: 6 }),
  34,
);
assert.equal(
  cap({ kind: "tau-mining-pit", populationMaximum: 200, workersPerPit: 13 }),
  16,
);
