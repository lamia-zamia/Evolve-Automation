import assert from "node:assert/strict";
import {
  createCapturedTraitAutomation,
  GENE_SLOTS_CONTROL,
} from "../src/adapters/evolve/traits/captured-trait-automation.ts";
import {
  runGeneticsMinorTraitAutomation,
  runGeneticsMutationAutomation,
} from "../src/application/genetics-traits.ts";

function fixture({
  slots = [{ g: "smart", r: 1 }, false, { g: "strong", r: 1 }],
  settings = {},
  choices = { 1: ["nimble"] },
  canCull = [],
  genes = 100,
  plasmids = 100,
  noop = false,
  control = true,
  held = false,
  rebindOnAction = false,
} = {}) {
  const root = {
    tech: { genetics: 3 },
    settings: { mKeys: held, keyMap: { x10: "1", x25: "2", x100: "3" } },
    race: {
      species: "human",
      universe: "standard",
      geneSlots: slots,
      strong: 1,
    },
    resource: { Genes: { amount: genes } },
    prestige: { Plasmid: { count: plasmids }, Phage: { count: 0 } },
  };
  let generation = 1;
  const calls = [];
  const methods = [
    "isGene",
    "canRank",
    "rankUp",
    "pickable",
    "canCull",
    "gain",
    "cullSlot",
  ];
  const controls = {
    resolve: (id) =>
      control && id === GENE_SLOTS_CONTROL
        ? { elementId: id, generation, methods }
        : undefined,
    invoke: (_handle, method, args = []) => {
      calls.push({ method, args: [...args] });
      const [first, second] = args;
      if (method === "isGene")
        return { ok: true, value: root.race.geneSlots[first]?.g === "smart" };
      if (method === "canRank")
        return {
          ok: true,
          value:
            root.race.geneSlots[first]?.g === "smart" &&
            root.resource.Genes.amount >= 10,
        };
      if (method === "rankUp") {
        if (!noop) {
          root.race.geneSlots[first].r++;
          root.resource.Genes.amount -= 10;
          if (rebindOnAction) generation++;
        }
        return { ok: true };
      }
      if (method === "pickable")
        return { ok: true, value: choices[first] ?? [] };
      if (method === "canCull")
        return { ok: true, value: canCull.includes(first) };
      if (method === "gain") {
        if (!noop) {
          root.race.geneSlots[second] = { g: first, r: 1 };
          root.race[first] = 1;
          root.prestige.Plasmid.count -= 10;
          if (rebindOnAction) generation++;
        }
        return { ok: true };
      }
      if (method === "cullSlot") {
        if (!noop) {
          const trait = root.race.geneSlots[first].g;
          root.race.geneSlots[first] = false;
          delete root.race[trait];
          root.prestige.Plasmid.count -= 10;
          if (rebindOnAction) generation++;
        }
        return { ok: true };
      }
      return { ok: false, reason: "unknown-method" };
    },
  };
  const dependencies = {
    rootState: { readRoot: () => root },
    controls,
    keyState: { readPressed: () => held },
    readSettings: () => ({
      doNotGoBelowPlasmidSoftcap: false,
      mTrait_smart: true,
      mTrait_p_smart: 0,
      mTrait_w_smart: 1,
      mutableTrait_gain_nimble: true,
      mutableTrait_p_nimble: 0,
      mutableTrait_purge_strong: true,
      mutableTrait_p_strong: 1,
      ...settings,
    }),
    readMutationCost: () => 10,
  };
  return {
    root,
    calls,
    captured: createCapturedTraitAutomation(dependencies),
    rebind: () => generation++,
    controls,
  };
}

{
  const f = fixture();
  assert.equal(
    runGeneticsMinorTraitAutomation(f.captured.minor).status,
    "succeeded",
  );
  assert.equal(f.root.race.geneSlots[0].r, 2);
  assert.equal(f.root.resource.Genes.amount, 90);
  assert.deepEqual(
    f.calls.filter((call) => call.method === "rankUp").map((call) => call.args),
    [[0]],
  );
}
{
  const f = fixture({ rebindOnAction: true });
  assert.equal(
    runGeneticsMinorTraitAutomation(f.captured.minor).status,
    "succeeded",
    "native redraw after rankUp is coherent",
  );
}
{
  const f = fixture();
  const decision = f.captured.minor.reader.read();
  assert.equal(decision.traits.length, 1);
  f.rebind();
  assert.equal(
    f.captured.minor.executor.execute({
      kind: "upgrade-minor-trait",
      traitId: "smart",
      slotIndex: 0,
      controlGeneration: 1,
      source: "gene-slot",
      expectedRank: 1,
      expectedGenes: 100,
      expectedCost: null,
    }).status,
    "stale",
  );
  assert.equal(
    f.calls.some((call) => call.method === "rankUp"),
    false,
  );
}
for (const change of [
  (f) => {
    f.root.race.geneSlots[0].g = "other";
  },
  (f) => {
    f.root.race.geneSlots[0].r++;
  },
]) {
  const f = fixture();
  f.captured.minor.reader.read();
  change(f);
  assert.equal(
    f.captured.minor.executor.execute({
      kind: "upgrade-minor-trait",
      traitId: "smart",
      slotIndex: 0,
      controlGeneration: 1,
      source: "gene-slot",
      expectedRank: 1,
      expectedGenes: 100,
      expectedCost: null,
    }).status,
    "stale",
  );
  assert.equal(
    f.calls.some((call) => call.method === "rankUp"),
    false,
  );
}
{
  const f = fixture({ held: true });
  assert.equal(
    runGeneticsMinorTraitAutomation(f.captured.minor).status,
    "stale",
  );
  assert.equal(
    f.calls.some((call) => call.method === "rankUp"),
    false,
  );
}
{
  const f = fixture({
    choices: { 1: ["nimble"] },
    settings: { mutableTrait_gain_forager: true, mutableTrait_p_forager: -1 },
  });
  assert.deepEqual(
    f.captured.mutation.reader
      .read()
      .operations.map((operation) => operation.traitId),
    ["nimble"],
  );
  assert.equal(
    runGeneticsMutationAutomation(f.captured.mutation).status,
    "succeeded",
  );
  assert.equal(f.root.race.geneSlots[1].g, "nimble");
  assert.deepEqual(
    f.calls.filter((call) => call.method === "gain").map((call) => call.args),
    [["nimble", 1]],
  );
}
{
  const f = fixture({ choices: {}, canCull: [] });
  assert.equal(f.captured.mutation.reader.read().operations.length, 0);
  assert.equal(
    runGeneticsMutationAutomation(f.captured.mutation).status,
    "succeeded",
  );
  assert.equal(
    f.calls.some((call) => call.method === "cullSlot"),
    false,
  );
}
{
  const f = fixture({ choices: {}, canCull: [2] });
  assert.equal(
    runGeneticsMutationAutomation(f.captured.mutation).status,
    "succeeded",
  );
  assert.equal(f.root.race.geneSlots[2], false);
  assert.equal(Object.hasOwn(f.root.race, "strong"), false);
}
{
  const f = fixture({ rebindOnAction: true });
  assert.equal(
    runGeneticsMutationAutomation(f.captured.mutation).status,
    "succeeded",
    "native redraw after gain is coherent",
  );
}
{
  const f = fixture({ control: false });
  assert.equal(f.captured.minor.reader.read().available, false);
  assert.equal(f.captured.mutation.reader.read().available, false);
  assert.equal(f.calls.length, 0);
}

console.log("captured trait automation tests passed");
