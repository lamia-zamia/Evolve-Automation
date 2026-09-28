import assert from "node:assert/strict";

import { startCapturedRuntime } from "../src/bootstrap/captured-runtime-control.ts";

const root = {
  race: {},
  tech: { spy: 1 },
  stats: { achieve: {} },
  civic: {
    garrison: { display: true, mercs: false, workers: 0, max: 0, crew: 0 },
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
    },
  },
  resource: {
    Money: { amount: 100_000, max: 100_000, diff: 100, display: true },
  },
  space: {},
  portal: {},
  eden: {},
  settings: { civTabs: 3, spaceTabs: 0 },
};
const calls = [];
const errors = [];
let cycle;
const garrison = {
  elementId: "garrison",
  generation: 1,
  methods: ["vis", "hire", "hell", "s_max"],
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
      invoke(handle, method, args = []) {
        calls.push(
          `${handle.elementId}.${method}${args.length ? `(${args[0]})` : ""}`,
        );
        if (handle === garrison && method === "vis") {
          return { ok: true, value: false };
        }
        if (handle === foreign && method === "vis") {
          return { ok: true, value: true };
        }
        if (handle === foreign && method === "gvis") {
          return { ok: true, value: args[0] === 0 };
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
        foreignPolicyInferior: "Influence",
        foreignPolicySuperior: "Ignore",
        foreignPolicyRival: "Ignore",
        foreignUnification: false,
        foreignForceSabotage: false,
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

assert.ok(calls.includes("foreign.spy(0)"), JSON.stringify(calls));
assert.equal(root.civic.foreign.gov0.trn, 300);
assert.equal(
  errors.some((message) => message.includes("autoFight.spy:")),
  false,
  JSON.stringify(errors),
);

console.log("captured spy-training runtime checks passed");
