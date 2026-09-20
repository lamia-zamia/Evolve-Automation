import assert from "node:assert/strict";

import { readCapturedEvolutionResult } from "../src/adapters/evolve/progression/evolution/captured-evolution-result.ts";
import {
  createCapturedEvolutionResultCheck,
  createCapturedSoftResetControl,
} from "../src/adapters/evolve/progression/evolution/captured-evolution-result-check.ts";
import { createCapturedEvolution } from "../src/adapters/evolve/progression/evolution/captured-evolution.ts";
import { createCapturedQueuedSettings } from "../src/adapters/evolve/progression/evolution/captured-queued-settings.ts";
import {
  decideEvolutionResult,
  INTENTIONAL_SPECIES,
} from "../src/domain/progression/evolution/evolution-result.ts";
import { createCapturedSettingsPage, edit } from "./captured-settings-page.mjs";

function input(overrides = {}) {
  return {
    autoEvolution: true,
    evolutionBackup: true,
    autoMutateTraits: false,
    userEvolutionTarget: "auto",
    species: "human",
    speciesRace: { name: "Human", weighting: 0, goals: [] },
    bestWeighting: 100,
    traits: [],
    ...overrides,
  };
}

function root(species = "human") {
  return {
    race: { species, universe: "standard", gods: "", jtype: "humanoid" },
    city: { biome: "grassland" },
    genes: { challenge: false },
    blood: { unbound: 0 },
    prestige: { Harmony: { count: 0 } },
    stats: { achieve: {}, feat: {}, synth: {} },
    pillars: {},
  };
}

function settings(overrides = {}) {
  return {
    autoEvolution: true,
    evolutionBackup: true,
    autoMutateTraits: false,
    userEvolutionTarget: "auto",
    prestigeType: "none",
    evolutionAutoUnbound: false,
    evolutionQueue: [],
    evolutionQueueEnabled: false,
    evolutionQueueRepeat: false,
    ...overrides,
  };
}

// 1. Auto backup resets an ordinary species with no achievement weighting when a better race exists.
{
  const decision = decideEvolutionResult(input());
  assert.equal(decision.needReset, true);
  assert.equal(decision.logs[0].code, "backup-no-achievements");
}

// 2. Auto backup keeps a species when it is the best available weighted result.
{
  const decision = decideEvolutionResult(input({ bestWeighting: 0 }));
  assert.equal(decision.needReset, false);
  assert.equal(decision.logs[0].code, "backup-no-race");
}

// 3. Explicit targets reset only when the configured target is habitability-reachable.
{
  assert.equal(
    decideEvolutionResult(
      input({ userEvolutionTarget: "cath", targetHabitability: 1 }),
    ).needReset,
    true,
  );
  assert.equal(
    decideEvolutionResult(
      input({ userEvolutionTarget: "cath", targetHabitability: 0 }),
    ).needReset,
    false,
  );
}

// 4. The intentional challenge species are never rejected as accidental results.
for (const species of INTENTIONAL_SPECIES) {
  assert.equal(
    decideEvolutionResult(
      input({
        species,
        speciesRace: { name: species, weighting: 0, goals: [] },
      }),
    ).needReset,
    false,
  );
}

// 5. Auto Mutate Traits still contributes a reset decision in the pure policy.
{
  const decision = decideEvolutionResult(
    input({
      autoEvolution: false,
      evolutionBackup: false,
      autoMutateTraits: true,
      traits: [
        {
          name: "Wasteful",
          resetEnabled: true,
          gained: true,
          inheritedFromBase: false,
        },
      ],
    }),
  );
  assert.equal(decision.needReset, true);
  assert.equal(decision.logs[0].code, "gained-trait");
}

// 6. Auto goals are reported only when no reset is required.
{
  const decision = decideEvolutionResult(
    input({
      speciesRace: { name: "Human", weighting: 50, goals: ["achieve_a"] },
    }),
  );
  assert.deepEqual(decision.logs, [
    { level: "info", code: "auto-goals", goals: ["achieve_a"] },
  ]);
}

// 7. The captured result reader uses the same catalog and exposes the configured backup flag.
{
  const sample = readCapturedEvolutionResult(root(), settings());
  assert.equal(sample.status, "ready");
  assert.equal(sample.input.evolutionBackup, true);
  assert.equal(sample.input.species, "human");
}

// 8. An unreachable explicit target is sampled, but the pure result policy refuses to reset for it.
{
  const sample = readCapturedEvolutionResult(
    root(),
    settings({ userEvolutionTarget: "sharkin" }),
  );
  assert.equal(sample.status, "ready");
  assert.equal(sample.input.targetHabitability, 0);
  assert.equal(decideEvolutionResult(sample.input).needReset, false);
}

// 9. A transition is the lifecycle trigger; checking while still protoplasm is a no-op.
{
  let samples = 0;
  const lifecycle = createCapturedEvolutionResultCheck({
    reader: {
      sampleEvolutionResult: () => {
        samples += 1;
        return { status: "ready", input: input() };
      },
    },
    softReset: { issueSoftReset: () => true },
    restoreEvolutionAfterResult: () => {},
  });
  lifecycle.observeSpecies("protoplasm");
  assert.deepEqual(lifecycle.check(), { status: "idle", stopCycle: false });
  assert.equal(samples, 0);
}

