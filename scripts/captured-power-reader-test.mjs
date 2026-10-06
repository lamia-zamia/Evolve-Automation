import assert from "node:assert/strict";

import {
  planPowerCycle,
  EMPTY_POWER_AUTOMATION_STATE,
} from "../src/domain/economy/production/power.ts";
import {
  createCapturedPowerReader,
  readCapturedPowerOrdinaryResourceState,
  readCapturedPoweredPopulationReserve,
  readNativePowerSupports,
  readCapturedWomlingFarmFood,
  readCapturedMiningPitWorkers,
} from "../src/adapters/evolve/economy/production/captured-power-reader.ts";
import {
  readCapturedHumongousEffectMultiplier,
  readCapturedHighPopulationGrowthMultiplier,
  readCapturedJobStackMultiplier,
} from "../src/adapters/evolve/civic/captured-job-catalog.ts";
import { readCapturedMechState } from "../src/domain/combat/mech-state.ts";
import { readCapturedMechQueueKeyHeld } from "../src/adapters/evolve/combat/captured-mech.ts";
import { EMPTY_DEMAND_SAMPLE } from "../src/adapters/evolve/economy/resources/captured-resource-demand.ts";
import { readCapturedBuildingState } from "../src/adapters/evolve/progression/build/captured-building-state.ts";
import { createCapturedOrdinaryJobsAutomation } from "../src/adapters/evolve/civic/captured-ordinary-jobs.ts";

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
  workers,
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
      value === undefined
        ? { kind: "absent" }
        : readNumber(typeof value === "function" ? value() : value),
    readWorkers: () =>
      workers === undefined
        ? { kind: "absent" }
        : readNumber(typeof workers === "function" ? workers() : workers),
    readShipRating: () =>
      shipRating === undefined ? { kind: "absent" } : readNumber(shipRating),
    ownsPowered,
    readPowered: () => readNumber(powered),
    readPowerGridRole: (sample, sampledPowered = powered) =>
      readNumber(
        Number(sampledPowered) > 0
          ? "consumer"
          : Number(sampledPowered) < 0
            ? "generator"
            : "none",
      ),
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
    readNativeSupportGrids: () => ({
      kind: "value",
      value: (supportTypes === undefined
        ? []
        : Array.isArray(supportTypes)
          ? supportTypes
          : [supportTypes]
      ).map((type) => ({
        type,
        contribution: supportFor?.[type] ?? support,
        consumer: support < 0,
        provider:
          (supportFor?.[type] ?? support) > 0 || supportProvider === true,
        topology: supportTopology ?? {
          anchorEntryKey: null,
          unlimited: false,
          enabled: { kind: "value", value: true },
        },
      })),
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
  powered: 1,
});
const metadataInterstellarDeuterium = structure({
  entryKey: "int_alpha:int_factory",
  region: "interstellar",
  sector: "int_alpha",
  struct: "int_factory",
  actionId: "interstellar-int_factory",
  powered: 1,
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
    moon_anchor: { count: 0, s_max: 0, support: 0 },
    red_anchor: { count: 0, s_max: 0, support: 0 },
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
    moon: [moonConsumer.entryKey, "stale:moon"],
    red: [redSupportConsumer.entryKey],
    gateway: [],
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
    production: { Global: { "Mejora global": "20%" } },
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
  guardPostRating = () => 1234,
  // Effective support equals the configured count until a test models a starved consumer, which
  // is exactly the live 0/5 case: configured on, effective zero.
  effectiveSupport = (sample, member) =>
    sample?.[member.region]?.[member.struct]?.on,
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
    readEffectivePowerCount: (sample, key) => {
      const member = byKey.get(key);
      const state =
        member === undefined
          ? undefined
          : sample?.[member.region]?.[member.struct];
      return typeof state?.on === "number"
        ? { kind: "value", value: state.on }
        : { kind: "invalid" };
    },
    readEffectiveSupportCount: (sample, key) => {
      const member = byKey.get(key);
      if (member === undefined) return { kind: "invalid" };
      const effective = effectiveSupport(sample, member);
      return typeof effective === "number"
        ? { kind: "value", value: effective }
        : { kind: "invalid" };
    },
    readLocalizedText: (key) =>
      Object.hasOwn(localizedText, key)
        ? { kind: "value", value: localizedText[key] }
        : { kind: "absent" },
    readAdjustedFuelFactor: (mode, resourceId) =>
      invalidateFuel && mode === "space" && resourceId === "Oil"
        ? { kind: "absent" }
        : adjustedFuelFactor(mode, resourceId),
    readGuardPostRating: () => ({ kind: "value", value: guardPostRating() }),
  });
}

const readerDependencies = {
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
};
const reader = createCapturedPowerReader(readerDependencies);

