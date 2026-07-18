import assert from "node:assert/strict";

import { createMechAdapter } from "../src/adapters/evolve/mech.ts";
import { runMechAutomation } from "../src/application/mech.ts";
import { createAutoMech } from "./test-support/legacy-auto-mech.ts";
import { planMechCycle } from "../src/domain/mech.ts";
import {
  assertEquivalentTraces,
  createTraceRecorder,
} from "./test-support/modernization-fixtures.mjs";

const SIZES = ["collector", "small", "medium", "large", "titan"];
const SPACE = { collector: 1, small: 2, medium: 5, large: 10, titan: 25 };
const COST = {
  collector: [0, 10],
  small: [5, 20],
  medium: [20, 50],
  large: [50, 100],
  titan: [100, 200],
};

function createResource(trace, name, current, maximum, rate) {
  let amount = current;
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
      return amount;
    },
    spareMaxQuantity: maximum,
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
  );
  const gems = createResource(
    trace,
    "gems",
    scenario.gemsCurrent ?? 500,
    scenario.gemsMaximum ?? 500,
    scenario.gemsRate ?? 10,
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

function runLegacy(scenario) {
  const fixture = createFixture(scenario);
  createAutoMech({
    getMechManager: () => fixture.manager,
    getGame: () => fixture.game,
    getSettings: () => fixture.settings,
    getResources: () => fixture.resources,
    getBuildings: () => fixture.buildings,
    getHaveTech: () => fixture.haveTech,
    getHaveTask: () => fixture.haveTask,
    average: (values) =>
      values.reduce((sum, value) => sum + value, 0) / values.length,
    GameLog: fixture.GameLog,
    getJQuery: () => fixture.jquery,
  })();
  return fixture.trace.snapshot();
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

function runModern(scenario) {
  const fixture = createFixture(scenario);
  runMechAutomation(createModern(fixture));
  return fixture.trace.snapshot();
}

const scenarios = [
  { name: "warlord challenge gate", warlord: true },
  { name: "lab unavailable", initialized: false },
  { name: "drag in progress", draggingRows: 1 },
  {
    name: "disabled bay improves active order",
    activeMechs: [makeMech(0, "small", 10), makeMech(1, "medium", 50)],
    inactiveMechs: [makeMech(2, "small", 30)],
  },
  {
    name: "governor task only clears flags",
    isActive: true,
    saveSupply: true,
    mechBaysFirst: true,
    haveTask: true,
  },
  { name: "building disabled only clears flags", mechBuild: "none" },
  { name: "random mech build", preferredSize: "medium", isActive: true },
  { name: "user blueprint build", mechBuild: "user", userPower: 75 },
  { name: "insufficient supply capacity", supplyMaximum: 40 },
  {
    name: "save supply for floor clear",
    supplyCurrent: 100,
    supplyMaximum: 500,
    mechSaveSupplyRatio: 1,
    timeToClear: 10,
  },
  {
    name: "scrap one weak mech then replace",
    activeMechs: [makeMech(0, "medium", 10)],
    bayMaximum: 5,
    mechScrap: "single",
    mechScrapEfficiency: 0,
    supplyCurrent: 40,
    gemsCurrent: 15,
  },
  {
    name: "fill remaining bay with smaller design",
    preferredSize: "large",
    bayMaximum: 5,
    mechFillBay: true,
  },
  {
    name: "mixed mode keeps full bay during waygate fight",
    activeMechs: [makeMech(0, "medium", 10)],
    bayMaximum: 5,
    mechScrap: "mixed",
    waygateActive: 1,
    mechScrapEfficiency: 0,
  },
];

for (const scenario of scenarios) {
  assertEquivalentTraces({
    legacy: runLegacy(scenario),
    modern: runModern(scenario),
    label: `mech ${scenario.name}`,
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

console.log(
  `Mech domain, validated Evolve adapter/application, and parity tests passed (${scenarios.length} dual-run scenarios)`,
);
