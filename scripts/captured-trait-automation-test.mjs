import assert from "node:assert/strict";

import {
  createCapturedTraitAutomation,
  GENE_SLOTS_CONTROL,
} from "../src/adapters/evolve/traits/captured-trait-automation.ts";
import { planGeneticsMinorTrait } from "../src/domain/traits/minor-trait.ts";
import { planGeneticsMutation } from "../src/domain/traits/mutation.ts";
import {
  runGeneticsMinorTraitAutomation,
  runGeneticsMutationAutomation,
} from "../src/application/genetics-traits.ts";
import { startCapturedRuntime } from "../src/bootstrap/captured-runtime-control.ts";

function node({ className = "", textContent = "", children = [] } = {}) {
  return {
    className,
    textContent,
    querySelector(selector) {
      if (selector === "h4") {
        return children.find((child) => child.tagName === "H4") ?? null;
      }
      return children.find((child) => child.selector === selector) ?? null;
    },
    querySelectorAll(selector) {
      return selector === "*" ? children : [];
    },
  };
}

function ecosystemRow(traitId) {
  return node({
    children: [
      { tagName: "H4", textContent: traitId },
      node({ className: "basic-button gene gbuy" }),
    ],
  });
}

function mutationRow(operation, traitId) {
  return node({
    children: [
      node({
        className: `${operation === "gain" ? "add" : "remove"}${traitId} basic-button`,
      }),
    ],
  });
}

function createFixture({
  genes = 100,
  ecosystemTraits = { promiscuous: 0 },
  ecosystemRows = Object.keys(ecosystemTraits),
  ecosystemCost = (rank) => rank + 2,
  livingExtinction = false,
  mutationRows = [],
  mutationCosts = {},
  plasmids = 1000,
  phage = 0,
  settings = {},
  noop = false,
  minorMethods = ["gene", "geneCost", "genePurchasable"],
} = {}) {
  const root = {
    tech: { genetics: 3, living_extinction: livingExtinction },
    race: {
      universe: "standard",
      geneSlots: [{ g: "curious", r: 2 }],
    },
    resource: { Genes: { amount: genes } },
    prestige: {
      Plasmid: { count: plasmids },
      AntiPlasmid: { count: plasmids },
      Phage: { count: phage },
    },
    surface: { trees: { traits: { ...ecosystemTraits } } },
    settings: { mKeys: false },
  };
  const calls = [];
  let generation = 1;
  const handles = new Map();
  const treesHandle = {
    elementId: "geneticMinor_trees",
    generation: 1,
    methods: minorMethods,
  };
  handles.set("geneticMinor_trees", treesHandle);
  const geneSlotsHandle = {
    elementId: GENE_SLOTS_CONTROL,
    generation: 1,
    methods: ["gain", "purge", "addCost", "removeCost"],
  };
  handles.set(GENE_SLOTS_CONTROL, geneSlotsHandle);

  const document = {
    querySelectorAll(selector) {
      if (selector === "#geneticMinor_trees .traitRow") {
        return ecosystemRows.map(ecosystemRow);
      }
      if (selector === "#geneSlots .traitRow") {
        return mutationRows.map(({ operation, traitId }) =>
          mutationRow(operation, traitId),
        );
      }
      return [];
    },
  };
  const controls = {
    resolve: (id) => {
      const handle = handles.get(id);
      return handle === undefined ? undefined : { ...handle, generation };
    },
    capturedElementIds: () => [...handles.keys()],
    invoke: (handle, method, args = []) => {
      calls.push({ elementId: handle.elementId, method, args: [...args] });
      if (handle.elementId === "geneticMinor_trees") {
        const [ecosystem, traitId] = args;
        const rank = root.surface[ecosystem].traits[traitId];
        if (method === "geneCost") {
          return { ok: true, value: ecosystemCost(rank, traitId) };
        }
        if (method === "genePurchasable") {
          return {
            ok: true,
            value:
              !root.tech.living_extinction &&
              root.resource.Genes.amount >= ecosystemCost(rank, traitId),
          };
        }
        if (method === "gene") {
          if (noop) return { ok: true, value: undefined };
          const cost = ecosystemCost(rank, traitId);
          if (
            root.tech.living_extinction ||
            root.resource.Genes.amount < cost
          ) {
            return { ok: true, value: undefined };
          }
          root.resource.Genes.amount -= cost;
          root.surface[ecosystem].traits[traitId] += 1;
          return { ok: true, value: undefined };
        }
      }
      if (handle.elementId === GENE_SLOTS_CONTROL) {
        const [traitId] = args;
        const cost =
          mutationCosts[`${method}:${traitId}`] ??
          mutationCosts[
            `${method === "gain" ? "addCost" : "removeCost"}:${traitId}`
          ];
        if (method === "addCost" || method === "removeCost") {
          return cost === undefined
            ? { ok: false, reason: "unknown-method" }
            : { ok: true, value: cost };
        }
        if (method === "gain" || method === "purge") {
          if (noop) return { ok: true, value: undefined };
          const amount = cost;
          if (amount === undefined)
            return { ok: false, reason: "unknown-method" };
          root.prestige.Plasmid.count -= amount;
          if (method === "gain") root.race[traitId] = 1;
          else delete root.race[traitId];
          return { ok: true, value: undefined };
        }
      }
      return { ok: false, reason: "unknown-method" };
    },
  };
  const captured = createCapturedTraitAutomation({
    rootState: { readRoot: () => root },
    controls,
    keyState: { readPressed: () => false },
    getDocument: () => document,
    readSettings: () => ({
      doNotGoBelowPlasmidSoftcap: false,
      minimumPlasmidsToPreserve: 0,
      ...settings,
    }),
  });
  return {
    root,
    captured,
    calls,
    bumpGeneration: () => {
      generation += 1;
    },
  };
}

