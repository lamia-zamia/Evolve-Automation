import assert from "node:assert/strict";

import {
  createCapturedTraitAutomation,
  GENETICS_BREAKDOWN_CONTROL,
} from "../src/adapters/evolve/traits/captured-trait-automation.ts";
import { readCapturedMutationCost } from "../src/adapters/evolve/traits/captured-mutation-cost.ts";
import { planGeneticsMinorTrait } from "../src/domain/traits/minor-trait.ts";
import { planGeneticsMutation } from "../src/domain/traits/mutation.ts";
import {
  runGeneticsMinorTraitAutomation,
  runGeneticsMutationAutomation,
} from "../src/application/genetics-traits.ts";
import { startCapturedRuntime } from "../src/bootstrap/captured-runtime-control.ts";
import { createCapturedTraitControl } from "../src/bootstrap/captured-trait-control.ts";

function gameFibonacci(index) {
  let previous = 1;
  let current = 1;
  for (let step = 0; step < index; step += 1) {
    const next = previous + current;
    previous = current;
    current = next;
  }
  return previous;
}

function node({
  className = "",
  textContent = "",
  tagName,
  children = [],
} = {}) {
  return {
    className,
    textContent,
    tagName,
    querySelector(selector) {
      if (selector === "h4") {
        return children.find((child) => child.tagName === "H4") ?? null;
      }
      return null;
    },
    querySelectorAll(selector) {
      return selector === "*" ? children : [];
    },
  };
}

function minorRow(traitId) {
  return node({
    className: `trait t-${traitId} traitRow`,
    children: [
      { tagName: "H4", textContent: traitId },
      node({ className: "basic-button gene gbuy" }),
    ],
  });
}

function mutationRow(operation, traitId) {
  return node({
    className: "traitRow",
    children: [
      node({
        className: `${operation === "gain" ? "add" : "remove"}${traitId} basic-button`,
      }),
    ],
  });
}

