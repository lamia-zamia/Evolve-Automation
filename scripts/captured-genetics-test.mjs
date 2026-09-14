import assert from "node:assert/strict";

import {
  createCapturedGenetics,
  GENETICS_CONTROL,
} from "../src/adapters/evolve/traits/captured-genetics.ts";
import { runGeneticsAutomation } from "../src/application/genetics.ts";

const GENE_COST = 200_000;

function createFixture(overrides = {}) {
  const sequence = {
    on: false,
    boost: false,
    auto: false,
    ...(overrides.sequence ?? {}),
  };
  const root = {
    tech: { genetics: overrides.level ?? 6 },
    race: { mutation: overrides.mutation ?? 0 },
    arpa: { sequence: overrides.sequenceMissing ? undefined : sequence },
    settings: { arpa: { genetics: true } },
    resource: {
      Knowledge: {
        amount: overrides.knowledge ?? 0,
        max: overrides.knowledgeMax ?? 0,
        diff: overrides.knowledgeRate ?? 0,
      },
      Genes: { amount: overrides.genes ?? 0 },
    },
  };
  const calls = [];
  let generation = 1;
  let bound = overrides.bound ?? true;
  let keyMultiplier = overrides.keyMultiplier ?? 1;
  const controls = {
    capturedElementIds: () => (bound ? [GENETICS_CONTROL] : []),
    resolve: (elementId) =>
      bound && elementId === GENETICS_CONTROL
        ? {
            elementId,
            generation,
            methods: ["toggle", "booster", "auto_seq", "novo"],
          }
        : undefined,
    invoke: (_handle, method) => {
      calls.push(method);
      if (method === "toggle") sequence.on = !sequence.on;
      if (method === "booster") sequence.boost = !sequence.boost;
      if (method === "auto_seq") sequence.auto = !sequence.auto;
      if (method === "novo") {
        // Upstream `novo`: buys `min(keyMultiplier(), affordable)` and charges both balances.
        const knowledge = root.resource.Knowledge;
        const affordable = Math.floor(knowledge.amount / GENE_COST);
        const bought = Math.min(keyMultiplier, affordable);
        knowledge.amount -= GENE_COST * bought;
        root.resource.Genes.amount += bought;
      }
      return { ok: true, value: undefined };
    },
  };
  const settings = {
    geneticsSequence: overrides.sequenceMode ?? "none",
    geneticsBoost: overrides.boostMode ?? "none",
    geneticsAssemble: overrides.assembleMode ?? "none",
    tickRate: overrides.tickRate ?? 4,
  };
  const genetics = createCapturedGenetics({
    rootState: { readRoot: () => root },
    controls,
    readSettings: () => settings,
    readDemand: () => ({
      requestedQuantity: () => 0,
      isDemanded: (id) => id === "Knowledge" && (overrides.demanded ?? false),
      storageRequired: () => 1,
    }),
  });
  return {
    root,
    sequence,
    settings,
    calls,
    genetics,
    run: () => runGeneticsAutomation(genetics),
    rebind: () => {
      generation += 1;
    },
    unbind: () => {
      bound = false;
    },
    setKeyMultiplier: (value) => {
      keyMultiplier = value;
    },
  };
}

// Locked genetics is not the script's business and costs no settings read.
{
  const fixture = createFixture({ level: 0 });
  let read = false;
  const genetics = createCapturedGenetics({
    rootState: { readRoot: () => fixture.root },
    controls: {
      capturedElementIds: () => [],
      resolve: () => undefined,
      invoke: () => ({ ok: false, reason: "unknown-control" }),
    },
    readSettings: () => {
      read = true;
      return {};
    },
    readDemand: () => {
      throw new Error("demand must not be sampled while genetics is locked");
    },
  });
  assert.deepEqual(runGeneticsAutomation(genetics), { status: "succeeded" });
  assert.equal(read, false);
}

// A panel the game has never bound leaves the feature waiting for discovery, not acting.
{
  const fixture = createFixture({ sequenceMode: "enabled", bound: false });
  assert.equal(fixture.run().status, "stale");
  assert.deepEqual(fixture.calls, []);
}

// Each configured toggle presses its own captured method, once, and only when it disagrees.
{
  const fixture = createFixture({
    sequenceMode: "enabled",
    boostMode: "enabled",
    assembleMode: "enabled",
  });
  assert.deepEqual(fixture.run(), { status: "succeeded" });
  assert.deepEqual(fixture.calls, ["toggle", "booster", "auto_seq"]);
  assert.deepEqual(fixture.sequence, { on: true, boost: true, auto: true });
  assert.deepEqual(fixture.run(), { status: "succeeded" });
  assert.deepEqual(fixture.calls, ["toggle", "booster", "auto_seq"]);
}

// `decode` follows the mutation count rather than a fixed target.
{
  const fixture = createFixture({
    sequenceMode: "decode",
    sequence: { on: true },
  });
  assert.deepEqual(fixture.run(), { status: "succeeded" });
  assert.deepEqual(fixture.calls, []);
  fixture.root.race.mutation = 1;
  assert.deepEqual(fixture.run(), { status: "succeeded" });
  assert.deepEqual(fixture.calls, ["toggle"]);
  assert.equal(fixture.sequence.on, false);
}

