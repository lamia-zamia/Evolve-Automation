import assert from "node:assert/strict";

import { planMutation } from "../src/domain/traits/mutation.ts";

assert.deepEqual(
  planMutation({
    unlocked: true,
    currency: { id: "Plasmid", name: "Plasmid", currentQuantity: 12 },
    traits: [
      {
        index: 0,
        canGain: false,
        canPurge: false,
        traitName: null,
        displayName: null,
        mutationCost: null,
      },
      {
        index: 1,
        canGain: false,
        canPurge: true,
        traitName: "frail",
        displayName: "Frail",
        mutationCost: 4,
      },
    ],
  }),
  {
    kind: "purge",
    index: 1,
    traitName: "frail",
    displayName: "Frail",
    mutationCost: 4,
    currencyId: "Plasmid",
    currencyName: "Plasmid",
    expectedCurrencyQuantity: 12,
  },
);
assert.equal(
  planMutation({ unlocked: false, currency: null, traits: [] }),
  null,
);

console.log("Mutation domain policy tests passed");
