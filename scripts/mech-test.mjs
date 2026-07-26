import assert from "node:assert/strict";

import { createMechAdapter } from "../src/adapters/evolve/combat/mech.ts";
import { runMechAutomation } from "../src/application/mech.ts";
import { planMechCycle } from "../src/domain/combat/mech.ts";
import { createTraceRecorder } from "./test-support/modernization-fixtures.mjs";

const SIZES = ["collector", "small", "medium", "large", "titan"];
const SPACE = { collector: 1, small: 2, medium: 5, large: 10, titan: 25 };
const COST = {
  collector: [0, 10],
  small: [5, 20],
  medium: [20, 50],
  large: [50, 100],
  titan: [100, 200],
};

function createResource(trace, name, current, maximum, rate, spare = current) {
  let amount = current;
  const reserved = current - spare;
  return {
    get currentQuantity() {
      return amount;
    },
    set currentQuantity(value) {
      amount = value;
      trace.stateChange(`${name}-current`, { value });
    },
    maxQuantity: maximum,
    get spareQuantity() {
      return amount - reserved;
    },
    spareMaxQuantity: maximum - reserved,
    rateOfChange: rate,
    get storageRatio() {
      return maximum === 0 ? 0 : amount / maximum;
    },
  };
}

function makeMech(id, size, power, overrides = {}) {
  return {
    id,
    size,
    infernal: false,
    power,
    efficiency: power / SPACE[size],
    chassis: "avian",
    hardpoint: size === "collector" ? [] : ["laser"],
    equip: [],
    ...overrides,
  };
}

function createFixture(scenario = {}) {
  const trace = createTraceRecorder();
  const activeMechs = (scenario.activeMechs ?? []).map((mech) => ({ ...mech }));
  const inactiveMechs = (scenario.inactiveMechs ?? []).map((mech) => ({
    ...mech,
  }));
  const allMechs = [...activeMechs, ...inactiveMechs];
  let isActive = scenario.isActive ?? false;
  let saveSupply = scenario.saveSupply ?? false;
  const bestMech = Object.fromEntries(
    SIZES.map((size) => [
      size,
      makeMech(-1, size, scenario.bestPower?.[size] ?? 100),
    ]),
  );
  const randomDesigns = Object.fromEntries(
    SIZES.map((size) => [
      size,
      makeMech(-2, size, scenario.designPower?.[size] ?? 80),
    ]),
  );
  const manager = {
    Size: SIZES,
    bestMech,
    bestBody: {},
    bestWeapon: [],
    get activeMechs() {
      return activeMechs;
    },
    get inactiveMechs() {
      return inactiveMechs;
    },
    get mechsPower() {
      return activeMechs.reduce((sum, mech) => sum + mech.power, 0);
    },
    get isActive() {
      return isActive;
    },
    set isActive(value) {
      isActive = value;
      trace.stateChange("mech-active", { value });
    },
    get saveSupply() {
      return saveSupply;
    },
    set saveSupply(value) {
      saveSupply = value;
      trace.stateChange("save-supply", { value });
    },
    initLab: () => scenario.initialized ?? true,
    getPreferredSize: () => [
      scenario.preferredSize ?? "medium",
      scenario.forceBuild ?? false,
    ],
    getRandomMech: (size) => ({ ...randomDesigns[size] }),
    getMechStats: (mech) => ({
      power: mech.power ?? scenario.userPower ?? 70,
      efficiency: (mech.power ?? scenario.userPower ?? 70) / SPACE[mech.size],
    }),
    getMechCost(mech) {
      const [gems, supply] = COST[mech.size];
      return [gems, supply, SPACE[mech.size]];
    },
    getMechRefund(mech) {
      const [gems, supply] = COST[mech.size];
      return [Math.floor(gems / 2), Math.floor(supply / 3)];
    },
    getMechSpace: (mech) => SPACE[mech.size],
    getTimeToClear: () => scenario.timeToClear ?? 1_000,
    dragMech(oldId, newId) {
      trace.managerCall("dragMech", { oldId, newId });
      trace.command("drag-mech", { oldId, newId });
    },
    mechDesc(mech) {
      return `${mech.size} ${Math.round((mech.power / bestMech[mech.size].power) * 100)}%`;
    },
    scrapMech(mech) {
      trace.managerCall("scrapMech", { id: mech.id });
      trace.command("scrap-mech", { id: mech.id });
    },
    buildMech(mech) {
      trace.managerCall("buildMech", { size: mech.size, power: mech.power });
      trace.command("build-mech", { size: mech.size, power: mech.power });
    },
  };
  const supply = createResource(
    trace,
    "supply",
    scenario.supplyCurrent ?? 500,
    scenario.supplyMaximum ?? 500,
    scenario.supplyRate ?? 10,
    scenario.supplySpare ?? scenario.supplyCurrent ?? 500,
  );
  const gems = createResource(
    trace,
    "gems",
    scenario.gemsCurrent ?? 500,
    scenario.gemsMaximum ?? 500,
    scenario.gemsRate ?? 10,
    scenario.gemsSpare ?? scenario.gemsCurrent ?? 500,
  );
  const resources = { Supply: supply, Soul_Gem: gems };
  const bayMaximum = scenario.bayMaximum ?? 50;
  const occupied =
    scenario.bayOccupied ??
    allMechs.reduce((sum, mech) => sum + SPACE[mech.size], 0);
  const game = {
    global: {
      race: { warlord: scenario.warlord ?? false },
      portal: {
        mechbay: {
          mechs: allMechs,
          max: bayMaximum,
          bay: occupied,
          scouts:
            scenario.scouts ??
            activeMechs.filter((mech) => mech.size === "small").length,
          blueprint: scenario.blueprint ?? {
            size: "medium",
            power: scenario.userPower ?? 70,
          },
        },
      },
    },
  };
  const settings = {
    mechBaysFirst: scenario.mechBaysFirst ?? false,
    mechBuild: scenario.mechBuild ?? "random",
    mechFillBay: scenario.mechFillBay ?? false,
    autoPrestige: scenario.autoPrestige ?? false,
    prestigeType: scenario.prestigeType ?? "ascension",
    prestigeDemonicFloor: scenario.prestigeDemonicFloor ?? 100,
    mechSaveSupplyRatio: scenario.mechSaveSupplyRatio ?? 0,
    autoBuild: scenario.autoBuild ?? false,
    mechMinSupply: scenario.mechMinSupply ?? 0,
    mechScrap: scenario.mechScrap ?? "none",
    mechScrapEfficiency: scenario.mechScrapEfficiency ?? 1,
    mechScoutsRebuild: scenario.mechScoutsRebuild ?? true,
    mechScouts: scenario.mechScouts ?? 0,
  };
  const affordable = (value) => ({
    isAutoBuildable: () => value,
    isAffordable: () => value,
  });
  const buildings = {
    SpirePurifier: {
      ...affordable(scenario.purifierAffordable ?? false),
      stateOffCount: scenario.purifierOff ?? 0,
    },
    SpireMechBay: affordable(scenario.bayAffordable ?? false),
    SpireTower: { count: scenario.towerCount ?? 0 },
    SpireWaygate: { stateOnCount: scenario.waygateActive ?? 0 },
  };
  const GameLog = {
    logSuccess(id, message, categories) {
      trace.log(id, { message, categories: Array.from(categories) });
    },
  };
  return {
    trace,
    manager,
    game,
    settings,
    resources,
    buildings,
    GameLog,
    haveTask: () => scenario.haveTask ?? false,
    haveTech: () => scenario.haveWaygate ?? false,
    jquery: () => ({ length: scenario.draggingRows ?? 0 }),
  };
}

