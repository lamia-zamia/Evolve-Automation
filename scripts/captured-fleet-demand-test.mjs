import assert from "node:assert/strict";

import { createCapturedFleetDemand } from "../src/adapters/evolve/combat/captured-fleet-demand.ts";

function element(attributes, children = []) {
  return {
    attributes: Object.entries(attributes).map(([name, value]) => ({
      name,
      value,
    })),
    querySelectorAll: () => children,
  };
}

const costs = element({}, [
  element({ class: "res-Money has-text-success", "data-money": "2500000" }),
  element({
    class: "res-Aluminium has-text-success",
    "data-aluminium": "500000",
  }),
]);
const root = {
  race: { truepath: true },
  tech: { syndicate: 1 },
  space: { shipyard: { blueprint: { class: "corvette" } } },
  resource: {
    Money: { max: 2500000 },
    Aluminium: { max: 500000 },
  },
};

function demand(resourceMaximums = root.resource, documentValue = costs) {
  return createCapturedFleetDemand({
    rootState: { readRoot: () => ({ ...root, resource: resourceMaximums }) },
    controls: {
      resolve: (elementId) =>
        elementId === "shipPlans"
          ? { elementId, generation: 1, methods: [] }
          : undefined,
      invoke: () => ({ ok: true, value: undefined }),
      capturedElementIds: () => ["shipPlans"],
    },
    getDocument: () => ({ querySelector: () => documentValue }),
  });
}

assert.deepEqual(demand().read(), {
  nextShipAffordable: true,
  nextShipCost: [
    { resourceId: "Money", amount: 2500000 },
    { resourceId: "Aluminium", amount: 500000 },
  ],
});
assert.equal(
  demand({ ...root.resource, Money: { max: 2499999 } }).read()
    .nextShipAffordable,
  false,
);
assert.equal(demand(root.resource, null).read(), undefined);
assert.equal(demand(root.resource, element({}, [])).read(), undefined);
console.log("Captured fleet demand adapter tests passed");
