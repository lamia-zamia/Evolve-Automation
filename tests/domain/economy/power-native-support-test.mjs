import assert from "node:assert/strict";
import {
  EMPTY_POWER_AUTOMATION_STATE,
  planPowerCycle,
} from "../../../src/domain/economy/production/power.ts";

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
    beltConsumers: [],
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

function beltPlan({
  providerUnit = 5,
  consumerUnit = 4,
  stationCount = 2,
  stationOn = 1,
  stationMaximum = 10,
  stationFuel = false,
  stationPowered = stationOn,
  powerCurrent = 100,
  iridiumOn = 1,
  commandIridium = true,
  eleriumUseful = true,
  eleriumSmart = true,
  eleriumMaximum = 2,
  eleriumUnavailable = false,
  ironCount = 0,
  ironOn = 0,
  ironSupportPerUnit = 2,
  commandIron = true,
  ironManaged = undefined,
  manageElerium = true,
  frozen = false,
  autoJobs = false,
  spaceMinerWorkersMaximum,
  actualSpaceMiners = 9,
} = {}) {
  const station = {
    ...building("space-space_station", [
      { type: "belt", amount: -providerUnit },
    ]),
    index: 0,
    count: stationCount,
    stateOn: stationOn,
    powered: stationPowered,
    autoMaximum: stationMaximum,
    autoStateManaged: true,
    consumptions: stationFuel
      ? [
          {
            resourceId: "Helium_3",
            currentTotal: 0,
            unwindCredit: 0,
            enableRate: 10,
          },
        ]
      : [],
    smartCategory: true,
    smartEnabled: true,
    rule: {
      kind: "belt-space-station",
      stationStorage: 10,
      eleriumMaximum: 100,
      eleriumMaximumCost: 10,
      beltSupportPerStation: 3,
      effectiveStations: stationOn,
    },
  };
  const iridium = {
    ...building("space-iridium_ship", [{ type: "belt", amount: providerUnit }]),
    index: 1,
    count: 1,
    stateOn: iridiumOn,
  };
  const elerium = {
    ...building("space-elerium_ship", [{ type: "belt", amount: consumerUnit }]),
    index: 2,
    count: 2,
    stateOn: 0,
    autoMaximum: eleriumMaximum,
    smartCategory: true,
    smartEnabled: eleriumSmart,
    rule: eleriumUnavailable
      ? { kind: "unavailable-production" }
      : {
          kind: "busy-resource",
          active: true,
          savingOnly: false,
          observation: {
            resourceId: "Elerium",
            useful: eleriumUseful,
            production: 0,
            income: 0,
          },
        },
  };
  const iron = {
    ...building("space-iron_ship", [
      { type: "belt", amount: ironSupportPerUnit },
    ]),
    index: 3,
    count: ironCount,
    stateOn: ironOn,
  };
  const maximum = stationPowered * providerUnit;
  const buildings = frozen
    ? []
    : [
        station,
        ...(commandIridium ? [iridium] : []),
        ...(manageElerium ? [elerium] : []),
        ...(ironCount && commandIron ? [iron] : []),
      ];
  const managedBindings = new Set(buildings.map(({ binding }) => binding));
  const beltConsumers = [iridium, elerium, iron].map((consumer) => ({
    binding: consumer.binding,
    configured: consumer.stateOn,
    supportPerUnit:
      consumer.supportChanges.find(
        ({ type, amount }) => type === "belt" && amount > 0,
      )?.amount ?? 0,
    managed:
      consumer.binding === "space-iron_ship" && ironManaged !== undefined
        ? ironManaged
        : managedBindings.has(consumer.binding),
  }));
  const cycle = {
    powerUnlocked: true,
    powerResourceId: "Power",
    powerCurrent,
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
      limitPowered: true,
      autoFleet: false,
      autoPower: true,
      autoJobs,
      crewReserve: 0,
    },
    resources: [
      powerResource,
      { ...powerResource, id: "Elerium" },
      {
        ...powerResource,
        id: "Helium_3",
        currentQuantity: 0,
        storageRatio: 0,
        rateOfChange: 0,
      },
    ],
    supports: [
      {
        type: "belt",
        title: "Belt",
        current: stationPowered > 0 ? providerUnit : 0,
        maximum,
        available: maximum - (stationPowered > 0 ? providerUnit : 0),
        unlocked: true,
        allocation: "strict",
      },
    ],
    beltConsumers,
    prospectiveSpaceMiners: autoJobs
      ? spaceMinerWorkersMaximum
      : actualSpaceMiners,
    buildings,
    lake: { enabled: false },
    spire: { available: false },
  };
  const operations = planPowerCycle(
    cycle,
    EMPTY_POWER_AUTOMATION_STATE,
  ).decision?.operations.filter(
    (operation) => operation.kind === "adjust-building",
  );
  return operations?.map(({ binding, amount }) => [binding, amount]) ?? [];
}