const cycle = reader.readCycle();
assert.ok(
  cycle,
  "complete captured mechanics and live state produce a full cycle",
);
assert.ok(Object.isFrozen(cycle) && Object.isFrozen(cycle.buildings));
assert.equal(
  cycle.buildings.find((building) => building.binding === "city-bank")?.powered,
  5,
  "a new native consumer is managed without Power binding metadata",
);
assert.equal(
  cycle.buildings.find(
    (building) => building.binding === "space-propellant_depot",
  )?.powered,
  -12,
  "a new native generator is managed without Power binding metadata",
);
assert.deepEqual(
  cycle.buildings.map((building) => building.binding),
  [
    "city-coal_power",
    "city-bank",
    "space-gas_mining",
    "space-propellant_depot",
    "interstellar-cargo_yard",
    "space-nav_beacon",
    "space-storehouse",
    "interstellar-warehouse",
    "space-red_factory",
    "interstellar-int_factory",
    "galaxy-cruiser_ship",
    "space-vr_center",
  ],
  "captured native power and support orders control the Power cycle",
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
        )?.rule.observation.production
      : Number.POSITIVE_INFINITY,
  ) < 1e-9,
  "an off Gas Mining has no observed production row",
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
  "producer capability survives an absent production ledger row",
);
assert.ok(
  planPowerCycle(cycle, EMPTY_POWER_AUTOMATION_STATE).decision?.operations.some(
    (operation) =>
      operation.kind === "adjust-building" &&
      operation.binding === "space-gas_mining" &&
      operation.amount > 0,
  ),
  "useful Helium-3 can power an off Gas Mining producer on",
);
const activeGasRoot = {
  ...root,
  space: { ...root.space, gas_mining: { count: 3, on: 1 } },
};
const activeGasCycle = createCapturedPowerReader({
  ...readerDependencies,
  rootState: { readRoot: () => activeGasRoot },
  mechanics: createMechanics({
    productionBreakdown: {
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
  }),
}).readCycle();
assert.ok(
  Math.abs(
    activeGasCycle?.buildings.find(
      (building) => building.binding === "space-gas_mining",
    )?.rule.observation.production - 7.2,
  ) < 1e-9,
  "active Gas Mining's amount comes from the native ledger",
);
assert.deepEqual(
  activeGasCycle?.buildings.find(
    (building) => building.binding === "space-gas_mining",
  )?.produces,
  ["Helium_3"],
);
const offHarvester = structure({
  entryKey: "int_alpha:harvester",
  region: "interstellar",
  sector: "int_alpha",
  struct: "harvester",
  actionId: "interstellar-harvester",
  powered: 4,
});
const offHarvesterRoot = {
  ...root,
  interstellar: {
    ...root.interstellar,
    harvester: { count: 1, on: 0 },
  },
  power: [...root.power, offHarvester.entryKey],
};
const offHarvesterCycle = createCapturedPowerReader({
  ...readerDependencies,
  rootState: { readRoot: () => offHarvesterRoot },
  mechanics: createMechanics({ structures: [...structures, offHarvester] }),
  readSettingsRaw: () => ({
    ...settings,
    "bld_s_interstellar-harvester": true,
  }),
}).readCycle();
assert.deepEqual(
  offHarvesterCycle?.buildings.find(
    (building) => building.binding === "interstellar-harvester",
  )?.produces,
  ["Helium_3", "Deuterium"],
  "both producer capabilities survive an off multi-output harvester",
);

function sampleSupportCoherence({
  providerOns = [1],
  providerValues = [2],
  consumerOns = [1],
  consumerValues = [1],
  nativeMaximum = providerOns.reduce(
    (total, on, index) => total + on * providerValues[index],
    0,
  ),
  nativeCurrent = consumerOns.reduce(
    (total, on, index) => total + on * consumerValues[index],
    0,
  ),
  unlimited = false,
  consumerFuel = false,
  managedProviders = providerOns.map(() => true),
  managedConsumers = consumerOns.map(() => true),
  crossGroup = false,
  frozenFuelDependency = false,
} = {}) {
  const type = "quasar";
  const providerIds = ["nav_beacon", "red_university"];
  const consumerIds = ["vr_center", "garage"];
  const providerKey = `spc_home:${providerIds[0]}`;
  const providers = providerOns.map((_, index) =>
    structure({
      entryKey: `spc_home:${providerIds[index]}`,
      region: "space",
      sector: "spc_home",
      struct: providerIds[index],
      actionId: `space-${providerIds[index]}`,
      support: 1,
      supportFor: { [type]: providerValues[index] },
      supportTypes: type,
      ...(frozenFuelDependency && index === 0
        ? { fuel: [{ resourceId: "MissingFuel", amount: 1 }] }
        : {}),
      ...(crossGroup && index === 0
        ? {
            supportTypes: [type, "nova"],
            supportFor: { [type]: providerValues[index], nova: 1 },
          }
        : {}),
    }),
  );
  const consumers = consumerOns.map((_, index) =>
    structure({
      entryKey: `spc_home:${consumerIds[index]}`,
      region: "space",
      sector: "spc_home",
      struct: consumerIds[index],
      actionId: `space-${consumerIds[index]}`,
      powered: 1,
      support: -consumerValues[index],
      supportTypes: type,
      supportFuel: consumerFuel
        ? [{ resourceId: "Oil", amount: 1 }]
        : undefined,
      supportTopology: {
        anchorEntryKey: providerKey,
        unlimited,
        enabled: { kind: "value", value: true },
      },
    }),
  );
  const sampleStructures = [...providers, ...consumers];
  if (crossGroup) {
    sampleStructures.push(
      structure({
        entryKey: "spc_home:moon_anchor",
        region: "space",
        sector: "spc_home",
        struct: "moon_anchor",
        actionId: "space-moon_anchor",
        support: 1,
        supportTypes: "nova",
      }),
      structure({
        entryKey: "spc_home:red_member",
        region: "space",
        sector: "spc_home",
        struct: "red_member",
        actionId: "space-red_member",
        powered: 1,
        support: -3,
        supportTypes: "nova",
        supportTopology: {
          anchorEntryKey: providerKey,
          unlimited: false,
          enabled: { kind: "value", value: true },
        },
      }),
    );
  }
  const unrelated = structure({
    entryKey: "city:consumer",
    region: "city",
    sector: "city",
    struct: "consumer",
    actionId: "city-bank",
    powered: 5,
  });
  sampleStructures.push(unrelated);
  const space = { ...root.space };
  sampleStructures.forEach((item, index) => {
    space[item.struct] = {
      count: 10,
      on:
        index < providers.length
          ? providerOns[index]
          : (consumerOns[index - providers.length] ?? 1),
      ...(index === 0 ? { s_max: nativeMaximum, support: nativeCurrent } : {}),
    };
  });
  const sampleRoot = {
    ...root,
    city: { ...root.city, consumer: { count: 2, on: 0 } },
    space,
    power: [...consumers.map((item) => item.entryKey), unrelated.entryKey],
    support: {
      [type]: consumers.map((item) => item.entryKey),
      ...(crossGroup ? { nova: ["spc_home:red_member"] } : {}),
    },
  };
  const sampleSettings = Object.fromEntries(
    sampleStructures.map((item, index) => [
      `bld_s_${item.actionId}`,
      index === sampleStructures.length - 1
        ? true
        : index < providers.length
          ? managedProviders[index]
          : (managedConsumers[index - providers.length] ?? true),
    ]),
  );
  return createCapturedPowerReader({
    ...readerDependencies,
    rootState: { readRoot: () => sampleRoot },
    mechanics: createMechanics({
      structures: sampleStructures,
      productionBreakdown: { production: {}, consumption: {} },
    }),
    resources: createResources(sampleRoot),
    readSettingsRaw: () => sampleSettings,
  }).readCycle();
}
const coherentSupport = sampleSupportCoherence();
assert.ok(coherentSupport);
assert.deepEqual(
  coherentSupport.buildings.map((building) => building.binding).sort(),
  ["city-bank", "space-nav_beacon", "space-vr_center"],
  "all coherent support participants and unrelated Power remain managed",
);
assert.ok(
  planPowerCycle(coherentSupport, EMPTY_POWER_AUTOMATION_STATE).decision,
  "a reconciled native group proceeds into planning",
);
function assertFrozenSupport(options, message) {
  const sample = sampleSupportCoherence(options);
  assert.ok(sample, message);
  assert.deepEqual(
    sample.buildings.map((building) => building.binding),
    ["city-bank"],
    message,
  );
  assert.ok(
    planPowerCycle(
      sample,
      EMPTY_POWER_AUTOMATION_STATE,
    ).decision?.operations.some(
      (operation) =>
        operation.kind === "adjust-building" &&
        operation.binding === "city-bank" &&
        operation.amount > 0,
    ),
    "unrelated Power still adjusts its ordinary building",
  );
}
function assertManagedSupportSurvivesUnmanaged(
  options,
  expectedBindings,
  message,
) {
  const sample = sampleSupportCoherence(options);
  assert.ok(sample, message);
  assert.deepEqual(
    sample.buildings.map((building) => building.binding).sort(),
    expectedBindings,
    message,
  );
}
assertFrozenSupport(
  { managedProviders: [false], managedConsumers: [false], nativeMaximum: 2 },
  "a nonzero native group with no managed participants remains background state",
);
assertManagedSupportSurvivesUnmanaged(
  { managedProviders: [false] },
  ["city-bank", "space-vr_center"],
  "an unmanaged provider participates in coherent native support without being managed",
);
assertManagedSupportSurvivesUnmanaged(
  { managedConsumers: [false] },
  ["city-bank", "space-nav_beacon"],
  "an unmanaged consumer participates in coherent native support without being managed",
);
assertFrozenSupport(
  {
    managedProviders: [false],
    managedConsumers: [false],
    frozenFuelDependency: true,
  },
  "an unmanaged provider's unavailable fuel resource does not block Power",
);
assertFrozenSupport(
  { providerOns: [10], nativeMaximum: 10 },
  "five effective providers cannot be rewound as ten configured providers",
);
assertFrozenSupport(
  { consumerOns: [10], nativeCurrent: 3 },
  "three active consumers cannot be rewound as ten configured consumers",
);
assertFrozenSupport(
  { providerOns: [10], nativeMaximum: 15 },
  "raw support_for output is not presumed to include the infiltrator factor",
);
assertFrozenSupport(
  { consumerOns: [10], nativeCurrent: 3, consumerFuel: true },
  "support-fuel shortages cannot fabricate free support",
);
assertFrozenSupport(
  { crossGroup: true, nativeCurrent: 3 },
  "removing a cross-group participant forces the second group to be rechecked",
);
assert.ok(
  sampleSupportCoherence({
    providerOns: [2, 3],
    providerValues: [2, 4],
  }),
  "all providers reconcile to the native capacity",
);
assertFrozenSupport(
  {
    providerOns: [2, 3],
    providerValues: [2, 4],
    nativeMaximum: 15,
  },
  "a multi-provider group fails closed if one contribution is missing",
);
assert.ok(
  sampleSupportCoherence({ consumerOns: [2, 3], consumerValues: [1, 2] }),
  "all consumers reconcile to native usage",
);
assertFrozenSupport(
  {
    consumerOns: [2, 3],
    consumerValues: [1, 2],
    nativeCurrent: 7,
  },
  "a multi-consumer group fails closed when usage differs",
);
assert.equal(
  sampleSupportCoherence({ unlimited: true })?.supports[0]?.allocation,
  "unconstrained",
  "support_unlimited retains the native allocation semantics",
);
assert.deepEqual(
  sampleSupportCoherence({ providerValues: [3] })?.buildings.find(
    (building) => building.binding === "space-nav_beacon",
  )?.supportChanges,
  [{ type: "quasar", amount: -3 }],
  "a dynamic support_for value and arbitrary native support type reach Power",
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
assert.deepEqual(
  navBeacon.supportChanges,
  [
    { type: "moon", amount: -6 },
    { type: "moon", amount: 2 },
  ],
  "native support_for[moon] provider output and support() consumer demand are both captured",
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
assert.deepEqual(
  redSupportConsumerInput.supportChanges,
  [{ type: "red", amount: 3 }],
  "an inactive support consumer retains its per-type consumption semantics",
);
assert.deepEqual(
  [
    cycle.supports.find((support) => support.type === "moon")?.current,
    cycle.supports.find((support) => support.type === "moon")?.maximum,
    cycle.supports.find((support) => support.type === "moon")?.available,
  ],
  [0, 0, 0],
  "support resources read s_max, support use, and available rate from live root state",
);
const newSupportAnchor = structure({
  entryKey: "spc_new:quasar_anchor",
  region: "space",
  sector: "spc_new",
  struct: "quasar_anchor",
  actionId: "space-quasar_anchor",
  supportTypes: ["quasar", "nova"],
  support: 5,
});
const newSupportConsumer = structure({
  entryKey: "spc_new:quasar_consumer",
  region: "space",
  sector: "spc_new",
  struct: "quasar_consumer",
  actionId: "space-quasar_consumer",
  supportTypes: ["quasar", "nova"],
  support: -2,
  supportFor: { nova: -3 },
  supportTopology: {
    anchorEntryKey: newSupportAnchor.entryKey,
    unlimited: false,
    enabled: { kind: "value", value: true },
  },
});
const newSupportRoot = {
  space: {
    quasar_anchor: { count: 1, on: 1, support: 4, s_max: 12 },
    quasar_consumer: { count: 1, on: 0 },
  },
  support: {
    quasar: [newSupportConsumer.entryKey],
    nova: [newSupportConsumer.entryKey],
  },
};
assert.deepEqual(
  readNativePowerSupports(
    newSupportRoot,
    createMechanics({ structures: [newSupportAnchor, newSupportConsumer] }),
    [newSupportAnchor, newSupportConsumer],
  )?.map(({ type, available }) => [type, available]),
  [
    ["quasar", 8],
    ["nova", 8],
  ],
  "new multi-support types use native topology and root anchor without a type catalogue",
);
assert.ok(
  cycle.buildings
    .find((building) => building.binding === "space-propellant_depot")
    ?.consumptions.some(
      (consumption) =>
        consumption.resourceId === "Oil" &&
        consumption.currentTotal === 0 &&
        consumption.enableRate === 4,
    ),
  "the adjusted game fuel rate is separate from the raw p_fuel amount",
);
assert.ok(
  cycle.buildings
    .find((building) => building.binding === "interstellar-cargo_yard")
    ?.consumptions.some(
      (consumption) =>
        consumption.resourceId === "Helium_3" &&
        consumption.currentTotal === 0 &&
        consumption.enableRate === 7.5,
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
  ].map((consumption) => [consumption?.currentTotal, consumption?.enableRate]),
  [
    [0, null],
    [0, null],
    [0, null],
  ],
  "an active fallback without a native row cannot justify an increase; shared ship fuel has no per-ship authority",
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

// DeadSpace src/main.js at 6cc9ba8 draws the Powered citizens from the species population and
// raises that whole draw to 125% while Discharge is active. `race.powered: 1` interpolates the
// native `traits.powered.vars()[0]` value 0.2, and rank 1.5 interpolates 0.125.
function poweredRaceRoot(population, race = {}, cityPower = 15) {
  const resources = { ...root.resource };
  if (population === null) delete resources.Human;
  else if (population !== undefined)
    resources.Human = { ...root.resource.Human, ...population };
  return {
    ...root,
    city: { ...root.city, power: cityPower },
    race: { ...root.race, powered: 1, ...race },
    resource: resources,
  };
}
const poweredReserve = (population, race) =>
  readCapturedPoweredPopulationReserve(poweredRaceRoot(population, race));
const growth = { amount: 10, max: 20 };

assert.equal(
  poweredReserve(growth),
  2,
  "without Discharge the reserve is the population headroom times the native Powered value",
);
for (const [label, discharge] of [
  ["a missing field", {}],
  ["an inactive zero counter", { discharge: 0 }],
  ["a spent negative counter", { discharge: -3 }],
  ["an absent flag", { discharge: false }],
]) {
  assert.equal(
    poweredReserve(growth, discharge),
    2,
    `Discharge ${label} takes the ordinary Powered branch`,
  );
}
assert.equal(
  poweredReserve(growth, { discharge: 4 }),
  2.5,
  "an active Discharge reserves the 125% full-population draw of 5 less the current draw of 2.5",
);
assert.equal(
  poweredReserve({ amount: 1, max: 2 }, { powered: 1.5, discharge: 1 }),
  0.157,
  "Discharge rounds each population draw separately, so 0.313 - 0.156 is not 0.15625",
);
assert.notEqual(
  poweredReserve({ amount: 1, max: 2 }, { powered: 1.5, discharge: 1 }),
  +(1 * 0.125 * 1.25).toFixed(3),
  "the reserve is not a separately rounded per-citizen approximation",
);
assert.equal(
  poweredReserve(null),
  0,
  "a Powered race without an initialized population resource reserves nothing",
);
for (const [label, discharge] of [
  ["a numeric string", { discharge: "3" }],
  ["a NaN counter", { discharge: Number.NaN }],
  ["an infinite counter", { discharge: Number.POSITIVE_INFINITY }],
  ["a boolean flag", { discharge: true }],
]) {
  assert.equal(
    poweredReserve(growth, discharge),
    undefined,
    `malformed Discharge state ${label} cannot fabricate a reserve`,
  );
}
assert.equal(
  poweredReserve({ amount: -1, max: 20 }),
  undefined,
  "a negative current population cannot fabricate a reserve",
);
assert.equal(
  poweredReserve({ amount: 10, max: -1 }),
  Number.MAX_SAFE_INTEGER * 0.2 - 2,
  "an uncapped population maximum keeps its sentinel headroom",
);
function poweredCycle(population, race, cityPower) {
  const sampleRoot = poweredRaceRoot(population, race, cityPower);
  return createCapturedPowerReader({
    ...readerDependencies,
    rootState: { readRoot: () => sampleRoot },
    resources: createResources(sampleRoot),
  }).readCycle();
}
const poweredSample = poweredCycle(growth, { discharge: 7 }, 1234.5);
assert.equal(
  poweredSample.resources.find((resource) => resource.id === "Power")
    ?.currentQuantity,
  1234.5,
  "synthetic Power current quantity stays the captured native value under a Powered race",
);
assert.equal(
  poweredSample.resources.find((resource) => resource.id === "Power")
    ?.maxQuantity,
  cycle.resources.find((resource) => resource.id === "Power").maxQuantity + 2.5,
  "the future Powered reserve affects only synthetic Power capacity",
);
const malformedDischargeReader = (() => {
  const sampleRoot = poweredRaceRoot(growth, { discharge: "3" });
  return createCapturedPowerReader({
    ...readerDependencies,
    rootState: { readRoot: () => sampleRoot },
    resources: createResources(sampleRoot),
  });
})();
assert.equal(
  malformedDischargeReader.readCycle(),
  undefined,
  "a malformed Discharge counter makes the Power sample unavailable",
);
assert.equal(
  malformedDischargeReader.readUnavailableReason()?.authority,
  "resources",
  "the unavailable authority names the resource snapshot",
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
  { production: {}, consumption: { Oil: { Trade: -4, Decay: -0.005 } } },
  {
    present: true,
    unlocked: true,
    amount: 60,
    max: 100,
    rateOfChange: -3,
    storageRatio: 0.6,
  },
  "Decay",
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
const changedNativeDecay = readCapturedPowerOrdinaryResourceState(
  { race: { decay: true } },
  "Oil",
  {},
  demandSample(),
  { production: {}, consumption: { Oil: { Decay: -0.025 } } },
  {
    present: true,
    unlocked: true,
    amount: 60,
    max: 100,
    rateOfChange: 0,
    storageRatio: 0.6,
  },
  "Decay",
);
assert.equal(
  changedNativeDecay?.rateOfChange,
  0.025,
  "Power follows the native decay ledger when the game's ratio changes",
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

const fleetSettings = {
  ...settings,
  autoFleet: true,
  "bld_s2_galaxy-cruiser_ship": true,
};
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
const truepathRoot = { ...root, race: { ...root.race, truepath: 1 } };
const truepathFleetReader = createCapturedPowerReader({
  rootState: { readRoot: () => truepathRoot },
  mechanics: createMechanics(),
  controls: fakeControls,
  resources,
  readDemand: () => EMPTY_DEMAND_SAMPLE,
  readFleetNeededShips: () => null,
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
assert.ok(
  truepathFleetReader.readCycle(),
  "not-applicable Galaxy Fleet must not block True Path Power",
);
const missingFleetReader = createCapturedPowerReader({
  rootState: { readRoot: () => root },
  mechanics: createMechanics(),
  controls: fakeControls,
  resources,
  readDemand: () => EMPTY_DEMAND_SAMPLE,
  readFleetNeededShips: () => undefined,
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
assert.ok(
  missingFleetReader.readCycle(),
  "ordinary Galaxy without a smart Fleet cap continues when neededShips is unavailable",
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
const unavailableFuelCycle = unavailableReader.readCycle();
assert.ok(unavailableFuelCycle);
assert.equal(
  unavailableFuelCycle.buildings
    .find((building) => building.binding === "space-propellant_depot")
    ?.consumptions.find((consumption) => consumption.resourceId === "Oil")
    ?.enableRate,
  null,
  "an absent adjusted-fuel observation freezes only that enable capability",
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
assert.deepEqual(badOrderReader.readUnavailableReason(), {
  authority: "native-order",
  message: "native Power/support order unavailable",
});

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
  missingSupportCycle?.supports.find((support) => support.type === "moon")
    ?.unlocked,
  false,
  "a lazily absent support anchor remains locked instead of falling back to global.resource",
);
assert.equal(
  missingSupportCycle?.supports.find((support) => support.type === "moon")
    ?.maximum,
  0,
);

const stationKey = "spc_belt:space_station";
const gatewayKey = "gxy_home:ship_dock";
const overseerKey = "tau_home:overseer";
let overseerNativeValue = 13;
let funNativeValue = 17;
let pitNativeWorkers = 8;
const lakeAnchorKey = "prtl_lake:harbor";
const spireAnchorKey = "prtl_spire:purifier";
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
    support: `${sector}:${struct}` === anchorEntryKey ? 1 : -1,
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
const specialIridiumShip = spireStructure(
  "space",
  "spc_belt",
  "iridium_ship",
  "space-iridium_ship",
  "belt",
  stationKey,
);
const specialIronShip = spireStructure(
  "space",
  "spc_belt",
  "iron_ship",
  "space-iron_ship",
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
  { value: () => overseerNativeValue },
);
const specialWomlingFun = spireStructure(
  "tauceti",
  "tau_home",
  "womling_fun",
  "tauceti-womling_fun",
  "tau_red",
  overseerKey,
  { value: () => funNativeValue },
);
const specialMiningPit = structure({
  entryKey: "tau_home:mining_pit",
  region: "tauceti",
  sector: "tau_home",
  struct: "mining_pit",
  actionId: "tauceti-mining_pit",
  powered: -1,
  workers: () => pitNativeWorkers,
});
const specialWomlingFarm = structure({
  entryKey: "tau_home:womling_farm",
  region: "tauceti",
  sector: "tau_home",
  struct: "womling_farm",
  actionId: "tauceti-womling_farm",
  powered: -1,
});
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
    powered: -1,
    entryKey: "city:hospital",
    region: "city",
    sector: "city",
    struct: "hospital",
    actionId: "city-hospital",
  }),
  structure({
    powered: -1,
    entryKey: "city:banquet",
    region: "city",
    sector: "city",
    struct: "banquet",
    actionId: "city-banquet",
  }),
  specialStation,
  specialEleriumShip,
  specialIridiumShip,
  specialIronShip,
  structure({
    entryKey: "space:lander",
    region: "space",
    sector: "space",
    struct: "lander",
    actionId: "space-lander",
    powered: -10,
  }),
  structure({
    powered: -1,
    entryKey: "space:fob",
    region: "space",
    sector: "space",
    struct: "fob",
    actionId: "space-fob",
  }),
  structure({
    powered: -1,
    entryKey: "int_home:ascension_trigger",
    region: "interstellar",
    sector: "int_home",
    struct: "ascension_trigger",
    actionId: "interstellar-ascension_trigger",
  }),
  structure({
    powered: -1,
    entryKey: "galaxy:vitreloy_plant",
    region: "galaxy",
    sector: "gxy_home",
    struct: "vitreloy_plant",
    actionId: "galaxy-vitreloy_plant",
  }),
  structure({
    powered: -1,
    entryKey: "galaxy:armed_miner",
    region: "galaxy",
    sector: "gxy_home",
    struct: "armed_miner",
    actionId: "galaxy-armed_miner",
  }),
  structure({
    powered: -1,
    entryKey: "galaxy:minelayer",
    region: "galaxy",
    sector: "gxy_chthonian",
    struct: "minelayer",
    actionId: "galaxy-minelayer",
    shipRating: 77,
  }),
  structure({
    powered: -1,
    entryKey: "prtl_ruins:guard_post",
    region: "portal",
    sector: "prtl_ruins",
    struct: "guard_post",
    actionId: "portal-guard_post",
  }),
  structure({
    powered: -1,
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
  specialMiningPit,
  specialWomlingFarm,
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
    powered: -1,
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
    space_station: { count: 3, on: 2, s_max: 2, support: 1 },
    elerium_ship: { count: 2, on: 1 },
    iridium_ship: { count: 1, on: 0 },
    iron_ship: { count: 1, on: 0 },
    lander: { count: 1, on: 1 },
    fob: { count: 1, on: 1 },
  },
  interstellar: { ascension_trigger: { count: 1, on: 1 } },
  galaxy: {
    ship_dock: { count: 1, on: 1, s_max: 1, support: 1 },
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
    harbor: { count: 1, on: 1, s_max: 1, support: 3 },
    bireme: { count: 2, on: 1 },
    transport: { count: 3, on: 2 },
    mechbay: {
      count: 2,
      on: 1,
      max: 10,
      bay: 1,
      active: 1,
      scouts: 0,
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
    purifier: {
      count: 4,
      on: 4,
      s_max: 4,
      support: 3,
      supply: 0,
      sup_max: 1000,
      diff: 1,
    },
    spire: { count: 3, type: "sand", progress: 25, status: {}, boss: "snake" },
  },
  tauceti: {
    overseer: { count: 1, on: 1, s_max: 1, support: 1, miners: 6, injured: 2 },
    womling_mine: { count: 1, on: 1, miners: 6 },
    womling_farm: { count: 1, on: 1, farmers: 5 },
    womling_fun: { count: 1, on: 1 },
    mining_pit: { count: 1, on: 1 },
  },
  civic: {
    cement_worker: { workers: 11 },
    miner: { workers: 13 },
    coal_miner: { workers: 17 },
    farmer: { workers: 4 },
    hunter: { workers: 3 },
    space_miner: { workers: 2 },
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
    belt: [
      specialEleriumShip.entryKey,
      specialIridiumShip.entryKey,
      specialIronShip.entryKey,
    ],
    gateway: [specialBologniumShip.entryKey],
    alien2: [],
    tau_red: [specialWomlingFun.entryKey],
    lake: [specialBireme.entryKey, specialTransport.entryKey],
    spire: [
      specialPort.entryKey,
      specialBaseCamp.entryKey,
      specialMechBay.entryKey,
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
let specialGuardRating = 1234;
let specialOnGuardRead = () => {};
const specialJobCounts = new Map([
  ["cement_worker", 11],
  ["miner", 13],
  ["coal_miner", 17],
  ["farmer", 12],
  ["hunter", 7],
  ["archaeologist", 2],
]);
const specialReaderDependencies = {
  rootState: { readRoot: () => specialRoot },
  readJobCounts: () =>
    Object.freeze({
      readCount: (id) =>
        specialJobCounts.get(id) ??
        (Object.hasOwn(specialRoot.civic, id) ? undefined : 0),
    }),
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
        Iridium: { "Minero armado": "4", "Mineros espaciales": "3" },
        Iron: { "Mineros espaciales": "5" },
        Global: { "Mejora global": "20%" },
      },
      consumption: {},
      capacity: { Elerium: { "Estación orbital": "18" } },
    },
    localizedText: {
      job_space_miner: "Mineros espaciales",
      galaxy_vitreloy_plant_bd: "Fábrica de Vitreloy",
      galaxy_armed_miner_bd: "Minero armado",
    },
    guardPostRating: () => {
      specialOnGuardRead();
      return specialGuardRating;
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
};
const specialReader = createCapturedPowerReader(specialReaderDependencies);
const specialCycle = specialReader.readCycle();
assert.ok(
  specialCycle,
  "the complete special-rule fixture yields a captured Power cycle",
);
const lateBeltMaximum = specialRoot.space.space_station.s_max;
const lateMinerWorkers = specialRoot.civic.space_miner.workers;
specialRoot.space.space_station.s_max = 0;
specialRoot.civic.space_miner.workers = 0;
const recoveringBelt = specialReader.readCycle();
assert.equal(
  recoveringBelt?.supports.find(({ type }) => type === "belt")?.maximum,
  2,
  "late Space Miner worker count cannot replace native Belt provider capacity",
);
const effectiveStationMechanics = {
  ...specialReaderDependencies.mechanics,
  readEffectivePowerCount: (_sample, key) =>
    key === stationKey
      ? { kind: "value", value: 1 }
      : specialReaderDependencies.mechanics.readEffectivePowerCount(
          _sample,
          key,
        ),
};
assert.equal(
  readNativePowerSupports(
    specialRoot,
    effectiveStationMechanics,
    specialStructures,
  )?.find(({ type }) => type === "belt")?.maximum,
  1,
  "Belt capacity follows effective native p_on rather than configured station on",
);
assert.ok(
  recoveringBelt?.buildings.some(
    ({ binding }) => binding === "space-space_station",
  ),
  "the required station remains managed while Space Miners recover",
);
specialRoot.space.space_station.s_max = lateBeltMaximum;
specialRoot.civic.space_miner.workers = lateMinerWorkers;
specialRoot.race.alien = { infiltrators: { spc_belt: { space_station: 1 } } };
assert.equal(
  readNativePowerSupports(
    specialRoot,
    specialReaderDependencies.mechanics,
    specialStructures,
  )?.some(({ type }) => type === "belt"),
  false,
  "an infiltrated provider freezes its group without copying the penalty",
);
delete specialRoot.race.alien;
const panelIndependentJobs = createCapturedOrdinaryJobsAutomation({
  rootState: specialReaderDependencies.rootState,
  controls: specialControls,
  readSettings: () => ({ autoJobs: false }),
});
const requiredPowerJobs = [
  "cement_worker",
  "miner",
  "coal_miner",
  "farmer",
  "hunter",
  "archaeologist",
];
assert.equal(
  specialControls.capturedElementIds().some((id) => id.startsWith("civ-")),
  false,
);
const rootCounts = panelIndependentJobs.readJobCounts(
  specialRoot,
  requiredPowerJobs,
);
assert.ok(
  rootCounts,
  "valid root job counts need no Civics controls or Jobs planner settings",
);
assert.deepEqual(
  requiredPowerJobs.map((id) => rootCounts.readCount(id)),
  [11, 13, 17, 12, 7, 2],
);
const realCountPower = createCapturedPowerReader({
  ...specialReaderDependencies,
  readJobCounts: panelIndependentJobs.readJobCounts,
});
const realCountCycle = realCountPower.readCycle();
assert.ok(
  realCountCycle,
  "Power runs with root job counts and no Civics panel",
);
assert.deepEqual(
  [
    realCountCycle.buildings.find(
      (building) => building.binding === "city-mine",
    )?.rule.jobCount,
    realCountCycle.buildings.find(
      (building) => building.binding === "city-cement_plant",
    )?.rule.jobCount,
    realCountCycle.buildings.find(
      (building) => building.binding === "city-mill",
    )?.rule.foodWorkers,
  ],
  [13, 11, 19],
);
const realWorkers = specialRoot.civic.miner.workers;
specialRoot.civic.miner.workers = Number.NaN;
assert.equal(
  realCountPower.readCycle(),
  undefined,
  "malformed requested root workers close Power without Civics controls",
);
specialRoot.civic.miner.workers = realWorkers;
const specialRule = (binding, kind) => {
  const building = specialCycle.buildings.find(
    (entry) => entry.binding === binding,
  );
  assert.equal(
    building?.rule.kind,
    kind,
    `${binding} retains its specialized rule: ${specialCycle.buildings.map((item) => item.binding).join(",")}`,
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
for (const [binding, expected] of [
  ["space-iridium_ship", 3.6],
  ["space-iron_ship", 6],
]) {
  assert.ok(
    Math.abs(
      specialRule(binding, "busy-resource").observation.production - expected,
    ) < 1e-9,
    "all Belt mining ships use the captured Space Miner localization",
  );
}
for (const localized of [
  { kind: "absent" },
  { kind: "value", value: "" },
  { kind: "value", value: 42 },
]) {
  const missingSourceReader = createCapturedPowerReader({
    ...specialReaderDependencies,
    mechanics: {
      ...specialReaderDependencies.mechanics,
      readLocalizedText: (key) =>
        key === "job_space_miner"
          ? localized
          : specialReaderDependencies.mechanics.readLocalizedText(key),
    },
  });
  const missingSourceCycle = missingSourceReader.readCycle();
  assert.ok(missingSourceCycle);
  for (const binding of [
    "space-elerium_ship",
    "space-iridium_ship",
    "space-iron_ship",
  ]) {
    assert.equal(
      missingSourceCycle.buildings.find((entry) => entry.binding === binding)
        ?.rule.kind,
      "unavailable-production",
      "missing Space Miner localization closes only the affected busy policy",
    );
  }
}
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
    tritonRule.wounded,
    tritonRule.highPopulationMultiplier,
    tritonRule.authorityReserve,
  ],
  [4, 4, 50],
  "Triton conservatively reserves currently wounded soldiers using native state",
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
  "Chthonian and native Ruins answers retain all live combat values",
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
    specialRule("tauceti-overseer", "womling-overseer").requiredBuildings,
    specialRule("tauceti-womling_fun", "womling-fun").requiredBuildings,
    specialRule("tauceti-mining_pit", "tau-mining-pit").workersPerPit,
    specialRule("tauceti-womling_farm", "womling-farm").cropPerFarm,
  ],
  [Math.ceil(106 / 13), Math.ceil(113 / 17), 8, 12],
  "Womling caps use native action values and pit workers",
);
for (const [population, expected] of [
  [undefined, 12],
  [1, 16],
  [2, 16],
  [3, 20],
  [4, 20],
]) {
  for (const gene of [undefined, 1]) {
    const root = {
      tech: {
        ...(population === undefined ? {} : { womling_pop: population }),
        ...(gene === undefined ? {} : { womling_gene: gene }),
      },
    };
    assert.equal(readCapturedWomlingFarmFood(root), expected + (gene ? 4 : 0));
  }
}
const currentSpecialRule = (binding) =>
  specialReader
    .readCycle()
    ?.buildings.find((entry) => entry.binding === binding)?.rule;
assert.equal(currentSpecialRule("tauceti-womling_farm")?.cropPerFarm, 12);
specialRoot.tech.womling_pop = 3;
specialRoot.tech.womling_gene = 1;
assert.equal(currentSpecialRule("tauceti-womling_farm")?.cropPerFarm, 24);
delete specialRoot.tech.womling_pop;
delete specialRoot.tech.womling_gene;
for (const [raceFlag, loyaltyBase, moraleBase] of [
  ["womling_friend", 25, 75],
  ["womling_god", 75, 40],
  ["womling_lord", 0, 30],
]) {
  specialRoot.race[raceFlag] = 1;
  assert.equal(
    currentSpecialRule("tauceti-overseer")?.requiredBuildings,
    Math.ceil((100 - loyaltyBase + 6) / 13),
  );
  assert.equal(
    currentSpecialRule("tauceti-womling_fun")?.requiredBuildings,
    Math.ceil((100 - moraleBase + 6 + 5 + 2) / 17),
  );
  delete specialRoot.race[raceFlag];
}
specialRoot.race.humongous = 1;
assert.equal(
  readCapturedHumongousEffectMultiplier(specialRoot),
  3.1500000000000004,
);
assert.equal(
  currentSpecialRule("tauceti-overseer")?.requiredBuildings,
  Math.ceil(106 / (13 * 3.1500000000000004)),
);
assert.equal(
  currentSpecialRule("tauceti-womling_fun")?.requiredBuildings,
  Math.ceil(113 / (17 * 3.1500000000000004)),
);
overseerNativeValue = 26; // Overlord is already in val().
funNativeValue = 34;
assert.equal(
  currentSpecialRule("tauceti-overseer")?.requiredBuildings,
  Math.ceil(106 / (26 * 3.1500000000000004)),
);
assert.equal(
  currentSpecialRule("tauceti-womling_fun")?.requiredBuildings,
  Math.ceil(113 / (34 * 3.1500000000000004)),
);
overseerNativeValue = 7; // Lone Survivor's native val() is used as received.
funNativeValue = 9;
assert.equal(
  currentSpecialRule("tauceti-overseer")?.requiredBuildings,
  Math.ceil(106 / (7 * 3.1500000000000004)),
);
assert.equal(
  currentSpecialRule("tauceti-womling_fun")?.requiredBuildings,
  Math.ceil(113 / (9 * 3.1500000000000004)),
);
delete specialRoot.race.humongous;
overseerNativeValue = 13;
funNativeValue = 17;
for (const invalidValue of [
  undefined,
  0,
  -1,
  Number.NaN,
  Number.POSITIVE_INFINITY,
]) {
  overseerNativeValue = invalidValue;
  assert.equal(specialReader.readCycle(), undefined);
  overseerNativeValue = 13;
  funNativeValue = invalidValue;
  assert.equal(specialReader.readCycle(), undefined);
  funNativeValue = 17;
}
for (const [rank, expected] of [
  [0.1, 2.02],
  [1, 3.1500000000000004],
  [2, 4.4],
]) {
  specialRoot.race.humongous = rank;
  assert.equal(readCapturedHumongousEffectMultiplier(specialRoot), expected);
}
specialRoot.race.humongous = "invalid";
assert.equal(readCapturedHumongousEffectMultiplier(specialRoot), undefined);
assert.equal(specialReader.readCycle(), undefined);
specialRoot.race.humongous = 1;
specialRoot.race.empowered = "invalid";
assert.equal(readCapturedHumongousEffectMultiplier(specialRoot), undefined);
delete specialRoot.race.empowered;
delete specialRoot.race.humongous;
const humongousSlots = Array.from({ length: 96 }, () => false);
const humongousRankRoot = {
  genes: { evolve: 0 },
  race: {
    species: "human",
    strandGenus: ["humanoid"],
    strandSpan: 48,
    geneRecess: 1,
    geneSlots: humongousSlots,
    humongous: 1,
  },
};
assert.equal(
  readCapturedHumongousEffectMultiplier(humongousRankRoot),
  3.1500000000000004,
);
humongousRankRoot.race.empowered = 2;
assert.equal(readCapturedHumongousEffectMultiplier(humongousRankRoot), 3.21);
humongousSlots[12] = { g: "humongous", r: 1 };
assert.equal(
  readCapturedHumongousEffectMultiplier(humongousRankRoot),
  3.1500000000000004,
);
humongousSlots[12] = { g: "adaptable", r: 1 };
assert.equal(readCapturedHumongousEffectMultiplier(humongousRankRoot), 3.21);
humongousRankRoot.race.geneRecess = "invalid";
assert.equal(
  readCapturedHumongousEffectMultiplier(humongousRankRoot),
  undefined,
);
humongousRankRoot.race.geneRecess = 1;
humongousSlots[12] = "invalid";
assert.equal(
  readCapturedHumongousEffectMultiplier(humongousRankRoot),
  undefined,
);
humongousSlots[12] = { r: 1 };
assert.equal(
  readCapturedHumongousEffectMultiplier(humongousRankRoot),
  undefined,
);
humongousSlots[12] = { g: "adaptable", r: 1 };
for (const empowered of [
  -1,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  "invalid",
  3,
]) {
  humongousRankRoot.race.empowered = empowered;
  assert.equal(
    readCapturedHumongousEffectMultiplier(humongousRankRoot),
    undefined,
  );
}
humongousRankRoot.race.empowered = 2;
for (const humongous of [-1, 0.01, 3, Number.NaN, Number.POSITIVE_INFINITY]) {
  humongousRankRoot.race.humongous = humongous;
  assert.equal(
    readCapturedHumongousEffectMultiplier(humongousRankRoot),
    undefined,
  );
}
humongousRankRoot.race.humongous = 1;
specialRoot.race.humongous = 1;
specialRoot.race.empowered = 2;
specialRoot.race.species = "human";
specialRoot.race.strandGenus = ["humanoid"];
specialRoot.race.strandSpan = 48;
specialRoot.race.geneRecess = 1;
specialRoot.race.geneSlots = humongousSlots;
specialRoot.genes = { evolve: 0 };
overseerNativeValue = 16.55;
funNativeValue = 17.8;
assert.equal(currentSpecialRule("tauceti-overseer")?.requiredBuildings, 2);
assert.equal(currentSpecialRule("tauceti-womling_fun")?.requiredBuildings, 2);
humongousSlots[12] = { g: "humongous", r: 1 };
assert.equal(currentSpecialRule("tauceti-overseer")?.requiredBuildings, 3);
assert.equal(currentSpecialRule("tauceti-womling_fun")?.requiredBuildings, 3);
specialRoot.race.geneRecess = "invalid";
assert.equal(specialReader.readCycle(), undefined);
delete specialRoot.race.humongous;
delete specialRoot.race.empowered;
delete specialRoot.race.strandGenus;
delete specialRoot.race.strandSpan;
delete specialRoot.race.geneRecess;
delete specialRoot.race.geneSlots;
delete specialRoot.genes;
specialRoot.race.species = "Human";
overseerNativeValue = 13;
funNativeValue = 17;
for (const workers of [8, 6, 13]) {
  pitNativeWorkers = workers;
  assert.equal(
    readCapturedMiningPitWorkers([specialMiningPit], "tauceti-mining_pit"),
    workers,
  );
  assert.equal(
    currentSpecialRule("tauceti-mining_pit")?.workersPerPit,
    workers,
  );
}
for (const workers of [
  undefined,
  0,
  -1,
  Number.NaN,
  Number.POSITIVE_INFINITY,
]) {
  pitNativeWorkers = workers;
  assert.equal(
    readCapturedMiningPitWorkers([specialMiningPit], "tauceti-mining_pit"),
    undefined,
  );
  assert.equal(specialReader.readCycle(), undefined);
}
assert.equal(readCapturedMiningPitWorkers([], "tauceti-mining_pit"), undefined);
pitNativeWorkers = 8;
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
    specialCycle.spire.available,
    specialCycle.spire.stateBalancingEnabled,
    specialCycle.spire.moneyMaximum,
    specialCycle.spire.supplyCurrent,
    specialCycle.spire.supportedSupplyCapacity,
    specialCycle.spire.mechQueued,
    specialCycle.spire.purifierQueued,
    specialCycle.spire.purifierDescription,
    specialCycle.spire.expectedSaveSupply,
  ],
  [true, true, 700, 0, 1000, true, true, "Purificador de la torre", false],
  "Spire input captures costs, live queues and description; final-floor state disables supply saving",
);
const spireBindings = ["portal-mechbay", "portal-port", "portal-base_camp"];
const spireAdjustments = (cycle) =>
  planPowerCycle(
    cycle,
    EMPTY_POWER_AUTOMATION_STATE,
  ).decision.operations.filter(
    (operation) =>
      operation.kind === "adjust-building" &&
      spireBindings.includes(operation.binding),
  );
const saveSupplyOperation = (cycle) =>
  planPowerCycle(cycle, EMPTY_POWER_AUTOMATION_STATE).decision.operations.find(
    (operation) => operation.kind === "set-mech-save-supply",
  );
assert.deepEqual(
  spireAdjustments(specialCycle).map((operation) => operation.binding),
  spireBindings,
  "a coherent, fully managed Spire can balance all three consumers",
);
const spireNativeCurrent = specialRoot.portal.purifier.support;
const originalMechActive = specialRoot.portal.mechbay.active;
specialRoot.portal.mechbay.active = 0;
specialSettings.autoPrestige = false;
for (const binding of spireBindings) {
  const key = binding.slice("portal-".length);
  const previousOn = specialRoot.portal[key].on;
  specialRoot.portal[key].on = 0;
  specialRoot.portal.purifier.support = spireNativeCurrent - previousOn;
  specialSettings[`bld_s_${binding}`] = false;
  const cycle = specialReader.readCycle();
  assert.ok(cycle, `${binding} background state leaves Power available`);
  assert.equal(
    cycle.spire.stateBalancingEnabled,
    false,
    `${binding} blocks partial Spire balancing`,
  );
  assert.equal(cycle.spire.available, true);
  assert.equal(saveSupplyOperation(cycle)?.value, true);
  assert.ok(
    spireAdjustments(cycle).every((operation) => operation.binding !== binding),
    `${binding} cannot be adjusted through ordinary or special Power`,
  );
  assert.ok(
    cycle.buildings
      .filter((building) => spireBindings.includes(building.binding))
      .every((building) => building.skipGroup === "none"),
    "the special Spire subgroup stays disabled",
  );
  assert.ok(
    planPowerCycle(
      cycle,
      EMPTY_POWER_AUTOMATION_STATE,
    ).decision.operations.some(
      (operation) =>
        operation.kind === "adjust-building" &&
        operation.binding === "city-cement_plant",
    ),
    "unrelated Power operations continue",
  );
  specialSettings[`bld_s_${binding}`] = true;
  specialRoot.portal[key].on = previousOn;
  specialRoot.portal.purifier.support = spireNativeCurrent;
}
const originalSupplyCapacity = specialRoot.portal.purifier.sup_max;
specialSettings["bld_s2_portal-mechbay"] = false;
specialRoot.portal.purifier.sup_max = 6;
const noSmartMechCycle = specialReader.readCycle();
assert.ok(noSmartMechCycle);
assert.equal(noSmartMechCycle.spire.available, true);
assert.equal(noSmartMechCycle.spire.stateBalancingEnabled, false);
assert.equal(noSmartMechCycle.spire.supportedSupplyCapacity, 6);
assert.equal(saveSupplyOperation(noSmartMechCycle)?.value, false);
assert.ok(
  noSmartMechCycle.buildings.some(
    (building) =>
      building.binding === "portal-mechbay" && building.skipGroup === "none",
  ),
  "a support-safe Mech Bay without smart management uses ordinary Power only",
);
specialSettings["bld_s2_portal-mechbay"] = true;
specialRoot.portal.purifier.support = spireNativeCurrent + 1;
const incoherentSpireCycle = specialReader.readCycle();
assert.ok(incoherentSpireCycle);
assert.equal(incoherentSpireCycle.spire.available, true);
assert.equal(incoherentSpireCycle.spire.stateBalancingEnabled, false);
assert.deepEqual(spireAdjustments(incoherentSpireCycle), []);
assert.equal(saveSupplyOperation(incoherentSpireCycle)?.value, false);
specialRoot.portal.purifier.support = spireNativeCurrent;
const originalMechCount = specialRoot.portal.mechbay.count;
const originalMechOn = specialRoot.portal.mechbay.on;
specialRoot.portal.mechbay.count = 0;
specialRoot.portal.mechbay.on = 0;
specialRoot.portal.purifier.support = spireNativeCurrent - originalMechOn;
specialRoot.portal.purifier.sup_max = 8;
const unbuiltMechCycle = specialReader.readCycle();
assert.ok(unbuiltMechCycle);
assert.equal(unbuiltMechCycle.spire.available, true);
assert.equal(unbuiltMechCycle.spire.stateBalancingEnabled, false);
assert.equal(unbuiltMechCycle.spire.mechQueued, true);
assert.equal(unbuiltMechCycle.spire.autoMech, true);
assert.ok(
  spireAdjustments(unbuiltMechCycle).every(
    (operation) => operation.binding !== "portal-mechbay",
  ),
);
assert.ok(
  unbuiltMechCycle.buildings
    .filter((building) => spireBindings.includes(building.binding))
    .every((building) => building.skipGroup === "none"),
);
assert.equal(saveSupplyOperation(unbuiltMechCycle)?.value, true);
specialRoot.portal.purifier.sup_max = 6;
const lowCapacityCycle = specialReader.readCycle();
assert.ok(lowCapacityCycle);
assert.equal(saveSupplyOperation(lowCapacityCycle)?.value, false);
specialRoot.portal.mechbay.count = originalMechCount;
specialRoot.portal.mechbay.on = originalMechOn;
specialRoot.portal.purifier.support = spireNativeCurrent;
specialRoot.portal.purifier.sup_max = originalSupplyCapacity;
specialRoot.portal.mechbay.active = originalMechActive;
specialSettings.autoPrestige = true;
for (const binding of ["portal-bireme", "portal-transport"]) {
  const key = binding.slice("portal-".length);
  const previousOn = specialRoot.portal[key].on;
  specialRoot.portal[key].on = 0;
  specialRoot.portal.harbor.support -= previousOn;
  specialSettings[`bld_s_${binding}`] = false;
  const cycle = specialReader.readCycle();
  assert.ok(cycle);
  assert.equal(cycle.lake.enabled, false, `${binding} blocks Lake balancing`);
  assert.ok(
    planPowerCycle(
      cycle,
      EMPTY_POWER_AUTOMATION_STATE,
    ).decision.operations.every(
      (operation) =>
        operation.kind !== "adjust-building" || operation.binding !== binding,
    ),
  );
  specialSettings[`bld_s_${binding}`] = true;
  specialRoot.portal.harbor.support += previousOn;
  specialRoot.portal[key].on = previousOn;
}
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
  "Mill combines the canonical Farmer and Hunter counts",
);
specialGuardRating = 777;
specialJobCounts.set("cement_worker", 21);
specialJobCounts.set("miner", 23);
specialJobCounts.set("coal_miner", 27);
specialJobCounts.set("farmer", 30);
specialJobCounts.set("hunter", 4);
specialJobCounts.set("archaeologist", 0);
const changedAuthorityCycle = specialReader.readCycle();
assert.ok(changedAuthorityCycle);
const changedRule = (binding) =>
  changedAuthorityCycle.buildings.find(
    (building) => building.binding === binding,
  )?.rule;
assert.deepEqual(
  [
    changedRule("city-cement_plant").jobCount,
    changedRule("city-mine").jobCount,
    changedRule("city-coal_mine").jobCount,
    changedRule("city-mill").foodWorkers,
    changedRule("portal-guard_post").suppressionUseful,
    changedRule("portal-guard_post").postRating,
  ],
  [21, 23, 27, 34, false, 777],
);
specialJobCounts.delete("farmer");
assert.equal(
  specialReader.readCycle(),
  undefined,
  "an incomplete canonical job snapshot closes the Power cycle",
);
specialJobCounts.set("farmer", 30);
specialJobCounts.set("miner", Number.NaN);
assert.equal(
  specialReader.readCycle(),
  undefined,
  "a malformed canonical count closes the Power cycle",
);
specialJobCounts.set("miner", 23);
const firstGuardHandle = specialHandles.get("portal-guard_post");
specialOnGuardRead = () =>
  specialHandles.set("portal-guard_post", {
    ...firstGuardHandle,
    generation: 2,
  });
assert.equal(
  specialReader.readCycle(),
  undefined,
  "a changed Guard Post control generation closes the Power cycle",
);
specialOnGuardRead = () => {};
specialHandles.set("portal-guard_post", firstGuardHandle);
specialJobCounts.delete("coal_miner");
const absentCoal = specialRoot.civic.coal_miner;
delete specialRoot.civic.coal_miner;
const absentJobCycle = specialReader.readCycle();
assert.equal(
  absentJobCycle?.buildings.find(
    (building) => building.binding === "city-coal_mine",
  )?.rule.jobCount,
  0,
  "a genuinely absent job has zero effective workers",
);
specialRoot.civic.coal_miner = absentCoal;
specialJobCounts.set("coal_miner", 17);
specialJobCounts.set("cement_worker", 11);
specialJobCounts.set("miner", 13);
specialJobCounts.set("farmer", 12);
specialJobCounts.set("hunter", 7);
specialJobCounts.set("archaeologist", 2);
specialGuardRating = 1234;
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
    hiddenPortalCycle.spire.available,
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
  assertSemanticCycle([], 0);
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
