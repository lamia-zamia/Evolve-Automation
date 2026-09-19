/**
 * Foreign Affairs settings, end to end.
 *
 * Every case drives the real captured panel — a DOM control the player would click — and then
 * asserts against the captured combat runtime that actually consumes the setting. Rendering a
 * control is not the claim under test; the claim is that the edit reaches a decision.
 */

import assert from "node:assert/strict";

import { capturedForeignPolicy } from "../src/adapters/evolve/combat/captured-foreign-state.ts";
import { createCapturedSpyTraining } from "../src/adapters/evolve/combat/captured-spy-training.ts";
import { runCapturedSpyTraining } from "../src/application/captured-spy-training.ts";
import { createCapturedMercenary } from "../src/adapters/evolve/combat/captured-mercenary.ts";
import { runMercenaryAutomation } from "../src/application/mercenary.ts";
import { runBattleAutomation } from "../src/application/battle.ts";
import { makeAutomation, makeRoot } from "./captured-battle-fixture.mjs";
import { createCapturedSettingsPage, edit } from "./captured-settings-page.mjs";

// --- the section renders from the capture alone, with no legacy manager -------------------------

{
  const page = createCapturedSettingsPage();
  assert.equal(
    page.root.querySelectorAll("#script_warSettings").length,
    1,
    "Foreign Affairs must be drawn by the captured panel",
  );
  assert.deepEqual(
    page.diagnostics.filter((message) => message.includes("war")),
    [],
    "a ported section must report no unported diagnostic",
  );
  // The page above passes no SpyManager, no game object and no legacy manager of any kind: the
  // section is composed from the capture alone.
  assert.deepEqual(page.logged, []);
  // Every control the read model offers reaches the DOM.
  for (const settingName of [
    "foreignPacifist",
    "foreignUnification",
    "foreignOccupyLast",
    "foreignForceSabotage",
    "foreignTrainSpy",
    "foreignSpyMax",
    "foreignPowerRequired",
    "foreignPolicyInferior",
    "foreignPolicySuperior",
    "foreignPolicyRival",
    "foreignAttackLivingSoldiersPercent",
    "foreignAttackHealthySoldiersPercent",
    "foreignHireMercMoneyStoragePercent",
    "foreignHireMercCostLowerThanIncome",
    "foreignHireMercDeadSoldiers",
    "foreignMinAdvantage",
    "foreignMaxAdvantage",
    "foreignMaxSiegeBattalion",
    "foreignProtect",
  ]) {
    assert.equal(
      page.root.querySelectorAll(`.script_${settingName}`).length,
      1,
      `${settingName} should be drawn once`,
    );
  }
}

// --- 1. the policy selects decide the captured espionage/battle policy --------------------------

{
  const page = createCapturedSettingsPage();
  edit(page, "foreignPolicyInferior", "Annex");
  assert.equal(page.settings.readRaw()["foreignPolicyInferior"], "Annex");
  assert.deepEqual(capturedForeignPolicy(page.effective, 0, 10), {
    rank: "Inferior",
    policy: "Annex",
  });

  edit(page, "foreignPolicyInferior", "Incite");
  assert.deepEqual(capturedForeignPolicy(page.effective, 0, 10), {
    rank: "Inferior",
    policy: "Incite",
  });

  // The Rival rank is index 3 and reads its own key, not the inferior one.
  edit(page, "foreignPolicyRival", "Betrayal");
  assert.deepEqual(capturedForeignPolicy(page.effective, 3, 10), {
    rank: "Rival",
    policy: "Betrayal",
  });
}

// --- 2. foreignPowerRequired moves the Inferior/Superior boundary -------------------------------

{
  const page = createCapturedSettingsPage();
  edit(page, "foreignPolicyInferior", "Annex");
  edit(page, "foreignPolicySuperior", "Sabotage");

  edit(page, "foreignPowerRequired", 75);
  assert.equal(capturedForeignPolicy(page.effective, 0, 60).rank, "Inferior");
  assert.equal(capturedForeignPolicy(page.effective, 0, 90).rank, "Superior");

  // Raising the threshold reclassifies the same power, and with it the selected policy.
  edit(page, "foreignPowerRequired", 95);
  assert.deepEqual(capturedForeignPolicy(page.effective, 0, 90), {
    rank: "Inferior",
    policy: "Annex",
  });
}

// --- 3. foreignPacifist suppresses combat -------------------------------------------------------

