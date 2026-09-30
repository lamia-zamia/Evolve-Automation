import assert from "node:assert/strict";

import {
  planPowerCycle,
  EMPTY_POWER_AUTOMATION_STATE,
} from "../src/domain/economy/production/power.ts";
import { createCapturedPowerReader } from "../src/adapters/evolve/economy/production/captured-power-reader.ts";

function structure({
  entryKey,
  region,
  sector,
  struct,
  actionId,
  powered = 0,
  requirements,
  fuel,
  supportFuel,
  supportTypes,
  support = 0,
  supportFor,
  supportProvider,
  supportTopology,
  fuelAdjustmentRequested,
  supportFuelAdjustmentDisabled,
}) {
  const readNumber = (value) => ({ kind: "value", value });
  return Object.freeze({
    entryKey,
    region,
    sector,
    struct,
    actionId,
    readTitle: () => ({ kind: "value", value: actionId }),
    readPowered: () => readNumber(powered),
    readPowerRequirements: () =>
      requirements === undefined
        ? { kind: "absent" }
        : { kind: "value", value: requirements },
    readFuel: () =>
      fuel === undefined ? { kind: "absent" } : readNumber(fuel),
    readFuelAdjustmentRequested: () =>
      fuelAdjustmentRequested === undefined
        ? { kind: "absent" }
        : readNumber(fuelAdjustmentRequested),
    readSupport: () => readNumber(support),
    readSupportTypes: () =>
      supportTypes === undefined
        ? { kind: "absent" }
        : {
            kind: "value",
            value: Array.isArray(supportTypes) ? supportTypes : [supportTypes],
          },
    readSupportValue: (type) => readNumber(supportFor?.[type] ?? support),
    readSupportProvider: () =>
      supportProvider === undefined
        ? { kind: "absent" }
        : { kind: "value", value: supportProvider },
    readSupportTopology: () => ({
      kind: "value",
      value: supportTopology ?? {
        anchorEntryKey: null,
        unlimited: false,
        enabled: { kind: "value", value: true },
      },
    }),
    readSupportFuel: () =>
      supportFuel === undefined ? { kind: "absent" } : readNumber(supportFuel),
    readSupportFuelAdjustmentDisabled: () =>
      supportFuelAdjustmentDisabled === undefined
        ? { kind: "absent" }
        : readNumber(supportFuelAdjustmentDisabled),
    readPowerLimit: () => ({ kind: "absent" }),
    readPowerBalancer: () => ({ kind: "absent" }),
  });
}