function createFixture({
  genes = 100,
  minor = { smart: 0 },
  minorRows = Object.keys(minor),
  mtorder = minorRows,
  livingExtinction = false,
  mutationRows = [],
  mutationCosts = {},
  readMutationCost = false,
  plasmids = 1000,
  phage = 0,
  settings = {},
  noop = false,
  methods = [
    "gene",
    "genePurchasable",
    "geneCost",
    "gain",
    "purge",
    "addCost",
    "removeCost",
  ],
} = {}) {
  const root = {
    tech: { genetics: 3, living_extinction: livingExtinction },
    settings: { mtorder },
    race: {
      universe: "standard",
      species: "human",
      minor: { ...minor },
    },
    resource: { Genes: { amount: genes } },
    prestige: {
      Plasmid: { count: plasmids },
      AntiPlasmid: { count: plasmids },
      Phage: { count: phage },
    },
  };
  const calls = [];
  let generation = 1;
  const handle = {
    elementId: GENETICS_BREAKDOWN_CONTROL,
    generation: 1,
    methods,
  };
  const mutationCost = (traitId, operation) =>
    mutationCosts[`${operation}:${traitId}`];
  const minorCost = (traitId) => {
    const rank = root.race.minor[traitId] ?? 0;
    return gameFibonacci(rank + 4) * (traitId === "mastery" ? 5 : 1);
  };
  const document = {
    querySelectorAll(selector) {
      if (selector === "#geneticBreakdown #geneticMinor .traitRow") {
        return minorRows.map(minorRow);
      }
      if (selector === "#geneticBreakdown .traitRow") {
        return [
          ...minorRows.map(minorRow),
          ...mutationRows.map(({ operation, traitId }) =>
            mutationRow(operation, traitId),
          ),
        ];
      }
      return [];
    },
  };
  const controls = {
    resolve: (id) =>
      id === GENETICS_BREAKDOWN_CONTROL ? { ...handle, generation } : undefined,
    capturedElementIds: () => [GENETICS_BREAKDOWN_CONTROL],
    invoke: (currentHandle, method, args = []) => {
      calls.push({
        elementId: currentHandle.elementId,
        method,
        args: [...args],
      });
      const [traitId] = args;
      if (method === "geneCost") {
        return {
          ok: true,
          value: `Buy ${traitId} for ${minorCost(traitId)} Genes`,
        };
      }
      if (method === "genePurchasable") {
        return {
          ok: true,
          value:
            !root.tech.living_extinction &&
            root.resource.Genes.amount >= minorCost(traitId),
        };
      }
      if (method === "gene") {
        if (noop) return { ok: true, value: undefined };
        const cost = minorCost(traitId);
        if (root.tech.living_extinction || root.resource.Genes.amount < cost) {
          return { ok: true, value: undefined };
        }
        root.resource.Genes.amount -= cost;
        root.race.minor[traitId] = (root.race.minor[traitId] ?? 0) + 1;
        root.race[traitId] = (root.race[traitId] ?? 0) + 1;
        return { ok: true, value: undefined };
      }
      if (method === "addCost" || method === "removeCost") {
        const operation = method === "addCost" ? "gain" : "purge";
        return {
          ok: true,
          value: `${operation} ${traitId} for ${mutationCost(traitId, operation)} Plasmids`,
        };
      }
      if (method === "gain" || method === "purge") {
        if (noop) return { ok: true, value: undefined };
        const cost = mutationCost(traitId, method);
        if (cost === undefined || root.prestige.Plasmid.count < cost) {
          return { ok: true, value: undefined };
        }
        root.prestige.Plasmid.count -= cost;
        if (method === "gain") root.race[traitId] = 1;
        else delete root.race[traitId];
        return { ok: true, value: undefined };
      }
      return { ok: false, reason: "unknown-method" };
    },
  };
  const minorPolicy = Object.fromEntries(
    minorRows.flatMap((traitId, index) => [
      [`mTrait_${traitId}`, true],
      [`mTrait_p_${traitId}`, index],
      [`mTrait_w_${traitId}`, 1],
    ]),
  );
  const dependencies = {
    rootState: { readRoot: () => root },
    controls,
    keyState: { readPressed: () => false },
    getDocument: () => document,
    readSettings: () => ({
      doNotGoBelowPlasmidSoftcap: false,
      minimumPlasmidsToPreserve: 0,
      ...minorPolicy,
      ...settings,
    }),
    ...(readMutationCost
      ? {
          readMutationCost: (_root, traitId, operation) =>
            mutationCost(traitId, operation),
        }
      : {}),
  };
  const captured = createCapturedTraitAutomation(dependencies);
  return {
    root,
    captured,
    dependencies,
    calls,
    bumpGeneration: () => {
      generation += 1;
    },
  };
}

// The normalized sample follows the live contract: one #geneticBreakdown binding, minor rows
// under #geneticMinor, and levels in race.minor. The presentation methods are intentionally
// strings and must not be consulted for numeric costs.
{
  const fixture = createFixture({
    genes: 100,
    minor: { smart: 0, mastery: 1 },
    minorRows: ["smart", "mastery"],
    mtorder: ["mastery", "smart"],
  });
  const input = fixture.captured.minor.reader.read();
  assert.equal(input.available, true);
  assert.deepEqual(input.traits, [
    {
      traitId: "mastery",
      source: "genetic-breakdown",
      rank: 1,
      cost: null,
      eligible: true,
      enabled: true,
      priority: 1,
      weighting: 1,
    },
    {
      traitId: "smart",
      source: "genetic-breakdown",
      rank: 0,
      cost: null,
      eligible: true,
      enabled: true,
      priority: 0,
      weighting: 1,
    },
  ]);
  assert.deepEqual(
    fixture.calls.filter(({ method }) =>
      ["geneCost", "addCost", "removeCost"].includes(method),
    ),
    [],
  );
}

// The game predicate can make every currently rendered minor trait ineligible.
{
  const fixture = createFixture({ genes: 1 });
  assert.deepEqual(runGeneticsMinorTraitAutomation(fixture.captured.minor), {
    status: "succeeded",
  });
  assert.equal(
    fixture.calls.some(({ method }) => method === "gene"),
    false,
  );
}

