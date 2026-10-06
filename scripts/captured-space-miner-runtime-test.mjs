import assert from "node:assert/strict";
import { runCapturedPhaseOrderCycle } from "./captured-phase-order-fixture.mjs";
import { element } from "./dom-fixture.mjs";

globalThis.__EA_TEST_SURFACE_ENABLED__ = true;

const value = (value) => ({ kind: "value", value });
const absent = () => ({ kind: "absent" });
const ship = {
  entryKey: "spc_belt:elerium_ship",
  region: "space",
  sector: "spc_belt",
  struct: "elerium_ship",
  actionId: "space-elerium_ship",
  ownsPowered: true,
  readAvailability: () => value(true),
  readTitle: () => value("Elerium Ship"),
  readDescription: () => value("Elerium Ship"),
  readValue: absent,
  readWorkers: absent,
  readShipRating: absent,
  readPowered: () => value(1),
  readPowerGridRole: () => value("consumer"),
  readSwitchable: absent,
  readPowerRequirements: absent,
  readFuel: absent,
  readFuelAdjustmentRequested: absent,
  readSupport: () => value(-2),
  readSupportTypes: () => value(["belt"]),
  readSupportValue: () => value(1),
  readSupportProvider: absent,
  readSupportTopology: () =>
    value({
      anchorEntryKey: "spc_belt:space_station",
      unlimited: false,
      enabled: value(true),
    }),
  readNativeSupportGrids: () =>
    value([
      {
        type: "belt",
        contribution: -2,
        consumer: true,
        provider: false,
        topology: {
          anchorEntryKey: "spc_belt:space_station",
          unlimited: false,
          enabled: value(true),
        },
      },
    ]),
  readSupportFuel: absent,
  readSupportFuelAdjustmentDisabled: absent,
  readPowerLimit: absent,
  readPowerBalancer: absent,
};
const station = {
  ...ship,
  entryKey: "spc_belt:space_station",
  struct: "space_station",
  actionId: "space-space_station",
  readPowered: () => value(0),
  readPowerGridRole: () => value("none"),
  readSupport: () => value(3),
  readSupportValue: () => value(3),
  readNativeSupportGrids: () =>
    value([
      {
        type: "belt",
        contribution: 3,
        consumer: false,
        provider: true,
        topology: {
          anchorEntryKey: null,
          unlimited: false,
          enabled: value(true),
        },
      },
    ]),
};
const iron = {
  ...ship,
  entryKey: "spc_belt:iron_ship",
  struct: "iron_ship",
  actionId: "space-iron_ship",
  readTitle: () => value("Iron Ship"),
  readSupport: () => value(-1),
  readNativeSupportGrids: () =>
    value([
      {
        type: "belt",
        contribution: -1,
        consumer: true,
        provider: false,
        topology: {
          anchorEntryKey: station.entryKey,
          unlimited: false,
          enabled: value(true),
        },
      },
    ]),
};

