import assert from "node:assert/strict";
import {
  planPowerCycle,
  EMPTY_POWER_AUTOMATION_STATE,
} from "../../../src/domain/economy/production/power.ts";

const resource = (id, rate, quantity = 1000000) => ({
  id,
  title: id,
  currentQuantity: quantity,
  maxQuantity: quantity,
  rateOfChange: rate,
  storageRatio: 1,
  unlocked: true,
  useful: true,
  income: rate,
});
const building = (binding, on, count, consumptions) => ({
  index: 0,
  id: binding.split("-")[1],
  binding,
  count,
  stateOn: on,
  powered: 0,
  autoMaximum: count,
  tab: "galaxy",
  smartCategory: false,
  smartEnabled: false,
  crewShip: false,
  crewValueRank: 1,
  singleState: false,
  ignorePositivePowerCap: false,
  skipGroup: "none",
  extraDescription: "",
  consumptions,
  supportChanges: [],
  produces: [],
  fleetMaximum: null,
  rule: { kind: "ordinary" },
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
  civilianPopulation: 100,
  currentCrew: 0,
  settings: {
    showGalactic: true,
    limitPowered: false,
    autoFleet: false,
    crewReserve: 0,
  },
  resources: [
    resource("Power", 100),
    resource("Money", -100000),
    resource("Bolognium", -5),
    resource("Stanene", -200),
    resource("Food", 20),
  ],
  supports: [],
  beltConsumers: [],
  buildings: [
    building("galaxy-vitreloy_plant", 5, 6, [
      {
        resourceId: "Money",
        currentTotal: 100000,
        unwindCredit: 100000,
        enableRate: null,
      },
      {
        resourceId: "Bolognium",
        currentTotal: 5,
        unwindCredit: 5,
        enableRate: null,
      },
      {
        resourceId: "Stanene",
        currentTotal: 200,
        unwindCredit: 200,
        enableRate: null,
      },
    ]),
    {
      ...building("galaxy-embassy", 4, 5, [
        {
          resourceId: "Food",
          currentTotal: 0,
          unwindCredit: 0,
          enableRate: null,
        },
      ]),
      index: 1,
    },
    {
      ...building("galaxy-unrelated", 0, 1, [
        { resourceId: "Food", currentTotal: 0, unwindCredit: 0, enableRate: 2 },
      ]),
      index: 2,
    },
  ],
  lake: { enabled: false },
  spire: { available: false },
};
const operations = planPowerCycle(cycle, EMPTY_POWER_AUTOMATION_STATE).decision
  ?.operations;
assert.ok(operations);
assert.deepEqual(
  operations
    .filter(
      (op) => op.kind === "set-resource-rate" && op.resourceId === "Money",
    )
    .map((op) => op.value),
  [0, -100000],
  "five configured Vitreloy plants unwind only the two copies observed by the ledger",
);
assert.equal(
  operations.find(
    (op) =>
      op.kind === "adjust-building" && op.binding === "galaxy-vitreloy_plant",
  )?.amount,
  0,
  "unknown marginal requirement preserves active plants but blocks expansion",
);
assert.equal(
  operations.find(
    (op) => op.kind === "adjust-building" && op.binding === "galaxy-embassy",
  )?.amount,
  0,
  "an Embassy behind a disabled gate is not credited with fictitious Food production",
);
assert.equal(
  operations.find(
    (op) => op.kind === "adjust-building" && op.binding === "galaxy-unrelated",
  )?.amount,
  1,
  "one unavailable requirement does not freeze unrelated buildings",
);
const starvedOil = {
  ...cycle,
  resources: [resource("Power", 100), resource("Oil", -3)],
  buildings: [
    building("space-oil_consumer", 0, 1, [
      { resourceId: "Oil", currentTotal: 0, unwindCredit: 0, enableRate: 1 },
    ]),
    building("city-oil_power", 10, 10, [
      { resourceId: "Oil", currentTotal: 10, unwindCredit: 0, enableRate: 1 },
    ]),
  ],
};
const oilOperations = planPowerCycle(starvedOil, EMPTY_POWER_AUTOMATION_STATE)
  .decision?.operations;
assert.ok(oilOperations);
assert.equal(
  oilOperations.find(
    (op) =>
      op.kind === "adjust-building" && op.binding === "space-oil_consumer",
  )?.amount,
  0,
  "the generator's pre-clamp observation cannot fund an earlier consumer",
);
assert.ok(
  oilOperations
    .filter((op) => op.kind === "set-resource-rate" && op.resourceId === "Oil")
    .every((op) => op.value <= -3),
  "Oil bookkeeping never creates the phantom positive budget",
);
const supportOil = {
  ...starvedOil,
  buildings: [
    starvedOil.buildings[0],
    building("space-support", 10, 10, [
      { resourceId: "Oil", currentTotal: 10, unwindCredit: 0, enableRate: 1 },
    ]),
  ],
};
const supportOperations = planPowerCycle(
  supportOil,
  EMPTY_POWER_AUTOMATION_STATE,
).decision?.operations;
assert.ok(supportOperations);
assert.equal(
  supportOperations.find(
    (op) =>
      op.kind === "adjust-building" && op.binding === "space-oil_consumer",
  )?.amount,
  0,
  "pre-clamp support fuel cannot finance another consumer",
);
assert.ok(
  supportOperations
    .filter((op) => op.kind === "set-resource-rate" && op.resourceId === "Oil")
    .every((op) => op.value <= -3),
);
const unchanged = {
  ...starvedOil,
  resources: [resource("Power", 100), resource("Oil", 5)],
  buildings: [
    building("space-safe", 1, 1, [
      { resourceId: "Oil", currentTotal: 2, unwindCredit: 2, enableRate: 2 },
    ]),
    building("space-observed", 1, 1, [
      { resourceId: "Oil", currentTotal: 10, unwindCredit: 0, enableRate: 1 },
    ]),
  ],
};
const unchangedOperations = planPowerCycle(
  unchanged,
  EMPTY_POWER_AUTOMATION_STATE,
).decision?.operations;
assert.ok(unchangedOperations);
assert.ok(
  unchangedOperations
    .filter((op) => op.kind === "adjust-building")
    .every((op) => op.amount === 0),
);
assert.equal(
  unchangedOperations
    .filter((op) => op.kind === "set-resource-rate" && op.resourceId === "Oil")
    .at(-1)?.value,
  5,
  "a no-change plan reconstructs the native rate across safe and observation-only rows",
);
const reactorPlan = (effective, netRate) => {
  const input = {
    ...cycle,
    resources: [resource("Power", 100), resource("Elerium", netRate, 0)],
    buildings: [
      building("space-e_reactor", 10, 10, [
        {
          resourceId: "Elerium",
          currentTotal: 10,
          unwindCredit: 0,
          enableRate: 1,
          appliedGeneratorFuel: effective,
        },
      ]),
    ],
  };
  return planPowerCycle(
    input,
    EMPTY_POWER_AUTOMATION_STATE,
  ).decision?.operations.find(
    (op) => op.kind === "adjust-building" && op.binding === "space-e_reactor",
  )?.amount;
};
assert.equal(
  reactorPlan(0, 0),
  -10,
  "native zero fuel reduces every configured reactor",
);
assert.equal(
  reactorPlan(3, -1),
  -8,
  "partial native fuel supports only two reactors",
);
assert.equal(reactorPlan(10, 0), 0, "sustainable reactors remain configured");
assert.equal(
  reactorPlan(null, -10),
  0,
  "missing native effective count freezes the reactor",
);
const banquetCapacity = planPowerCycle(
  {
    ...cycle,
    banquetStateOn: 1,
    resources: [
      resource("Power", 100),
      { ...resource("Food", -100, 0), storageRatio: 0 },
      resource("Oil", 100),
    ],
    buildings: [
      building("space-banquet-consumer", 0, 1, [
        {
          resourceId: "Food",
          currentTotal: 10,
          unwindCredit: 0,
          enableRate: 1,
        },
        {
          resourceId: "Oil",
          currentTotal: 0,
          unwindCredit: 0,
          enableRate: 1,
        },
      ]),
    ],
  },
  EMPTY_POWER_AUTOMATION_STATE,
).decision?.operations.find(
  (operation) =>
    operation.kind === "adjust-building" &&
    operation.binding === "space-banquet-consumer",
);
assert.equal(
  banquetCapacity?.kind === "adjust-building" ? banquetCapacity.amount : 0,
  1,
  "an active Banquet supplies Food while later resource requirements still constrain Power expansion",
);
console.log(
  "Power planner unwinds native totals and isolates unavailable marginal requirements",
);
