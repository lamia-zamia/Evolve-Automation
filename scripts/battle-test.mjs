import assert from "node:assert/strict";

import { createBattleAdapter } from "../src/adapters/evolve/combat/battle.ts";
import { runBattleAutomation } from "../src/application/battle.ts";
import { planBattle, prepareBattle } from "../src/domain/combat/battle.ts";
import { createTraceRecorder } from "./test-support/modernization-fixtures.mjs";

function createForeign(definition = {}, index = 0) {
  return {
    id: definition.id ?? index,
    policy: definition.policy ?? "None",
    released: definition.released ?? false,
    gov: {
      spy: definition.spy ?? 2,
      anx: definition.annexed ?? false,
      buy: definition.purchased ?? false,
      occ: definition.occupied ?? false,
    },
  };
}

function createFixture(scenario = {}) {
  const trace = createTraceRecorder();
  const foreigns = (scenario.foreigns ?? []).map(createForeign);
  const target =
    scenario.target === null
      ? null
      : createForeign(scenario.target ?? { policy: "Raid" }, 0);
  let hellGarrison = scenario.hellGarrison ?? 0;
  const manager = {
    isGarrisonVisible: scenario.garrisonView !== false,
    isHellVisible: scenario.hellView === true,
    maxCityGarrison: scenario.maxCityGarrison ?? 10,
    maxSoldiers: scenario.maxSoldiers ?? 10,
    currentCityGarrison: scenario.currentCityGarrison ?? 10,
    availableGarrison: scenario.availableGarrison ?? 10,
    wounded: scenario.wounded ?? 0,
    deadSoldiers: scenario.deadSoldiers ?? 0,
    hellReservedSoldiers: scenario.hellReservedSoldiers ?? 0,
    hellSoldiers: scenario.hellSoldiers ?? 0,
    hellPatrolSize: scenario.hellPatrolSize ?? 5,
    raid: scenario.raid ?? 0,
    get hellGarrison() {
      return hellGarrison;
    },
    getSoldiersForAdvantage(advantage, tactic, governmentId) {
      trace.managerCall("getSoldiersForAdvantage", {
        advantage,
        tactic,
        governmentId,
      });
      const exact =
        scenario.soldiers?.[`${advantage}:${tactic}:${governmentId}`];
      return exact ?? scenario.soldiersByTactic?.[tactic] ?? 5;
    },
    release(governmentId) {
      trace.managerCall("release", { governmentId });
      trace.command("release-foreign", { governmentId });
      const candidate = [target, ...foreigns].find(
        (entry) => entry?.id === governmentId,
      );
      candidate.gov.anx = false;
      candidate.gov.buy = false;
      candidate.gov.occ = false;
      trace.stateChange("foreign-control", {
        governmentId,
        occupied: false,
        annexed: false,
        purchased: false,
      });
    },
    removeHellPatrol(count) {
      trace.managerCall("removeHellPatrol", { count });
      trace.command("remove-hell-patrol", { count });
      hellGarrison += count * this.hellPatrolSize;
      trace.stateChange("hell-garrison", { soldiers: hellGarrison });
    },
    removeHellGarrison(count) {
      trace.managerCall("removeHellGarrison", { count });
      trace.command("remove-hell-garrison", { count });
      hellGarrison -= count;
      this.currentCityGarrison += count;
      trace.stateChange("city-garrison", {
        soldiers: this.currentCityGarrison,
      });
    },
    setTactic(tactic) {
      trace.managerCall("setTactic", { tactic });
      trace.command("set-tactic", { tactic });
      this.tactic = tactic;
    },
    addBattalion(count) {
      trace.managerCall("addBattalion", { count });
      trace.command("add-battalion", { count });
      this.raid += count;
      trace.stateChange("raid", { soldiers: this.raid });
    },
    removeBattalion(count) {
      trace.managerCall("removeBattalion", { count });
      trace.command("remove-battalion", { count });
      this.raid -= count;
      trace.stateChange("raid", { soldiers: this.raid });
    },
    getCampaignTitle(tactic) {
      trace.managerCall("getCampaignTitle", { tactic });
      return ["Ambush", "Raid", "Pillage", "Assault", "Siege"][tactic];
    },
    getAdvantage(rating, tactic, governmentId) {
      trace.managerCall("getAdvantage", { rating, tactic, governmentId });
      return scenario.reportedAdvantage ?? 12.34;
    },
    launchCampaign(governmentId) {
      trace.managerCall("launchCampaign", { governmentId });
      trace.command("launch-campaign", { governmentId });
    },
  };
  const spyManager = {
    _foreignVue: scenario.foreignView === false ? undefined : {},
    foreignTarget: target,
    foreignActive: foreigns,
  };
  const settings = {
    foreignPacifist: scenario.pacifist ?? false,
    foreignAttackHealthySoldiersPercent: scenario.healthyPercent ?? 100,
    foreignAttackLivingSoldiersPercent: scenario.livingPercent ?? 100,
    foreignProtect: scenario.protect ?? "never",
    foreignMinAdvantage: scenario.minimumAdvantage ?? 0,
    foreignMaxAdvantage: scenario.maximumAdvantage ?? 10,
    foreignMaxSiegeBattalion: scenario.maximumSiegeBattalion ?? 10,
    foreignUnification: scenario.unification ?? false,
    foreignOccupyLast: scenario.occupyLast ?? false,
    autoHell: scenario.autoHell ?? false,
  };
  const game = {
    global: {
      civic: {
        garrison: {
          progress: scenario.recruitmentProgress ?? 0,
          rate: scenario.recruitmentRate ?? 1,
        },
      },
      tech: { armor: scenario.armorTechnology ?? 0 },
      city: { ptrait: scenario.planetTraits ?? [] },
      settings: { showPortal: scenario.showPortal ?? false },
    },
    armyRating(soldiers, type) {
      assert.equal(type, "army");
      return soldiers * (scenario.armyMultiplier ?? 1);
    },
  };
  const state = { goal: scenario.goal ?? "Normal" };
  const traitValues = {
    scales: scenario.scalesArmor ?? 0,
    armored: scenario.armoredDivisor ?? 1,
    frail: scenario.frailPenalty ?? 0,
    high_pop: scenario.highPopulationMultiplier ?? 1,
  };
  const GameLog = {
    logSuccess(id, message, categories) {
      trace.managerCall("logSuccess", { id });
      trace.log(id, { message, categories });
    },
  };
  return {
    trace,
    manager,
    spyManager,
    settings,
    game,
    state,
    GameLog,
    guardActive: (setting) =>
      setting === "guardPacifist" && Boolean(scenario.guarded),
    getHealingRate: () => scenario.healingRate ?? 1,
    traitVal: (trait) => traitValues[trait] ?? 0,
    getOccupationCost: () => scenario.occupationCost ?? 0,
    getGovernmentName: (id) => `Foreign power ${id + 1}`,
  };
}