const moonAnchor = structure({
  entryKey: "spc_home:moon_anchor",
  region: "space",
  sector: "spc_home",
  struct: "moon_anchor",
  actionId: "space-moon_anchor",
  supportTypes: "moon",
});
const redAnchor = structure({
  entryKey: "spc_home:red_anchor",
  region: "space",
  sector: "spc_home",
  struct: "red_anchor",
  actionId: "space-red_anchor",
  supportTypes: ["red", "moon"],
});
const inactiveProducer = structure({
  entryKey: "spc_home:gas_mining",
  region: "space",
  sector: "spc_home",
  struct: "gas_mining",
  actionId: "space-gas_mining",
  powered: "-8",
});
const shortSpace = structure({
  entryKey: "spc_home:reactor",
  region: "space",
  sector: "spc_home",
  struct: "reactor",
  actionId: "space-reactor",
  powered: 3,
});
const spaceGenerator = structure({
  entryKey: "spc_home:oil_generator",
  region: "space",
  sector: "spc_home",
  struct: "oil_generator",
  actionId: "space-oil_generator",
  powered: -12,
  fuel: [{ resourceId: "Oil", amount: 8 }],
  fuelAdjustmentRequested: true,
});
const interstellarGenerator = structure({
  entryKey: "int_alpha:helium_generator",
  region: "interstellar",
  sector: "int_alpha",
  struct: "helium_generator",
  actionId: "interstellar-helium_generator",
  powered: -6,
  fuel: [{ resourceId: "Helium_3", amount: 10 }],
  fuelAdjustmentRequested: true,
});
const moonConsumer = structure({
  entryKey: "spc_home:nav_beacon",
  region: "space",
  sector: "spc_home",
  struct: "nav_beacon",
  actionId: "space-nav_beacon",
  powered: 4,
  support: -2,
  supportTypes: "moon",
  supportFor: { moon: 6 },
  supportProvider: true,
  supportTopology: {
    anchorEntryKey: moonAnchor.entryKey,
    unlimited: false,
    enabled: { kind: "value", value: true },
  },
});
const redSupportMember = structure({
  entryKey: "spc_home:red_member",
  region: "space",
  sector: "spc_home",
  struct: "red_member",
  actionId: "space-red_member",
  supportTypes: ["red"],
  supportTopology: {
    anchorEntryKey: redAnchor.entryKey,
    unlimited: false,
    enabled: { kind: "value", value: true },
  },
});
const redSupportConsumer = structure({
  entryKey: "spc_home:vr_center",
  region: "space",
  sector: "spc_home",
  struct: "vr_center",
  actionId: "space-vr_center",
  support: -3,
  supportTypes: "red",
  supportTopology: {
    anchorEntryKey: redAnchor.entryKey,
    unlimited: false,
    enabled: { kind: "value", value: true },
  },
});
const cityConsumer = structure({
  entryKey: "city:consumer",
  region: "city",
  sector: "city",
  struct: "consumer",
  actionId: "city-consumer",
  powered: 5,
});
const cityGenerator = structure({
  entryKey: "city:coal_power",
  region: "city",
  sector: "city",
  struct: "coal_power",
  actionId: "city-coal_power",
  powered: -20,
  fuel: [{ resourceId: "Coal", amount: 2 }],
});
const lockedGenerator = structure({
  entryKey: "spc_home:locked_generator",
  region: "space",
  sector: "spc_home",
  struct: "locked_generator",
  actionId: "space-locked_generator",
  powered: -25,
  requirements: [{ techId: "advanced_power", level: 2 }],
});
const shortInterstellar = structure({
  entryKey: "int_alpha:reactor",
  region: "interstellar",
  sector: "int_alpha",
  struct: "reactor",
  actionId: "interstellar-reactor",
  powered: 2,
});
const structures = Object.freeze([
  cityGenerator,
  shortInterstellar,
  moonAnchor,
  inactiveProducer,
  redAnchor,
  spaceGenerator,
  interstellarGenerator,
  moonConsumer,
  shortSpace,
  redSupportMember,
  redSupportConsumer,
  cityConsumer,
  lockedGenerator,
]);

const root = {
  city: {
    power: 15,
    powered: true,
    consumer: { count: 1, on: 1 },
    coal_power: { count: 2, on: 1 },
  },
  space: {
    gas_mining: { count: 3, on: 0 },
    reactor: { count: 1, on: 1 },
    oil_generator: { count: 1, on: 0 },
    nav_beacon: { count: 1, on: 0 },
    red_member: { count: 0, on: 0 },
    vr_center: { count: 1, on: 0 },
    locked_generator: { count: 1, on: 1 },
    moon_anchor: { count: 0, s_max: 10, support: 3 },
    red_anchor: { count: 0, s_max: 20, support: 8 },
  },
  interstellar: {
    reactor: { count: 1, on: 1 },
    helium_generator: { count: 1, on: 1 },
  },
  tech: { advanced_power: 1, luna: 3 },
  race: { universe: "magic", fasting: false, hungry: true },
  settings: { showGalactic: true },
  resource: {
    Power: {
      name: "Power",
      max: 100,
      diff: 0,
      requestedQuantity: 0,
      display: true,
    },
    Coal: {
      name: "Coal",
      max: 50,
      diff: -2,
      requestedQuantity: 0,
      display: true,
      incomeAdusted: true,
    },
    Oil: {
      name: "Oil",
      max: 100,
      diff: -8,
      requestedQuantity: 0,
      display: true,
    },
    Helium_3: {
      name: "Helium-3",
      max: 100,
      diff: 0,
      requestedQuantity: 0,
      display: true,
    },
    Red_Support: {
      name: "Red Support",
      max: 0,
      diff: 0,
      requestedQuantity: 0,
      display: false,
    },
    Moon_Support: {
      name: "Moon Support",
      max: 0,
      diff: 0,
      requestedQuantity: 0,
      display: false,
    },
  },
  support: {
    moon: [moonConsumer.entryKey, "stale:moon", moonAnchor.entryKey],
    red: [
      redSupportMember.entryKey,
      redSupportConsumer.entryKey,
      redAnchor.entryKey,
    ],
  },
  power: [
    cityGenerator.entryKey,
    "stale:power",
    cityConsumer.entryKey,
    inactiveProducer.entryKey,
    spaceGenerator.entryKey,
    interstellarGenerator.entryKey,
    moonConsumer.entryKey,
    shortSpace.entryKey,
    shortInterstellar.entryKey,
    lockedGenerator.entryKey,
  ],
};

