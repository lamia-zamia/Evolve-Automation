import assert from "node:assert/strict";

import {
  createMutationCommandExecutor,
  createMutationReader,
} from "../src/adapters/evolve/traits/mutation.ts";
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

let lockedPriorityRead = false;
const lockedInput = createMutationReader({
  getMutableTraitManager: () => ({
    isUnlocked: () => false,
    get priorityList() {
      lockedPriorityRead = true;
      throw new Error("irrelevant priority-list read");
    },
  }),
  getGame: () => {
    throw new Error("irrelevant game read");
  },
  getResources: () => {
    throw new Error("irrelevant resource read");
  },
}).read();
assert.deepEqual(lockedInput, { unlocked: false, currency: null, traits: [] });
assert.equal(lockedPriorityRead, false);

const noActionInput = createMutationReader({
  getMutableTraitManager: () => ({
    isUnlocked: () => true,
    priorityList: [{ canGain: () => false, canPurge: () => false }],
  }),
  getGame: () => ({ global: { race: { universe: "standard" } } }),
  getResources: () => {
    throw new Error("no actionable trait must not read currency fields");
  },
}).read();
assert.equal(noActionInput.currency, null);

assert.throws(
  () =>
    createMutationReader({
      getMutableTraitManager: () => ({
        isUnlocked: () => true,
        priorityList: null,
      }),
      getGame: () => ({ global: { race: {} } }),
      getResources: () => ({}),
    }).read(),
  /MutableTraitManager\.priorityList must be an array/,
);
assert.throws(
  () =>
    createMutationReader({
      getMutableTraitManager: () => ({
        isUnlocked: () => true,
        priorityList: [
          {
            traitName: "bad",
            name: "Bad",
            canGain: () => true,
            mutationCost: () => -1,
          },
        ],
      }),
      getGame: () => ({ global: { race: {} } }),
      getResources: () => ({
        Plasmid: { name: "Plasmid", currentQuantity: 10 },
      }),
    }).read(),
  /mutationCost\(gain\) must be non-negative/,
);

function executorFixture(overrides = {}) {
  const actions = [];
  const state = {
    game: { global: { race: { universe: "standard" } } },
    resources: {
      Plasmid: { name: "Plasmid", currentQuantity: 10 },
      AntiPlasmid: { name: "Anti-Plasmid", currentQuantity: 20 },
    },
    manager: {
      priorityList: [{ traitName: "strong" }],
    },
    traitControls: {
      gainTrait: (name) => (actions.push(["gain", name]), true),
      purgeTrait: (name) => (actions.push(["purge", name]), true),
    },
    GameLog: {
      logSuccess: (...args) => actions.push(["log", ...args]),
    },
    ...overrides,
  };
  return {
    state,
    actions,
    executor: createMutationCommandExecutor({
      getMutableTraitManager: () => state.manager,
      getGame: () => state.game,
      getResources: () => state.resources,
      traitControls: {
        gainTrait: (name) => state.traitControls.gainTrait(name),
        purgeTrait: (name) => state.traitControls.purgeTrait(name),
      },
      getGameLog: () => state.GameLog,
    }),
  };
}

const staleCurrency = executorFixture();
staleCurrency.state.resources.Plasmid.currentQuantity = 9;
const staleCurrencyOutcome = staleCurrency.executor.execute({
  kind: "gain",
  index: 0,
  traitName: "strong",
  displayName: "Strong",
  mutationCost: 5,
  currencyId: "Plasmid",
  currencyName: "Plasmid",
  expectedCurrencyQuantity: 10,
});
assert.equal(staleCurrencyOutcome.status, "stale");
assert.deepEqual(staleCurrency.actions, []);

const staleTrait = executorFixture({
  manager: { priorityList: [{ traitName: "replacement" }] },
  traitControls: {
    gainTrait: () => {
      throw new Error("stale mutation executed");
    },
  },
});
const staleTraitOutcome = staleTrait.executor.execute({
  kind: "gain",
  index: 0,
  traitName: "strong",
  displayName: "Strong",
  mutationCost: 5,
  currencyId: "Plasmid",
  currencyName: "Plasmid",
  expectedCurrencyQuantity: 10,
});
assert.equal(staleTraitOutcome.status, "stale");
assert.deepEqual(staleTrait.actions, []);

const malformedLogger = executorFixture({ GameLog: {} });
assert.throws(
  () =>
    malformedLogger.executor.execute({
      kind: "gain",
      index: 0,
      traitName: "strong",
      displayName: "Strong",
      mutationCost: 5,
      currencyId: "Plasmid",
      currencyName: "Plasmid",
      expectedCurrencyQuantity: 10,
    }),
  /GameLog\.logSuccess must be a function/,
);
assert.deepEqual(
  malformedLogger.actions,
  [],
  "logger is validated before mutation",
);
assert.equal(malformedLogger.state.resources.Plasmid.currentQuantity, 10);

// An unoffered trait panel spends nothing, so neither the log nor the currency
// model may record a mutation that never happened.
const unoffered = executorFixture({
  traitControls: { gainTrait: () => false },
});
const unofferedOutcome = unoffered.executor.execute({
  kind: "gain",
  index: 0,
  traitName: "strong",
  displayName: "Strong",
  mutationCost: 5,
  currencyId: "Plasmid",
  currencyName: "Plasmid",
  expectedCurrencyQuantity: 10,
});
assert.equal(unofferedOutcome.status, "stale");
assert.equal(unofferedOutcome.failure.code, "stale-mutation-panel");
assert.deepEqual(unoffered.actions, []);
assert.equal(unoffered.state.resources.Plasmid.currentQuantity, 10);

const gained = executorFixture();
const gainedOutcome = gained.executor.execute({
  kind: "gain",
  index: 0,
  traitName: "strong",
  displayName: "Strong",
  mutationCost: 5,
  currencyId: "Plasmid",
  currencyName: "Plasmid",
  expectedCurrencyQuantity: 10,
});
assert.equal(gainedOutcome.status, "succeeded");
assert.deepEqual(gained.actions, [
  ["gain", "strong"],
  ["log", "mutation", "Mutating in Strong for 5 Plasmid", ["progress"]],
]);
assert.equal(gained.state.resources.Plasmid.currentQuantity, 5);

const purged = executorFixture();
const purgedOutcome = purged.executor.execute({
  kind: "purge",
  index: 0,
  traitName: "strong",
  displayName: "Strong",
  mutationCost: 4,
  currencyId: "Plasmid",
  currencyName: "Plasmid",
  expectedCurrencyQuantity: 10,
});
assert.equal(purgedOutcome.status, "succeeded");
assert.deepEqual(purged.actions, [
  ["purge", "strong"],
  ["log", "mutation", "Mutating out Strong for 4 Plasmid", ["progress"]],
]);
assert.equal(purged.state.resources.Plasmid.currentQuantity, 6);

console.log("Mutation automation adapter and regression tests passed");
