import assert from "node:assert/strict";

import {
  createBrowserTaxControls,
  createKeyModifierController,
} from "../src/adapters/browser/tax-controls.ts";
import { createTaxCommandExecutor } from "../src/adapters/evolve/civic/tax-command-executor.ts";
import { createEvolveTaxReader } from "../src/adapters/evolve/civic/tax-reader.ts";
import { createTaxSettingsReader } from "../src/adapters/storage/tax-settings-reader.ts";

function makeContext() {
  return {
    game: {
      global: {
        civic: { taxes: { display: true, tax_rate: 20 } },
        race: {},
      },
    },
    resources: {
      Morale: {
        currentQuantity: 101,
        rateOfChange: 102,
        maxQuantity: 140,
        incomeAdusted: false,
      },
      Money: {
        storageRatio: 0.5,
        isDemanded: () => false,
      },
      Authority: {
        currentQuantity: 80,
        maxQuantity: 120,
        isUnlocked: () => true,
      },
    },
    poly: { taxCap: (minimum) => (minimum ? 0 : 50) },
    settings: {
      generalRequestedTaxRate: -1,
      generalMinimumTaxRate: 0,
      generalMinimumMorale: 100,
      generalMaximumMorale: 200,
      authorityManage: true,
      generalMinimumAuthority: 100,
    },
  };
}

let context = makeContext();
let controlsAvailable = true;
let now = 5;
const reader = createEvolveTaxReader({
  clock: { nowMs: () => now++ },
  controls: {
    isAvailable: () => controlsAvailable,
    adjust: () => true,
  },
  getGame: () => context.game,
  getPoly: () => context.poly,
  getResources: () => context.resources,
});

const ready = reader.readSnapshot();
assert.deepEqual(ready, {
  metadata: { id: "tax-snapshot-1", capturedAtMs: 5 },
  status: "ready",
  tax: { currentRate: 20, minimumRate: 0, maximumRate: 50 },
  morale: { current: 101, projected: 102, maximum: 140 },
  money: { storageRatio: 0.5, demanded: false },
  authority: { current: 80, maximum: 120, unlocked: true },
  banana: false,
});
assert.equal(Object.isFrozen(ready), true);
assert.equal(Object.isFrozen(ready.tax), true);

context.resources.Morale.incomeAdusted = true;
assert.deepEqual(reader.readSnapshot(), {
  metadata: { id: "tax-snapshot-2", capturedAtMs: 6 },
  status: "unavailable",
  reason: "morale-already-adjusted",
});
context.resources.Morale.incomeAdusted = false;
controlsAvailable = false;
assert.equal(reader.readSnapshot().reason, "controls-unavailable");
controlsAvailable = true;
context.game.global.civic.taxes.display = false;
assert.equal(reader.readSnapshot().reason, "taxes-hidden");
context = makeContext();
context.game.global.civic.taxes.tax_rate = "20";
assert.throws(() => reader.readSnapshot(), /tax_rate must be a finite number/);
context = makeContext();
context.poly.taxCap = (minimum) => (minimum ? 60 : 50);
assert.throws(() => reader.readSnapshot(), /cannot exceed/);
context = makeContext();
delete context.resources.Authority;
assert.throws(
  () => reader.readSnapshot(),
  /resources.Authority must be an object/,
);

context = makeContext();
const settingsReader = createTaxSettingsReader(() => context.settings);
assert.deepEqual(settingsReader.readSettings(), {
  requestedRate: -1,
  minimumRate: 0,
  minimumMorale: 100,
  maximumMorale: 200,
  manageAuthority: true,
  authorityTarget: 100,
});
context.settings.generalMaximumMorale = Number.NaN;
assert.throws(() => settingsReader.readSettings(), /finite number/);

