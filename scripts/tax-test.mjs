import assert from "node:assert/strict";

import { createAutoTax } from "../src/automation/civic/tax.ts";

function runTaxCase({
  taxRate = 10,
  requestedTaxRate = -1,
  morale = 100,
  moraleMax = 120,
  moraleAdjusted = false,
  moneyStorageRatio = 1,
  moneyDemanded = false,
  authority = 100,
  authorityMax = 100,
  authorityTarget = 0,
} = {}) {
  const actions = [];
  const resources = {
    Morale: {
      currentQuantity: morale,
      maxQuantity: moraleMax,
      rateOfChange: morale,
      incomeAdusted: moraleAdjusted,
    },
    Money: {
      storageRatio: moneyStorageRatio,
      isDemanded: () => moneyDemanded,
    },
    Authority: {
      currentQuantity: authority,
      maxQuantity: authorityMax,
      isUnlocked: () => true,
    },
  };
  const settings = {
    generalRequestedTaxRate: requestedTaxRate,
    generalMinimumTaxRate: 0,
    generalMinimumMorale: 100,
    generalMaximumMorale: 200,
    generalMinimumAuthority: authorityTarget,
  };
  const game = {
    global: {
      civic: { taxes: { display: true, tax_rate: taxRate } },
      race: {},
    },
  };
  let poly;
  const autoTax = createAutoTax({
    KeyManager: { set: (...args) => actions.push(["keys", ...args]) },
    getPoly: () => poly,
    getResources: () => resources,
    getSettings: () => settings,
    getGame: () => game,
    getVueById: () => ({
      add: () => actions.push(["add"]),
      sub: () => actions.push(["sub"]),
    }),
  });

  // Main initializes poly after wiring the controller, so it must be resolved lazily.
  poly = { taxCap: (minimum) => (minimum ? 0 : 50) };
  autoTax();
  return { actions, resources };
}

const forced = runTaxCase({ taxRate: 10, requestedTaxRate: 13 });
assert.deepEqual(forced.actions, [
  ["keys", false, false, false],
  ["add"],
  ["add"],
  ["add"],
]);
assert.equal(forced.resources.Morale.incomeAdusted, true);

const authority = runTaxCase({
  taxRate: 20,
  morale: 101,
  moraleMax: 140,
  authority: 80,
  authorityMax: 120,
  authorityTarget: 100,
});
assert.deepEqual(authority.actions, [["keys", false, false, false], ["add"]]);
assert.equal(authority.resources.Morale.incomeAdusted, true);

const alreadyAdjusted = runTaxCase({
  requestedTaxRate: 20,
  moraleAdjusted: true,
});
assert.deepEqual(
  alreadyAdjusted.actions,
  [],
  "taxes must only be adjusted once per tick",
);

console.log("Tax automation regression tests passed");