// The normalized sample follows the live Genetics 2.0 state: ecosystem rows are read from the
// rendered panel, while the slotted gene is observed state but not guessed into an old priority list.
{
  const fixture = createFixture({
    ecosystemTraits: { promiscuous: 1 },
    ecosystemCost: () => 7,
  });
  const input = fixture.captured.minor.reader.read();
  assert.equal(input.available, true);
  assert.deepEqual(input.traits, [
    {
      traitId: "trees:promiscuous",
      source: "ecosystem",
      ecosystem: "trees",
      ecosystemTrait: "promiscuous",
      rank: 1,
      cost: 7,
      eligible: true,
    },
  ]);
}

// No ecosystem trait is eligible while the game's living-extinction gate is active.
{
  const fixture = createFixture({ livingExtinction: true });
  assert.deepEqual(runGeneticsMinorTraitAutomation(fixture.captured.minor), {
    status: "succeeded",
  });
  assert.deepEqual(
    fixture.calls.filter(({ method }) => method === "gene"),
    [],
  );
}

// The selected ecosystem trait is upgraded by the captured game-owned method and both
// postconditions are verified.
{
  const fixture = createFixture({ genes: 10, ecosystemCost: () => 4 });
  assert.deepEqual(runGeneticsMinorTraitAutomation(fixture.captured.minor), {
    status: "succeeded",
  });
  assert.equal(fixture.root.surface.trees.traits.promiscuous, 1);
  assert.equal(fixture.root.resource.Genes.amount, 6);
}

// Insufficient Genes is answered by the live game predicate, so the planner emits no command.
{
  const fixture = createFixture({ genes: 1, ecosystemCost: () => 4 });
  assert.deepEqual(runGeneticsMinorTraitAutomation(fixture.captured.minor), {
    status: "succeeded",
  });
  assert.equal(
    fixture.calls.some(({ method }) => method === "gene"),
    false,
  );
}