// The ordered mtorder list is the current game's meaningful minor-trait priority.
{
  const fixture = createFixture({
    genes: 50,
    minor: { smart: 0, mastery: 0 },
    minorRows: ["smart", "mastery"],
    mtorder: ["mastery", "smart"],
    settings: {
      mTrait_p_smart: 0,
      mTrait_p_mastery: 0,
    },
  });
  assert.equal(
    planGeneticsMinorTrait(fixture.captured.minor.reader.read())?.traitId,
    "mastery",
  );
}

// Script policy can disable a live offer, and weighting remains meaningful when candidates share
// a configured priority. The live mtorder list is only the final tie-break.
{
  const disabled = createFixture({
    genes: 50,
    minor: { smart: 0, mastery: 0 },
    minorRows: ["smart", "mastery"],
    mtorder: ["smart", "mastery"],
    settings: { mTrait_smart: false },
  });
  assert.equal(
    planGeneticsMinorTrait(disabled.captured.minor.reader.read())?.traitId,
    "mastery",
  );
  assert.deepEqual(disabled.captured.minor.reader.read().traits[0], {
    traitId: "smart",
    source: "genetic-breakdown",
    rank: 0,
    cost: null,
    eligible: true,
    enabled: false,
    priority: 0,
    weighting: 1,
  });
  const disabledOnly = createFixture({
    genes: 50,
    minor: { smart: 0 },
    minorRows: ["smart"],
    settings: { mTrait_smart: false },
  });
  assert.deepEqual(
    runGeneticsMinorTraitAutomation(disabledOnly.captured.minor),
    { status: "succeeded" },
  );
  assert.equal(
    disabledOnly.calls.some(({ method }) => method === "gene"),
    false,
  );

  const weighted = createFixture({
    genes: 50,
    minor: { smart: 0, mastery: 0 },
    minorRows: ["smart", "mastery"],
    mtorder: ["smart", "mastery"],
    settings: {
      mTrait_p_smart: 0,
      mTrait_p_mastery: 0,
      mTrait_w_smart: 1,
      mTrait_w_mastery: 3,
    },
  });
  assert.equal(
    planGeneticsMinorTrait(weighted.captured.minor.reader.read())?.traitId,
    "mastery",
  );
}

// A live minor upgrade spends the game-derived cost and verifies both race.minor and race[trait].
{
  const fixture = createFixture({ genes: 10 });
  fixture.root.race.smart = 1;
  assert.deepEqual(runGeneticsMinorTraitAutomation(fixture.captured.minor), {
    status: "succeeded",
  });
  assert.equal(fixture.root.race.minor.smart, 1);
  assert.equal(fixture.root.race.smart, 2);
  assert.equal(fixture.root.resource.Genes.amount, 5);
  assert.equal(
    fixture.calls.some(({ method }) => method === "geneCost"),
    false,
  );
}

// An unknown minor capability is a stand-down, not a fallback to the display method.
{
  const fixture = createFixture({ methods: ["gene", "geneCost"] });
  assert.deepEqual(runGeneticsMinorTraitAutomation(fixture.captured.minor), {
    status: "succeeded",
  });
  assert.equal(
    fixture.calls.some(({ method }) => method === "gene"),
    false,
  );
}

// A rebound breakdown control is stale and cannot execute a sampled decision.
{
  const fixture = createFixture({ genes: 10 });
  const decision = planGeneticsMinorTrait(fixture.captured.minor.reader.read());
  assert.ok(decision);
  fixture.bumpGeneration();
  assert.equal(
    fixture.captured.minor.executor.execute(decision).status,
    "stale",
  );
  assert.equal(
    fixture.calls.some(({ method }) => method === "gene"),
    false,
  );
}

// A successful invocation with no verified state blocks the unchanged target and all alternatives.
{
  const fixture = createFixture({
    minor: { smart: 0, hardy: 0 },
    minorRows: ["smart", "hardy"],
    mtorder: ["smart", "hardy"],
    genes: 20,
    noop: true,
  });
  assert.equal(
    runGeneticsMinorTraitAutomation(fixture.captured.minor).status,
    "stale",
  );
  assert.equal(
    runGeneticsMinorTraitAutomation(fixture.captured.minor).status,
    "succeeded",
  );
  assert.deepEqual(
    fixture.calls
      .filter(({ method }) => method === "gene")
      .map(({ args }) => args[0]),
    ["smart"],
  );
}