{
  // The effective layer delegates to the raw record through its prototype, so the runtime is
  // handed that object itself; copying it would drop every value the player did not override.
  const page = createCapturedSettingsPage({
    achievementGuards: false,
    autoHell: false,
  });
  edit(page, "foreignPolicyInferior", "Sabotage");
  edit(page, "foreignProtect", "never");
  edit(page, "foreignAttackHealthySoldiersPercent", 100);
  edit(page, "foreignAttackLivingSoldiersPercent", 100);
  edit(page, "foreignMinAdvantage", 0);
  edit(page, "foreignMaxAdvantage", 0);

  edit(page, "foreignPacifist", false);
  const fighting = makeRoot();
  assert.equal(
    runBattleAutomation(makeAutomation(fighting, page.effective).adapter)
      .status,
    "succeeded",
  );
  assert.equal(fighting.stats.attacks, 1);

  edit(page, "foreignPacifist", true);
  assert.equal(page.effective["foreignPacifist"], true);
  const pacifist = makeRoot();
  const quiet = makeAutomation(pacifist, page.effective);
  assert.equal(runBattleAutomation(quiet.adapter).status, "succeeded");
  assert.equal(pacifist.stats.attacks, 0, "a pacifist must not attack");
  assert.deepEqual(quiet.trace, [], "a pacifist must not touch the garrison");
}

// --- 4. mercenary thresholds come from the edited effective values ------------------------------

function mercenaryFixture(settings, { money = 1_000 } = {}) {
  const root = {
    tech: { mercs: 1 },
    race: {},
    civic: {
      garrison: {
        display: true,
        mercs: true,
        workers: 0,
        max: 3,
        crew: 0,
        m_use: 0,
      },
    },
    resource: { Money: { amount: money, max: 1_000, diff: 100 } },
    portal: {},
    space: {},
    eden: {},
    stats: { achieve: {} },
  };
  const control = {
    elementId: "garrison",
    generation: 1,
    methods: ["vis", "hire", "hell", "s_max"],
  };
  const hires = [];
  const controls = {
    resolve: (id) => (id === "garrison" ? control : undefined),
    invoke: (_handle, method) => {
      if (method === "vis") return { ok: true, value: true };
      if (method === "hell")
        return { ok: true, value: root.civic.garrison.workers };
      if (method === "s_max")
        return { ok: true, value: root.civic.garrison.max };
      if (method === "hire") {
        hires.push(method);
        root.resource.Money.amount -= 25;
        root.civic.garrison.workers += 1;
        root.civic.garrison.m_use += 1;
        return { ok: true, value: undefined };
      }
      return { ok: false, reason: "unknown-method" };
    },
    capturedElementIds: () => ["garrison"],
  };
  const automation = createCapturedMercenary({
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls,
    readSettings: () => settings,
    readGoal: () => "Standard",
    readMoneyRequested: () => 0,
    readMoneyStorageRequired: () => 0,
  });
  return { root, hires, automation };
}

{
  const page = createCapturedSettingsPage({ storageAssignExtra: false });
  edit(page, "foreignHireMercDeadSoldiers", 0);
  edit(page, "foreignHireMercCostLowerThanIncome", 1);
  edit(page, "foreignHireMercMoneyStoragePercent", 0);
  const hiring = mercenaryFixture(page.effective);
  assert.equal(runMercenaryAutomation(hiring.automation).status, "succeeded");
  assert.ok(
    hiring.hires.length > 0,
    "the edited thresholds must allow a mercenary hire",
  );

  // Requiring dead soldiers the garrison does not have withdraws the whole cycle.
  edit(page, "foreignHireMercDeadSoldiers", 99);
  assert.equal(page.effective["foreignHireMercDeadSoldiers"], 99);
  const blocked = mercenaryFixture(page.effective);
  assert.equal(runMercenaryAutomation(blocked.automation).status, "succeeded");
  assert.deepEqual(
    blocked.hires,
    [],
    "an unmet dead-soldier reserve must stop hiring",
  );

  // The money-storage percent is the other threshold, and it is read the same way.
  edit(page, "foreignHireMercDeadSoldiers", 0);
  edit(page, "foreignHireMercMoneyStoragePercent", 100);
  edit(page, "foreignHireMercCostLowerThanIncome", 0);
  const tooPoor = mercenaryFixture(page.effective);
  assert.equal(runMercenaryAutomation(tooPoor.automation).status, "succeeded");
  assert.deepEqual(
    tooPoor.hires,
    [],
    "a full-storage requirement must stop hiring",
  );
}

// --- 5. foreignTrainSpy / foreignSpyMax gate spy training ---------------------------------------