assert.deepEqual(beltPlan(), [
  ["space-space_station", 1],
  ["space-iridium_ship", 0],
  ["space-elerium_ship", 1],
]);
assert.deepEqual(
  beltPlan({ stationCount: 5, stationOn: 0, powerCurrent: 101 }),
  [
    ["space-space_station", 3],
    ["space-iridium_ship", 0],
    ["space-elerium_ship", 1],
  ],
  "the configured Belt floor recovers a configured-off Station while Power has headroom",
);
const alteredBeltPlan = beltPlan({
  providerUnit: 7,
  consumerUnit: 6,
  actualSpaceMiners: 13,
});
assert.deepEqual(alteredBeltPlan, beltPlan());
const alteredStationDelta = alteredBeltPlan.find(
  ([id]) => id === "space-space_station",
)?.[1];
const alteredShipDelta = alteredBeltPlan.find(
  ([id]) => id === "space-elerium_ship",
)?.[1];
assert.ok(
  7 + alteredStationDelta * 7 >= 7 + alteredShipDelta * 6,
  "the planned native Belt maximum covers the selected ship",
);
assert.deepEqual(beltPlan({ ironCount: 1 }), [
  ["space-space_station", 1],
  ["space-iridium_ship", 0],
  ["space-elerium_ship", 1],
  ["space-iron_ship", 0],
]);
assert.deepEqual(beltPlan({ ironCount: 1, eleriumMaximum: 0 }), [
  ["space-space_station", 1],
  ["space-iridium_ship", 0],
  ["space-elerium_ship", 0],
  ["space-iron_ship", 1],
]);
assert.deepEqual(
  beltPlan({
    providerUnit: 3,
    consumerUnit: 2,
    stationCount: 1,
    stationOn: 1,
    stationMaximum: 1,
    iridiumOn: 0,
    commandIridium: false,
    ironCount: 3,
    ironOn: 3,
    ironSupportPerUnit: 1,
    commandIron: false,
    ironManaged: true,
    actualSpaceMiners: 3,
  }).filter(([binding]) => binding === "space-elerium_ship"),
  [["space-elerium_ship", 0]],
  "a Belt consumer marked managed but absent from the commandable cycle keeps its configured demand fixed",
);
assert.equal(
  beltPlan({ stationCount: 1 }).find(
    ([id]) => id === "space-elerium_ship",
  )?.[1],
  0,
);
assert.equal(
  beltPlan({ stationMaximum: 1 }).find(
    ([id]) => id === "space-elerium_ship",
  )?.[1],
  1,
  "the Station s_max setting does not replace native built-count authority",
);
for (const blocked of [
  { stationFuel: true },
  { powerCurrent: 0, stationPowered: 10 },
]) {
  assert.equal(
    beltPlan(blocked).find(([id]) => id === "space-elerium_ship")?.[1],
    0,
    `a station that cannot legally increase supplies no bootstrap support: ${JSON.stringify(blocked)}`,
  );
}
assert.equal(
  beltPlan({ eleriumUseful: false }).find(
    ([id]) => id === "space-space_station",
  )?.[1],
  0,
);
assert.equal(
  beltPlan({ eleriumUnavailable: true }).find(
    ([id]) => id === "space-elerium_ship",
  )?.[1],
  0,
);
assert.equal(
  beltPlan({ eleriumSmart: false }).find(
    ([id]) => id === "space-elerium_ship",
  )?.[1],
  1,
);
assert.equal(
  beltPlan({ eleriumMaximum: 0 }).find(
    ([id]) => id === "space-space_station",
  )?.[1],
  0,
);
assert.deepEqual(beltPlan({ frozen: true }), []);
assert.equal(
  beltPlan({ autoJobs: true, spaceMinerWorkersMaximum: 9 }).find(
    ([id]) => id === "space-elerium_ship",
  )?.[1],
  1,
  "Jobs' prospective headroom allows a Belt ship before its miners are assigned",
);
assert.equal(
  beltPlan({
    stationCount: 1,
    autoJobs: true,
    spaceMinerWorkersMaximum: 9,
  }).find(([id]) => id === "space-elerium_ship")?.[1],
  0,
  "one active Station cannot supply configured consumers beyond its own native capacity",
);
assert.equal(
  beltPlan({ autoJobs: false, actualSpaceMiners: 1 }).find(
    ([id]) => id === "space-elerium_ship",
  )?.[1],
  0,
  "disabled Jobs uses only currently assigned miners",
);
assert.equal(
  beltPlan({ stationCount: 1, autoJobs: true }).find(
    ([id]) => id === "space-elerium_ship",
  )?.[1],
  0,
  "missing Jobs headroom freezes the prospective ship increase",
);
assert.equal(
  beltPlan({ manageElerium: false }).find(
    ([id]) => id === "space-space_station",
  )?.[1],
  0,
);
assert.equal(
  beltPlan({ stationOn: 2 }).find(([id]) => id === "space-space_station")?.[1],
  0,
);