let vue;
const browserControls = createBrowserTaxControls(() => vue);
assert.equal(browserControls.isAvailable(), false);
vue = {
  add() {
    this.added = true;
  },
  sub() {
    this.subtracted = true;
  },
};
assert.equal(browserControls.isAvailable(), true);
assert.equal(browserControls.adjust("increase"), true);
assert.equal(vue.added, true);
assert.equal(browserControls.adjust("decrease"), true);
assert.equal(vue.subtracted, true);
vue = { add() {} };
assert.throws(() => browserControls.isAvailable(), /tax controls.sub/);

context = makeContext();
const executionTrace = [];
let executorControlsAvailable = true;
const executor = createTaxCommandExecutor({
  controls: {
    isAvailable: () => executorControlsAvailable,
    adjust: (direction) => {
      executionTrace.push(direction);
      context.game.global.civic.taxes.tax_rate +=
        direction === "increase" ? 1 : -1;
      return true;
    },
  },
  keyModifiers: createKeyModifierController(() =>
    executionTrace.push("clear-keys"),
  ),
  getGame: () => context.game,
  getResources: () => context.resources,
});

function envelope(command) {
  return {
    id: "command-1",
    expectedSnapshotId: "snapshot-1",
    command,
  };
}

let adjustedWrites = 0;
let adjusted = false;
Object.defineProperty(context.resources.Morale, "incomeAdusted", {
  get: () => adjusted,
  set: (value) => {
    adjustedWrites += 1;
    adjusted = value;
  },
});
assert.deepEqual(
  executor.execute(
    envelope({
      kind: "adjust-tax-rate",
      expectedRate: 20,
      batches: [
        {
          operations: [
            { direction: "decrease", count: 2 },
            { direction: "increase", count: 1 },
          ],
        },
      ],
    }),
  ),
  { status: "succeeded" },
);
assert.deepEqual(executionTrace, [
  "clear-keys",
  "decrease",
  "decrease",
  "increase",
]);
assert.equal(context.game.global.civic.taxes.tax_rate, 19);
assert.equal(adjustedWrites, 1);

adjusted = false;
context.game.global.civic.taxes.tax_rate = 20;
executionTrace.length = 0;
assert.equal(
  executor.execute(
    envelope({
      kind: "adjust-tax-rate",
      expectedRate: 20,
      batches: [
        { operations: [{ direction: "increase", count: 1 }] },
        { operations: [{ direction: "decrease", count: 1 }] },
      ],
    }),
  ).status,
  "succeeded",
);
assert.deepEqual(executionTrace, [
  "clear-keys",
  "increase",
  "clear-keys",
  "decrease",
]);
assert.equal(adjustedWrites, 3);

adjusted = false;
context.game.global.civic.taxes.tax_rate = 21;
const staleRate = executor.execute(
  envelope({ kind: "adjust-tax-rate", expectedRate: 20, batches: [] }),
);
assert.equal(staleRate.status, "stale");
assert.equal(staleRate.failure.code, "stale-tax-rate");
context.game.global.civic.taxes.tax_rate = 20;
executorControlsAvailable = false;
assert.equal(
  executor.execute(
    envelope({ kind: "adjust-tax-rate", expectedRate: 20, batches: [] }),
  ).failure.code,
  "tax-controls-unavailable",
);
executorControlsAvailable = true;
context.game.global.civic.taxes.display = false;
assert.equal(
  executor.execute(
    envelope({ kind: "adjust-tax-rate", expectedRate: 20, batches: [] }),
  ).failure.code,
  "taxes-hidden",
);
context.game.global.civic.taxes.display = true;
adjusted = true;
assert.equal(
  executor.execute(
    envelope({ kind: "adjust-tax-rate", expectedRate: 20, batches: [] }),
  ).failure.code,
  "morale-already-adjusted",
);
adjusted = false;
assert.equal(
  executor.execute(
    envelope({
      kind: "adjust-tax-rate",
      expectedRate: 20,
      batches: [{ operations: [{ direction: "increase", count: -1 }] }],
    }),
  ).failure.code,
  "invalid-tax-adjustment-count",
);

console.log("Tax adapter contract tests passed");
