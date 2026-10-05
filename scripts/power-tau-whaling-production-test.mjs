import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EMPTY_POWER_AUTOMATION_STATE,
  planPowerCycle,
  planPowerWarningShutdown,
} from "../src/domain/economy/production/power.ts";
import { readCapturedTauWhalingProduction } from "../src/adapters/evolve/economy/production/captured-power-reader.ts";

const structures = [
  { entryKey: "tau_gas:whaling_station", actionId: "tauceti-whaling_station" },
  { entryKey: "tau_roid:whaling_ship", actionId: "tauceti-whaling_ship" },
];
const rounded = (receiver, digits) => ({
  receiver,
  digits,
  text: Number(receiver).toFixed(digits),
});
let stationObservations = [rounded(12, 2), rounded(20, 2), rounded(6, 2)];
let shipObservations = [rounded(14, 1), rounded(8, 2)];
let current = true;
const mechanics = {
  readEffectRoundedValues(entryKey, isCurrent) {
    if (!isCurrent()) return { kind: "invalid" };
    return {
      kind: "value",
      value:
        entryKey === structures[0].entryKey
          ? stationObservations
          : shipObservations,
    };
  },
};
const native = () =>
  readCapturedTauWhalingProduction(mechanics, structures, () => current);

assert.deepEqual(native(), {
  nativeStationProduction: 12,
  nativeShipProduction: 8,
});

const building = (binding, rule, stateOn = 0) => ({
  index: binding === "tauceti-whaling_station" ? 0 : 1,
  id: binding,
  binding,
  count: 50,
  stateOn,
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
  civilianPopulation: 100,
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
const adjustments = (stationRule, stateOn = 0) =>
  planPowerCycle(
    {
      ...cycle,
      buildings: [
        building("tauceti-whaling_station", stationRule, stateOn),
        building("other-building", { kind: "ordinary" }),
      ],
    },
    EMPTY_POWER_AUTOMATION_STATE,
  ).decision.operations.filter(
    (operation) => operation.kind === "adjust-building",
  );
const stationCap = (shipsOn) => ({
  kind: "tau-whaling-station",
  whalingShipsOn: shipsOn,
  ...native(),
});

assert.deepEqual(
  adjustments(stationCap(3)).map(({ binding, amount }) => [binding, amount]),
  [
    ["tauceti-whaling_station", 2],
    ["other-building", 50],
  ],
);
stationObservations = [rounded(5, 2), rounded(20, 2), rounded(6, 2)];
assert.equal(adjustments(stationCap(3))[0].amount, 5);
shipObservations = [rounded(14, 1), rounded(3.5, 2)];
assert.equal(adjustments(stationCap(3))[0].amount, 3);
shipObservations = [rounded(14, 1), rounded(1.125, 2)];
assert.equal(adjustments(stationCap(3))[0].amount, 1);
shipObservations = [rounded(14, 1), rounded(0, 2)];
assert.deepEqual(native(), {
  nativeStationProduction: 5,
  nativeShipProduction: 0,
});
assert.equal(adjustments(stationCap(3), 2)[0].amount, -2);

for (const badStation of [
  [],
  [rounded(20, 2), rounded(6, 2)],
  [rounded(12, 2), rounded(20, 2), rounded(6, 2), rounded(99, 2)],
  [rounded(20, 2), rounded(12, 1), rounded(6, 2)],
  [rounded(0, 2), rounded(20, 2), rounded(6, 2)],
  [
    { receiver: Number.NaN, digits: 2, text: "NaN" },
    rounded(20, 2),
    rounded(6, 2),
  ],
]) {
  stationObservations = badStation;
  assert.equal(native(), undefined);
}
stationObservations = [rounded(12, 2), rounded(20, 2), rounded(6, 2)];
for (const badShip of [
  [],
  [rounded(8, 2)],
  [rounded(14, 1), rounded(8, 2), rounded(8, 2)],
  [rounded(8, 2), rounded(14, 1)],
  [rounded(14, 1), { receiver: Infinity, digits: 2, text: "Infinity" }],
  [rounded(14, 1), rounded(-1, 2)],
]) {
  shipObservations = badShip;
  assert.equal(native(), undefined);
}
shipObservations = [rounded(14, 1), rounded(8, 2)];
current = false;
assert.equal(native(), undefined);
current = true;
assert.equal(
  readCapturedTauWhalingProduction(
    { readEffectRoundedValues: () => ({ kind: "invalid" }) },
    structures,
    () => true,
  ),
  undefined,
);
assert.equal(
  readCapturedTauWhalingProduction(mechanics, structures.slice(1), () => true),
  undefined,
);
assert.deepEqual(
  adjustments({ kind: "unavailable-production" }, 2).map(
    ({ binding, amount }) => [binding, amount],
  ),
  [
    ["tauceti-whaling_station", 0],
    ["other-building", 50],
  ],
);
assert.deepEqual(
  adjustments(
    {
      kind: "tau-whaling-station",
      whalingShipsOn: 3,
      nativeShipProduction: 8,
      nativeStationProduction: 0,
    },
    2,
  ).map(({ binding, amount }) => [binding, amount]),
  [
    ["tauceti-whaling_station", 0],
    ["other-building", 50],
  ],
);
assert.equal(
  planPowerWarningShutdown([
    {
      domId: "tauceti-whaling_ship",
      buildingId: "whaling_ship",
      binding: "tauceti-whaling_ship",
      stateOn: 2,
      autoStateEnabled: true,
      ship: true,
      warningKind: "tau-whaling",
      beltSupportNeeded: 0,
      beltSupportMaximum: 0,
      lakeSupportNeeded: 0,
      lakeSupportMaximum: 0,
    },
  ]),
  null,
  "the Tau whaling warning remains exempt from generic forced shutdown",
);

const powerSource = readFileSync(
  new URL("../src/domain/economy/production/power.ts", import.meta.url),
  "utf8",
);
const tauRule = powerSource
  .split('case "tau-whaling-station":')[1]
  .split('case "tau-mining-pit":')[0];
assert.doesNotMatch(tauRule, /\b(?:8|12|1\.4|supportMaximum|supportCurrent)\b/);
