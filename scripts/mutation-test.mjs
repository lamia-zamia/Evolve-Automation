import assert from "node:assert/strict";

import { runMutationAutomation } from "../src/application/mutation.ts";
import {
  createMutationCommandExecutor,
  createMutationReader,
} from "../src/adapters/evolve/traits/mutation.ts";
import { planMutation } from "../src/domain/traits/mutation.ts";

function createFixture(scenario) {
  const trace = [];
  const resources = {
    Plasmid: {
      name: "Plasmid",
      currentQuantity: scenario.plasmids ?? 20,
    },
    AntiPlasmid: {
      name: "Anti-Plasmid",
      currentQuantity: scenario.antiPlasmids ?? 30,
    },
  };
  const traits = (scenario.traits ?? []).map((definition) => ({
    traitName: definition.traitName,
    name: definition.name,
    canGain() {
      trace.push(["canGain", definition.traitName]);
      return definition.canGain;
    },
    canPurge() {
      if (definition.throwCanPurge) {
        throw new Error(`canPurge should not run: ${definition.traitName}`);
      }
      trace.push(["canPurge", definition.traitName]);
      return definition.canPurge;
    },
    mutationCost(kind) {
      const cost =
        typeof definition.cost === "function"
          ? definition.cost(kind)
          : definition.cost;
      trace.push(["cost", definition.traitName, kind, cost]);
      return cost;
    },
  }));
  const manager = {
    isUnlocked: () => scenario.unlocked,
    priorityList: traits,
    gainTrait: (traitName) => trace.push(["gain", traitName]),
    purgeTrait: (traitName) => trace.push(["purge", traitName]),
  };
  const game = {
    global: { race: { universe: scenario.universe ?? "standard" } },
  };
  const GameLog = {
    logSuccess: (type, message, tags) =>
      trace.push(["log", type, message, tags]),
  };
  return { trace, resources, manager, game, GameLog };
}

// Exact copy of the deleted factory algorithm, retained only as a parity oracle.
function runLegacy(scenario) {
  const fixture = createFixture(scenario);
  const m = fixture.manager;
  if (m.isUnlocked()) {
    const currency =
      fixture.game.global.race.universe === "antimatter"
        ? fixture.resources.AntiPlasmid
        : fixture.resources.Plasmid;
    for (const trait of m.priorityList) {
      if (trait.canGain()) {
        const mutationCost = trait.mutationCost("gain");
        m.gainTrait(trait.traitName);
        fixture.GameLog.logSuccess(
          "mutation",
          `Mutating in ${trait.name} for ${mutationCost} ${currency.name}`,
          ["progress"],
        );
        currency.currentQuantity -= mutationCost;
        break;
      }
      if (trait.canPurge()) {
        const mutationCost = trait.mutationCost("purge");
        m.purgeTrait(trait.traitName);
        fixture.GameLog.logSuccess(
          "mutation",
          `Mutating out ${trait.name} for ${mutationCost} ${currency.name}`,
          ["progress"],
        );
        currency.currentQuantity -= mutationCost;
        break;
      }
    }
  }
  return {
    trace: fixture.trace,
    plasmids: fixture.resources.Plasmid.currentQuantity,
    antiPlasmids: fixture.resources.AntiPlasmid.currentQuantity,
  };
}

function runModern(scenario) {
  const fixture = createFixture(scenario);
  const dependencies = {
    getMutableTraitManager: () => fixture.manager,
    getGame: () => fixture.game,
    getResources: () => fixture.resources,
  };
  const outcome = runMutationAutomation({
    reader: createMutationReader(dependencies),
    executor: createMutationCommandExecutor({
      ...dependencies,
      getGameLog: () => fixture.GameLog,
    }),
  });
  assert.equal(outcome.status, "succeeded");
  return {
    trace: fixture.trace,
    plasmids: fixture.resources.Plasmid.currentQuantity,
    antiPlasmids: fixture.resources.AntiPlasmid.currentQuantity,
  };
}

const parityScenarios = [
  { name: "locked mutation manager short-circuits", unlocked: false },
  {
    name: "first gain mutates once and logs",
    unlocked: true,
    plasmids: 20,
    traits: [
      {
        traitName: "strong",
        name: "Strong",
        canGain: true,
        canPurge: false,
        cost: 5,
      },
    ],
  },
  {
    name: "purge follows a false gain check",
    unlocked: true,
    plasmids: 20,
    traits: [
      {
        traitName: "frail",
        name: "Frail",
        canGain: false,
        canPurge: true,
        cost: 7,
      },
    ],
  },
  {
    name: "gain takes precedence without evaluating purge",
    unlocked: true,
    traits: [
      {
        traitName: "smart",
        name: "Smart",
        canGain: true,
        canPurge: true,
        throwCanPurge: true,
        cost: (kind) => (kind === "gain" ? 3 : 99),
      },
    ],
  },
  {
    name: "list order stops after the first actionable trait",
    unlocked: true,
    traits: [
      {
        traitName: "none",
        name: "None",
        canGain: false,
        canPurge: false,
        cost: 1,
      },
      {
        traitName: "second",
        name: "Second",
        canGain: true,
        canPurge: false,
        cost: 4,
      },
      {
        traitName: "later",
        name: "Later",
        canGain: true,
        canPurge: false,
        cost: 2,
      },
    ],
  },
  {
    name: "antimatter universe uses Anti-Plasmids",
    unlocked: true,
    universe: "antimatter",
    antiPlasmids: 40,
    traits: [
      {
        traitName: "cold",
        name: "Cold",
        canGain: false,
        canPurge: true,
        cost: 8,
      },
    ],
  },
  {
    name: "no actionable trait performs no command",
    unlocked: true,
    traits: [
      {
        traitName: "none",
        name: "None",
        canGain: false,
        canPurge: false,
        cost: 1,
      },
    ],
  },
  {
    name: "zero-cost mutation retains currency balance",
    unlocked: true,
    traits: [
      {
        traitName: "free",
        name: "Free",
        canGain: true,
        canPurge: false,
        cost: 0,
      },
    ],
  },
];

for (const scenario of parityScenarios) {
  assert.deepEqual(runModern(scenario), runLegacy(scenario), scenario.name);
}

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
      gainTrait: (name) => actions.push(["gain", name]),
      purgeTrait: (name) => actions.push(["purge", name]),
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
  manager: {
    priorityList: [{ traitName: "replacement" }],
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

console.log("Mutation automation dual-run and adapter tests passed");