function createAutomation(fixture, overrides = {}) {
  return createBattleAdapter({
    getSpyManager: overrides.getSpyManager ?? (() => fixture.spyManager),
    getWarManager: overrides.getWarManager ?? (() => fixture.manager),
    getGameLog: overrides.getGameLog ?? (() => fixture.GameLog),
    getState: overrides.getState ?? (() => fixture.state),
    getSettings: overrides.getSettings ?? (() => fixture.settings),
    getGame: overrides.getGame ?? (() => fixture.game),
    guardActive: overrides.guardActive ?? fixture.guardActive,
    getHealingRate: overrides.getHealingRate ?? fixture.getHealingRate,
    traitVal: overrides.traitVal ?? fixture.traitVal,
    getOccupationCost: overrides.getOccupationCost ?? fixture.getOccupationCost,
    getGovernmentName: overrides.getGovernmentName ?? fixture.getGovernmentName,
  });
}

const prepared = prepareBattle({
  available: true,
  wounded: 2,
  deadSoldiers: 10,
  currentCityGarrison: 10,
  maxCityGarrison: 10,
  availableGarrison: 10,
  healthySoldiersPercent: 79,
  livingSoldiersPercent: 0,
  protectMode: "auto",
  minimumAdvantage: 20,
  maximumAdvantage: 50,
  maximumSiegeBattalion: 10,
  recruitmentProgress: 0,
  recruitmentRate: 1,
  healingRate: 1,
  scalesArmor: 0,
  armorTechnology: 0,
  armoredDivisor: 1,
  frailPenalty: 0,
  highPopulationMultiplier: 1,
  ragePlanet: false,
  autoHell: false,
  hellAvailable: false,
  maximumSoldiers: 0,
  hellReservedSoldiers: 0,
  hellSoldiers: 0,
  hellGarrison: 0,
  hellPatrolSize: 1,
  occupationCost: 0,
  portalVisible: false,
  unificationEnabled: false,
  occupyLast: false,
});
assert.equal(prepared.minimumAdvantage, 80);
assert.equal(prepared.maximumAdvantage, 80);

const malformed = createFixture();
malformed.settings.foreignMaxAdvantage = Number.NaN;
assert.throws(
  () => runBattleAutomation(createAutomation(malformed)),
  /settings\.foreignMaxAdvantage must be a finite number/,
);

const stale = createFixture();
const staleAutomation = createAutomation(stale);
const staleParameters = prepareBattle(staleAutomation.reader.readCycle());
const staleBattlefield =
  staleAutomation.reader.readBattlefield(staleParameters);
const staleDecision = planBattle(staleParameters, staleBattlefield);
stale.manager.raid = 1;
assert.equal(staleAutomation.executor.execute(staleDecision).status, "stale");
assert.deepEqual(
  stale.trace.snapshot().filter((event) => event.category !== "manager-call"),
  [],
);

const alreadyOccupied = createFixture({
  target: { policy: "Occupy", occupied: true },
});
const alreadyOccupiedAutomation = createAutomation(alreadyOccupied);
assert.deepEqual(runBattleAutomation(alreadyOccupiedAutomation), {
  status: "succeeded",
});
assert.deepEqual(
  alreadyOccupied.trace
    .snapshot()
    .filter((event) => event.category !== "manager-call"),
  [],
);

console.log("Battle domain and phased Evolve adapter/application tests passed");