const stateOnSettingsOrder = [
  cityConsumer.actionId,
  cityGenerator.actionId,
  inactiveProducer.actionId,
  spaceGenerator.actionId,
  interstellarGenerator.actionId,
  moonConsumer.actionId,
  redSupportConsumer.actionId,
  shortSpace.actionId,
  shortInterstellar.actionId,
  lockedGenerator.actionId,
];
const settings = Object.fromEntries(
  stateOnSettingsOrder.flatMap((binding, index) => [
    [`bld_s_${binding}`, true],
    [`bld_p_${binding}`, index],
  ]),
);
settings["bld_s_space-red_member"] = true;
settings["bld_p_space-red_member"] = stateOnSettingsOrder.length;
settings["bld_m_city-consumer"] = 15;

const fakeControls = Object.freeze({
  capturedElementIds: () => Object.freeze([]),
  resolve: () => undefined,
  invoke: () => ({ ok: false, reason: "unknown-control" }),
});

function resourceView(rootValue, id) {
  const resource = rootValue.resource[id];
  if (resource === undefined) {
    return Object.freeze({
      present: false,
      unlocked: false,
      amount: 0,
      max: 0,
      rateOfChange: 0,
      storageRatio: 0,
    });
  }
  const amount = id === "Power" ? rootValue.city.power : 0;
  const max = Number(resource.max);
  return Object.freeze({
    present: true,
    unlocked: Boolean(resource.display),
    amount,
    max,
    rateOfChange: Number(resource.diff),
    storageRatio: max > 0 ? amount / max : 1,
  });
}

const resources = Object.freeze({
  readResources(ids) {
    return Object.freeze({
      resources: new Map([...ids].map((id) => [id, resourceView(root, id)])),
    });
  },
});

function createMechanics({
  powerOrder = (sample) => sample.power,
  supportOrder = (sample, type) => sample.support[type],
  adjustedFuelFactor = (mode) => ({
    kind: "value",
    value: mode === "space" ? 0.5 : 0.75,
  }),
  invalidateFuel = false,
} = {}) {
  const byKey = new Map(structures.map((item) => [item.entryKey, item]));
  const resolve = (keys) =>
    Object.freeze(
      keys.flatMap((key) => {
        const item = byKey.get(key);
        return item === undefined ? [] : [item];
      }),
    );
  return Object.freeze({
    readStructures: () => structures,
    readPowerOrder: (sample) =>
      Array.isArray(powerOrder(sample))
        ? { kind: "value", value: resolve(powerOrder(sample)) }
        : { kind: "invalid" },
    readSupportOrder: (sample, type) => {
      const order = supportOrder(sample, type);
      return Array.isArray(order)
        ? { kind: "value", value: resolve(order) }
        : { kind: "invalid" };
    },
    readProductionBreakdown: () => ({
      production: { Helium_3: { "Gas Mining": "4" } },
      consumption: {},
    }),
    readAdjustedFuelFactor: (mode, resourceId) =>
      invalidateFuel && mode === "space" && resourceId === "Oil"
        ? { kind: "absent" }
        : adjustedFuelFactor(mode, resourceId),
  });
}

