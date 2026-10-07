import assert from "node:assert/strict";

import { startCapturedRuntime } from "../src/bootstrap/captured-runtime-control.ts";

const root = {
  race: { governor: { tasks: { t0: "none" } } },
  tech: { spy: 1, unify: 0, armor: 0 },
  stats: { attacks: 0, achieve: {} },
  civic: {
    govern: { type: "democracy" },
    garrison: {
      display: true,
      mercs: false,
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
    },
    foreign: {
      gov0: {
        mil: 70,
        spy: 0,
        trn: 0,
        sab: 0,
        act: "none",
        hstl: 0,
        unrest: 0,
        eco: 1,
        occ: false,
        anx: false,
        buy: false,
      },
      gov1: {
        mil: 70,
        spy: 0,
        trn: 0,
        sab: 0,
        act: "none",
        hstl: 0,
        unrest: 0,
        eco: 1,
        occ: false,
        anx: false,
        buy: false,
      },
    },
  },
  resource: {
    Money: { amount: 100_000, max: 100_000, diff: 100, display: true },
    Knowledge: { amount: 0, max: 100_000, display: true, diff: 0, value: 1 },
  },
  city: { biome: "plains", ptrait: [], morale: { current: 250 } },
  space: {},
  portal: {},
  eden: {},
  settings: { civTabs: 3, spaceTabs: 0, showPortal: false, mKeys: false },
};
const calls = [];
const errors = [];
let cycle;
const garrison = {
  elementId: "garrison",
  generation: 1,
  methods: [
    "vis",
    "hire",
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
    mechanics: { readStructures: () => undefined },
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls: {
      resolve: (id) =>
        id === "garrison" ? garrison : id === "foreign" ? foreign : undefined,
      invoke(handle, method, args = []) {
        calls.push(
          `${handle.elementId}.${method}${args.length ? `(${args[0]})` : ""}`,
        );
        if (handle === garrison && method === "vis") {
          return { ok: true, value: true };
        }
        if (handle === garrison && method === "campaign") {
          root.stats.attacks += 1;
          return { ok: true, value: undefined };
        }
        if (handle === garrison && method === "hell") {
          return { ok: true, value: root.civic.garrison.cityGarrison };
        }
        if (handle === garrison && method === "s_max") {
          return { ok: true, value: root.civic.garrison.maxCityGarrison };
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
          root.civic.garrison.raid += 1;
          return { ok: true, value: undefined };
        }
        if (handle === garrison && method === "aLast") {
          root.civic.garrison.raid -= 1;
          return { ok: true, value: undefined };
        }
        if (handle === foreign && method === "vis") {
          return { ok: true, value: true };
        }
        if (handle === foreign && method === "gvis") {
          return {
            ok: true,
            value: root.civic.foreign[`gov${args[0]}`] !== undefined,
          };
        }
        if (handle === foreign && method === "spy_disabled") {
          return { ok: true, value: false };
        }
        if (handle === foreign && method === "spy") {
          const index = args[0];
          root.civic.foreign[`gov${index}`].trn = 300;
          return { ok: true, value: undefined };
        }
        return { ok: true, value: false };
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
  storage: {
    getItem: () =>
      JSON.stringify({
        masterScriptToggle: true,
        tickRate: 1,
        autoFight: true,
        foreignTrainSpy: true,
        foreignSpyMax: 0,
        foreignPowerRequired: 75,
        foreignPolicyInferior: "Ignore",
        foreignPolicySuperior: "Ignore",
        foreignPolicyRival: "Ignore",
        foreignUnification: false,
        foreignForceSabotage: true,
        foreignOccupyLast: false,
        achievementGuards: false,
      }),
  },
  logError: (message) => errors.push(message),
});

try {
  cycle({ periods: 1 });
} finally {
  stop();
}

assert.ok(calls.includes("foreign.spy(1)"), JSON.stringify(calls));
assert.equal(calls.includes("foreign.spy(0)"), false, JSON.stringify(calls));
assert.equal(root.civic.foreign.gov0.trn, 0);
assert.ok(root.civic.foreign.gov1.trn > 0, root.civic.foreign.gov1.trn);
assert.ok(calls.includes("garrison.campaign(1)"), JSON.stringify(calls));
assert.equal(
  calls.includes("garrison.campaign(0)"),
  false,
  JSON.stringify(calls),
);
assert.equal(root.stats.attacks, 1, "Battle's game control mutates game state");
assert.equal(
  errors.some((message) => message.includes("autoFight.spy:")),
  false,
  JSON.stringify(errors),
);

console.log("captured spy-training runtime checks passed");