// Legacy mutation policy remains meaningful through explicit gain/purge flags and numeric
// priorities, while the live panel rows determine which operations the game currently offers.
{
  const fixture = createFixture({
    mutationRows: [
      { operation: "purge", traitId: "old" },
      { operation: "gain", traitId: "new" },
    ],
    mutationCosts: { "purge:old": 10, "gain:new": 10 },
    readMutationCost: true,
    plasmids: 100,
    settings: {
      mutableTrait_gain_new: true,
      mutableTrait_p_new: 1,
      mutableTrait_purge_old: true,
      mutableTrait_p_old: 10,
    },
  });
  fixture.root.race.old = 1;
  assert.equal(
    planGeneticsMutation(fixture.captured.mutation.reader.read())?.traitId,
    "new",
  );
  assert.deepEqual(runGeneticsMutationAutomation(fixture.captured.mutation), {
    status: "succeeded",
  });
  assert.equal(fixture.root.race.new, 1);
  assert.equal(fixture.root.prestige.Plasmid.count, 90);
  assert.equal(
    fixture.calls.some(({ method }) =>
      ["addCost", "removeCost"].includes(method),
    ),
    false,
  );
}

// A mutation absent from the live breakdown is illegal even if the script has a policy and cost.
{
  const fixture = createFixture({
    mutationCosts: { "gain:new": 10 },
    readMutationCost: true,
    settings: { mutableTrait_gain_new: true, mutableTrait_p_new: 0 },
  });
  assert.deepEqual(runGeneticsMutationAutomation(fixture.captured.mutation), {
    status: "succeeded",
  });
  assert.equal(
    fixture.calls.some(({ method }) => method === "gain"),
    false,
  );
}

// A missing action method is an unknown game capability, not an invitation to invoke a display
// helper or guess a mutation operation.
{
  const fixture = createFixture({
    mutationRows: [{ operation: "gain", traitId: "new" }],
    methods: ["gene", "genePurchasable"],
    settings: { mutableTrait_gain_new: true, mutableTrait_p_new: 0 },
  });
  assert.deepEqual(runGeneticsMutationAutomation(fixture.captured.mutation), {
    status: "succeeded",
  });
  assert.equal(
    fixture.calls.some(({ method }) => method === "gain"),
    false,
  );
  assert.equal(fixture.root.race.new, undefined);
}

// Without numeric mutation costs, a configured reserve is preserved by refusing to act.
{
  const fixture = createFixture({
    mutationRows: [{ operation: "gain", traitId: "new" }],
    mutationCosts: { "gain:new": 10 },
    plasmids: 500,
    phage: 0,
    settings: {
      doNotGoBelowPlasmidSoftcap: true,
      mutableTrait_gain_new: true,
      mutableTrait_p_new: 0,
    },
  });
  assert.deepEqual(runGeneticsMutationAutomation(fixture.captured.mutation), {
    status: "succeeded",
  });
  assert.equal(fixture.root.race.new, undefined);
  assert.equal(fixture.root.prestige.Plasmid.count, 500);
  assert.equal(
    fixture.calls.some(({ method }) =>
      ["addCost", "removeCost", "gain", "purge"].includes(method),
    ),
    false,
  );
}

// With reserve zero, the game-owned gain method can decide affordability and the executor verifies
// the resulting trait/currency state without ever treating addCost() as numeric.
{
  const fixture = createFixture({
    mutationRows: [{ operation: "gain", traitId: "new" }],
    mutationCosts: { "gain:new": 10 },
    plasmids: 10,
    settings: {
      doNotGoBelowPlasmidSoftcap: false,
      mutableTrait_gain_new: true,
      mutableTrait_p_new: 0,
    },
  });
  assert.equal(
    planGeneticsMutation(fixture.captured.mutation.reader.read())?.cost,
    null,
  );
  assert.deepEqual(runGeneticsMutationAutomation(fixture.captured.mutation), {
    status: "succeeded",
  });
  assert.equal(fixture.root.race.new, 1);
  assert.equal(fixture.root.prestige.Plasmid.count, 0);
}

