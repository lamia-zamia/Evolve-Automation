import assert from "node:assert/strict";

import { createAutoBattle } from "../src/subsystems/battle.ts";

function runBattleCase({ guarded = false } = {}) {
  const actions = [];
  const target = {
    id: 0,
    released: false,
    gov: { spy: 2, anx: false, buy: false, occ: false },
  };
  const WarManager = {
    _garrisonVue: {},
    _hellVue: undefined,
    maxCityGarrison: 10,
    maxSoldiers: 10,
    currentCityGarrison: 10,
    availableGarrison: 10,
    wounded: 0,
    deadSoldiers: 0,
    raid: 0,
    getSoldiersForAdvantage: () => 5,
    setTactic: (tactic) => actions.push(["tactic", tactic]),
    addBattalion(count) {
      this.raid += count;
      actions.push(["add", count]);
    },
    removeBattalion(count) {
      this.raid -= count;
      actions.push(["remove", count]);
    },
    getCampaignTitle: () => "Siege",
    getAdvantage: () => 0.2,
    launchCampaign: (id) => actions.push(["launch", id]),
    release: () => actions.push(["release"]),
  };
  const SpyManager = {
    _foreignVue: {},
    foreignTarget: target,
    foreignActive: [],
  };
  const settings = {
    foreignPacifist: false,
    foreignAttackHealthySoldiersPercent: 100,
    foreignAttackLivingSoldiersPercent: 100,
    foreignProtect: "never",
    foreignMinAdvantage: 0,
    foreignMaxAdvantage: 10,
    foreignMaxSiegeBattalion: 10,
    foreignUnification: false,
    foreignOccupyLast: false,
    autoHell: false,
  };
  const game = {
    global: {
      civic: { garrison: { progress: 0, rate: 1 } },
      tech: { armor: 0 },
      city: { ptrait: [] },
      settings: { showPortal: false },
    },
    armyRating: (soldiers) => soldiers,
  };
  const logs = [];

  const autoBattle = createAutoBattle({
    SpyManager,
    WarManager,
    GameLog: { logSuccess: (...args) => logs.push(args) },
    getState: () => ({ goal: "Normal" }),
    getSettings: () => settings,
    getGame: () => game,
    guardActive: (setting) => setting === "guardPacifist" && guarded,
    getHealingRate: () => 1,
    traitVal: (_trait, fallback) => fallback,
    getOccCosts: () => 0,
    getGovName: () => "Test Nation",
  });

  autoBattle();
  return { actions, logs, WarManager };
}

const attack = runBattleCase();
assert.deepEqual(attack.actions, [
  ["tactic", 4],
  ["add", 5],
  ["launch", 0],
]);
assert.equal(attack.WarManager.raid, 5);
assert.equal(attack.logs.length, 1);
assert.match(attack.logs[0][1], /Siege campaign against Test Nation/);

const guarded = runBattleCase({ guarded: true });
assert.deepEqual(guarded.actions, [], "the Pacifist guard must block attacks");
assert.deepEqual(guarded.logs, [], "blocked attacks must not be logged as launched");

console.log("Battle automation regression tests passed");
