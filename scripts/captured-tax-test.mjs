import assert from "node:assert/strict";
import { createCapturedTaxAutomation } from "../src/adapters/evolve/civic/captured-tax.ts";

let root = {
  civic: {
    taxes: { tax_rate: 20, display: true, incomeAdusted: false },
    govern: { type: "democracy" },
  },
  // The game keeps morale in `global.city.morale`; there is no `resource.Morale`.
  city: { morale: { current: 200, cap: 500, potential: 0, entertain: 0 } },
  resource: {
    Money: {
      amount: 50,
      max: 100,
      isDemanded: () => true,
    },
    Authority: { amount: 0, max: 100, display: true },
  },
  race: {},
  tech: {},
  genes: {},
};
const handle = {
  elementId: "tax_rates",
  generation: 1,
  methods: ["add", "sub"],
};
const controls = {
  resolve: (elementId) => (elementId === "tax_rates" ? handle : undefined),
  invoke: (_handle, method) => {
    assert.equal(_handle, handle);
    if (method === "add") root.civic.taxes.tax_rate += 1;
    else root.civic.taxes.tax_rate -= 1;
    return { ok: true, value: undefined };
  },
  capturedElementIds: () => ["tax_rates"],
};
const rootState = {
  readRoot: () => root,
  isReactivitySuppressed: () => false,
  subscribeRootReplaced: () => () => {},
};
const settings = {
  generalRequestedTaxRate: -1,
  generalMinimumTaxRate: 20,
  generalMinimumMorale: 105,
  generalMaximumMorale: 500,
  authorityManage: false,
  generalMinimumAuthority: 100,
};
const automation = createCapturedTaxAutomation({
  rootState,
  controls,
  readSettings: () => settings,
  nowMs: () => 10,
});

const snapshot = automation.reader.readSnapshot();
assert.equal(snapshot.status, "ready");
if (snapshot.status === "ready") {
  assert.equal(snapshot.tax.currentRate, 20);
  assert.equal(snapshot.tax.maximumRate, 30);
}
automation.runCycle();
assert.equal(root.civic.taxes.tax_rate, 21);

root.civic.taxes.display = false;
assert.equal(automation.reader.readSnapshot().status, "unavailable");

root = {
  ...root,
  civic: { ...root.civic, taxes: { ...root.civic.taxes, display: true } },
};
assert.deepEqual(
  automation.executor.execute({
    kind: "adjust-tax-rate",
    expectedRate: 21,
    batches: [],
  }),
  {
    status: "stale",
    failure: {
      code: "tax-session-missing",
      message: "tax read session is missing",
    },
  },
);

console.log("captured-tax ok");
