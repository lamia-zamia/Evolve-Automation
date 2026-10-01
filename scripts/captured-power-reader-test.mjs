import assert from "node:assert/strict";

import {
  planPowerCycle,
  EMPTY_POWER_AUTOMATION_STATE,
} from "../src/domain/economy/production/power.ts";
import {
  createCapturedPowerReader,
  readCapturedPowerMetadataFuelMode,
  readCapturedPowerOrdinaryResourceState,
  readCapturedPowerSupportResourceState,
} from "../src/adapters/evolve/economy/production/captured-power-reader.ts";
import {
  readCapturedHighPopulationGrowthMultiplier,
  readCapturedJobStackMultiplier,
  readCapturedLegacyJobCount,
} from "../src/adapters/evolve/civic/captured-job-catalog.ts";
import { readCapturedMechState } from "../src/domain/combat/mech-state.ts";
import { readCapturedMechQueueKeyHeld } from "../src/adapters/evolve/combat/captured-mech.ts";
import { EMPTY_DEMAND_SAMPLE } from "../src/adapters/evolve/economy/resources/captured-resource-demand.ts";
import { readCapturedBuildingState } from "../src/adapters/evolve/progression/build/captured-building-state.ts";

const capturedPowerFixtureControlIds = new Set();

function structure({
  entryKey,
  region,
  sector,
  struct,
  actionId,
  powered = 0,
  ownsPowered = true,
  switchable,
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
  title = actionId,
  description = actionId,
  value,
  shipRating,
}) {
  // Arbitrary fixture actions belong to the automation catalog through captured controls.
  // This one deliberately represents an upstream-only registry action.
  if (actionId !== "city-registry_only") {
    capturedPowerFixtureControlIds.add(actionId);
  }
  const readNumber = (value) => ({ kind: "value", value });
  return Object.freeze({
    entryKey,
    region,
    sector,
    struct,
    actionId,
    readAvailability: () => ({ kind: "value", value: true }),
    readTitle: () => ({ kind: "value", value: title }),
    readDescription: () => ({ kind: "value", value: description }),
    readValue: () =>
      value === undefined ? { kind: "absent" } : readNumber(value),
    readShipRating: () =>
      shipRating === undefined ? { kind: "absent" } : readNumber(shipRating),
    ownsPowered,
    readPowered: () => readNumber(powered),
    readSwitchable: () =>
      switchable === undefined
        ? { kind: "absent" }
        : { kind: "value", value: switchable },
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
  actionId: "space-gps",
  supportTypes: "moon",
});
const redAnchor = structure({
  entryKey: "spc_home:red_anchor",
  region: "space",
  sector: "spc_home",
  struct: "red_anchor",
  actionId: "space-red_university",
  supportTypes: ["red", "moon"],
});
const inactiveProducer = structure({
  entryKey: "spc_home:gas_mining",
  region: "space",
  sector: "spc_home",
  struct: "gas_mining",
  actionId: "space-gas_mining",
  powered: "-8",
  title: "Explotación de gas",
});
const shortSpace = structure({
  entryKey: "spc_home:reactor",
  region: "space",
  sector: "spc_home",
  struct: "reactor",
  actionId: "space-storehouse",
  powered: 3,
});
const spaceGenerator = structure({
  entryKey: "spc_home:oil_generator",
  region: "space",
  sector: "spc_home",
  struct: "oil_generator",
  actionId: "space-propellant_depot",
  powered: -12,
  fuel: [{ resourceId: "Oil", amount: 8 }],
  fuelAdjustmentRequested: true,
});
const interstellarGenerator = structure({
  entryKey: "int_alpha:helium_generator",
  region: "interstellar",
  sector: "int_alpha",
  struct: "helium_generator",
  actionId: "interstellar-cargo_yard",
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
  actionId: "space-garage",
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
  actionId: "city-bank",
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
  actionId: "space-gas_storage",
  powered: -25,
  requirements: [{ techId: "advanced_power", level: 2 }],
});
const shortInterstellar = structure({
  entryKey: "int_alpha:reactor",
  region: "interstellar",
  sector: "int_alpha",
  struct: "reactor",
  actionId: "interstellar-warehouse",
  powered: 2,
});
const metadataSpaceFuel = structure({
  entryKey: "spc_home:red_factory",
  region: "space",
  sector: "spc_home",
  struct: "red_factory",
  actionId: "space-red_factory",
});
const metadataInterstellarDeuterium = structure({
  entryKey: "int_alpha:int_factory",
  region: "interstellar",
  sector: "int_alpha",
  struct: "int_factory",
  actionId: "interstellar-int_factory",
});
const metadataGalaxyDeuterium = structure({
  entryKey: "gxy_home:cruiser_ship",
  region: "galaxy",
  sector: "gxy_home",
  struct: "cruiser_ship",
  actionId: "galaxy-cruiser_ship",
  supportTypes: "gateway",
});
const structures = Object.freeze([
  cityGenerator,
  shortInterstellar,
  metadataSpaceFuel,
  metadataInterstellarDeuterium,
  metadataGalaxyDeuterium,
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
    red_factory: { count: 1, on: 1 },
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
    int_factory: { count: 1, on: 1 },
  },
  galaxy: { cruiser_ship: { count: 1, on: 1 } },
  tech: { high_tech: 2, advanced_power: 1, luna: 3 },
  race: { universe: "magic", species: "Human", fasting: false, hungry: true },
  settings: { showGalactic: true },
  resource: {
    Power: {
      name: "Power",
      amount: 999,
      max: 999,
      diff: 99,
      requestedQuantity: 999,
      rateMods: { eject: 50, supply: 75 },
      storeOverflow: true,
      maxStorage: 2000,
      incomeAdusted: true,
      display: true,
    },
    Coal: {
      name: "Coal",
      amount: 50,
      max: 50,
      diff: -2,
      requestedQuantity: 999,
      rateMods: { eject: 50, supply: 75 },
      storeOverflow: true,
      maxStorage: 200,
      display: true,
      incomeAdusted: true,
    },
    Supply: {
      name: "Supply",
      amount: 999,
      max: 999,
      diff: 99,
      requestedQuantity: 999,
      display: true,
    },
    Oil: {
      name: "Oil",
      amount: 0,
      max: 100,
      diff: -8,
      requestedQuantity: 999,
      display: true,
    },
    Helium_3: {
      name: "Helium-3",
      amount: 0,
      max: 100,
      diff: 0,
      display: true,
    },
    Deuterium: {
      name: "Deuterium",
      amount: 20,
      max: 100,
      diff: 0,
      display: true,
    },
    Human: {
      name: "Human",
      amount: 42,
      max: 100,
      diff: 3,
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
      amount: 999,
      max: 999,
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
    gateway: [metadataGalaxyDeuterium.entryKey],
  },
  portal: { purifier: { supply: 32, sup_max: 80, diff: 7 } },
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
    metadataSpaceFuel.entryKey,
    metadataInterstellarDeuterium.entryKey,
    metadataGalaxyDeuterium.entryKey,
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
  metadataSpaceFuel.actionId,
  metadataInterstellarDeuterium.actionId,
  metadataGalaxyDeuterium.actionId,
  lockedGenerator.actionId,
];
const settings = Object.fromEntries(
  stateOnSettingsOrder.flatMap((binding, index) => [
    [`bld_s_${binding}`, true],
    [`bld_p_${binding}`, index],
  ]),
);
settings["bld_s_space-garage"] = true;
settings["bld_p_space-garage"] = stateOnSettingsOrder.length;
settings["bld_m_city-bank"] = 15;

const fakeControls = Object.freeze({
  capturedElementIds: () => Object.freeze([...capturedPowerFixtureControlIds]),
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
  const amount = Number(resource.amount ?? 0);
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

const requestedResourceIds = [];
function createResources(rootValue, readIds = requestedResourceIds) {
  return Object.freeze({
    readResources(ids) {
      readIds.push(...ids);
      return Object.freeze({
        resources: new Map(
          [...ids].map((id) => [id, resourceView(rootValue, id)]),
        ),
      });
    },
  });
}
const resources = createResources(root);

function createMechanics({
  structures: structureSample = structures,
  productionBreakdown = {
    production: {
      Helium_3: {
        "Explotación de gas": "4",
        "Bonificación orbital": "50%",
        "Siguiente fuente": "2",
      },
      Global: { "Mejora global": "20%" },
    },
    consumption: {},
  },
  localizedText = {},
  powerOrder = (sample) => sample.power,
  supportOrder = (sample, type) => sample.support[type],
  adjustedFuelFactor = (mode) => ({
    kind: "value",
    value: mode === "space" ? 0.5 : 0.75,
  }),
  invalidateFuel = false,
} = {}) {
  const byKey = new Map(structureSample.map((item) => [item.entryKey, item]));
  const resolve = (keys) =>
    Object.freeze(
      keys.flatMap((key) => {
        const item = byKey.get(key);
        return item === undefined ? [] : [item];
      }),
    );
  return Object.freeze({
    readStructures: () => structureSample,
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
    readProductionBreakdown: () => productionBreakdown,
    readLocalizedText: (key) =>
      Object.hasOwn(localizedText, key)
        ? { kind: "value", value: localizedText[key] }
        : { kind: "absent" },
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
  readDemand: () => EMPTY_DEMAND_SAMPLE,
  readCurrentDate: () => new Date("2026-07-01T12:00:00"),
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
  stateOnSettingsOrder.filter((binding) => binding !== "space-gas_storage"),
  "stored Building catalog priorities control Power input order, not root.power or Map order",
);
assert.ok(
  cycle.buildings.every((building) => building.binding !== "space-garage"),
  "a managed-state row with no built instances is excluded",
);
assert.equal(
  cycle.buildings.find((building) => building.binding === "space-storehouse")
    ?.id,
  "reactor",
);
assert.equal(
  cycle.buildings.find(
    (building) => building.binding === "interstellar-warehouse",
  )?.id,
  "reactor",
  "duplicate short structure ids remain distinct through their full bindings",
);
assert.equal(
  cycle.buildings.find((building) => building.binding === "space-gas_storage"),
  undefined,
  "an unsatisfied action power_reqs gate excludes state management despite raw on",
);
assert.equal(
  cycle.buildings.find((building) => building.binding === "space-gas_mining")
    ?.stateOn,
  0,
  "a built currently-off managed producer stays in the cycle",
);
assert.ok(
  Math.abs(
    cycle.buildings.find((building) => building.binding === "space-gas_mining")
      ?.rule.kind === "busy-resource"
      ? cycle.buildings.find(
          (building) => building.binding === "space-gas_mining",
        )?.rule.observation.production - 7.2
      : Number.POSITIVE_INFINITY,
  ) < 1e-9,
  "busy production matches the game's localized source, following percent rows, and Global modifier",
);
assert.equal(
  cycle.buildings.find(
    (building) => building.binding === "space-propellant_depot",
  )?.stateOn,
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
    .find((building) => building.binding === "space-propellant_depot")
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
    .find((building) => building.binding === "interstellar-cargo_yard")
    ?.consumptions.some(
      (consumption) =>
        consumption.resourceId === "Helium_3" &&
        consumption.rate === 10 &&
        consumption.fuelRate === 7.5,
    ),
  "the interstellar fuel adjustment mode produces its own exact rate",
);
assert.deepEqual(
  [
    cycle.buildings
      .find((building) => building.binding === "space-red_factory")
      ?.consumptions.find(
        (consumption) => consumption.resourceId === "Helium_3",
      ),
    cycle.buildings
      .find((building) => building.binding === "interstellar-int_factory")
      ?.consumptions.find(
        (consumption) => consumption.resourceId === "Deuterium",
      ),
    cycle.buildings
      .find((building) => building.binding === "galaxy-cruiser_ship")
      ?.consumptions.find(
        (consumption) => consumption.resourceId === "Deuterium",
      ),
  ].map((consumption) => [consumption?.rate, consumption?.fuelRate]),
  [
    [1, 0.5],
    [5, 3.75],
    [25, 18.75],
  ],
  "metadata declarations use space H3 and interstellar Deuterium adjustments in all orbital regions",
);
assert.equal(
  cycle.resources.find((resource) => resource.id === "Power")?.maxQuantity,
  -52,
  "synthetic Power capacity comes from currently-off structures, not resource.Power",
);
assert.equal(cycle.powerCurrent, 15);
assert.equal(cycle.powerMaximum, -52);
assert.equal(cycle.civilianPopulation, 42);
assert.equal(
  cycle.resources.find((resource) => resource.id === "Human")?.currentQuantity,
  42,
  "Population resolves to the current species resource",
);
assert.equal(
  requestedResourceIds.includes("Power"),
  false,
  "the generic captured resource reader never receives synthetic Power",
);
assert.equal(
  requestedResourceIds.includes("Human"),
  false,
  "the current species population is read from the synthetic Population wrapper",
);
assert.equal(
  cycle.resources.find((resource) => resource.id === "Power")?.currentQuantity,
  15,
  "synthetic Power current quantity comes from city.power",
);
assert.deepEqual(
  [
    cycle.resources.find((resource) => resource.id === "Supply")
      ?.currentQuantity,
    cycle.resources.find((resource) => resource.id === "Supply")?.maxQuantity,
    cycle.resources.find((resource) => resource.id === "Supply")?.rateOfChange,
  ],
  [32, 80, 7],
  "synthetic Supply reads the live portal purifier rather than resource.Supply",
);
assert.equal(
  requestedResourceIds.includes("Supply"),
  false,
  "synthetic Supply is never sent through the generic resource reader",
);
assert.equal(
  readCapturedPowerMetadataFuelMode("space-red_factory", "space", "Helium_3"),
  "space",
);
assert.equal(
  readCapturedPowerMetadataFuelMode(
    "interstellar-int_factory",
    "interstellar",
    "Deuterium",
  ),
  "interstellar",
);
assert.equal(
  readCapturedPowerMetadataFuelMode(
    "galaxy-cruiser_ship",
    "galaxy",
    "Deuterium",
  ),
  "interstellar",
);
assert.equal(
  readCapturedPowerMetadataFuelMode(
    "tauceti-patrol_ship",
    "tauceti",
    "Deuterium",
  ),
  "interstellar",
  "Tau Ceti metadata fuel keeps the retired interstellar adjustment selection",
);
assert.equal(
  readCapturedPowerMetadataFuelMode(
    "interstellar-cruiser",
    "interstellar",
    "Helium_3",
  ),
  "interstellar",
);
assert.equal(
  readCapturedPowerMetadataFuelMode(
    "interstellar-fusion",
    "interstellar",
    "Deuterium",
  ),
  undefined,
  "Alpha Fusion retains the retired Building.getFuelRate exception",
);
assert.equal(
  readCapturedPowerMetadataFuelMode(
    "interstellar-fusion",
    "interstellar",
    "Helium_3",
  ),
  undefined,
  "Alpha Fusion excludes both resources handled by the interstellar metadata path",
);

const demandSample = (overrides = {}) => ({
  savingTarget: null,
  requestedQuantity: () => 0,
  requestedQuantityExcludingMech: () => 0,
  requestedQuantityForMechPriority: () => 0,
  isDemanded: () => false,
  storageRequired: () => 1,
  maxCost: () => 0,
  ...overrides,
});
const adjustedOil = readCapturedPowerOrdinaryResourceState(
  {
    race: { decay: true },
    portal: {
      transport: { count: 2, on: 1, cargo: { Oil: 2 } },
      bireme: { on: 1 },
    },
    interstellar: { mass_ejector: { count: 1, on: 1, Oil: 3 } },
  },
  "Oil",
  {
    autoMarket: true,
    autoSupply: true,
    res_supplyOil: true,
    autoEject: true,
    res_ejectOil: true,
  },
  demandSample(),
  { production: {}, consumption: { Oil: { Trade: -4 } } },
  {
    present: true,
    unlocked: true,
    amount: 60,
    max: 100,
    rateOfChange: -3,
    storageRatio: 0.6,
  },
);
assert.equal(
  adjustedOil?.income,
  -3,
  "income excludes sell, decay, Supply, and Eject modifiers",
);
assert.equal(
  adjustedOil?.rateOfChange,
  24004.005,
  "rateOfChange retains all current sell, decay, Supply, and Eject adjustments",
);
assert.equal(
  adjustedOil?.useful,
  true,
  "active supply/eject allocations make a resource useful",
);
const demandedAtCap = readCapturedPowerOrdinaryResourceState(
  {},
  "Oil",
  {},
  demandSample({ isDemanded: () => true }),
  { production: {}, consumption: {} },
  {
    present: true,
    unlocked: true,
    amount: 100,
    max: 100,
    rateOfChange: 0,
    storageRatio: 1,
  },
);
assert.equal(
  demandedAtCap?.useful,
  true,
  "an actual demand target keeps a full resource useful",
);
const overflowStorage = readCapturedPowerOrdinaryResourceState(
  {},
  "Oil",
  { res_storage_o_Oil: true, res_max_storeOil: 120 },
  demandSample(),
  { production: {}, consumption: {} },
  {
    present: true,
    unlocked: true,
    amount: 100,
    max: 100,
    rateOfChange: 0,
    storageRatio: 1,
  },
);
assert.equal(
  overflowStorage?.useful,
  true,
  "store-overflow uses its captured storage setting",
);

const beltStation = structure({
  entryKey: "spc_titan:space_station",
  region: "space",
  sector: "spc_titan",
  struct: "space_station",
  actionId: "space-space_station",
  supportTypes: "belt",
});
const beltMember = structure({
  entryKey: "spc_titan:elerium_ship",
  region: "space",
  sector: "spc_titan",
  struct: "elerium_ship",
  actionId: "space-elerium_ship",
  supportTypes: "belt",
  supportTopology: {
    anchorEntryKey: beltStation.entryKey,
    unlimited: false,
    enabled: { kind: "value", value: true },
  },
});
const supportStructures = [beltStation, beltMember];
const supportRoot = {
  city: {},
  space: {
    space_station: { count: 4, on: 1, s_max: 120, support: 20 },
    elerium_ship: { count: 1, on: 1 },
    electrolysis: { count: 4, on: 4 },
    hydrogen_plant: { count: 3, on: 3 },
  },
  race: {
    high_pop: 2,
    truepath: true,
    species: "Human",
  },
  civic: { space_miner: { workers: 100 } },
  tech: { high_tech: 2, tau_red: 5, womling_pop: 2 },
  tauceti: {
    womling_village: { count: 4, on: 4 },
    womling_farm: { count: 3, on: 3 },
    womling_lab: { count: 2, on: 2 },
    womling_mine: { count: 1, on: 1 },
  },
  resource: {},
};
const supportBuildingStates = [
  readCapturedBuildingState(
    supportRoot,
    {
      binding: beltStation.actionId,
      elementId: beltStation.actionId,
      entryKey: beltStation.entryKey,
      region: beltStation.region,
      sector: beltStation.sector,
      id: beltStation.struct,
      label: beltStation.actionId,
      switchable: true,
      smart: false,
      knowledge: false,
      state: supportRoot.space.space_station,
    },
    beltStation,
    true,
  ),
];
assert.ok(supportBuildingStates[0]);
for (const [region, id] of [
  ["space", "electrolysis"],
  ["space", "hydrogen_plant"],
  ["tauceti", "womling_village"],
  ["tauceti", "womling_farm"],
  ["tauceti", "womling_lab"],
  ["tauceti", "womling_mine"],
]) {
  const definition = structure({
    entryKey: `${region}:${id}`,
    region,
    sector: region,
    struct: id,
    actionId: `${region}-${id}`,
    ownsPowered: false,
    switchable: true,
  });
  const snapshot = readCapturedBuildingState(
    supportRoot,
    {
      binding: definition.actionId,
      elementId: definition.actionId,
      entryKey: definition.entryKey,
      region,
      sector: region,
      id,
      label: definition.actionId,
      switchable: true,
      smart: false,
      knowledge: false,
      state: supportRoot[region][id],
    },
    definition,
    true,
  );
  assert.ok(snapshot);
  supportStructures.push(definition);
  supportBuildingStates.push(snapshot);
}
const beltSupport = readCapturedPowerSupportResourceState(
  supportRoot,
  "Belt_Support",
  { autoPower: true, "bld_s_space-space_station": true },
  supportStructures,
  supportBuildingStates,
);
assert.deepEqual(
  [beltSupport?.currentQuantity, beltSupport?.maxQuantity],
  [20, 84],
  "Belt Support capacity uses powered station count, high-pop capacity, and current miner workers",
);
assert.equal(
  readCapturedPowerSupportResourceState(
    supportRoot,
    "Belt_Support",
    { autoPower: true },
    supportStructures,
    supportBuildingStates,
  )?.maxQuantity,
  21,
  "Belt Support falls back to currently-on stations when auto-state is not enabled",
);
assert.deepEqual(
  [
    readCapturedPowerSupportResourceState(
      supportRoot,
      "Electrolysis_Support",
      {},
      [],
      supportBuildingStates,
    )?.currentQuantity,
    readCapturedPowerSupportResourceState(
      supportRoot,
      "Electrolysis_Support",
      {},
      [],
      supportBuildingStates,
    )?.maxQuantity,
  ],
  [3, 4],
  "Electrolysis Support uses Titan hydrogen-plant and electrolysis counts",
);
assert.deepEqual(
  [
    readCapturedPowerSupportResourceState(
      supportRoot,
      "Womlings_Support",
      {},
      [],
      supportBuildingStates,
    )?.currentQuantity,
    readCapturedPowerSupportResourceState(
      supportRoot,
      "Womlings_Support",
      {},
      [],
      supportBuildingStates,
    )?.maxQuantity,
  ],
  [14, 24],
  "Womlings Support uses flat tau-red structure state and the level-two population cap",
);
const uninitializedSupportRoot = {
  race: { truepath: true },
  space: {},
  tech: { tau_red: 4 },
  tauceti: {},
};
assert.deepEqual(
  [
    readCapturedPowerSupportResourceState(
      uninitializedSupportRoot,
      "Electrolysis_Support",
      {},
      [],
    )?.currentQuantity,
    readCapturedPowerSupportResourceState(
      uninitializedSupportRoot,
      "Electrolysis_Support",
      {},
      [],
    )?.maxQuantity,
    readCapturedPowerSupportResourceState(
      uninitializedSupportRoot,
      "Womlings_Support",
      {},
      [],
    )?.currentQuantity,
    readCapturedPowerSupportResourceState(
      uninitializedSupportRoot,
      "Womlings_Support",
      {},
      [],
    )?.maxQuantity,
    readCapturedPowerSupportResourceState(
      uninitializedSupportRoot,
      "Womlings_Support",
      {},
      [],
    )?.unlocked,
  ],
  [0, 0, 0, 0, false],
  "uninitialized Electrolysis and Tau-Ceti counts retain the wrappers' zero and locked state",
);
assert.deepEqual(
  [
    readCapturedLegacyJobCount(
      {
        civic: { farmer: { workers: 4 }, archaeologist: { workers: 3 } },
        race: {
          high_pop: 2,
          servants: { jobs: { farmer: 2, archaeologist: 5 } },
        },
      },
      "farmer",
      true,
    ),
    readCapturedLegacyJobCount(
      {
        civic: { farmer: { workers: 4 }, archaeologist: { workers: 3 } },
        race: {
          high_pop: 2,
          servants: { jobs: { farmer: 2, archaeologist: 5 } },
        },
      },
      "archaeologist",
      false,
    ),
  ],
  [18, 3],
  "BasicJob counts include high-pop-scaled servants while ordinary Job counts remain workers only",
);
assert.deepEqual(
  [
    readCapturedJobStackMultiplier({
      race: { high_pop: 1, empowered: 1 },
    }),
    readCapturedHighPopulationGrowthMultiplier({
      race: { high_pop: 1, empowered: 1 },
    }),
  ],
  [4.3, 3.8],
  "high_pop remains a genus trait when the empowered rank bonus is applied",
);
assert.equal(
  cycle.hungryRace,
  false,
  "the retired Power adapter samples hungry-race state only when a managed building consumes Food",
);
assert.equal(
  cycle.resources.find((resource) => resource.id === "Coal")?.income,
  -2,
);
assert.equal(
  cycle.resources.find((resource) => resource.id === "Coal")?.useful,
  false,
  "ordinary useful ignores wrapper-only demand, rateMods, and storage fields on global.resource",
);
assert.equal(
  "incomeAdjusted" in
    cycle.resources.find((resource) => resource.id === "Coal"),
  false,
  "incomeAdjusted is not treated as game resource state",
);
assert.ok(cycle.buildings.some((building) => building.powered > 0));
assert.ok(cycle.buildings.some((building) => building.powered < 0));
const capturedPlan = planPowerCycle(cycle, EMPTY_POWER_AUTOMATION_STATE);
assert.ok(
  capturedPlan.decision?.kind === "apply-power-cycle",
  "a captured unlocked cycle proceeds past the power gate and produces a Power decision",
);
assert.ok(
  capturedPlan.decision.operations.some(
    (operation) => operation.kind === "adjust-building",
  ),
  "the captured Power decision contains an actual building operation",
);

const fleetSettings = { ...settings, autoFleet: true };
const fleetReader = createCapturedPowerReader({
  rootState: { readRoot: () => root },
  mechanics: createMechanics(),
  controls: fakeControls,
  resources,
  readDemand: () => EMPTY_DEMAND_SAMPLE,
  readFleetNeededShips: () => ({ cruiser_ship: 2 }),
  readCurrentDate: () => new Date("2026-07-01T12:00:00"),
  readSettingsRaw: () => fleetSettings,
  readRuntimeOptions: () => ({
    settings: {
      showGalactic: true,
      limitPowered: false,
      autoFleet: true,
      crewReserve: 0,
    },
    debug: false,
    consumptionBalanceMinimum: 60,
  }),
  readWarnings: () => [],
});
const fleetCycle = fleetReader.readCycle();
assert.equal(
  fleetCycle?.buildings.find(
    (building) => building.binding === "galaxy-cruiser_ship",
  )?.fleetMaximum,
  2,
  "autoFleet reads the current neededShips cap for the matching ship structure",
);
assert.equal(
  fleetCycle?.buildings.find((building) => building.binding === "city-bank")
    ?.fleetMaximum,
  null,
  "non-fleet buildings retain the legacy absence of a fleet cap",
);

const disabledSettings = { ...settings, "bld_s_space-storehouse": false };
const disabledReader = createCapturedPowerReader({
  rootState: { readRoot: () => root },
  mechanics: createMechanics(),
  controls: fakeControls,
  resources,
  readDemand: () => EMPTY_DEMAND_SAMPLE,
  readCurrentDate: () => new Date("2026-07-01T12:00:00"),
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
    ?.buildings.some((building) => building.binding === "space-storehouse"),
  false,
  "auto-Power-disabled buildings are omitted",
);

const unavailableReader = createCapturedPowerReader({
  rootState: { readRoot: () => root },
  mechanics: createMechanics({ invalidateFuel: true }),
  controls: fakeControls,
  resources,
  readDemand: () => EMPTY_DEMAND_SAMPLE,
  readCurrentDate: () => new Date("2026-07-01T12:00:00"),
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
  readDemand: () => EMPTY_DEMAND_SAMPLE,
  readCurrentDate: () => new Date("2026-07-01T12:00:00"),
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
  readDemand: () => EMPTY_DEMAND_SAMPLE,
  readCurrentDate: () => new Date("2026-07-01T12:00:00"),
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
const missingSupportCycle = missingSupportReader.readCycle();
assert.equal(
  missingSupportCycle?.resources.find(
    (resource) => resource.id === "Moon_Support",
  )?.unlocked,
  false,
  "a lazily absent support anchor remains locked instead of falling back to global.resource",
);
assert.equal(
  missingSupportCycle?.resources.find(
    (resource) => resource.id === "Moon_Support",
  )?.maxQuantity,
  0,
);

const stationKey = "spc_belt:space_station";
const gatewayKey = "gxy_home:ship_dock";
const overseerKey = "tau_home:overseer";
const lakeAnchorKey = "prtl_lake:harbor";
const spireAnchorKey = "prtl_spire:mechbay";
const spireStructure = (
  region,
  sector,
  struct,
  actionId,
  supportType,
  anchorEntryKey,
  extras = {},
) =>
  structure({
    entryKey: `${sector}:${struct}`,
    region,
    sector,
    struct,
    actionId,
    supportTypes: supportType,
    supportTopology: {
      anchorEntryKey,
      unlimited: false,
      enabled: { kind: "value", value: true },
    },
    ...extras,
  });
const specialStation = spireStructure(
  "space",
  "spc_belt",
  "space_station",
  "space-space_station",
  "belt",
  stationKey,
  { title: "Estación orbital" },
);
const specialEleriumShip = spireStructure(
  "space",
  "spc_belt",
  "elerium_ship",
  "space-elerium_ship",
  "belt",
  stationKey,
);
const specialGatewayAnchor = spireStructure(
  "galaxy",
  "gxy_home",
  "ship_dock",
  "galaxy-ship_dock",
  "gateway",
  gatewayKey,
);
const specialBologniumShip = spireStructure(
  "galaxy",
  "gxy_home",
  "bolognium_ship",
  "galaxy-bolognium_ship",
  "gateway",
  gatewayKey,
);
const specialOverseer = spireStructure(
  "tauceti",
  "tau_home",
  "overseer",
  "tauceti-overseer",
  "tau_red",
  overseerKey,
  { value: 13 },
);
const specialWomlingFun = spireStructure(
  "tauceti",
  "tau_home",
  "womling_fun",
  "tauceti-womling_fun",
  "tau_red",
  overseerKey,
  { value: 17 },
);
const specialLakeAnchor = spireStructure(
  "portal",
  "prtl_lake",
  "harbor",
  "portal-harbor",
  "lake",
  lakeAnchorKey,
);
const specialBireme = spireStructure(
  "portal",
  "prtl_lake",
  "bireme",
  "portal-bireme",
  "lake",
  lakeAnchorKey,
);
const specialTransport = spireStructure(
  "portal",
  "prtl_lake",
  "transport",
  "portal-transport",
  "lake",
  lakeAnchorKey,
);
const specialMechBay = spireStructure(
  "portal",
  "prtl_spire",
  "mechbay",
  "portal-mechbay",
  "spire",
  spireAnchorKey,
);
const specialPort = spireStructure(
  "portal",
  "prtl_spire",
  "port",
  "portal-port",
  "spire",
  spireAnchorKey,
);
const specialBaseCamp = spireStructure(
  "portal",
  "prtl_spire",
  "base_camp",
  "portal-base_camp",
  "spire",
  spireAnchorKey,
);
const specialPurifier = spireStructure(
  "portal",
  "prtl_spire",
  "purifier",
  "portal-purifier",
  "spire",
  spireAnchorKey,
  { description: "Purificador de la torre" },
);
const specialStructures = Object.freeze([
  structure({
    entryKey: "city:hospital",
    region: "city",
    sector: "city",
    struct: "hospital",
    actionId: "city-hospital",
  }),
  structure({
    entryKey: "city:banquet",
    region: "city",
    sector: "city",
    struct: "banquet",
    actionId: "city-banquet",
  }),
  specialStation,
  specialEleriumShip,
  structure({
    entryKey: "space:lander",
    region: "space",
    sector: "space",
    struct: "lander",
    actionId: "space-lander",
    powered: -10,
  }),
  structure({
    entryKey: "space:fob",
    region: "space",
    sector: "space",
    struct: "fob",
    actionId: "space-fob",
  }),
  structure({
    entryKey: "int_home:ascension_trigger",
    region: "interstellar",
    sector: "int_home",
    struct: "ascension_trigger",
    actionId: "interstellar-ascension_trigger",
  }),
  structure({
    entryKey: "galaxy:vitreloy_plant",
    region: "galaxy",
    sector: "gxy_home",
    struct: "vitreloy_plant",
    actionId: "galaxy-vitreloy_plant",
  }),
  structure({
    entryKey: "galaxy:armed_miner",
    region: "galaxy",
    sector: "gxy_home",
    struct: "armed_miner",
    actionId: "galaxy-armed_miner",
    supportTypes: "alien2",
    support: 5,
  }),
  structure({
    entryKey: "galaxy:minelayer",
    region: "galaxy",
    sector: "gxy_chthonian",
    struct: "minelayer",
    actionId: "galaxy-minelayer",
    shipRating: 77,
  }),
  structure({
    entryKey: "prtl_ruins:guard_post",
    region: "portal",
    sector: "prtl_ruins",
    struct: "guard_post",
    actionId: "portal-guard_post",
  }),
  structure({
    entryKey: "prtl_spire:waygate",
    region: "portal",
    sector: "prtl_spire",
    struct: "waygate",
    actionId: "portal-waygate",
  }),
  specialGatewayAnchor,
  specialBologniumShip,
  specialOverseer,
  specialWomlingFun,
  structure({
    entryKey: "city:cement_plant",
    region: "city",
    sector: "city",
    struct: "cement_plant",
    actionId: "city-cement_plant",
    powered: -5,
  }),
  structure({
    entryKey: "city:mine",
    region: "city",
    sector: "city",
    struct: "mine",
    actionId: "city-mine",
    powered: -4,
  }),
  structure({
    entryKey: "city:coal_mine",
    region: "city",
    sector: "city",
    struct: "coal_mine",
    actionId: "city-coal_mine",
    powered: -3,
  }),
  structure({
    entryKey: "city:mill",
    region: "city",
    sector: "city",
    struct: "mill",
    actionId: "city-mill",
    powered: -8,
  }),
  specialLakeAnchor,
  specialBireme,
  specialTransport,
  specialMechBay,
  specialPort,
  specialBaseCamp,
  specialPurifier,
  structure({
    entryKey: "prtl_spire:spire",
    region: "portal",
    sector: "prtl_spire",
    struct: "spire",
    actionId: "portal-spire",
  }),
]);
const specialRoot = {
  city: {
    power: 100,
    powered: true,
    hospital: { count: 30, on: 1 },
    banquet: { count: 0, on: 0, strength: 0 },
    cement_plant: { count: 1, on: 1 },
    mine: { count: 1, on: 1 },
    coal_mine: { count: 1, on: 1 },
    mill: { count: 1, on: 1 },
    foundry: {},
  },
  space: {
    space_station: { count: 3, on: 2, s_max: 45, support: 12 },
    elerium_ship: { count: 2, on: 1 },
    lander: { count: 1, on: 1 },
    fob: { count: 1, on: 1 },
  },
  interstellar: { ascension_trigger: { count: 1, on: 1 } },
  galaxy: {
    ship_dock: { count: 1, on: 1, s_max: 20, support: 6 },
    bolognium_ship: { count: 1, on: 1 },
    gorddon_mission: { count: 99 },
    vitreloy_plant: { count: 1, on: 1 },
    armed_miner: { count: 1, on: 1 },
    gxy_chthonian: { piracy: 8, armada: 12 },
    minelayer: { count: 1, on: 1, crew: 1 },
  },
  portal: {
    guard_post: { count: 1, on: 1 },
    waygate: { count: 1, on: 0 },
    harbor: { count: 1, on: 1, s_max: 18, support: 7 },
    bireme: { count: 2, on: 1 },
    transport: { count: 3, on: 2 },
    mechbay: {
      count: 2,
      on: 1,
      max: 10,
      bay: 1,
      active: 1,
      scouts: 0,
      s_max: 12,
      support: 5,
      blueprint: {
        size: "small",
        chassis: "wheel",
        hardpoint: ["laser"],
        equip: ["special"],
        infernal: false,
      },
      mechs: [
        {
          size: "small",
          chassis: "wheel",
          hardpoint: ["laser"],
          equip: ["special"],
          infernal: false,
        },
      ],
    },
    port: { count: 1, on: 1 },
    base_camp: { count: 1, on: 1 },
    purifier: { count: 1, on: 1, supply: 0, sup_max: 1000, diff: 1 },
    spire: { count: 3, type: "sand", progress: 25, status: {}, boss: "snake" },
  },
  tauceti: {
    overseer: { count: 1, on: 1, s_max: 10, support: 4, miners: 6, injured: 2 },
    womling_mine: { count: 1, on: 1, miners: 6 },
    womling_farm: { count: 1, on: 1, farmers: 5 },
    womling_fun: { count: 1, on: 1 },
  },
  civic: {
    cement_worker: { workers: 11 },
    miner: { workers: 13 },
    coal_miner: { workers: 17 },
    farmer: { workers: 4 },
    hunter: { workers: 3 },
    space_miner: { workers: 2, name: "Mineros espaciales" },
    archaeologist: { workers: 2 },
    garrison: { workers: 60, crew: 10, wounded: 4 },
    crew: { workers: 10 },
    govern: { type: "autocracy" },
  },
  race: {
    species: "Human",
    universe: "evil",
    high_pop: 1,
    empowered: 0,
    governor: { g: { bg: "sports" }, tasks: {} },
    servants: { jobs: { farmer: 2, hunter: 1 } },
  },
  tech: { high_tech: 2, xeno: 2, waygate: 3, evil: 0 },
  settings: {
    qKey: false,
    showPortal: true,
    showSpace: true,
    showOuter: true,
    showGalactic: true,
    showDeep: true,
    showTau: true,
  },
  pillars: { Human: 0 },
  blood: { prepared: 0, wrath: 0, spire: 7 },
  stats: { spire: { e: { dlstr: 1 } }, achieve: { gladiator: { l: 1 } } },
  queue: {
    display: true,
    pause: false,
    queue: [{ id: "portal-mechbay" }, { id: "portal-purifier" }],
  },
  resource: {
    Power: { amount: 999, max: 999, diff: 999, display: true },
    Human: { amount: 100, max: 200, diff: 1, display: true },
    Supply: { amount: 999, max: 999, diff: 999, display: true },
    Money: { amount: 500, max: 700, diff: 0, display: true },
    Elerium: { amount: 100, max: 500, diff: 0, display: true },
    Authority: { amount: 100, max: 200, diff: 0, display: true },
    Harmony: { amount: 1, max: 10, diff: 0, display: true },
    Bolognium: { amount: 50, max: 100, diff: 0, display: true },
    Soul_Gem: { amount: 100, max: 500, diff: 0, display: true },
    Food: { amount: 100, max: 500, diff: 0, display: true },
    Oil: { amount: 100, max: 500, diff: 0, display: true },
    Helium_3: { amount: 100, max: 500, diff: 0, display: true },
    Deuterium: { amount: 100, max: 500, diff: 0, display: true },
  },
  support: {
    belt: [specialStation.entryKey, specialEleriumShip.entryKey],
    gateway: [specialGatewayAnchor.entryKey, specialBologniumShip.entryKey],
    alien2: ["galaxy:armed_miner"],
    tau_red: [specialOverseer.entryKey, specialWomlingFun.entryKey],
    lake: [
      specialLakeAnchor.entryKey,
      specialBireme.entryKey,
      specialTransport.entryKey,
    ],
    spire: [
      specialMechBay.entryKey,
      specialPort.entryKey,
      specialBaseCamp.entryKey,
      specialPurifier.entryKey,
    ],
  },
  power: specialStructures.map((entry) => entry.entryKey),
};
const specialSettings = Object.fromEntries(
  specialStructures.flatMap((entry, index) => [
    [`bld_s_${entry.actionId}`, true],
    [`bld_p_${entry.actionId}`, index],
  ]),
);
Object.assign(specialSettings, {
  autoPower: true,
  buildingsLimitPowered: true,
  autoBuild: true,
  autoMech: true,
  autoPrestige: true,
  prestigeType: "demonic",
  prestigeDemonicFloor: 2,
  prestigeDemonicBomb: true,
  prestigeAscensionPillar: true,
  mechWaygatePotential: 0,
  mechBuild: "random",
  mechCollectorValue: 1,
  mechSaveSupplyRatio: 1,
  authorityManage: true,
  generalMinimumAuthority: 150,
  "batgalaxy-gorddon_mission": true,
  "bld_w_galaxy-gorddon_mission": 1,
});
for (const binding of [
  "portal-bireme",
  "portal-transport",
  "portal-port",
  "portal-base_camp",
]) {
  specialSettings[`bld_s2_${binding}`] = true;
}
for (const binding of [
  "portal-mechbay",
  "portal-port",
  "portal-base_camp",
  "portal-purifier",
]) {
  specialSettings[`bld_s2_${binding}`] = true;
  specialSettings[`bld_m_${binding}`] = 5;
  specialSettings[`bat${binding}`] = true;
  specialSettings[`bld_w_${binding}`] = 1;
}
const specialHandles = new Map([
  ["portal-guard_post", { id: "portal-guard_post", methods: ["effect"] }],
  ["prtl_ruins", { id: "prtl_ruins", methods: ["filter"] }],
  ["prtl_gate", { id: "prtl_gate", methods: ["filter"] }],
  ["garrison", { id: "garrison", methods: ["hell"] }],
]);
const specialControls = Object.freeze({
  capturedElementIds: () => Object.freeze(["galaxy-gorddon_mission"]),
  resolve: (id) => specialHandles.get(id),
  invoke(handle, method, args = []) {
    if (handle.id === "portal-guard_post" && method === "effect")
      return { ok: true, value: "+1234 Sécurité des ruines et du portail" };
    if (handle.id === "prtl_ruins" && method === "filter")
      return { ok: true, value: 321 };
    if (handle.id === "prtl_gate" && method === "filter")
      return { ok: true, value: 654 };
    if (handle.id === "garrison" && args[0] === "hell")
      return { ok: true, value: 100 };
    return { ok: false, reason: "unknown-control" };
  },
});
const specialReader = createCapturedPowerReader({
  rootState: { readRoot: () => specialRoot },
  mechanics: createMechanics({
    structures: [
      ...specialStructures,
      {
        ...structure({
          entryKey: "gxy_alien1:gorddon_mission",
          region: "galaxy",
          sector: "gxy_alien1",
          struct: "gorddon_mission",
          actionId: "galaxy-gorddon_mission",
          ownsPowered: false,
        }),
        readAvailability: () => ({
          kind: "value",
          value: specialRoot.tech.xeno < 3,
        }),
      },
    ],
    productionBreakdown: {
      production: {
        Elerium: {
          "Mineros espaciales": "8",
          "Bonificación de prospección": "50%",
          "Siguiente fuente": "2",
        },
        Vitreloy: {
          "Fábrica de Vitreloy": "6",
          "Bonificación de fábrica": "25%",
          "Siguiente fuente": "2",
        },
        Bolognium: { "Minero armado": "4" },
        Adamantite: { "Minero armado": "4" },
        Iridium: { "Minero armado": "4" },
        Global: { "Mejora global": "20%" },
      },
      consumption: {},
      capacity: { Elerium: { "Estación orbital": "18" } },
    },
    localizedText: {
      galaxy_vitreloy_plant_bd: "Fábrica de Vitreloy",
      galaxy_armed_miner_bd: "Minero armado",
    },
  }),
  controls: specialControls,
  resources: createResources(specialRoot),
  readDemand: () => ({
    ...demandSample(),
    maxCost: (id) => (id === "Elerium" ? 44 : 0),
  }),
  costs: {
    readCost: () => ({ cost: { Money: 12, Supply: 7 }, pool: "spire" }),
  },
  readCurrentDate: () => new Date("2026-07-01T12:00:00"),
  readMechState: () =>
    readCapturedMechState({
      root: specialRoot,
      settings: specialSettings,
      queueKeyHeld: readCapturedMechQueueKeyHeld(specialRoot.settings, {
        readPressed: () => false,
      }),
    }),
  readSettingsRaw: () => specialSettings,
  readRuntimeOptions: () => ({
    settings: {
      showGalactic: true,
      limitPowered: true,
      autoFleet: false,
      crewReserve: 0,
    },
    debug: false,
    consumptionBalanceMinimum: 60,
  }),
  readWarnings: () => [],
});
const specialCycle = specialReader.readCycle();
assert.ok(
  specialCycle,
  "the complete special-rule fixture yields a captured Power cycle",
);
const specialRule = (binding, kind) => {
  const building = specialCycle.buildings.find(
    (entry) => entry.binding === binding,
  );
  assert.equal(
    building?.rule.kind,
    kind,
    `${binding} retains its specialized rule`,
  );
  return building.rule;
};
assert.deepEqual(
  [
    specialRule("space-space_station", "belt-space-station").stationStorage,
    specialRule("space-space_station", "belt-space-station").eleriumMaximumCost,
  ],
  [18, 44],
  "Belt Station storage and Elerium cost come from game capacity and demand ledgers",
);
assert.ok(
  Math.abs(
    specialRule("space-elerium_ship", "busy-resource").observation.production -
      14.4,
  ) < 1e-9,
  "busy production resolves the localized BasicJob source, following percent rows, and global modifier",
);
assert.ok(
  Math.abs(
    specialRule("galaxy-vitreloy_plant", "busy-resource").observation
      .production - 9,
  ) < 1e-9,
  "busy production resolves the localized Vitreloy ledger source before action titles",
);
assert.deepEqual(
  specialRule("galaxy-armed_miner", "armed-miner").observations.map(
    (row) => row.production,
  ),
  [4.8, 4.8, 4.8],
  "armed-miner production uses its localized source for all three resources",
);
const tritonRule = specialRule("space-lander", "triton-lander");
assert.deepEqual(
  [
    tritonRule.healingRate,
    tritonRule.highPopulationMultiplier,
    tritonRule.authorityReserve,
  ],
  [9.1, 4, 50],
  "Triton retains the legacy healing calculation, high-pop scale, and typed authority reserve",
);
assert.equal(
  specialRule("interstellar-ascension_trigger", "ascension-trigger")
    .pillarFinished,
  false,
  "Ascension Trigger blocks when the typed pillar policy says an available pillar remains",
);
assert.deepEqual(
  [
    specialRule("galaxy-minelayer", "chthonian-mine-layer").rating,
    specialRule("portal-guard_post", "ruins-guard-post").suppressionUseful,
    specialRule("portal-guard_post", "ruins-guard-post").postRating,
    specialRule("portal-guard_post", "ruins-guard-post").ruinsRating,
    specialRule("portal-guard_post", "ruins-guard-post").gateRating,
  ],
  [77, true, 1234, 321, 654],
  "Chthonian and localized Ruins outputs retain all live combat values",
);
assert.deepEqual(
  [
    specialRule("portal-waygate", "spire-waygate").cleared,
    specialRule("portal-waygate", "spire-waygate").demonicBombReady,
    specialRule("portal-waygate", "spire-waygate").mechPotentialTooHigh,
    specialRule("portal-waygate", "spire-waygate").prestigeFloorProtected,
  ],
  [true, true, true, true],
  "Waygate uses current completion, bomb, Mech potential, and prestige-floor conditions",
);
assert.equal(
  specialRule("galaxy-bolognium_ship", "bolognium-ship").missionBuildable,
  true,
  "Bolognium Ship sees the unlocked, enabled, weighted, not-yet-complete Gorddon mission",
);
specialRoot.tech.xeno = 3;
assert.equal(
  specialReader
    .readCycle()
    ?.buildings.find((entry) => entry.binding === "galaxy-bolognium_ship")?.rule
    .missionBuildable,
  false,
  "completed Gorddon mission uses its semantic completion count and is no longer buildable",
);
specialRoot.tech.xeno = 2;
assert.equal(
  specialCycle.buildings.find((entry) => entry.binding === "portal-waygate")
    ?.extraDescription,
  "portal-waygate",
  "Power descriptions start from the localized game action description, not a type-completion placeholder",
);
assert.deepEqual(
  [
    specialRule("tauceti-overseer", "womling-overseer").loyaltyPerBuilding,
    specialRule("tauceti-womling_fun", "womling-fun").moralePerBuilding,
  ],
  [13, 17],
  "Womling rates use each action's live value function",
);
assert.deepEqual(
  [
    specialCycle.lake.enabled,
    specialCycle.lake.bloodSpireLevel,
    specialCycle.lake.biremeCount,
    specialCycle.lake.transportCount,
  ],
  [true, 7, 2, 3],
  "lake management includes the game's current building and Blood Spire facts",
);
assert.deepEqual(
  [
    specialCycle.spire.enabled,
    specialCycle.spire.moneyMaximum,
    specialCycle.spire.supplyCurrent,
    specialCycle.spire.mechQueued,
    specialCycle.spire.purifierQueued,
    specialCycle.spire.purifierDescription,
    specialCycle.spire.expectedSaveSupply,
  ],
  [true, 700, 0, true, true, "Purificador de la torre", false],
  "Spire input captures costs, live queues and description; final-floor state disables supply saving",
);
specialSettings.autoPrestige = false;
specialRoot.portal.spire.progress = 100;
assert.equal(
  specialReader.readCycle()?.spire.expectedSaveSupply,
  true,
  "Spire input uses the typed Mech supply-saving policy when no final demonic floor is active",
);
specialSettings.autoPrestige = true;
specialRoot.portal.spire.progress = 25;
assert.deepEqual(
  [
    specialCycle.spire.mechBay.moneyCost,
    specialCycle.spire.mechBay.supplyCost,
    specialCycle.spire.mechBay.autoBuildable,
    specialCycle.spire.mechBay.smartManaged,
  ],
  [12, 7, true, true],
  "Spire building costs, buildability, and smart management come from current capabilities",
);
assert.equal(specialRule("city-cement_plant", "job-dependent").jobCount, 11);
assert.equal(specialRule("city-mine", "job-dependent").jobCount, 13);
assert.equal(specialRule("city-coal_mine", "job-dependent").jobCount, 17);
assert.equal(
  specialRule("city-mill", "mill").foodWorkers,
  19,
  "Mill combines Farmer and Hunter worker plus high-pop-scaled servant counts",
);
specialRoot.resource.Harmony.amount = 0;
const noHarmonyCycle = specialReader.readCycle();
assert.ok(noHarmonyCycle);
assert.equal(
  noHarmonyCycle.buildings.find(
    (entry) => entry.binding === "interstellar-ascension_trigger",
  )?.rule.pillarFinished,
  true,
  "Ascension Trigger completes when the typed pillar policy has no remaining pillar requirement",
);
specialRoot.settings.showPortal = false;
const hiddenPortalCycle = specialReader.readCycle();
assert.ok(hiddenPortalCycle);
assert.deepEqual(
  [
    hiddenPortalCycle.lake.enabled,
    hiddenPortalCycle.spire.enabled,
    hiddenPortalCycle.buildings.find(
      (entry) => entry.binding === "portal-bireme",
    )?.skipGroup,
  ],
  [false, false, "none"],
  "hidden Portal groups stay disabled and their buildings remain in ordinary Power planning",
);
specialRoot.settings.showPortal = true;

// The semantic Building owner, including count overrides, is independent of Power policy.
{
  const stateRoot = { tech: { high_tech: 1, advanced_power: 0, space: 3 } };
  const stateDefinition = structure({
    entryKey: "city:semantic_probe",
    region: "city",
    sector: "city",
    struct: "semantic_probe",
    actionId: "city-warehouse",
    powered: 3,
  });
  const semanticCatalog = (binding, state) => ({
    binding,
    elementId: binding,
    entryKey: stateDefinition.entryKey,
    region: binding.split("-")[0],
    sector: stateDefinition.sector,
    id: binding.split("-")[1],
    label: binding,
    switchable: true,
    smart: false,
    knowledge: false,
    state,
  });
  const ordinary = semanticCatalog("city-warehouse", { count: 3, on: 1 });
  const sample = (
    definition = stateDefinition,
    available = true,
    catalog = ordinary,
  ) => readCapturedBuildingState(stateRoot, catalog, definition, available);
  assert.deepEqual(
    [sample().count, sample().hasState, sample().stateOn, sample().stateOff],
    [3, false, 0, 0],
    "raw on does not establish state capability before high_tech 2",
  );
  stateRoot.tech.high_tech = 2;
  assert.deepEqual(
    [sample().hasState, sample().stateOn, sample().stateOff],
    [true, 1, 2],
  );
  const requirementDefinition = {
    ...stateDefinition,
    readPowerRequirements: () => ({
      kind: "value",
      value: [{ techId: "advanced_power", level: 2 }],
    }),
  };
  assert.equal(sample(requirementDefinition).hasState, false);
  stateRoot.tech.advanced_power = 2;
  assert.equal(sample(requirementDefinition).hasState, true);
  const switchDefinition = {
    ...stateDefinition,
    ownsPowered: false,
    readPowered: () => ({ kind: "absent" }),
    readSwitchable: () => ({ kind: "value", value: true }),
  };
  assert.deepEqual(
    [sample(switchDefinition).hasState, sample(switchDefinition).powered],
    [true, 0],
  );
  assert.equal(
    sample({
      ...switchDefinition,
      readSwitchable: () => ({ kind: "value", value: false }),
    }).hasState,
    false,
  );
  assert.deepEqual(
    [
      sample(stateDefinition, false).available,
      sample(stateDefinition, false).hasState,
      sample(stateDefinition, false).stateOff,
    ],
    [false, false, 0],
  );
  const banquet = semanticCatalog("city-banquet", {
    count: 1,
    level: 4,
    on: 0,
  });
  assert.deepEqual(
    [
      sample(switchDefinition, true, banquet).count,
      sample(switchDefinition, true, banquet).stateOn,
      sample(switchDefinition, true, banquet).stateOff,
    ],
    [4, 0, 1],
    "Banquet level is its count while the shell is one switchable state",
  );
  banquet.state.on = 1;
  assert.deepEqual(
    [
      sample(switchDefinition, true, banquet).stateOn,
      sample(switchDefinition, true, banquet).stateOff,
    ],
    [1, 0],
  );
  const mission = semanticCatalog("space-red_mission", { count: 99, on: 0 });
  const undrawnMission = readCapturedBuildingState(
    stateRoot,
    mission,
    undefined,
    true,
  );
  assert.deepEqual(
    [
      undrawnMission.count,
      undrawnMission.hasState,
      undrawnMission.stateOn,
      undrawnMission.stateOff,
    ],
    [0, false, 0, 0],
    "catalog missions without mechanics still report semantic completion count",
  );
  assert.equal(sample(switchDefinition, true, mission).count, 0);
  stateRoot.tech.space = 4;
  assert.equal(
    sample(switchDefinition, true, mission).count,
    1,
    "mission count follows its grant completion rather than the root shell count",
  );
  const lockedCompletedMission = readCapturedBuildingState(
    stateRoot,
    mission,
    undefined,
    false,
  );
  assert.deepEqual(
    [
      lockedCompletedMission.available,
      lockedCompletedMission.count,
      lockedCompletedMission.hasState,
    ],
    [false, 1, false],
    "locked mission completion count survives absent mechanics without granting state capability",
  );
}

// Full cycle capacity and planner buildings consume the same semantic snapshots.
{
  const probe = structure({
    entryKey: "city:semantic_probe",
    region: "city",
    sector: "city",
    struct: "semantic_probe",
    actionId: "city-warehouse",
    powered: 3,
  });
  const registryOnly = structure({
    entryKey: "city:registry_only",
    region: "city",
    sector: "city",
    struct: "registry_only",
    actionId: "city-registry_only",
    powered: 100,
  });
  const semanticRoot = {
    ...root,
    tech: { high_tech: 1 },
    city: {
      ...root.city,
      semantic_probe: { count: 3, on: 1 },
      registry_only: { count: 100, on: 0 },
    },
    power: [probe.entryKey, registryOnly.entryKey],
    support: {},
  };
  let available = true;
  let required = false;
  let switchable;
  let ownsPowered = true;
  const semanticMechanics = createMechanics({
    structures: [
      {
        ...probe,
        readAvailability: () => ({ kind: "value", value: available }),
        get ownsPowered() {
          return ownsPowered;
        },
        readSwitchable: () =>
          switchable === undefined
            ? { kind: "absent" }
            : { kind: "value", value: switchable },
        readPowerRequirements: () =>
          required
            ? { kind: "value", value: [{ techId: "advanced_power", level: 2 }] }
            : { kind: "absent" },
      },
      registryOnly,
    ],
    productionBreakdown: { production: {}, consumption: {} },
  });
  const semanticReader = createCapturedPowerReader({
    rootState: { readRoot: () => semanticRoot },
    mechanics: semanticMechanics,
    controls: { ...fakeControls, capturedElementIds: () => [probe.actionId] },
    resources: createResources(semanticRoot),
    readDemand: () => EMPTY_DEMAND_SAMPLE,
    readCurrentDate: () => new Date("2026-07-01T12:00:00"),
    readSettingsRaw: () => ({
      "bld_s_city-warehouse": true,
      "bld_p_city-warehouse": 0,
    }),
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
  const assertSemanticCycle = (expectedBuildings, expectedMaximum) => {
    const input = semanticReader.readCycle();
    assert.ok(input);
    assert.deepEqual(
      input.buildings.map(({ binding, count, stateOn }) => [
        binding,
        count,
        stateOn,
      ]),
      expectedBuildings,
    );
    assert.equal(
      input.powerMaximum,
      expectedMaximum,
      "Power maximum and managed list share Building capability/count/on snapshots; registry-only state adds nothing",
    );
  };
  assertSemanticCycle([], 0);
  semanticRoot.tech.high_tech = 2;
  assertSemanticCycle([[probe.actionId, 3, 1]], 6);
  required = true;
  assertSemanticCycle([], 0);
  semanticRoot.tech.advanced_power = 2;
  assertSemanticCycle([[probe.actionId, 3, 1]], 6);
  available = false;
  assertSemanticCycle([], 0);
  available = true;
  ownsPowered = false;
  switchable = true;
  assertSemanticCycle([[probe.actionId, 3, 1]], 0);
  switchable = false;
  assertSemanticCycle([], 0);
}

// A changing live getter detects a second independent capture inside this same cycle.
{
  let countReads = 0;
  let onReads = 0;
  let poweredReads = 0;
  const singleCaptureState = {
    get count() {
      return ++countReads === 1 ? 3 : 99;
    },
    get on() {
      return ++onReads === 1 ? 1 : 0;
    },
  };
  const singleCaptureDefinition = {
    ...structure({
      entryKey: "city:coal_power",
      region: "city",
      sector: "city",
      struct: "coal_power",
      actionId: "city-coal_power",
    }),
    readAvailability: () => ({ kind: "value", value: singleCaptureAvailable }),
    readPowered: () => ({
      kind: "value",
      value: ++poweredReads === 1 ? 3 : 100,
    }),
  };
  const singleCaptureRoot = {
    ...root,
    city: { ...root.city, coal_power: singleCaptureState },
    tech: { high_tech: 2 },
    power: [singleCaptureDefinition.entryKey],
    support: {},
  };
  const singleCaptureSettings = {
    "bld_s_city-coal_power": true,
    "bld_p_city-coal_power": 0,
    masterScriptToggle: true,
    autoPower: true,
    buildingsLimitPowered: false,
    "bld_m_city-coal_power": 2,
  };
  let singleCaptureAvailable = true;
  const singleCaptureReader = createCapturedPowerReader({
    rootState: { readRoot: () => singleCaptureRoot },
    mechanics: createMechanics({
      structures: [singleCaptureDefinition],
      productionBreakdown: { production: {}, consumption: {} },
    }),
    controls: {
      ...fakeControls,
      capturedElementIds: () => [singleCaptureDefinition.actionId],
    },
    resources: createResources(singleCaptureRoot),
    readDemand: () => EMPTY_DEMAND_SAMPLE,
    readCurrentDate: () => new Date("2026-07-01T12:00:00"),
    readSettingsRaw: () => singleCaptureSettings,
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
  const captureOnce = () => {
    countReads = 0;
    onReads = 0;
    poweredReads = 0;
    return singleCaptureReader.readCycle();
  };
  const input = captureOnce();
  assert.ok(input);
  assert.deepEqual(
    input.buildings.map(({ count, stateOn, powered }) => [
      count,
      stateOn,
      powered,
    ]),
    [[3, 1, 3]],
  );
  assert.equal(input.powerMaximum, 6);
  assert.deepEqual(
    [countReads, onReads, poweredReads],
    [1, 1, 1],
    "managed planner input and synthetic Power capacity reuse one count/on/powered capture",
  );
  singleCaptureSettings.buildingsLimitPowered = true;
  assert.equal(
    captureOnce().powerMaximum,
    3,
    "powered auto-max reduces the shared snapshot off capacity",
  );
  singleCaptureAvailable = undefined;
  const unknownAvailability = captureOnce();
  assert.ok(unknownAvailability);
  assert.deepEqual(
    unknownAvailability.buildings,
    [],
    "unknown availability does not infer unlocked from raw state",
  );
  assert.equal(unknownAvailability.powerMaximum, 0);
}

process.stdout.write(
  "captured Power reader builds and plans a full mechanics-backed cycle\n",
);