function runMinerBootstrap({
  autoJobs = true,
  staleJobs = false,
  replaceBeforePower = false,
  starved = false,
} = {}) {
  const root = {
    settings: { civTabs: 1, spaceTabs: 0, showResearch: true, showSpace: true },
    race: {},
    tech: { high_tech: 2 },
    stats: {},
    city: { power: 10, powered: true },
    space: {
      elerium_ship: { count: 1, on: 0 },
      space_station: { count: 1, on: 1, support: 3, s_max: starved ? 0 : 3 },
      iridium_ship: { count: 0, on: 0 },
      iron_ship: { count: 3, on: 3 },
    },
    civic: {
      d_job: "unemployed",
      unemployed: {
        job: "unemployed",
        assigned: starved ? 8 : 5,
        workers: starved ? 8 : 5,
        max: -1,
        display: true,
      },
      space_miner: {
        job: "space_miner",
        assigned: starved ? 0 : 3,
        workers: starved ? 0 : 3,
        max: 8,
        display: true,
      },
    },
    queue: { display: false, pause: false, queue: [] },
    resource: {
      Population: { amount: 8, max: 20, diff: 0, display: true },
      Power: { amount: 10, max: 10, diff: 10, display: true },
      Elerium: { amount: 100, max: 200, diff: 0, display: true },
      Iron: { amount: 0, max: 200, diff: 3, display: true },
    },
    support: { belt: [ship.entryKey] },
    power: [ship.entryKey],
  };
  const snapshots = [];
  const afterCycles = [];
  let replaceRoot = () => {};
  const hooks = {
    observePowerDemandPhase(stage) {
      if (stage === "power-handoff-start" && replaceBeforePower)
        replaceRoot(structuredClone(root));
      if (stage === "power-ready")
        snapshots.push({
          workers: root.civic.space_miner.workers,
          lateMaximum: root.space.space_station.s_max,
          handoff: hooks.readSpaceMinerHandoff(),
          power: hooks.readPowerCycle(),
        });
    },
  };
  const run = runCapturedPhaseOrderCycle({
    root,
    cycles: autoJobs && !staleJobs && !replaceBeforePower ? 2 : 1,
    mount: true,
    controlSetup: (control) => {
      replaceRoot = control.replaceRoot;
    },
    afterCycle: () =>
      afterCycles.push({
        workers: root.civic.space_miner.workers,
        shipOn: root.space.elerium_ship.on,
      }),
    settingsHostWindow: { __EA_TEST_HOOKS__: hooks },
    settings: {
      autoJobs,
      autoPower: true,
      job_unemployed: true,
      job_space_miner: true,
      job_p_space_miner: 0,
      job_p_unemployed: 999,
      job_s_space_miner: true,
      job_b1_space_miner: 5,
      job_b2_space_miner: 5,
      job_b3_space_miner: 5,
      job_b1_unemployed: -1,
      job_b2_unemployed: -1,
      job_b3_unemployed: -1,
      "bld_s_space-elerium_ship": true,
      "bld_p_space-elerium_ship": 1,
      "bld_s_space-space_station": true,
      "bld_p_space-space_station": 0,
      "bld_s_space-iron_ship": true,
      "bld_p_space-iron_ship": 2,
    },
    documentSetup: ({ body }) => body.append(element("div", { id: "tech" })),
    mechanics: {
      readStructures: () => [ship, station, iron],
      readPowerOrder: () => value([station, iron, ship]),
      readSupportOrder: (_root, type) =>
        value(type === "belt" ? [iron, ship] : []),
      readEffectivePowerCount: (sample, key) =>
        value(sample.space[key.split(":")[1]]?.on ?? 0),
      // Native support_on is the count the support pass actually served; the live 0/5 case has a
      // consumer configured on and effectively zero, so the default here follows the root's own
      // `supportOn` map when a scenario supplies one.
      readEffectiveSupportCount: (sample, key) => {
        const struct = key.split(":")[1];
        const configured = sample.space[struct]?.on;
        const effective = sample.space.supportOn?.[struct] ?? configured;
        return Number.isSafeInteger(effective) &&
          effective >= 0 &&
          effective <= configured
          ? value(effective)
          : { kind: "invalid" };
      },
      readProductionBreakdown: () => ({
        production: { Iron: { "Space Miner": 3 } },
        consumption: {},
      }),
      readLocalizedText: (key) =>
        key === "job_space_miner" ? value("Space Miner") : absent(),
      readAdjustedFuelFactor: () => value(1),
      readGuardPostRating: () => value(0),
      adjustPower(
        _root,
        entryKey,
        expected,
        target,
        _coherent,
        dryRun = false,
      ) {
        const state =
          entryKey === ship.entryKey
            ? root.space.elerium_ship
            : entryKey === iron.entryKey
              ? root.space.iron_ship
              : root.space.space_station;
        if (state.on !== expected) return value(false);
        if (!dryRun) {
          state.on = target;
          if (entryKey === ship.entryKey) {
            root.space.space_station.support =
              root.space.iron_ship.on + target * 2;
            root.space.space_station.s_max = root.space.space_station.support;
          }
        }
        return value(true);
      },
    },
    controls: {
      "#mainColumn div.content": {
        methods: {
          swapTab(index) {
            root.settings.civTabs = index;
          },
        },
      },
      mTabCivil: {
        methods: {
          swapTab(index) {
            root.settings.spaceTabs = index;
          },
        },
      },
      "civ-unemployed": {
        methods: {
          add() {
            root.civic.unemployed.workers++;
            root.civic.unemployed.assigned++;
          },
          sub() {
            if (staleJobs) throw new Error("stale Jobs control");
            root.civic.unemployed.workers--;
            root.civic.unemployed.assigned--;
          },
          setDefault(id) {
            if (staleJobs) root.civic.space_miner.workers++;
            root.civic.d_job = id;
          },
        },
      },
      "civ-space_miner": {
        methods: {
          add() {
            root.civic.space_miner.workers++;
            root.civic.space_miner.assigned++;
          },
          sub() {
            root.civic.space_miner.workers--;
            root.civic.space_miner.assigned--;
          },
          setDefault(id) {
            root.civic.d_job = id;
          },
        },
      },
      "space-elerium_ship": {
        methods: {
          power_on() {
            root.space.elerium_ship.on++;
          },
          power_off() {
            root.space.elerium_ship.on--;
          },
        },
      },
    },
  });
  return { run, snapshots, afterCycles, root };
}

