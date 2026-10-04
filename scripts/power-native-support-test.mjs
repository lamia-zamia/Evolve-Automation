import assert from "node:assert/strict";
import {
  EMPTY_POWER_AUTOMATION_STATE,
  planPowerCycle,
} from "../src/domain/economy/production/power.ts";

const powerResource = {
  id: "Power",
  title: "Power",
  currentQuantity: 100,
  maxQuantity: 100,
  rateOfChange: 0,
  storageRatio: 1,
  unlocked: true,
  useful: true,
  income: 0,
};

function building(binding, supportChanges) {
  return {
    index: 0,
    id: binding,
    binding,
    count: 10,
    stateOn: 0,
    powered: 1,
    autoMaximum: 10,
    tab: "space",
    smartCategory: false,
    smartEnabled: false,
    crewShip: false,
    crewValueRank: 1,
    singleState: false,
    ignorePositivePowerCap: false,
    skipGroup: "none",
    extraDescription: "",
    consumptions: [],
    supportChanges,
    produces: [],
    fleetMaximum: null,
    rule: { kind: "ordinary" },
  };
}

function support(type, available, allocation = "strict") {
  return {
    type,
    title: type,
    current: 0,
    maximum: available,
    available,
    unlocked: true,
    allocation,
  };
}

function adjustment(supports, buildings) {
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
    civilianPopulation: 100,
    currentCrew: 0,
    settings: {
      showGalactic: true,
      limitPowered: false,
      autoFleet: false,
      crewReserve: 0,
    },
    resources: [powerResource],
    supports,
    buildings,
    lake: { enabled: false },
    spire: { available: false },
  };
  return planPowerCycle(cycle, EMPTY_POWER_AUTOMATION_STATE)
    .decision.operations.filter(
      (operation) => operation.kind === "adjust-building",
    )
    .map(({ binding, amount }) => [binding, amount]);
}

assert.deepEqual(
  adjustment(
    [support("new_grid", 6)],
    [building("new_consumer", [{ type: "new_grid", amount: 2 }])],
  ),
  [["new_consumer", 3]],
);

assert.deepEqual(
  adjustment(
    [support("new_grid", 6)],
    [
      {
        ...building("new_provider", [{ type: "new_grid", amount: -4 }]),
        powered: 0,
        count: 1,
      },
      building("new_consumer", [{ type: "new_grid", amount: 2 }]),
    ],
  ),
  [
    ["new_provider", 1],
    ["new_consumer", 5],
  ],
);

assert.deepEqual(
  adjustment(
    [support("new_grid", 6), support("second_grid", 3)],
    [
      building("multi_support", [
        { type: "new_grid", amount: 2 },
        { type: "second_grid", amount: 2 },
      ]),
    ],
  ),
  [["multi_support", 1]],
);

assert.deepEqual(
  adjustment(
    [support("new_grid", 3, "round-up")],
    [building("rounded", [{ type: "new_grid", amount: 2 }])],
  ),
  [["rounded", 2]],
);
