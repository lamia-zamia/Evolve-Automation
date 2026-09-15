import assert from "node:assert/strict";

import { runCapturedSpyTraining } from "../src/application/captured-spy-training.ts";
import { createCapturedSpyTraining } from "../src/adapters/evolve/combat/captured-spy-training.ts";
import { planCapturedSpyTraining } from "../src/domain/combat/captured-spy-training.ts";

const root = {
  tech: { spy: 1 },
  civic: {
    foreign: {
      gov0: { spy: 0, trn: 0, occ: false, anx: false, buy: false },
      gov1: { spy: 2, trn: 0, occ: false, anx: false, buy: false },
      gov2: { spy: 0, trn: 0, occ: false, anx: false, buy: false },
    },
  },
};
const settings = { foreignTrainSpy: true, foreignSpyMax: 2 };
const trace = [];
const foreign = {
  elementId: "foreign",
  generation: 1,
  methods: ["vis", "gvis", "spy_disabled", "spy"],
};
const controls = {
  resolve: (id) => (id === "foreign" ? foreign : undefined),
  invoke: (handle, method, args = []) => {
    assert.equal(handle, foreign);
    if (method === "vis") return { ok: true, value: true };
    if (method === "gvis") {
      return { ok: true, value: args[0] === 0 || args[0] === 1 };
    }
    if (method === "spy_disabled") {
      return { ok: true, value: args[0] === 1 };
    }
    if (method === "spy") {
      trace.push([method, args[0]]);
      root.civic.foreign.gov0.trn = 300;
      return { ok: true, value: undefined };
    }
    return { ok: false, reason: "unknown-method" };
  },
  capturedElementIds: () => ["foreign"],
};

const adapter = createCapturedSpyTraining({
  rootState: {
    readRoot: () => root,
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls,
  readSettings: () => settings,
});

assert.deepEqual(adapter.reader.readCycle(), {
  available: true,
  governmentCount: 2,
});
const first = adapter.reader.readGovernment(0);
assert.equal(first.disabled, false);
assert.deepEqual(planCapturedSpyTraining(first), {
  kind: "train-spy",
  governmentIndex: 0,
  expectedSpyCount: 0,
  expectedTraining: 0,
});
assert.equal(runCapturedSpyTraining(adapter).status, "succeeded");
assert.deepEqual(trace, [["spy", 0]]);
assert.equal(root.civic.foreign.gov0.trn, 300);

settings.foreignTrainSpy = false;
assert.deepEqual(adapter.reader.readCycle(), {
  available: false,
  governmentCount: 0,
});

assert.equal(
  planCapturedSpyTraining({
    ...first,
    enabled: true,
    maximum: 0,
  }),
  null,
);

console.log("captured spy-training checks passed");