function spyTrainingFixture(settings) {
  const root = {
    tech: { spy: 1 },
    civic: {
      foreign: {
        gov0: { spy: 1, trn: 0, occ: false, anx: false, buy: false },
        gov1: { spy: 1, trn: 0, occ: false, anx: false, buy: false },
      },
    },
  };
  const foreign = {
    elementId: "foreign",
    generation: 1,
    methods: ["vis", "gvis", "spy_disabled", "spy"],
  };
  const trained = [];
  const adapter = createCapturedSpyTraining({
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls: {
      resolve: (id) => (id === "foreign" ? foreign : undefined),
      invoke: (_handle, method, args = []) => {
        if (method === "vis") return { ok: true, value: true };
        if (method === "gvis")
          return { ok: true, value: args[0] === 0 || args[0] === 1 };
        if (method === "spy_disabled") return { ok: true, value: false };
        if (method === "spy") {
          trained.push(args[0]);
          root.civic.foreign[`gov${args[0]}`].trn = 300;
          return { ok: true, value: undefined };
        }
        return { ok: false, reason: "unknown-method" };
      },
      capturedElementIds: () => ["foreign"],
    },
    readSettings: () => settings,
  });
  return { adapter, trained };
}

{
  const page = createCapturedSettingsPage();
  edit(page, "foreignTrainSpy", true);
  edit(page, "foreignSpyMax", 2);
  const training = spyTrainingFixture(page.effective);
  assert.equal(runCapturedSpyTraining(training.adapter).status, "succeeded");
  assert.ok(
    training.trained.length > 0,
    "an enabled trainer under the cap must train a spy",
  );

  // Lowering the cap to what each power already has stops training.
  edit(page, "foreignSpyMax", 1);
  const capped = spyTrainingFixture(page.effective);
  assert.equal(runCapturedSpyTraining(capped.adapter).status, "succeeded");
  assert.deepEqual(capped.trained, [], "a reached spy cap must stop training");

  // The toggle withdraws the whole cycle regardless of the cap.
  edit(page, "foreignSpyMax", 5);
  edit(page, "foreignTrainSpy", false);
  const off = spyTrainingFixture(page.effective);
  assert.deepEqual(off.adapter.reader.readCycle(), {
    available: false,
    governmentCount: 0,
  });
  assert.equal(runCapturedSpyTraining(off.adapter).status, "succeeded");
  assert.deepEqual(off.trained, []);
}

// --- 6. an override changes behaviour without mutating raw storage ------------------------------

{
  const page = createCapturedSettingsPage();
  edit(page, "foreignPolicyInferior", "Annex");
  // The override editor writes here; this is the shape it persists.
  page.settings.readRaw()["overrides"]["foreignPolicyInferior"] = [
    {
      type1: "Boolean",
      arg1: true,
      cmp: "==",
      type2: "Boolean",
      arg2: true,
      ret: "Occupy",
    },
  ];
  page.settings.persist();
  page.panel.ensurePanel();
  edit(page, "foreignPolicyInferior", "Annex");

  assert.equal(
    page.settings.readRaw()["foreignPolicyInferior"],
    "Annex",
    "an override must not rewrite the persisted raw value",
  );
  assert.equal(
    JSON.parse(page.storage.writes())["foreignPolicyInferior"],
    "Annex",
  );
  assert.equal(page.effective["foreignPolicyInferior"], "Occupy");
  assert.deepEqual(capturedForeignPolicy(page.effective, 0, 10), {
    rank: "Inferior",
    policy: "Occupy",
  });
}

// --- 7. the War reset restores defaults and leaves unrelated overrides alone --------------------

{
  const page = createCapturedSettingsPage();
  edit(page, "foreignMinAdvantage", 12);
  edit(page, "foreignPacifist", true);
  edit(page, "foreignPolicySuperior", "Incite");
  const overrides = page.settings.readRaw()["overrides"];
  overrides["foreignMinAdvantage"] = [
    {
      type1: "Boolean",
      arg1: true,
      cmp: "==",
      type2: "Boolean",
      arg2: true,
      ret: 5,
    },
  ];
  overrides["autoBuild"] = [
    {
      type1: "Boolean",
      arg1: true,
      cmp: "==",
      type2: "Boolean",
      arg2: true,
      ret: true,
    },
  ];

  page.root.querySelectorAll("#script_resetwar")[0].dispatch("click");

  const raw = page.settings.readRaw();
  assert.equal(raw["foreignMinAdvantage"], 40);
  assert.equal(raw["foreignPacifist"], false);
  assert.equal(raw["foreignPolicySuperior"], "Sabotage");
  assert.equal(
    raw["overrides"]["foreignMinAdvantage"],
    undefined,
    "the reset owns its own section's overrides",
  );
  assert.notEqual(
    raw["overrides"]["autoBuild"],
    undefined,
    "a reset must not touch another section's overrides",
  );
}

console.log("captured Foreign Affairs settings checks passed");