// A structured current-game numeric capability permits reserve-aware mutation and is rechecked
// immediately before invocation.
{
  const fixture = createFixture({
    mutationRows: [{ operation: "gain", traitId: "new" }],
    mutationCosts: { "gain:new": 10 },
    readMutationCost: true,
    plasmids: 500,
    settings: { mutableTrait_gain_new: true, mutableTrait_p_new: 0 },
  });
  assert.deepEqual(runGeneticsMutationAutomation(fixture.captured.mutation), {
    status: "succeeded",
  });
  assert.equal(fixture.root.race.new, 1);
  assert.equal(fixture.root.prestige.Plasmid.count, 490);
}

// Production composition supplies the current numeric capability, so the normal Phage+250
// reserve path can act while the public addCost() method remains a localized display string.
{
  const fixture = createFixture({
    mutationRows: [{ operation: "gain", traitId: "smart" }],
    mutationCosts: { "gain:smart": 30 },
    plasmids: 500,
    phage: 0,
    settings: {
      doNotGoBelowPlasmidSoftcap: true,
      mutableTrait_gain_smart: true,
      mutableTrait_p_smart: 0,
    },
  });
  const control = createCapturedTraitControl(fixture.dependencies);
  assert.deepEqual(control.autoMutateTrait(), { status: "succeeded" });
  assert.equal(fixture.root.race.smart, 1);
  assert.equal(fixture.root.prestige.Plasmid.count, 470);
}

// The narrow cost capability mirrors the current game-owned formula and rejects unknown catalog
// entries instead of turning a localized presentation value into a guessed number.
{
  assert.equal(
    readCapturedMutationCost({ race: { species: "human" } }, "smart", "gain"),
    30,
  );
  assert.equal(
    readCapturedMutationCost({ race: { species: "custom" } }, "smart", "gain"),
    300,
  );
  assert.equal(
    readCapturedMutationCost(
      { race: { species: "human", dumb: 0.5 } },
      "dumb",
      "purge",
    ),
    50,
  );
  assert.equal(
    readCapturedMutationCost(
      { race: { species: "human", modified: { t: 2, pa: 3 } } },
      "smart",
      "gain",
    ),
    80,
  );
  assert.equal(
    readCapturedMutationCost(
      { race: { species: "human" } },
      "future_trait",
      "gain",
    ),
    undefined,
  );
}

// A no-op mutation blocks the sampled target and does not try another destructive alternative.
{
  const fixture = createFixture({
    mutationRows: [
      { operation: "gain", traitId: "first" },
      { operation: "gain", traitId: "second" },
    ],
    mutationCosts: { "gain:first": 10, "gain:second": 10 },
    readMutationCost: true,
    plasmids: 100,
    noop: true,
    settings: {
      mutableTrait_gain_first: true,
      mutableTrait_p_first: 0,
      mutableTrait_gain_second: true,
      mutableTrait_p_second: 1,
    },
  });
  assert.equal(
    runGeneticsMutationAutomation(fixture.captured.mutation).status,
    "stale",
  );
  assert.equal(
    runGeneticsMutationAutomation(fixture.captured.mutation).status,
    "succeeded",
  );
  assert.deepEqual(
    fixture.calls
      .filter(({ method }) => method === "gain")
      .map(({ args }) => args[0]),
    ["first"],
  );
}

// Runtime orchestration does not discover or read trait controls while both automations are off.
{
  let periodListener;
  let resolveCalls = 0;
  const stop = startCapturedRuntime({
    pageCapture: {
      isComplete: () => true,
      rootState: {
        readRoot: () => undefined,
        isReactivitySuppressed: () => false,
        subscribeRootReplaced: () => () => {},
      },
      controls: {
        resolve: () => {
          resolveCalls += 1;
          return undefined;
        },
        invoke: () => ({ ok: false, reason: "unknown-control" }),
        capturedElementIds: () => [],
      },
      controlUsage: { readUsage: () => [] },
      periods: {
        subscribe(next) {
          periodListener = next;
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
          autoMinorTrait: false,
          autoMutateTraits: false,
        }),
    },
    logError: () => {},
  });
  periodListener({ periods: 4 });
  stop();
  assert.equal(resolveCalls, 0);
}

console.log("captured trait automation tests passed");
