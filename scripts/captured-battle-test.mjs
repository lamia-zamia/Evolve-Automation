import assert from "node:assert/strict";

import { runBattleAutomation } from "../src/application/battle.ts";
import { createCapturedBattle } from "../src/adapters/evolve/combat/battle.ts";
import { planBattle, prepareBattle } from "../src/domain/combat/battle.ts";

function makeRoot({
  occupied = false,
  policy = "Sabotage",
  autoHell = false,
} = {}) {
  return {
    settings: {
      mKeys: false,
      keyMap: { x10: "Shift", x25: "Control", x100: "Alt" },
      showPortal: autoHell,
    },
    race: {},
    city: { biome: "plains", ptrait: [] },
    tech: {},
    stats: { attacks: 0 },
    civic: {
      govern: { type: "democracy" },
      garrison: {
        display: true,
        workers: 20,
        max: 20,
        crew: 0,
        wounded: 0,
        raid: 0,
        tactic: 0,
        progress: 0,
        rate: 1,
      },
      foreign: {
        gov0: {
          mil: occupied ? 50 : 10,
          spy: 3,
          occ: occupied,
          anx: false,
          buy: false,
          hstl: 0,
          trn: 0,
        },
      },
    },
    portal: autoHell
      ? { fortress: { garrison: 15, patrols: 0, patrol_size: 5 } }
      : {},
    policy,
  };
}

function makeControls(root, { hell = false } = {}) {
  const trace = [];
  const garrison = {
    elementId: "garrison",
    generation: 1,
    methods: [
      "campaign",
      "next",
      "last",
      "aNext",
      "aLast",
      "rating",
      "hell",
      "s_max",
    ],
  };
  const foreign = {
    elementId: "foreign",
    generation: 1,
    methods: ["vis", "gvis"],
  };
  const fortress = {
    elementId: "gFort",
    generation: 1,
    methods: ["aLast", "patDec", "patrolling"],
  };
  const controls = {
    resolve(id) {
      if (id === "garrison") return garrison;
      if (id === "foreign") return foreign;
      if (hell && id === "gFort") return fortress;
      return undefined;
    },
    invoke(handle, method, args = []) {
      trace.push([handle.elementId, method, ...args]);
      if (handle === foreign && method === "vis")
        return { ok: true, value: true };
      if (handle === foreign && method === "gvis") {
        return { ok: true, value: args[0] === 0 };
      }
      if (handle === garrison && method === "hell") {
        return { ok: true, value: 20 };
      }
      if (handle === garrison && method === "s_max") {
        return { ok: true, value: 20 };
      }
      if (handle === garrison && method === "rating") {
        return { ok: true, value: args[0] * 10 };
      }
      if (handle === garrison && method === "next") {
        root.civic.garrison.tactic += 1;
        return { ok: true, value: undefined };
      }
      if (handle === garrison && method === "last") {
        root.civic.garrison.tactic -= 1;
        return { ok: true, value: undefined };
      }
      if (handle === garrison && method === "aNext") {
        root.civic.garrison.raid = Math.min(20, root.civic.garrison.raid + 1);
        return { ok: true, value: undefined };
      }
      if (handle === garrison && method === "aLast") {
        root.civic.garrison.raid = Math.max(0, root.civic.garrison.raid - 1);
        return { ok: true, value: undefined };
      }
      if (handle === garrison && method === "campaign") {
        const government = root.civic.foreign.gov0;
        if (government.occ || government.anx || government.buy) {
          government.occ = false;
          government.anx = false;
          government.buy = false;
        } else if (root.civic.garrison.raid > 0) {
          root.stats.attacks += 1;
          if (root.policy === "Occupy") government.occ = true;
        }
        return { ok: true, value: undefined };
      }
      if (handle === fortress && method === "patrolling") {
        const state = root.portal.fortress;
        return {
          ok: true,
          value: state.garrison - state.patrols * state.patrol_size,
        };
      }
      if (handle === fortress && method === "patDec") {
        root.portal.fortress.patrols = Math.max(
          0,
          root.portal.fortress.patrols - 1,
        );
        return { ok: true, value: undefined };
      }
      if (handle === fortress && method === "aLast") {
        root.portal.fortress.garrison = Math.max(
          root.portal.fortress.patrols * root.portal.fortress.patrol_size,
          root.portal.fortress.garrison - 1,
        );
        return { ok: true, value: undefined };
      }
      return { ok: false, reason: "unknown-method" };
    },
    capturedElementIds() {
      return ["garrison", "foreign", ...(hell ? ["gFort"] : [])];
    },
  };
  return { controls, trace, handles: { garrison, foreign, fortress } };
}

function makeAutomation(root, settings, options = {}) {
  const { controls, trace, handles } = makeControls(root, options);
  const sourceRoot = { current: root };
  const activity = [];
  const adapter = createCapturedBattle({
    rootState: {
      readRoot: () => sourceRoot.current,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls,
    keyState: options.keyState,
    readSettings: () => settings,
    onActivity: (entry) => activity.push(entry),
  });
  return { adapter, controls, trace, handles, sourceRoot, activity };
}

const settings = {
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