const reader = createCapturedPowerReader({
  rootState: { readRoot: () => root },
  mechanics: createMechanics(),
  controls: fakeControls,
  resources,
  readSettingsRaw: () => settings,
  readRuntimeOptions: () => ({
    settings: {
      showGalactic: true,
      limitPowered: false,
      autoFleet: false,
      crewReserve: 0,
    },
    debug: false,
    consumptionBalanceMinimum: 60,
  }),
  readWarnings: () => Object.freeze([]),
});

const cycle = reader.readCycle();
assert.ok(
  cycle,
  "complete captured mechanics and live state produce a full cycle",
);
assert.ok(Object.isFrozen(cycle) && Object.isFrozen(cycle.buildings));
assert.deepEqual(
  cycle.buildings.map((building) => building.binding),
  stateOnSettingsOrder,
  "stored Building catalog priorities control Power input order, not root.power or Map order",
);
assert.ok(
  cycle.buildings.every((building) => building.binding !== "space-red_member"),
  "a managed-state row with no built instances is excluded",
);
assert.equal(
  cycle.buildings.find((building) => building.binding === "space-reactor")?.id,
  "reactor",
);
assert.equal(
  cycle.buildings.find(
    (building) => building.binding === "interstellar-reactor",
  )?.id,
  "reactor",
  "duplicate short structure ids remain distinct through their full bindings",
);
assert.equal(
  cycle.buildings.find(
    (building) => building.binding === "space-locked_generator",
  )?.powered,
  0,
  "an unsatisfied action power_reqs gate forces the captured output to zero",
);
assert.equal(
  cycle.buildings.find((building) => building.binding === "space-gas_mining")
    ?.stateOn,
  0,
  "a built currently-off managed producer stays in the cycle",
);
assert.equal(
  cycle.buildings.find((building) => building.binding === "space-oil_generator")
    ?.stateOn,
  0,
  "a fuel-consuming generator with no active instances stays in the cycle",
);
assert.deepEqual(
  cycle.buildings.find((building) => building.binding === "space-gas_mining")
    ?.produces,
  ["Helium_3"],
  "inactive producers retain script-owned produces metadata with no active ledger row",
);
const navBeacon = cycle.buildings.find(
  (building) => building.binding === "space-nav_beacon",
);
assert.ok(navBeacon);
assert.equal(
  navBeacon.stateOn,
  0,
  "the support provider has no active instances",
);
assert.ok(
  navBeacon.consumptions.some(
    (consumption) =>
      consumption.resourceId === "Moon_Support" &&
      consumption.rate === -6 &&
      consumption.fuelRate === -6,
  ),
  "the support_for[moon] value overrides support() for the typed support consumption",
);
const redSupportConsumerInput = cycle.buildings.find(
  (building) => building.binding === redSupportConsumer.actionId,
);
assert.ok(redSupportConsumerInput);
assert.equal(
  redSupportConsumerInput.stateOn,
  0,
  "the support consumer has no active instances",
);
assert.ok(
  redSupportConsumerInput.consumptions.some(
    (consumption) =>
      consumption.resourceId === "Red_Support" && consumption.rate === 3,
  ),
  "an inactive support consumer retains its per-type consumption semantics",
);
assert.deepEqual(
  [
    cycle.resources.find((resource) => resource.id === "Moon_Support")
      ?.currentQuantity,
    cycle.resources.find((resource) => resource.id === "Moon_Support")
      ?.maxQuantity,
    cycle.resources.find((resource) => resource.id === "Moon_Support")
      ?.rateOfChange,
  ],
  [3, 10, 7],
  "support resources read s_max, support use, and available rate from live root state",
);
assert.ok(
  cycle.buildings
    .find((building) => building.binding === "space-oil_generator")
    ?.consumptions.some(
      (consumption) =>
        consumption.resourceId === "Oil" &&
        consumption.rate === 8 &&
        consumption.fuelRate === 4,
    ),
  "the adjusted game fuel rate is separate from the raw p_fuel amount",
);
assert.ok(
  cycle.buildings
    .find((building) => building.binding === "interstellar-helium_generator")
    ?.consumptions.some(
      (consumption) =>
        consumption.resourceId === "Helium_3" &&
        consumption.rate === 10 &&
        consumption.fuelRate === 7.5,
    ),
  "the interstellar fuel adjustment mode produces its own exact rate",
);
assert.equal(
  cycle.resources.find((resource) => resource.id === "Power")?.maxQuantity,
  100,
);
assert.equal(cycle.powerCurrent, 15);
assert.equal(cycle.powerMaximum, 100);
assert.equal(
  cycle.hungryRace,
  false,
  "the retired Power adapter samples hungry-race state only when a managed building consumes Food",
);
assert.equal(
  cycle.resources.find((resource) => resource.id === "Coal")?.incomeAdjusted,
  true,
  "the captured resource carries the legacy incomeAdusted root flag",
);
assert.ok(cycle.buildings.some((building) => building.powered > 0));
assert.ok(cycle.buildings.some((building) => building.powered < 0));
assert.doesNotThrow(() => planPowerCycle(cycle, EMPTY_POWER_AUTOMATION_STATE));

