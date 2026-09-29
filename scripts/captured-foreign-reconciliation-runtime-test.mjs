import assert from "node:assert/strict";

import { startCapturedRuntime } from "../src/bootstrap/captured-runtime-control.ts";
import {
  readCapturedForeignTargets,
  selectCapturedForeignStrategy,
} from "../src/adapters/evolve/combat/captured-foreign-state.ts";

const settings = {
  masterScriptToggle: true,
  tickRate: 1,
  autoFight: true,
  foreignTrainSpy: false,
  foreignSpyMax: 3,
  foreignPowerRequired: 75,
  foreignPolicyInferior: "Ignore",
  foreignPolicySuperior: "Influence",
  foreignPolicyRival: "Ignore",
  foreignUnification: false,
  foreignForceSabotage: false,
  foreignOccupyLast: false,
  foreignPacifist: false,
  autoHell: false,
  achievementGuards: false,
};

const root = {
  race: { elusive: false, governor: { tasks: { t0: "none" } } },
  tech: { spy: 2, unify: 0, world_control: 1, armor: 0 },
  stats: { attacks: 0, achieve: {} },
  city: { biome: "plains", ptrait: [], morale: { current: 250 } },
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
      cityGarrison: 20,
      maxCityGarrison: 20,
      mercs: false,
    },
    foreign: {
      gov0: {
        mil: 10,
        spy: 3,
        sab: 0,
        act: "none",
        hstl: 0,
        unrest: 20,
        eco: 1,
        occ: false,
        anx: false,
        buy: false,
      },
      gov1: {
        mil: 90,
        spy: 3,
        sab: 0,
        act: "none",
        hstl: 0,
        unrest: 20,
        eco: 1,
        occ: false,
        anx: true,
        buy: false,
      },
    },
  },
  resource: {
    Money: { amount: 0, max: 100_000, display: true, diff: 0, value: 1 },
    Knowledge: { amount: 0, max: 100_000, display: true, diff: 0, value: 1 },
  },
  space: {},
  portal: {},
  eden: {},
  settings: { civTabs: 3, spaceTabs: 0, showPortal: false, mKeys: false },
};

const events = [];
const errors = [];
let cycle;
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
  methods: ["vis", "gvis", "trigModal", "spy_disabled", "spy"],
};

const stop = startCapturedRuntime({
  pageCapture: {
    isComplete: () => true,
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls: {
      resolve: (id) =>
        id === "garrison" ? garrison : id === "foreign" ? foreign : undefined,
      invoke(control, method, args = []) {
        const governmentId = args[0];
        events.push({
          control: control.elementId,
          method,
          args,
          afterRelease: events.some(
            (event) => event.method === "campaign" && event.args[0] === 1,
          ),
          flags: root.civic.foreign.gov1
            ? [
                root.civic.foreign.gov1.occ,
                root.civic.foreign.gov1.anx,
                root.civic.foreign.gov1.buy,
              ]
            : [],
        });
        if (control === foreign && method === "vis") {
          return { ok: true, value: true };
        }
        if (control === foreign && method === "gvis") {
          return {
            ok: true,
            value: root.civic.foreign[`gov${governmentId}`] !== undefined,
          };
        }
        if (control === garrison && method === "campaign") {
          const government = root.civic.foreign[`gov${governmentId}`];
          if (government.occ || government.anx || government.buy) {
            government.occ = false;
            government.anx = false;
            government.buy = false;
          } else {
            root.stats.attacks += 1;
          }
          return { ok: true, value: undefined };
        }
        if (control === garrison && method === "hell") {
          return { ok: true, value: root.civic.garrison.cityGarrison };
        }
        if (control === garrison && method === "s_max") {
          return { ok: true, value: root.civic.garrison.maxCityGarrison };
        }
        if (control === garrison && method === "rating") {
          return { ok: true, value: args[0] * 10 };
        }
        if (control === garrison && method === "next") {
          root.civic.garrison.tactic += 1;
          return { ok: true, value: undefined };
        }
        if (control === garrison && method === "last") {
          root.civic.garrison.tactic -= 1;
          return { ok: true, value: undefined };
        }
        if (control === garrison && method === "aNext") {
          root.civic.garrison.raid = Math.min(
            root.civic.garrison.maxCityGarrison,
            root.civic.garrison.raid + 1,
          );
          return { ok: true, value: undefined };
        }
        if (control === garrison && method === "aLast") {
          root.civic.garrison.raid = Math.max(0, root.civic.garrison.raid - 1);
          return { ok: true, value: undefined };
        }
        return { ok: false, reason: "unknown-method" };
      },
      capturedElementIds: () => ["garrison", "foreign"],
    },
    controlUsage: { readUsage: () => [] },
    keyState: { readPressed: () => false },
    periods: {
      subscribe(next) {
        cycle = next;
        return () => {};
      },
    },
    mountSuppression: { available: false, withoutMounting: () => undefined },
    uninstall: () => {},
  },
  document: {},
  mouseEvent: class {},
  storage: { getItem: () => JSON.stringify(settings) },
  logError: (message) => errors.push(message),
});

try {
  const beforeTargets = readCapturedForeignTargets(
    root,
    {
      resolve: (id) => (id === "foreign" ? foreign : undefined),
      invoke: (_control, method, args = []) => ({
        ok: true,
        value:
          method === "vis" ||
          (method === "gvis" &&
            root.civic.foreign[`gov${args[0]}`] !== undefined),
      }),
    },
    foreign,
    settings,
  );
  const strategy = selectCapturedForeignStrategy(root, settings, beforeTargets);
  assert.equal(strategy.battleTargetId, 0);
  assert.notEqual(strategy.battleTargetId, 1);

  cycle({ periods: 1 });
} finally {
  stop();
}

assert.deepEqual(
  [
    root.civic.foreign.gov1.occ,
    root.civic.foreign.gov1.anx,
    root.civic.foreign.gov1.buy,
  ],
  [false, false, false],
);
assert.deepEqual(
  events
    .filter((event) => event.method === "campaign")
    .map((event) => event.args[0]),
  [1, 0],
  "espionage releases government 1, then Battle acts on its separate target 0",
);
const releaseIndex = events.findIndex(
  (event) => event.method === "campaign" && event.args[0] === 1,
);
const battleSampleIndex = events.findIndex(
  (event, index) =>
    index > releaseIndex &&
    event.control === "foreign" &&
    event.method === "gvis" &&
    event.afterRelease &&
    event.flags.every((flag) => flag === false),
);
assert.ok(releaseIndex >= 0);
assert.ok(battleSampleIndex > releaseIndex);
assert.ok(
  events.some(
    (event, index) =>
      index > releaseIndex &&
      event.control === "garrison" &&
      (event.method === "hell" || event.method === "s_max"),
  ),
  "Battle sampled garrison state after release",
);
assert.equal(
  events.some((event) =>
    ["influence", "sabotage", "incite", "annex", "purchase"].includes(
      event.method,
    ),
  ),
  false,
  "release does not leave an espionage modal or start another mission from its stale sample",
);
assert.equal(
  errors.some((message) => message.includes("autoFight.")),
  false,
);

console.log("captured foreign reconciliation runtime checks passed");
