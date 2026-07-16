import assert from "node:assert/strict";

import { createTaxAutomation } from "../src/bootstrap/tax.ts";

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
  authorityManage = true,
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
    authorityManage,
  };
  const game = {
    global: {
      civic: { taxes: { display: true, tax_rate: taxRate } },
      race: {},
    },
  };
  let now = 100;
  const automation = createTaxAutomation({
    getPoly: () => ({ taxCap: (minimum) => (minimum ? 0 : 50) }),
    getResources: () => resources,
    getSettings: () => settings,
    getGame: () => game,
    getVueById: () => ({
      add: () => {
        actions.push(["add"]);
        game.global.civic.taxes.tax_rate += 1;
      },
      sub: () => {
        actions.push(["sub"]);
        game.global.civic.taxes.tax_rate -= 1;
      },
    }),
    clearKeyModifiers: () => actions.push(["keys", false, false, false]),
    nowMs: () => now++,
  });

  automation.autoTax();
  return { actions, resources, trace: automation.getLastTrace() };
}

const forced = runTaxCase({ taxRate: 10, requestedTaxRate: 13 });
assert.deepEqual(forced.actions, [
  ["keys", false, false, false],
  ["add"],
  ["add"],
  ["add"],
]);
assert.equal(forced.resources.Morale.incomeAdusted, true);
assert.equal(forced.trace.snapshotId, "tax-snapshot-1");
assert.equal(forced.trace.results[0].status, "succeeded");

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

const unmanagedAuthority = runTaxCase({
  taxRate: 20,
  morale: 101,
  moraleMax: 140,
  authority: 80,
  authorityTarget: 100,
  authorityManage: false,
});
const noAuthorityTarget = runTaxCase({
  taxRate: 20,
  morale: 101,
  moraleMax: 140,
  authority: 80,
  authorityTarget: 0,
});
assert.deepEqual(unmanagedAuthority.actions, noAuthorityTarget.actions);

const alreadyAdjusted = runTaxCase({
  requestedTaxRate: 20,
  moraleAdjusted: true,
});
assert.deepEqual(alreadyAdjusted.actions, []);
assert.deepEqual(alreadyAdjusted.trace.results, []);

console.log("Tax automation application integration tests passed");
