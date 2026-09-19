import assert from "node:assert/strict";

import { runBattleAutomation } from "../src/application/battle.ts";
import { makeAutomation, makeRoot } from "./captured-battle-fixture.mjs";
import { planBattle, prepareBattle } from "../src/domain/combat/battle.ts";

const settings = {
  achievementGuards: false,
  foreignPacifist: false,
  foreignPowerRequired: 75,
  foreignPolicyInferior: "Sabotage",
  foreignPolicySuperior: "Ignore",
  foreignPolicyRival: "Ignore",
  foreignProtect: "never",
  foreignAttackHealthySoldiersPercent: 100,
  foreignAttackLivingSoldiersPercent: 100,
  foreignMinAdvantage: 0,
  foreignMaxAdvantage: 0,
  foreignMaxSiegeBattalion: 10,
  foreignUnification: false,
  foreignOccupyLast: false,
  autoHell: false,
};

// The planner selects tactic 3 and a four-soldier battalion from the captured rating oracle.
{
  const root = makeRoot();
  const automation = makeAutomation(root, settings);
  assert.equal(runBattleAutomation(automation.adapter).status, "succeeded");
  assert.equal(root.stats.attacks, 1);
  assert.equal(root.civic.garrison.tactic, 4);
  assert.equal(root.civic.garrison.raid, 3);
  assert.deepEqual(
    automation.trace.filter((entry) => entry[1] === "campaign"),
    [["garrison", "campaign", 0]],
  );
  assert.equal(automation.activity.length, 1);
}

// Ignore remains a farming target; it is not an instruction to remove the power
// from the battle state machine.
{
  const ignoreSettings = {
    ...settings,
    foreignPolicyInferior: "Ignore",
  };
  const root = makeRoot();
  const automation = makeAutomation(root, ignoreSettings);
  assert.equal(runBattleAutomation(automation.adapter).status, "succeeded");
  assert.equal(root.stats.attacks, 1);
  assert.deepEqual(
    automation.trace.filter((entry) => entry[1] === "campaign"),
    [["garrison", "campaign", 0]],
  );
}

// Occupation cost is game-owned through jobStack(jobScale); without that oracle
// the captured adapter must not launch an Occupy siege for high-pop races.
{
  const occupySettings = {
    ...settings,
    foreignPolicyInferior: "Occupy",
  };
  const root = makeRoot({
    policy: "Occupy",
    race: { high_pop: 1 },
    garrison: { cityGarrison: 25, maxCityGarrison: 30 },
  });
  const automation = makeAutomation(root, occupySettings);
  const result = runBattleAutomation(automation.adapter);
  assert.equal(result.status, "succeeded");
  assert.equal(
    automation.trace.filter((entry) => entry[1] === "campaign").length,
    0,
  );
  assert.equal(root.stats.attacks, 0);
}

// Unsupported protection modifiers fail closed instead of using placeholder
// values that could make a protected battalion larger than the game permits.
for (const trait of ["frail", "high_pop"]) {
  const protectedSettings = { ...settings, foreignProtect: "always" };
  const root = makeRoot({ race: { [trait]: 1 } });
  const automation = makeAutomation(root, protectedSettings);
  assert.equal(runBattleAutomation(automation.adapter).status, "succeeded");
  assert.equal(
    automation.trace.filter((entry) => entry[1] === "campaign").length,
    0,
  );
  assert.equal(root.stats.attacks, 0);
}

// The automatic Pacifist achievement guard is part of the battle precondition.
{
  const guardedSettings = {
    ...settings,
    achievementGuards: true,
    guardPacifist: true,
  };
  const root = makeRoot({ stats: { achieve: {} } });
  const automation = makeAutomation(root, guardedSettings);
  assert.equal(runBattleAutomation(automation.adapter).status, "succeeded");
  assert.equal(
    automation.trace.filter((entry) => entry[1] === "campaign").length,
    0,
  );
  assert.equal(root.stats.attacks, 0);
}

// Non-star challenge modifiers do not raise the achievement guard target.
{
  const guardedSettings = {
    ...settings,
    achievementGuards: true,
    guardPacifist: true,
  };
  const root = makeRoot({
    race: { universe: "standard", nerfed: 1 },
    stats: {
      attacks: 0,
      achieve: { pacifist: { l: 1 } },
    },
  });
  const automation = makeAutomation(root, guardedSettings);
  assert.equal(runBattleAutomation(automation.adapter).status, "succeeded");
  assert.deepEqual(
    automation.trace.filter((entry) => entry[1] === "campaign"),
    [["garrison", "campaign", 0]],
  );
  assert.equal(root.stats.attacks, 1);
}

// Once two powers are controlled, unification deliberately pauses a non-Occupy
// farm target instead of continuing to attack it.
{
  const unifySettings = {
    ...settings,
    foreignUnification: true,
    foreignPolicyInferior: "Sabotage",
    foreignPolicySuperior: "Occupy",
  };
  const root = makeRoot({
    tech: { unify: 1 },
    governments: {
      0: { mil: 100, occ: true },
      1: { mil: 100, occ: true },
      2: { mil: 10 },
    },
  });
  const automation = makeAutomation(root, unifySettings);
  assert.equal(runBattleAutomation(automation.adapter).status, "succeeded");
  assert.equal(
    automation.trace.filter((entry) => entry[1] === "campaign").length,
    0,
  );
  assert.equal(root.stats.attacks, 0);
}

