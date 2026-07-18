import assert from "node:assert/strict";

import { createBattleAdapter } from "../src/adapters/evolve/battle.ts";
import { runBattleAutomation } from "../src/application/battle.ts";
import { planBattle, prepareBattle } from "../src/domain/battle.ts";
import {
  assertEquivalentTraces,
  createTraceRecorder,
} from "./test-support/modernization-fixtures.mjs";

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
    _garrisonVue: scenario.garrisonView === false ? undefined : {},
    _hellVue: scenario.hellView ? {} : undefined,
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

// Exact copy of the deleted controller, retained only as a parity oracle.
function runLegacy(scenario) {
  const fixture = createFixture(scenario);
  const sm = fixture.spyManager;
  const m = fixture.manager;
  const settings = fixture.settings;
  const game = fixture.game;
  if (
    !m._garrisonVue ||
    !sm._foreignVue ||
    m.maxCityGarrison <= 0 ||
    fixture.state.goal === "Reset" ||
    settings.foreignPacifist ||
    fixture.guardActive("guardPacifist")
  ) {
    return fixture.trace.snapshot();
  }
  const healthyMin = settings.foreignAttackHealthySoldiersPercent / 100;
  const livingMin =
    settings.foreignProtect === "auto" && m.wounded <= 0
      ? 0
      : settings.foreignAttackLivingSoldiersPercent / 100;
  if (
    m.wounded > (1 - healthyMin) * m.maxCityGarrison ||
    m.currentCityGarrison < livingMin * m.maxCityGarrison
  ) {
    return fixture.trace.snapshot();
  }

  let minAdv = settings.foreignMinAdvantage;
  let maxAdv = settings.foreignMaxAdvantage;
  let protectSoldiers = settings.foreignProtect === "always";
  if (settings.foreignProtect === "auto") {
    const garrison = game.global.civic.garrison;
    const timeToRecruit =
      (m.deadSoldiers * 100 - garrison.progress) / (garrison.rate * 4);
    const timeToHeal = (m.wounded / fixture.getHealingRate()) * 5;
    protectSoldiers = timeToRecruit > timeToHeal;
  }
  if (protectSoldiers) {
    minAdv = Math.max(minAdv, 80);
    maxAdv = Math.max(maxAdv, minAdv);
  }

  let maxBattalion = new Array(5).fill(m.availableGarrison);
  let requiredBattalion = m.maxCityGarrison;
  if (protectSoldiers) {
    const armor =
      (fixture.traitVal("scales", 0) + (game.global.tech.armor ?? 0)) /
        fixture.traitVal("armored", 0, "-") -
      fixture.traitVal("frail", 0);
    const protectedBattalion = [5, 10, 25, 50, 999].map((cap, tactic) =>
      armor >= cap * fixture.traitVal("high_pop", 0, 1)
        ? Number.MAX_SAFE_INTEGER
        : (5 - tactic) *
            (armor + (game.global.city.ptrait.includes("rage") ? 1 : 2)) -
          1,
    );
    maxBattalion = protectedBattalion.map((soldiers) =>
      Math.min(soldiers, m.availableGarrison),
    );
    requiredBattalion = 0;
  }
  maxBattalion[4] = Math.min(
    maxBattalion[4],
    settings.foreignMaxSiegeBattalion,
  );
  let requiredTactic = 0;
  let currentTarget = sm.foreignTarget;
  for (const foreign of sm.foreignActive) {
    if (foreign.policy === "Occupy" && !foreign.gov.occ) {
      const soldiersMin = m.getSoldiersForAdvantage(
        settings.foreignMinAdvantage,
        4,
        foreign.id,
      );
      if (
        soldiersMin <=
        (settings.autoHell && m._hellVue
          ? m.maxSoldiers - m.hellReservedSoldiers
          : m.maxCityGarrison)
      ) {
        currentTarget = foreign;
        requiredBattalion = Math.max(
          soldiersMin,
          Math.min(
            m.availableGarrison,
            m.getSoldiersForAdvantage(
              settings.foreignMaxAdvantage,
              4,
              foreign.id,
            ) - 1,
          ),
        );
        requiredTactic = 4;
        if (
          m.availableGarrison <
            requiredBattalion / 2 + fixture.getOccupationCost() &&
          m.availableGarrison < m.maxCityGarrison
        ) {
          return fixture.trace.snapshot();
        }
        break;
      }
    }
  }
  if (!currentTarget) return fixture.trace.snapshot();
  if (requiredTactic !== 4) {
    for (
      let tactic =
        !settings.foreignUnification || settings.foreignOccupyLast ? 4 : 3;
      tactic >= 0;
      tactic--
    ) {
      const soldiersMin = m.getSoldiersForAdvantage(
        minAdv,
        tactic,
        currentTarget.id,
      );
      if (soldiersMin <= maxBattalion[tactic]) {
        requiredBattalion = Math.max(
          soldiersMin,
          Math.min(
            maxBattalion[tactic],
            m.availableGarrison,
            m.getSoldiersForAdvantage(maxAdv, tactic, currentTarget.id) - 1,
          ),
        );
        requiredTactic = tactic;
        break;
      }
    }
    if (!requiredBattalion || requiredBattalion > m.availableGarrison) {
      return fixture.trace.snapshot();
    }
  }
  if (
    !currentTarget.released &&
    (currentTarget.gov.anx || currentTarget.gov.buy || currentTarget.gov.occ)
  ) {
    m.release(currentTarget.id);
  } else if (requiredTactic === 4 && game.global.settings.showPortal) {
    const missingSoldiers =
      fixture.getOccupationCost() - (m.currentCityGarrison - requiredBattalion);
    if (missingSoldiers > 0) {
      if (
        !settings.autoHell ||
        !m._hellVue ||
        m.hellSoldiers - m.hellReservedSoldiers < missingSoldiers
      ) {
        return fixture.trace.snapshot();
      }
      const patrolsToRemove = Math.ceil(
        (missingSoldiers - m.hellGarrison) / m.hellPatrolSize,
      );
      if (patrolsToRemove > 0) m.removeHellPatrol(patrolsToRemove);
      m.removeHellGarrison(missingSoldiers);
    }
  }
  m.setTactic(requiredTactic);
  const deltaBattalion = requiredBattalion - m.raid;
  if (deltaBattalion > 0) m.addBattalion(deltaBattalion);
  if (deltaBattalion < 0) m.removeBattalion(deltaBattalion * -1);
  const campaignTitle = m.getCampaignTitle(requiredTactic);
  const battalionRating = game.armyRating(m.raid, "army");
  const advantagePercent = m
    .getAdvantage(battalionRating, requiredTactic, currentTarget.id)
    .toFixed(1);
  fixture.GameLog.logSuccess(
    "attack",
    `Launching ${campaignTitle} campaign against ${fixture.getGovernmentName(
      currentTarget.id,
    )} with ${currentTarget.gov.spy < 1 ? "~" : ""}${advantagePercent}% advantage.`,
    ["combat"],
  );
  m.launchCampaign(currentTarget.id);
  return fixture.trace.snapshot();
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

function runModern(scenario) {
  const fixture = createFixture(scenario);
  runBattleAutomation(createAutomation(fixture));
  return fixture.trace.snapshot();
}

const dualRunScenarios = [
  { name: "garrison panel unavailable", garrisonView: false },
  { name: "foreign panel unavailable", foreignView: false },
  { name: "no city garrison", maxCityGarrison: 0 },
  { name: "reset goal", goal: "Reset" },
  { name: "Pacifist setting", pacifist: true },
  { name: "Pacifist guard", guarded: true },
  { name: "too many wounded soldiers", wounded: 1, healthyPercent: 100 },
  {
    name: "too few living soldiers",
    currentCityGarrison: 9,
    livingPercent: 100,
  },
  { name: "ordinary siege" },
  { name: "unification limits plunder to assault", unification: true },
  {
    name: "protected soldiers choose a safe raid",
    protect: "always",
    maximumSiegeBattalion: 10,
    soldiersByTactic: { 4: 2, 3: 3 },
  },
  { name: "no current target", target: null },
  {
    name: "Occupy target supersedes current target",
    target: { id: 0, policy: "Raid" },
    foreigns: [{ id: 1, policy: "Occupy" }],
  },
  {
    name: "Occupy waits for city soldiers",
    maxCityGarrison: 20,
    currentCityGarrison: 10,
    availableGarrison: 10,
    livingPercent: 0,
    occupationCost: 9,
    soldiers: { "0:4:1": 8, "10:4:1": 10 },
    foreigns: [{ id: 1, policy: "Occupy" }],
  },
  {
    name: "controlled target is released before attack",
    target: { policy: "Raid", occupied: true },
  },
  {
    name: "portal siege waits without hell automation",
    showPortal: true,
    currentCityGarrison: 6,
    livingPercent: 0,
    occupationCost: 5,
  },
  {
    name: "portal siege pulls a patrol and hell soldiers",
    showPortal: true,
    autoHell: true,
    hellView: true,
    currentCityGarrison: 6,
    livingPercent: 0,
    occupationCost: 5,
    hellSoldiers: 10,
    hellGarrison: 0,
    hellPatrolSize: 5,
  },
  {
    name: "existing oversized battalion is reduced",
    raid: 9,
    soldiersByTactic: { 4: 5 },
  },
  {
    name: "unknown target strength is marked approximate",
    target: { spy: 0 },
  },
];

for (const scenario of dualRunScenarios) {
  assertEquivalentTraces({
    legacy: runLegacy(scenario),
    modern: runModern(scenario),
    label: `battle ${scenario.name}`,
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

console.log(
  `Battle domain, phased Evolve adapter/application, and parity tests passed (${dualRunScenarios.length} dual-run scenarios)`,
);
