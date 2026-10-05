import assert from "node:assert/strict";
import {
  planPowerCycle,
  EMPTY_POWER_AUTOMATION_STATE,
} from "../src/domain/economy/production/power.ts";

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
  buildings: [
    building("galaxy-vitreloy_plant", 5, 6, [
      { resourceId: "Money", currentTotal: 100000, enableRate: null },
      { resourceId: "Bolognium", currentTotal: 5, enableRate: null },
      { resourceId: "Stanene", currentTotal: 200, enableRate: null },
    ]),
    {
      ...building("galaxy-embassy", 4, 5, [
        { resourceId: "Food", currentTotal: 0, enableRate: null },
      ]),
      index: 1,
    },
    {
      ...building("galaxy-unrelated", 0, 1, [
        { resourceId: "Food", currentTotal: 0, enableRate: 2 },
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
console.log(
  "Power planner unwinds native totals and isolates unavailable marginal requirements",
);