// Achievement guards can temporarily replace configured policies with the
// selected World Domination strategy without changing the settings object.
{
  const achievementSettings = {
    ...settings,
    achievementGuards: true,
    guardPacifist: false,
    guardWorldDomination: true,
    guardSyndicate: false,
    foreignPolicyInferior: "Ignore",
    foreignPolicySuperior: "Ignore",
    foreignUnification: false,
    foreignOccupyLast: false,
  };
  const root = makeRoot({
    policy: "Occupy",
    race: { universe: "standard" },
    governments: {
      0: {},
      1: {},
      2: {},
    },
    stats: { achieve: {} },
  });
  const automation = makeAutomation(root, achievementSettings);
  assert.equal(runBattleAutomation(automation.adapter).status, "succeeded");
  assert.deepEqual(
    automation.trace.filter((entry) => entry[1] === "campaign"),
    [["garrison", "campaign", 0]],
  );
  assert.equal(root.stats.attacks, 1);
}

// Betrayal stops being a battle target after its military threshold unless the
// explicit force-sabotage policy has changed it first.
{
  const betrayalSettings = {
    ...settings,
    foreignForceSabotage: false,
    foreignPolicyInferior: "Betrayal",
    foreignPolicySuperior: "Betrayal",
  };
  const root = makeRoot({ governments: { 0: { mil: 80 } } });
  const automation = makeAutomation(root, betrayalSettings);
  assert.equal(runBattleAutomation(automation.adapter).status, "succeeded");
  assert.equal(
    automation.trace.filter((entry) => entry[1] === "campaign").length,
    0,
  );
  assert.equal(root.stats.attacks, 0);
}

// The upstream campaign closure handles release and returns without attacking; the next cycle can attack.
{
  const root = makeRoot({ occupied: true });
  const automation = makeAutomation(root, settings);
  assert.equal(runBattleAutomation(automation.adapter).status, "succeeded");
  assert.equal(root.civic.foreign.gov0.occ, false);
  assert.equal(root.stats.attacks, 0);
  assert.deepEqual(automation.activity[0].message, "Released foreign power 1");
}

// Hell deductions go through the normal fortress controls before the siege campaign.
{
  const hellSettings = { ...settings, autoHell: true };
  const root = makeRoot({ policy: "Occupy", autoHell: true });
  hellSettings.foreignPolicyInferior = "Occupy";
  const automation = makeAutomation(root, hellSettings, { hell: true });
  assert.equal(runBattleAutomation(automation.adapter).status, "succeeded");
  assert.equal(root.portal.fortress.garrison, 12);
  assert.equal(root.stats.attacks, 1);
  assert.equal(root.civic.foreign.gov0.occ, true);
  assert.ok(
    automation.trace.some(
      (entry) => entry[1] === "aLast" && entry[0] === "gFort",
    ),
  );
}

// Future Hell reserves are not represented by patrolling(). If an active forge
// or guardpost makes the reserve unknown, the battle adapter must not borrow Hell.
{
  const hellSettings = {
    ...settings,
    autoHell: true,
    foreignPolicyInferior: "Occupy",
  };
  const root = makeRoot({
    policy: "Occupy",
    autoHell: true,
    portal: {
      fortress: { garrison: 30, patrols: 0, patrol_size: 5 },
      soul_forge: { count: 1 },
    },
  });
  const automation = makeAutomation(root, hellSettings, { hell: true });
  assert.equal(runBattleAutomation(automation.adapter).status, "succeeded");
  assert.equal(root.stats.attacks, 0);
  assert.equal(root.portal.fortress.garrison, 30);
  assert.equal(
    automation.trace.filter(
      (entry) => entry[0] === "gFort" && entry[1] !== "patrolling",
    ).length,
    0,
  );
}

// A root replacement between read and execute invalidates the captured session.
{
  const root = makeRoot();
  const automation = makeAutomation(root, settings);
  const parameters = prepareBattle(automation.adapter.reader.readCycle());
  const battlefield = automation.adapter.reader.readBattlefield(parameters);
  const decision = planBattle(parameters, battlefield);
  automation.sourceRoot.current = makeRoot();
  assert.equal(automation.adapter.executor.execute(decision).status, "stale");
  assert.equal(root.stats.attacks, 0);
}

// Held click multipliers are left to the player; the captured runtime never overshoots a planned raid.
{
  const root = makeRoot();
  root.settings.mKeys = true;
  const automation = makeAutomation(root, settings, {
    keyState: { readPressed: (key) => key === "Shift" },
  });
  assert.equal(automation.adapter.reader.readCycle().available, false);
  assert.equal(automation.trace.length, 0);
}

console.log("captured battle checks passed");