const bootstrap = runMinerBootstrap();
assert.equal(
  bootstrap.snapshots.length,
  2,
  JSON.stringify(bootstrap.run.errors),
);
assert.equal(bootstrap.snapshots[0].workers, 3);
assert.equal(bootstrap.snapshots[0].handoff, 5);
assert.equal(bootstrap.snapshots[0].power.cycle.prospectiveSpaceMiners, 5);
assert.ok(
  bootstrap.snapshots[0].power.plan.decision.operations.some(
    (operation) =>
      operation.kind === "adjust-building" &&
      operation.binding === "space-elerium_ship" &&
      operation.amount === 1,
  ),
);
assert.deepEqual(bootstrap.afterCycles, [
  { workers: 3, shipOn: 1 },
  { workers: 5, shipOn: 1 },
]);
assert.equal(bootstrap.snapshots[1].workers, 5);
assert.equal(bootstrap.snapshots[1].power.cycle.prospectiveSpaceMiners, 5);
assert.deepEqual(bootstrap.run.errors, []);

const starvedBootstrap = runMinerBootstrap({ starved: true });
assert.equal(starvedBootstrap.snapshots[0].lateMaximum, 0);
assert.ok(
  starvedBootstrap.snapshots[0].workers > 0,
  "Jobs starts recovering workers from an initial zero pool before Power",
);
assert.equal(
  starvedBootstrap.snapshots[0].power.cycle.supports.find(
    ({ type }) => type === "belt",
  )?.maximum,
  3,
);
assert.ok(
  starvedBootstrap.snapshots[0].power.plan.decision.operations.some(
    ({ kind, binding, amount }) =>
      kind === "adjust-building" &&
      binding === "space-elerium_ship" &&
      amount === 1,
  ),
  "Jobs to Power can reserve a mining ship while the late worker-owned s_max is zero",
);
assert.ok(
  starvedBootstrap.afterCycles[1].workers > 0,
  "the next Jobs phase recovers actual Space Miners",
);

const stale = runMinerBootstrap({ staleJobs: true });
assert.equal(stale.root.civic.space_miner.workers, 4);
assert.equal(stale.snapshots[0].handoff, undefined);
assert.equal(stale.snapshots[0].power.cycle.prospectiveSpaceMiners, undefined);
assert.equal(stale.root.space.elerium_ship.on, 0);

const replaced = runMinerBootstrap({ replaceBeforePower: true });
assert.equal(replaced.snapshots[0].handoff, undefined);

const disabled = runMinerBootstrap({ autoJobs: false });
assert.equal(disabled.snapshots[0].handoff, undefined);
assert.equal(disabled.snapshots[0].power.cycle.prospectiveSpaceMiners, null);
assert.equal(disabled.root.space.elerium_ship.on, 0);

console.log("captured Space Miner runtime bootstrap passed");