// Candidate order is the current panel order, which is the only defensible priority after the
// legacy weighting table disappeared.
{
  const fixture = createFixture({
    ecosystemTraits: { hardy: 0, promiscuous: 0 },
    ecosystemRows: ["hardy", "promiscuous"],
    ecosystemCost: () => 3,
  });
  assert.equal(
    planGeneticsMinorTrait(fixture.captured.minor.reader.read())?.traitId,
    "trees:hardy",
  );
}

// A rebound live control is stale and cannot execute a decision from the old generation.
{
  const fixture = createFixture();
  fixture.captured.minor.reader.read();
  fixture.captured.minor.executor.execute({
    kind: "upgrade-minor-trait",
    traitId: "trees:promiscuous",
    source: "ecosystem",
    ecosystem: "trees",
    ecosystemTrait: "promiscuous",
    expectedRank: 0,
    expectedGenes: 100,
    expectedCost: 2,
  });
  fixture.bumpGeneration();
  assert.equal(
    fixture.captured.minor.executor.execute({
      kind: "upgrade-minor-trait",
      traitId: "trees:promiscuous",
      source: "ecosystem",
      ecosystem: "trees",
      ecosystemTrait: "promiscuous",
      expectedRank: 0,
      expectedGenes: 100,
      expectedCost: 2,
    }).status,
    "stale",
  );
}

// A missing live cost capability is unknown, not an invitation to invoke the action.
{
  const fixture = createFixture({ minorMethods: ["gene", "genePurchasable"] });
  assert.deepEqual(runGeneticsMinorTraitAutomation(fixture.captured.minor), {
    status: "succeeded",
  });
  assert.equal(
    fixture.calls.some(({ method }) => method === "gene"),
    false,
  );
}

// Gain remains ahead of purge, while each group keeps the live panel order.
{
  const fixture = createFixture({
    mutationRows: [
      { operation: "purge", traitId: "old" },
      { operation: "gain", traitId: "new" },
    ],
    mutationCosts: { "addCost:new": 10, "removeCost:old": 10 },
    plasmids: 100,
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
}

// The reserve follows legacy settings intent but the mutation itself uses current live cost data.
{
  const fixture = createFixture({
    mutationRows: [{ operation: "gain", traitId: "new" }],
    mutationCosts: { "addCost:new": 300 },
    plasmids: 500,
    settings: { doNotGoBelowPlasmidSoftcap: true },
  });
  assert.deepEqual(runGeneticsMutationAutomation(fixture.captured.mutation), {
    status: "succeeded",
  });
  assert.equal(fixture.root.race.new, undefined);
  assert.equal(fixture.root.prestige.Plasmid.count, 500);
}

// A mutation absent from the current panel is illegal even if a cost method is available.
{
  const fixture = createFixture({
    mutationRows: [],
    mutationCosts: { "addCost:new": 10 },
  });
  assert.deepEqual(runGeneticsMutationAutomation(fixture.captured.mutation), {
    status: "succeeded",
  });
  assert.equal(
    fixture.calls.some(({ method }) => method === "gain"),
    false,
  );
}

// A rebound control is stale and cannot execute a decision sampled from the old generation.
{
  const fixture = createFixture({
    mutationRows: [{ operation: "gain", traitId: "new" }],
    mutationCosts: { "addCost:new": 10 },
  });
  const input = fixture.captured.mutation.reader.read();
  const decision = planGeneticsMutation(input);
  assert.ok(decision);
  fixture.bumpGeneration();
  assert.equal(
    fixture.captured.mutation.executor.execute(decision).status,
    "stale",
  );
  assert.equal(
    fixture.calls.some(({ method }) => method === "gain"),
    false,
  );
}

// A successful invocation with no postcondition is blocked for the unchanged target; no alternate
// destructive mutation is attempted on the next run.
{
  const fixture = createFixture({
    mutationRows: [
      { operation: "gain", traitId: "first" },
      { operation: "gain", traitId: "second" },
    ],
    mutationCosts: { "addCost:first": 10, "addCost:second": 10 },
    noop: true,
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

// Runtime orchestration does not call a trait reader or discovery path when the automation toggle
// is disabled, even though the captured runtime is active.
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