function createModern(fixture, overrides = {}) {
  return createMechAdapter({
    getMechManager: overrides.getMechManager ?? (() => fixture.manager),
    getGame: overrides.getGame ?? (() => fixture.game),
    getSettings: overrides.getSettings ?? (() => fixture.settings),
    getResources: overrides.getResources ?? (() => fixture.resources),
    getBuildings: overrides.getBuildings ?? (() => fixture.buildings),
    haveTech: overrides.haveTech ?? fixture.haveTech,
    haveTask: overrides.haveTask ?? fixture.haveTask,
    getGameLog: overrides.getGameLog ?? (() => fixture.GameLog),
    getJQuery: overrides.getJQuery ?? (() => fixture.jquery),
  });
}

const unavailableFixture = createFixture({ warlord: true });
const unavailable = createModern(unavailableFixture).reader.readCycle();
assert.equal(planMechCycle(unavailable), null);
assert.ok(Object.isFrozen(unavailable));

const malformed = createFixture();
malformed.settings.mechFillBay = "yes";
assert.throws(
  () => runMechAutomation(createModern(malformed)),
  /settings\.mechFillBay must be a boolean/,
);

const staleFixture = createFixture();
let staleManager = staleFixture.manager;
const staleAutomation = createModern(staleFixture, {
  getMechManager: () => staleManager,
});
const cycle = planMechCycle(staleAutomation.reader.readCycle());
staleManager = {};
assert.equal(staleAutomation.executor.prepare(cycle).status, "stale");

// A distant Soul Gem reservation may be spent by a mech when the current
// quantity covers the cost, but a near-term reservation remains a hard gate.
const distantReservation = createFixture({
  mechBuild: "user",
  blueprint: { size: "small", power: 70 },
  gemsCurrent: 41,
  gemsSpare: -209,
  gemsRate: 0.01,
});
runMechAutomation(createModern(distantReservation));
assert.deepEqual(
  distantReservation.trace
    .snapshot()
    .filter((entry) => entry.category === "command")
    .map((entry) => entry.name),
  ["build-mech"],
);

const nearReservation = createFixture({
  mechBuild: "user",
  blueprint: { size: "small", power: 70 },
  gemsCurrent: 41,
  gemsSpare: 0,
  gemsRate: 0.02,
});
runMechAutomation(createModern(nearReservation));
assert.deepEqual(
  nearReservation.trace
    .snapshot()
    .filter((entry) => entry.category === "command")
    .map((entry) => entry.name),
  [],
);

console.log(
  "Mech domain and validated Evolve adapter/application tests passed",
);