// The level gates are the pure policy's: no booster below 5, no auto or assembly below 6.
{
  const fixture = createFixture({
    level: 4,
    sequenceMode: "enabled",
    boostMode: "enabled",
    assembleMode: "enabled",
  });
  assert.deepEqual(fixture.run(), { status: "succeeded" });
  assert.deepEqual(fixture.calls, ["toggle"]);
}

// Knowledge that would overflow before the next cycle is dumped into genes, one press per gene.
{
  const fixture = createFixture({
    assembleMode: "auto",
    knowledge: 1_000_000,
    knowledgeMax: 1_000_000,
    knowledgeRate: 400_000,
    tickRate: 4,
  });
  assert.deepEqual(fixture.run(), { status: "succeeded" });
  // 4 periods per cycle at rate 4 is one cycle per second, so a full second of income overflows.
  assert.deepEqual(fixture.calls, ["novo", "novo"]);
  assert.equal(fixture.root.resource.Genes.amount, 2);
  assert.equal(fixture.root.resource.Knowledge.amount, 600_000);
}

// A held multiplier key buys the whole count in one press; the loop counts genes, not presses.
{
  const fixture = createFixture({
    assembleMode: "auto",
    knowledge: 1_000_000,
    knowledgeMax: 1_000_000,
    knowledgeRate: 400_000,
  });
  fixture.setKeyMultiplier(10);
  assert.deepEqual(fixture.run(), { status: "succeeded" });
  assert.deepEqual(fixture.calls, ["novo"]);
  assert.equal(fixture.root.resource.Genes.amount, 5);
}

// Knowledge something else is saving for is not spare Knowledge.
{
  const fixture = createFixture({
    assembleMode: "auto",
    knowledge: 1_000_000,
    knowledgeMax: 1_000_000,
    knowledgeRate: 400_000,
    demanded: true,
  });
  assert.deepEqual(fixture.run(), { status: "succeeded" });
  assert.deepEqual(fixture.calls, []);
}

// An uncapped resource — the game's negative "no limit" — has nothing to spill.
{
  const fixture = createFixture({
    assembleMode: "auto",
    knowledge: 1_000_000,
    knowledgeMax: -1,
    knowledgeRate: 400_000,
  });
  assert.deepEqual(fixture.run(), { status: "succeeded" });
  assert.deepEqual(fixture.calls, []);
}

// A slower cycle projects further ahead, so the same income overflows by more.
{
  const fixture = createFixture({
    assembleMode: "auto",
    knowledge: 1_000_000,
    knowledgeMax: 1_000_000,
    knowledgeRate: 400_000,
    tickRate: 8,
  });
  assert.deepEqual(fixture.run(), { status: "succeeded" });
  assert.deepEqual(fixture.calls, ["novo", "novo", "novo", "novo"]);
}

// A flag that moved between the plan and the press is not one this cycle may act on.
{
  const fixture = createFixture({ sequenceMode: "enabled" });
  fixture.genetics.reader.readGate();
  fixture.genetics.controls.capture();
  fixture.genetics.reader.readPlan();
  fixture.sequence.on = true;
  const outcome = fixture.genetics.executor.execute({
    kind: "set-genetics-toggle",
    toggle: "sequence",
    expected: false,
    enabled: true,
  });
  assert.equal(outcome.status, "stale");
  assert.deepEqual(fixture.calls, []);
}

// A panel the game redrew between the plan and the press is a superseded closure.
{
  const fixture = createFixture({ sequenceMode: "enabled" });
  fixture.genetics.reader.readGate();
  fixture.genetics.controls.capture();
  const [decision] = [
    {
      kind: "set-genetics-toggle",
      toggle: "sequence",
      expected: false,
      enabled: true,
    },
  ];
  fixture.genetics.reader.readPlan();
  fixture.rebind();
  const outcome = fixture.genetics.executor.execute(decision);
  assert.equal(outcome.status, "stale");
  assert.equal(outcome.failure.code, "genetics-control-stale");
  assert.deepEqual(fixture.calls, []);
}

// A replaced game root is a new game, not a stale flag.
{
  const fixture = createFixture({ sequenceMode: "enabled" });
  let root = fixture.root;
  const genetics = createCapturedGenetics({
    rootState: { readRoot: () => root },
    controls: {
      capturedElementIds: () => [GENETICS_CONTROL],
      resolve: (id) =>
        id === GENETICS_CONTROL
          ? { elementId: id, generation: 1, methods: ["toggle"] }
          : undefined,
      invoke: () => ({ ok: true, value: undefined }),
    },
    readSettings: () => fixture.settings,
    readDemand: () => ({
      requestedQuantity: () => 0,
      isDemanded: () => false,
      storageRequired: () => 1,
    }),
  });
  genetics.reader.readGate();
  genetics.controls.capture();
  genetics.reader.readPlan();
  root = { ...fixture.root, arpa: { sequence: { ...fixture.sequence } } };
  const outcome = genetics.executor.execute({
    kind: "set-genetics-toggle",
    toggle: "sequence",
    expected: false,
    enabled: true,
  });
  assert.equal(outcome.status, "stale");
  assert.equal(outcome.failure.code, "genetics-root-changed");
}

// An unbuilt sequencer bag describes nothing, whatever the technology level says.
{
  const fixture = createFixture({
    sequenceMissing: true,
    sequenceMode: "enabled",
  });
  assert.deepEqual(fixture.run(), { status: "succeeded" });
  assert.deepEqual(fixture.calls, []);
}

console.log("Captured genetics adapter tests passed");