// 10. One rejected result causes exactly one queue restore and one reset click; repeated checks on
// the same species cannot click again.
{
  let resets = 0;
  let restores = 0;
  const lifecycle = createCapturedEvolutionResultCheck({
    reader: {
      sampleEvolutionResult: () => ({ status: "ready", input: input() }),
    },
    softReset: { issueSoftReset: () => (++resets, true) },
    restoreEvolutionAfterResult: () => restores++,
  });
  lifecycle.observeSpecies("protoplasm");
  lifecycle.observeSpecies("human");
  assert.deepEqual(lifecycle.check(), {
    status: "reset-issued",
    stopCycle: true,
  });
  assert.deepEqual(lifecycle.check(), { status: "idle", stopCycle: false });
  assert.equal(resets, 1);
  assert.equal(restores, 1);
}

// 11. A missing reset control is fail-closed and bounded to the observed transition.
{
  let resets = 0;
  const lifecycle = createCapturedEvolutionResultCheck({
    reader: {
      sampleEvolutionResult: () => ({ status: "ready", input: input() }),
    },
    softReset: { issueSoftReset: () => (++resets, false) },
    restoreEvolutionAfterResult: () => {},
  });
  lifecycle.observeSpecies("protoplasm");
  lifecycle.observeSpecies("human");
  assert.deepEqual(lifecycle.check(), {
    status: "reset-unavailable",
    stopCycle: true,
  });
  assert.deepEqual(lifecycle.check(), { status: "idle", stopCycle: false });
  assert.equal(resets, 1);
}

// 12. The real settings control, captured reader, and rendered soft-reset selector compose into
// the lifecycle. The DOM postcondition is the game's own button invocation, not a raw global call.
{
  const page = createCapturedSettingsPage({ autoEvolution: true });
  edit(page, "evolutionBackup", true);
  const gameRoot = root();
  gameRoot.stats.achieve.extinct_human = { l: 1 };
  const evolution = createCapturedEvolution({
    rootState: {
      readRoot: () => gameRoot,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls: {
      resolve: () => undefined,
      invoke: () => ({ ok: false, reason: "unknown-method" }),
      capturedElementIds: () => [],
    },
    drawnActions: { readActionRows: () => [] },
    readSettings: () => page.effective,
    readEvolutionAttempts: () => 0,
    loadQueuedSettings: () => {},
    universeControls: { selectUniverse: () => true },
    challengeGroups: [],
  });
  let clicked = 0;
  const softReset = createCapturedSoftResetControl(() => ({
    querySelector: (selector) => {
      assert.equal(selector, ".reset .button:not(.right)");
      return { disabled: false, click: () => clicked++ };
    },
  }));
  const lifecycle = createCapturedEvolutionResultCheck({
    reader: evolution.reader,
    softReset,
    restoreEvolutionAfterResult: () => {},
  });
  lifecycle.observeSpecies("protoplasm");
  gameRoot.race.species = "human";
  lifecycle.observeSpecies("human");
  assert.deepEqual(lifecycle.check(), {
    status: "reset-issued",
    stopCycle: true,
  });
  assert.equal(clicked, 1);
}

// Queue semantics are covered by the lifecycle's injected queue authority in the runtime; keep a
// direct assertion here that a non-repeating applied row is restored rather than dropped.
{
  const raw = {
    userEvolutionTarget: "human",
    userEvolutionGenus: "fungi",
    evolutionAutoUnbound: false,
    evolutionBackup: true,
    prestigeType: "none",
    evolutionQueueEnabled: true,
    evolutionQueueRepeat: false,
    evolutionQueue: [{ userEvolutionTarget: "cath", prestigeType: "bioseed" }],
  };
  const queued = createCapturedQueuedSettings({
    settings: { readRaw: () => raw, persist: () => {} },
  });
  queued.loadQueuedSettings();
  assert.equal(raw.userEvolutionTarget, "cath");
  queued.restoreEvolutionAfterResult();
  assert.equal(raw.evolutionQueue[0].userEvolutionTarget, "cath");
}

// A repeating queue rotates the applied row back to the front instead of duplicating it.
{
  const raw = {
    userEvolutionTarget: "human",
    userEvolutionGenus: "fungi",
    evolutionAutoUnbound: false,
    evolutionBackup: true,
    prestigeType: "none",
    evolutionQueueEnabled: true,
    evolutionQueueRepeat: true,
    evolutionQueue: [
      { userEvolutionTarget: "cath", prestigeType: "bioseed" },
      { userEvolutionTarget: "balorg", prestigeType: "ascension" },
    ],
  };
  const queued = createCapturedQueuedSettings({
    settings: { readRaw: () => raw, persist: () => {} },
  });
  queued.loadQueuedSettings();
  queued.restoreEvolutionAfterResult();
  assert.deepEqual(
    raw.evolutionQueue.map((entry) => entry.userEvolutionTarget),
    ["cath", "balorg"],
  );
}

console.log("captured Evolution result checks passed");
