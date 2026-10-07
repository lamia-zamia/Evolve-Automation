import assert from "node:assert/strict";
import { runCapturedPhaseOrderCycle } from "../../support/fixtures/captured-phase-order-fixture.mjs";
import { element } from "../../support/fixtures/dom-fixture.mjs";

globalThis.__EA_TEST_SURFACE_ENABLED__ = true;

const value = (value) => ({ kind: "value", value });
const absent = () => ({ kind: "absent" });
const invalid = () => ({ kind: "invalid" });
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
  readPowered: () => value(0),
  readPowerGridRole: invalid,
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
  readTitle: () => value("Space Station"),
  readPowered: () => value(3),
  readPowerGridRole: () => value("consumer"),
  readSupport: () => value(3),
  readSupportTypes: () => value(["belt"]),
  readSupportValue: () => value(3),
  readSupportFuel: () => value([{ resourceId: "Helium_3", amount: 2.5 }]),
  readSupportFuelAdjustmentDisabled: () => value(true),
  readNativeSupportGrids: () =>
    value([
      {
        type: "belt",
        contribution: 3,
        consumer: false,
        provider: true,
        topology: {
          anchorEntryKey: "spc_belt:space_station",
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
  readPowered: () => value(0),
  readPowerGridRole: invalid,
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
  liveStarvation = false,
  configuredStationOn = false,
  productionFaithful = false,
  nativeSupportReady = false,
  workerProfile = undefined,
  insufficientPower = false,
  insufficientFuel = false,
  eleriumFull = false,
  insufficientWorkers = false,
  shipAutoState = true,
  shipSmart = true,
  shipPriority = 1,
  ironCount = productionFaithful ? 1 : 3,
  ironOn = productionFaithful ? 1 : 3,
  ironAutoState = !liveStarvation,
  ironPriority = 2,
  spaceMinerEnabled = true,
  spaceMinerSmart = true,
  autoCraftsmen = false,
} = {}) {
  const jobWorkers =
    workerProfile ??
    (insufficientWorkers
      ? { unemployed: 0, farmer: 0, scientist: 0, space_miner: 1 }
      : { unemployed: 10, farmer: 4, scientist: 3, space_miner: 1 });
  const root = {
    settings: { civTabs: 1, spaceTabs: 0, showResearch: true, showSpace: true },
    race: {},
    tech: { high_tech: 2 },
    stats: {},
    city: {
      power: insufficientPower ? 0 : 10,
      powered: !insufficientPower,
      ...(autoCraftsmen
        ? {
            foundry: {
              Plywood: 2,
              Brick: 2,
              crafting: 4,
              cap: 4,
              rcap: {},
            },
          }
        : {}),
    },
    space: {
      ...(liveStarvation || productionFaithful
        ? {
            pOn: { space_station: nativeSupportReady ? 1 : 0 },
            supportOn: {
              elerium_ship: 0,
              iron_ship: nativeSupportReady ? ironOn : 0,
            },
          }
        : {}),
      elerium_ship: { count: 1, on: 0 },
      space_station: {
        count: liveStarvation ? 5 : 1,
        on: liveStarvation ? (configuredStationOn ? 5 : 0) : 1,
        support: nativeSupportReady
          ? ironOn
          : liveStarvation || productionFaithful
            ? 0
            : 3,
      },
      iridium_ship: { count: 0, on: 0 },
      iron_ship: {
        count: ironCount,
        on: ironOn,
      },
    },
    civic: {
      d_job: "unemployed",
      unemployed: {
        job: "unemployed",
        assigned: productionFaithful ? jobWorkers.unemployed : starved ? 8 : 5,
        workers: productionFaithful ? jobWorkers.unemployed : starved ? 8 : 5,
        max: -1,
        display: true,
      },
      ...(productionFaithful
        ? {
            farmer: {
              job: "farmer",
              assigned: jobWorkers.farmer,
              workers: jobWorkers.farmer,
              max: -1,
              display: true,
            },
            scientist: {
              job: "scientist",
              assigned: jobWorkers.scientist,
              workers: jobWorkers.scientist,
              max: -1,
              display: true,
            },
          }
        : {}),
      space_miner: {
        job: "space_miner",
        assigned: productionFaithful ? 1 : starved ? 0 : 3,
        workers: productionFaithful ? 1 : starved ? 0 : 3,
        max: productionFaithful ? 18 : 8,
        display: true,
      },
      ...(autoCraftsmen ? { craftsman: { workers: 4, max: 4 } } : {}),
    },
    queue: { display: false, pause: false, queue: [] },
    resource: {
      Population: {
        amount: productionFaithful
          ? insufficientWorkers
            ? 1
            : autoCraftsmen
              ? 22
              : 18
          : 8,
        max: productionFaithful ? 18 : 20,
        diff: 0,
        display: true,
      },
      Power: {
        amount: insufficientPower ? 0 : 10,
        max: 10,
        diff: insufficientPower ? 0 : 10,
        display: true,
      },
      Elerium: {
        amount: eleriumFull ? 200 : 100,
        max: 200,
        diff: 0,
        display: true,
      },
      Iron: { amount: 0, max: 200, diff: 3, display: true },
      Food: {
        amount: productionFaithful ? 130 : 100,
        max: 200,
        diff: 10,
        display: true,
      },
      Helium_3: {
        amount: insufficientFuel ? 0 : 100,
        max: 200,
        diff: insufficientFuel ? 0 : 10,
        display: true,
      },
      ...(autoCraftsmen
        ? {
            Plywood: { amount: 100, max: 200, diff: 0, display: true },
            Brick: { amount: 100, max: 200, diff: 0, display: true },
          }
        : {}),
    },
    support: { belt: [iron.entryKey, ship.entryKey] },
    power: [station.entryKey],
  };
  const snapshots = [];
  const afterCycles = [];
  const jobsExecutions = [];
  const spaceMinerDecisions = [];
  const capturedStation =
    productionFaithful && nativeSupportReady
      ? {
          ...station,
          readSupportTypes: absent,
          readNativeSupportGrids: () => value([]),
        }
      : station;
  let replaceRoot = () => {};
  const hooks = {
    observeJobsAutomation(phase, outcome) {
      jobsExecutions.push({
        phase,
        status: outcome.status,
        failure: outcome.failure,
      });
    },
    observeSpaceMinerDecision(maximum) {
      spaceMinerDecisions.push(maximum);
    },
    observePowerDemandPhase(stage) {
      if (stage === "power-handoff-start" && replaceBeforePower)
        replaceRoot(structuredClone(root));
      if (stage === "power-ready") {
        const power = hooks.readPowerCycle();
        const belt = power?.cycle.supports.find(({ type }) => type === "belt");
        const elerium = power?.cycle.resources.find(
          ({ id }) => id === "Elerium",
        );
        const powerResource = power?.cycle.resources.find(
          ({ id }) => id === "Power",
        );
        const helium3 = power?.cycle.resources.find(
          ({ id }) => id === "Helium_3",
        );
        const plannedTarget = (binding, current) => {
          const operation = power?.plan.decision?.operations.find(
            (candidate) =>
              candidate.kind === "adjust-building" &&
              candidate.binding === binding,
          );
          return operation?.kind === "adjust-building"
            ? operation.expectedStateOn + operation.amount
            : current;
        };
        const stationTarget = plannedTarget(
          "space-space_station",
          root.space.space_station.on,
        );
        const eleriumTarget = plannedTarget(
          "space-elerium_ship",
          root.space.elerium_ship.on,
        );
        const ironTarget = plannedTarget(
          "space-iron_ship",
          root.space.iron_ship.on,
        );
        snapshots.push({
          workers: root.civic.space_miner.workers,
          assigned: root.civic.space_miner.assigned,
          spaceMinerMaximum: root.civic.space_miner.max,
          stationCount: root.space.space_station.count,
          stationOn: root.space.space_station.on,
          stationEffective: root.space.pOn?.space_station ?? null,
          stationSupport: root.space.space_station.support,
          ironOn: root.space.iron_ship.on,
          ironEffective: root.space.supportOn?.iron_ship ?? null,
          eleriumShipCount: root.space.elerium_ship.count,
          eleriumConfiguredOn: root.space.elerium_ship.on,
          eleriumEffective: root.space.supportOn?.elerium_ship ?? null,
          handoff: hooks.readSpaceMinerHandoff(),
          decisionMaximum: spaceMinerDecisions.at(-1),
          jobsOutcome: jobsExecutions.at(-1),
          eleriumUseful: elerium?.useful,
          eleriumStorageRatio: elerium?.storageRatio,
          powerQuantity: powerResource?.currentQuantity,
          helium3Quantity: helium3?.currentQuantity,
          beltCurrentSupport: belt?.current,
          beltNativeMaximum: belt?.maximum,
          beltProspectiveSupport: power?.plan.beltProspectiveMaximum,
          plannedStationTarget: stationTarget,
          plannedEleriumTarget: eleriumTarget,
          plannedIronTarget: ironTarget,
          power,
        });
      }
    },
  };
  const run = runCapturedPhaseOrderCycle({
    root,
    cycles:
      autoJobs && !staleJobs && !replaceBeforePower && !insufficientWorkers
        ? 2
        : 1,
    mount: true,
    controlSetup: (control) => {
      replaceRoot = control.replaceRoot;
    },
    afterCycle: () => {
      if (liveStarvation || productionFaithful) {
        const stationEffective =
          insufficientPower || insufficientFuel
            ? 0
            : root.space.space_station.on;
        root.space.pOn.space_station = stationEffective;
        const effectiveCapacity =
          stationEffective * station.readSupportValue("belt").value;
        let used = 0;
        for (const [struct, supportPerUnit] of [
          ["iron_ship", 1],
          ["elerium_ship", 2],
        ]) {
          const configured = root.space[struct].on;
          const effective = Math.min(
            configured,
            Math.max(
              0,
              Math.floor((effectiveCapacity - used) / supportPerUnit),
            ),
          );
          root.space.supportOn[struct] = effective;
          used += effective * supportPerUnit;
        }
        root.space.space_station.support = used;
      }
      afterCycles.push({
        workers: root.civic.space_miner.workers,
        shipOn: root.space.elerium_ship.on,
        ...(liveStarvation || productionFaithful
          ? {
              stationOn: root.space.space_station.on,
              stationEffective: root.space.pOn.space_station,
              beltUsed: root.space.space_station.support,
              ironEffective: root.space.supportOn.iron_ship,
              eleriumEffective: root.space.supportOn.elerium_ship,
            }
          : {}),
      });
    },
    settingsHostWindow: { __EA_TEST_HOOKS__: hooks },
    settings: {
      autoJobs,
      autoCraftsmen,
      autoPower: true,
      job_unemployed: true,
      job_space_miner: spaceMinerEnabled,
      ...(productionFaithful
        ? {
            job_farmer: true,
            job_scientist: true,
            job_s_farmer: true,
            job_s_scientist: false,
            job_b1_farmer: 4,
            job_b2_farmer: 4,
            job_b3_farmer: 4,
            job_b1_scientist: 3,
            job_b2_scientist: 6,
            job_b3_scientist: 0,
            job_b1_space_miner: 1,
            job_b2_space_miner: 3,
            job_b3_space_miner: -1,
          }
        : {}),
      job_s_space_miner: spaceMinerSmart,
      ...(!productionFaithful
        ? {
            job_b1_space_miner: 1,
            job_b2_space_miner: 3,
            job_b3_space_miner: -1,
            job_b1_unemployed: 0,
            job_b2_unemployed: 0,
            job_b3_unemployed: -1,
          }
        : {
            job_b1_unemployed: 0,
            job_b2_unemployed: 0,
            job_b3_unemployed: -1,
          }),
      "bld_s_space-elerium_ship": shipAutoState,
      "bld_s2_space-elerium_ship": shipSmart,
      "bld_p_space-elerium_ship":
        productionFaithful && (!shipSmart || eleriumFull) ? 0 : shipPriority,
      "bld_s_space-space_station": true,
      "bld_s2_space-space_station": true,
      "bld_p_space-space_station": 0,
      "bld_s_space-iron_ship": ironAutoState,
      "bld_s2_space-iron_ship": ironAutoState,
      "bld_p_space-iron_ship": ironPriority,
    },
    documentSetup: ({ body }) => body.append(element("div", { id: "tech" })),
    mechanics: {
      readStructures: () => [ship, capturedStation, iron],
      readStructureIdentities: () =>
        [ship, capturedStation, iron].map(
          ({ entryKey, region, sector, struct, actionId }) => ({
            entryKey,
            region,
            sector,
            struct,
            actionId,
          }),
        ),
      readPowerOrder: () => value([capturedStation]),
      readSupportOrder: (sample, type) =>
        value(
          type === "belt"
            ? sample.support.belt.flatMap((key) =>
                key === iron.entryKey
                  ? [iron]
                  : key === ship.entryKey
                    ? [ship]
                    : [],
              )
            : [],
        ),
      readEffectivePowerCount: (sample, key) =>
        value(
          sample.space.pOn?.[key.split(":")[1]] ??
            sample.space[key.split(":")[1]]?.on ??
            0,
        ),
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
      readEffectLocalizedNumericInputs: (entryKey, localizationKey) =>
        entryKey === station.entryKey &&
        localizationKey === "space_belt_station_effect4"
          ? value([1])
          : { kind: "absent" },
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
      ...(productionFaithful
        ? {
            "civ-farmer": {
              methods: {
                add() {
                  root.civic.farmer.workers++;
                  root.civic.farmer.assigned++;
                },
                sub() {
                  root.civic.farmer.workers--;
                  root.civic.farmer.assigned--;
                },
                setDefault(id) {
                  root.civic.d_job = id;
                },
              },
            },
            "civ-scientist": {
              methods: {
                add() {
                  root.civic.scientist.workers++;
                  root.civic.scientist.assigned++;
                },
                sub() {
                  root.civic.scientist.workers--;
                  root.civic.scientist.assigned--;
                },
                setDefault(id) {
                  root.civic.d_job = id;
                },
              },
            },
          }
        : {}),
      ...(autoCraftsmen
        ? {
            foundry: {
              methods: {
                add(id) {
                  root.city.foundry[id]++;
                  root.city.foundry.crafting++;
                  root.civic.craftsman.workers++;
                  root.civic[root.civic.d_job].workers--;
                },
                sub(id) {
                  root.city.foundry[id]--;
                  root.city.foundry.crafting--;
                  root.civic.craftsman.workers--;
                  root.civic[root.civic.d_job].workers++;
                },
              },
            },
          }
        : {}),
    },
  });
  return { run, snapshots, afterCycles, root };
}

// Live bootstrap: one effectively served Iron ship caps actual workers at one, while the same Jobs
// policy can support three if only that ship-derived smart cap is removed.
const productionBootstrap = runMinerBootstrap({
  productionFaithful: true,
  nativeSupportReady: true,
  workerProfile: { unemployed: 0, farmer: 10, scientist: 7, space_miner: 1 },
});
const productionSnapshot = productionBootstrap.snapshots[0];
assert.ok(productionSnapshot);
assert.equal(productionSnapshot.assigned, 1);
assert.equal(productionSnapshot.spaceMinerMaximum, 18);
assert.equal(productionSnapshot.eleriumShipCount, 1);
assert.equal(productionSnapshot.eleriumConfiguredOn, 0);
assert.equal(productionSnapshot.eleriumEffective, 0);
assert.equal(
  productionSnapshot.workers,
  1,
  JSON.stringify({
    productionSnapshot,
    jobs: productionBootstrap.root.civic,
    afterCycle: productionBootstrap.afterCycles[0],
    errors: productionBootstrap.run.errors,
  }),
);
assert.equal(productionSnapshot.stationCount, 1);
assert.equal(productionSnapshot.stationOn, 1);
assert.equal(productionSnapshot.stationEffective, 1);
assert.equal(productionSnapshot.stationSupport, 1);
assert.equal(productionSnapshot.ironOn, 1);
assert.equal(productionSnapshot.ironEffective, 1);
assert.ok(
  productionSnapshot.handoff >= 3,
  "one configured Iron ship needs a three-miner prospective handoff under catalog job order",
);
assert.ok(
  productionSnapshot.plannedEleriumTarget >= 1,
  "Power must use the prospective worker handoff to plan the next useful Belt ship",
);
assert.equal(productionSnapshot.jobsOutcome?.phase, "autoJobs");
assert.equal(productionSnapshot.jobsOutcome?.status, "succeeded");
assert.ok(productionSnapshot.decisionMaximum >= 3);
assert.equal(productionSnapshot.powerQuantity, 10);
assert.equal(productionSnapshot.helium3Quantity, 100);
assert.equal(productionSnapshot.eleriumUseful, true);
assert.equal(productionSnapshot.eleriumStorageRatio, 0.5);
assert.equal(productionSnapshot.beltCurrentSupport, 1);
assert.equal(productionSnapshot.beltNativeMaximum, 3);
assert.equal(
  productionSnapshot.power.cycle.prospectiveSpaceMiners,
  productionSnapshot.handoff,
);
const productionEleriumShip = productionSnapshot.power.cycle.buildings.find(
  ({ binding }) => binding === "space-elerium_ship",
);
assert.ok(
  productionEleriumShip,
  "an inactive zero-watt Belt consumer remains available to prospective Power planning",
);
assert.equal(productionEleriumShip.stateOn, 0);
assert.equal(productionEleriumShip.powered, 0);
assert.equal(productionEleriumShip.autoStateManaged, true);
assert.ok(
  productionEleriumShip.supportChanges.some(
    ({ type, amount }) => type === "belt" && amount === 2,
  ),
);
assert.ok(productionSnapshot.beltProspectiveSupport >= 3);
assert.ok(productionSnapshot.plannedStationTarget >= 1);
assert.equal(
  productionBootstrap.afterCycles[0].eleriumEffective,
  1,
  JSON.stringify(productionBootstrap.afterCycles[0]),
);
assert.ok(
  productionBootstrap.afterCycles[1].workers >= 3,
  JSON.stringify({
    afterCycles: productionBootstrap.afterCycles,
    jobs: productionBootstrap.root.civic,
  }),
);

const livePriorityBootstrap = runMinerBootstrap({
  productionFaithful: true,
  nativeSupportReady: true,
  workerProfile: { unemployed: 0, farmer: 10, scientist: 7, space_miner: 3 },
  ironCount: 3,
  ironOn: 3,
  spaceMinerEnabled: true,
  spaceMinerSmart: true,
});
const livePrioritySnapshot = livePriorityBootstrap.snapshots[0];
assert.ok(livePrioritySnapshot);
assert.equal(livePrioritySnapshot.workers, 3);
assert.equal(livePrioritySnapshot.spaceMinerMaximum, 18);
assert.equal(livePrioritySnapshot.stationCount, 1);
assert.equal(livePrioritySnapshot.stationOn, 1);
assert.equal(livePrioritySnapshot.stationEffective, 1);
assert.equal(livePrioritySnapshot.ironOn, 3);
assert.equal(livePrioritySnapshot.ironEffective, 3);
assert.equal(livePrioritySnapshot.eleriumConfiguredOn, 0);
assert.equal(livePrioritySnapshot.eleriumEffective, 0);
assert.ok(livePrioritySnapshot.power.cycle.prospectiveSpaceMiners >= 3);
assert.equal(livePrioritySnapshot.beltProspectiveSupport, 3);
assert.equal(livePrioritySnapshot.powerQuantity, 10);
assert.equal(livePrioritySnapshot.helium3Quantity, 100);
assert.equal(livePrioritySnapshot.eleriumUseful, true);
assert.deepEqual(
  livePriorityBootstrap.root.support.belt,
  [iron.entryKey, ship.entryKey],
  "native Belt support order deliberately puts Iron before Elerium",
);
const livePriorityBuildings = livePrioritySnapshot.power.cycle.buildings.map(
  ({ binding }) => binding,
);
assert.ok(
  livePriorityBuildings.indexOf("space-elerium_ship") <
    livePriorityBuildings.indexOf("space-iron_ship"),
  "managed Power decisions follow Elerium's higher bld_p priority over native Belt order",
);
const liveEleriumShip = livePrioritySnapshot.power.cycle.buildings.find(
  ({ binding }) => binding === "space-elerium_ship",
);
const liveIronShip = livePrioritySnapshot.power.cycle.buildings.find(
  ({ binding }) => binding === "space-iron_ship",
);
const liveStation = livePrioritySnapshot.power.cycle.buildings.find(
  ({ binding }) => binding === "space-space_station",
);
assert.equal(liveEleriumShip?.autoStateManaged, true);
assert.equal(liveEleriumShip?.smartEnabled, true);
assert.equal(liveIronShip?.autoStateManaged, true);
assert.equal(liveIronShip?.smartEnabled, true);
assert.equal(liveIronShip?.rule.kind, "busy-resource");
assert.equal(
  liveIronShip?.rule.kind === "busy-resource"
    ? liveIronShip.rule.observation.useful
    : false,
  true,
);
assert.equal(liveStation?.rule.kind, "belt-space-station");
assert.equal(
  liveStation?.rule.kind === "belt-space-station"
    ? liveStation.rule.beltSupportPerStation
    : undefined,
  3,
);
const plannedAdjustment = (snapshot, binding) =>
  snapshot.power.plan.decision?.operations.find(
    (operation) =>
      operation.kind === "adjust-building" && operation.binding === binding,
  );
assert.deepEqual(
  [
    plannedAdjustment(livePrioritySnapshot, "space-elerium_ship")
      ?.expectedStateOn,
    plannedAdjustment(livePrioritySnapshot, "space-elerium_ship")?.amount,
    plannedAdjustment(livePrioritySnapshot, "space-iron_ship")?.expectedStateOn,
    plannedAdjustment(livePrioritySnapshot, "space-iron_ship")?.amount,
  ],
  [0, 1, 3, -2],
  "Elerium gets two Belt support and Iron gives up two for a total of three",
);
assert.equal(livePriorityBootstrap.afterCycles[0].eleriumEffective, 1);
assert.equal(livePriorityBootstrap.afterCycles[0].ironEffective, 1);
assert.equal(livePriorityBootstrap.afterCycles[0].workers, 3);
assert.deepEqual(livePriorityBootstrap.root.power, [station.entryKey]);
assert.deepEqual(
  livePriorityBootstrap.root.support.belt,
  [iron.entryKey, ship.entryKey],
  "Power planning leaves native support order intact after refresh",
);

const reversedPriorityBootstrap = runMinerBootstrap({
  productionFaithful: true,
  nativeSupportReady: true,
  workerProfile: { unemployed: 0, farmer: 10, scientist: 7, space_miner: 3 },
  ironCount: 3,
  ironOn: 3,
  shipPriority: 2,
  ironPriority: 1,
});
const reversedPrioritySnapshot = reversedPriorityBootstrap.snapshots[0];
assert.ok(reversedPrioritySnapshot);
assert.ok(
  reversedPrioritySnapshot.power.cycle.buildings.findIndex(
    ({ binding }) => binding === "space-iron_ship",
  ) <
    reversedPrioritySnapshot.power.cycle.buildings.findIndex(
      ({ binding }) => binding === "space-elerium_ship",
    ),
  "reversing bld_p priorities reverses managed Power processing order",
);
assert.equal(reversedPrioritySnapshot.plannedIronTarget, 3);
assert.equal(reversedPrioritySnapshot.plannedEleriumTarget, 0);
assert.equal(reversedPriorityBootstrap.afterCycles[0].ironEffective, 3);
assert.equal(reversedPriorityBootstrap.afterCycles[0].eleriumEffective, 0);

const unmanagedIronBootstrap = runMinerBootstrap({
  productionFaithful: true,
  nativeSupportReady: true,
  workerProfile: { unemployed: 0, farmer: 10, scientist: 7, space_miner: 3 },
  ironCount: 3,
  ironOn: 3,
  ironAutoState: false,
  shipPriority: 0,
  ironPriority: 1,
});
const unmanagedIronSnapshot = unmanagedIronBootstrap.snapshots[0];
assert.ok(unmanagedIronSnapshot);
assert.equal(
  unmanagedIronSnapshot.power.cycle.buildings.some(
    ({ binding }) => binding === "space-iron_ship",
  ),
  false,
);
assert.equal(
  unmanagedIronSnapshot.power.cycle.beltConsumers.find(
    ({ binding }) => binding === "space-iron_ship",
  )?.managed,
  false,
);
assert.equal(unmanagedIronSnapshot.plannedIronTarget, 3);
assert.equal(
  unmanagedIronSnapshot.plannedEleriumTarget,
  0,
  "higher-priority Elerium cannot reserve support from unmanaged Iron",
);
assert.equal(unmanagedIronBootstrap.afterCycles[0].ironEffective, 3);
assert.equal(unmanagedIronBootstrap.afterCycles[0].eleriumEffective, 0);

const starvedBootstrap = runMinerBootstrap({ starved: true });
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
assert.equal(
  starvedBootstrap.snapshots[0].plannedEleriumTarget,
  1,
  "the recovered three-miner Belt capacity follows configured building priority",
);
assert.ok(
  starvedBootstrap.afterCycles[1].workers > 0,
  "the next Jobs phase recovers actual Space Miners",
);

const liveStarvationBootstrap = runMinerBootstrap({
  liveStarvation: true,
  productionFaithful: true,
  autoJobs: false,
});
const liveStarvationSnapshot = liveStarvationBootstrap.snapshots[0];
assert.ok(liveStarvationSnapshot);
assert.equal(liveStarvationSnapshot.stationCount, 5);
assert.equal(liveStarvationSnapshot.stationOn, 0);
assert.equal(liveStarvationSnapshot.stationEffective, 0);
assert.equal(liveStarvationSnapshot.stationSupport, 0);
assert.equal(liveStarvationSnapshot.ironOn, 1);
assert.equal(liveStarvationSnapshot.ironEffective, 0);
assert.equal(
  liveStarvationSnapshot.power.cycle.resources.find(({ id }) => id === "Power")
    ?.currentQuantity,
  10,
);
assert.equal(
  liveStarvationSnapshot.power.cycle.resources.find(({ id }) => id === "Food")
    ?.currentQuantity,
  130,
);
assert.equal(
  liveStarvationSnapshot.power.cycle.resources.find(
    ({ id }) => id === "Helium_3",
  )?.currentQuantity,
  100,
);
assert.equal(
  liveStarvationSnapshot.power.cycle.supports.find(
    ({ type }) => type === "belt",
  )?.maximum,
  0,
);
assert.equal(
  liveStarvationSnapshot.power.cycle.supports.find(
    ({ type }) => type === "belt",
  )?.current,
  0,
);
assert.deepEqual(
  liveStarvationSnapshot.power.cycle.beltConsumers,
  [
    {
      binding: "space-elerium_ship",
      configured: 0,
      supportPerUnit: 2,
      managed: true,
    },
    {
      binding: "space-iron_ship",
      configured: 1,
      supportPerUnit: 1,
      managed: false,
    },
  ],
  "the full Belt grid includes the unmanaged configured miner",
);
assert.ok(
  liveStarvationSnapshot.power.cycle.buildings.some(
    ({ binding }) => binding === "space-space_station",
  ),
  "the configured Space Station stays in the managed Power set",
);
assert.ok(
  liveStarvationSnapshot.power.plan.decision.operations.some(
    ({ kind, binding, amount }) =>
      kind === "adjust-building" &&
      binding === "space-space_station" &&
      amount === 1,
  ),
  "a disabled Station is raised to cover the configured Iron ship with the current one-miner ceiling",
);
assert.ok(
  liveStarvationBootstrap.afterCycles[0].ironEffective === 1 &&
    liveStarvationBootstrap.afterCycles[0].eleriumEffective === 0,
  "native support refresh restores only the already staffed Iron ship",
);
assert.equal(liveStarvationSnapshot.plannedEleriumTarget, 0);

const fullElerium = runMinerBootstrap({
  productionFaithful: true,
  nativeSupportReady: true,
  eleriumFull: true,
});
assert.equal(fullElerium.snapshots[0].eleriumUseful, false);
assert.ok(fullElerium.snapshots[0].eleriumStorageRatio >= 0.99);
assert.equal(fullElerium.snapshots[0].plannedEleriumTarget, 0);

const unmanagedElerium = runMinerBootstrap({
  productionFaithful: true,
  nativeSupportReady: true,
  shipAutoState: false,
  shipSmart: false,
});
assert.equal(unmanagedElerium.snapshots[0].plannedEleriumTarget, 0);

const nonsmartSpaceMiner = runMinerBootstrap({
  productionFaithful: true,
  nativeSupportReady: true,
  spaceMinerEnabled: false,
  spaceMinerSmart: false,
});
assert.equal(
  nonsmartSpaceMiner.snapshots[0].power.cycle.prospectiveSpaceMiners,
  1,
);
assert.equal(
  nonsmartSpaceMiner.snapshots[0].beltProspectiveSupport,
  1,
  JSON.stringify(nonsmartSpaceMiner.snapshots[0]),
);
assert.equal(nonsmartSpaceMiner.snapshots[0].workers, 1);
assert.equal(nonsmartSpaceMiner.snapshots[0].plannedEleriumTarget, 0);

const jobsDisabled = runMinerBootstrap({
  productionFaithful: true,
  nativeSupportReady: true,
  autoJobs: false,
});
assert.equal(jobsDisabled.snapshots[0].power.cycle.prospectiveSpaceMiners, 1);
assert.equal(jobsDisabled.snapshots[0].beltProspectiveSupport, 1);
assert.equal(jobsDisabled.snapshots[0].plannedEleriumTarget, 0);

const powerInsufficient = runMinerBootstrap({
  productionFaithful: true,
  insufficientPower: true,
});
assert.equal(powerInsufficient.snapshots[0].plannedEleriumTarget, 0);

const fuelInsufficient = runMinerBootstrap({
  productionFaithful: true,
  insufficientFuel: true,
});
assert.equal(
  fuelInsufficient.snapshots[0].plannedEleriumTarget,
  0,
  JSON.stringify({
    cycle: fuelInsufficient.snapshots[0].power.cycle,
    operations: fuelInsufficient.snapshots[0].power.plan.decision?.operations,
  }),
);

const workersInsufficient = runMinerBootstrap({
  productionFaithful: true,
  nativeSupportReady: true,
  insufficientWorkers: true,
});
assert.ok(workersInsufficient.snapshots[0].beltProspectiveSupport < 3);
assert.equal(workersInsufficient.snapshots[0].plannedEleriumTarget, 0);

const combinedJobs = runMinerBootstrap({
  productionFaithful: true,
  nativeSupportReady: true,
  autoCraftsmen: true,
  workerProfile: { unemployed: 0, farmer: 10, scientist: 7, space_miner: 1 },
});
assert.equal(
  combinedJobs.snapshots[0].jobsOutcome?.phase,
  "autoJobs with autoCraftsmen",
);
assert.equal(combinedJobs.snapshots[0].jobsOutcome?.status, "succeeded");
assert.ok(combinedJobs.snapshots[0].decisionMaximum >= 3);
assert.ok(combinedJobs.snapshots[0].handoff >= 3);
assert.equal(
  combinedJobs.snapshots[0].decisionMaximum,
  productionSnapshot.decisionMaximum,
);
assert.equal(combinedJobs.snapshots[0].handoff, productionSnapshot.handoff);
assert.ok(combinedJobs.snapshots[0].plannedEleriumTarget >= 1);

const stale = runMinerBootstrap({
  staleJobs: true,
  productionFaithful: true,
  nativeSupportReady: true,
});
assert.equal(stale.root.civic.space_miner.workers, 1);
assert.equal(stale.snapshots[0].jobsOutcome?.phase, "autoJobs");
assert.notEqual(stale.snapshots[0].jobsOutcome?.status, "succeeded");
assert.equal(stale.snapshots[0].handoff, undefined);
assert.equal(stale.snapshots[0].power.cycle.prospectiveSpaceMiners, undefined);
assert.equal(stale.root.space.elerium_ship.on, 0);
assert.equal(stale.snapshots[0].plannedEleriumTarget, 0);
assert.equal(
  stale.run.errors.filter((message) => message.includes("autoJobs")).length,
  1,
  "a rejected Jobs command is reported once through runtime diagnostics",
);

const replaced = runMinerBootstrap({
  replaceBeforePower: true,
  productionFaithful: true,
  nativeSupportReady: true,
});
assert.ok(replaced.snapshots[0].decisionMaximum >= 3);
assert.equal(replaced.snapshots[0].handoff, undefined);
assert.equal(replaced.snapshots[0].power, undefined);
assert.equal(replaced.snapshots[0].plannedEleriumTarget, 0);

console.log("captured Space Miner runtime bootstrap passed");