const disabledSettings = { ...settings, "bld_s_space-reactor": false };
const disabledReader = createCapturedPowerReader({
  rootState: { readRoot: () => root },
  mechanics: createMechanics(),
  controls: fakeControls,
  resources,
  readSettingsRaw: () => disabledSettings,
  readRuntimeOptions: () => ({
    settings: {
      showGalactic: true,
      limitPowered: false,
      autoFleet: false,
      crewReserve: 0,
    },
    debug: false,
    consumptionBalanceMinimum: 60,
  }),
  readWarnings: () => [],
});
assert.equal(
  disabledReader
    .readCycle()
    ?.buildings.some((building) => building.binding === "space-reactor"),
  false,
  "auto-Power-disabled buildings are omitted",
);

const unavailableReader = createCapturedPowerReader({
  rootState: { readRoot: () => root },
  mechanics: createMechanics({ invalidateFuel: true }),
  controls: fakeControls,
  resources,
  readSettingsRaw: () => settings,
  readRuntimeOptions: () => ({
    settings: {
      showGalactic: true,
      limitPowered: false,
      autoFleet: false,
      crewReserve: 0,
    },
    debug: false,
    consumptionBalanceMinimum: 60,
  }),
  readWarnings: () => [],
});
assert.equal(
  unavailableReader.readCycle(),
  undefined,
  "an absent adjusted-fuel observation makes the entire cycle unavailable instead of using raw fuel",
);

const badOrderReader = createCapturedPowerReader({
  rootState: { readRoot: () => root },
  mechanics: createMechanics({ powerOrder: () => undefined }),
  controls: fakeControls,
  resources,
  readSettingsRaw: () => settings,
  readRuntimeOptions: () => ({
    settings: {
      showGalactic: true,
      limitPowered: false,
      autoFleet: false,
      crewReserve: 0,
    },
    debug: false,
    consumptionBalanceMinimum: 60,
  }),
  readWarnings: () => [],
});
assert.equal(
  badOrderReader.readCycle(),
  undefined,
  "invalid live mechanics ordering makes the cycle unavailable",
);

const missingAnchorRoot = { ...root, space: { ...root.space } };
delete missingAnchorRoot.space.moon_anchor;
const missingSupportReader = createCapturedPowerReader({
  rootState: { readRoot: () => missingAnchorRoot },
  mechanics: createMechanics(),
  controls: fakeControls,
  resources,
  readSettingsRaw: () => settings,
  readRuntimeOptions: () => ({
    settings: {
      showGalactic: true,
      limitPowered: false,
      autoFleet: false,
      crewReserve: 0,
    },
    debug: false,
    consumptionBalanceMinimum: 60,
  }),
  readWarnings: () => [],
});
assert.equal(
  missingSupportReader.readCycle(),
  undefined,
  "a missing live support anchor cannot fall back to the generic resource sample",
);

process.stdout.write(
  "captured Power reader builds and plans a full mechanics-backed cycle\n",
);
