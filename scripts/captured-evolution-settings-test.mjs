/**
 * Evolution settings, end to end.
 *
 * Each exposed control is driven through the real captured panel and then observed in the
 * captured evolution runtime that consumes it. The two compatibility-only controls with no
 * captured consumer are asserted absent, so re-adding one without its runtime semantics fails.
 */

import assert from "node:assert/strict";

import { createCapturedEvolutionSettingsAdapter } from "../src/adapters/evolve/progression/evolution/captured-evolution-settings.ts";
import { createCapturedEvolution } from "../src/adapters/evolve/progression/evolution/captured-evolution.ts";
import { createCapturedQueuedSettings } from "../src/adapters/evolve/progression/evolution/captured-queued-settings.ts";
import { challenges } from "../src/adapters/evolve/runtime-catalogs.ts";
import { planEvolutionTarget } from "../src/domain/progression/evolution/evolution.ts";
import { createCapturedSettingsPage, edit } from "./captured-settings-page.mjs";

const challengeGroups = challenges.map((group) => ({
  members: group.map((member) => ({
    id: member.id,
    trait: member.trait,
    cycleEnding: false,
  })),
}));

/** The captured evolution adapter over a minimal evolving root. */
function evolutionRuntime(readSettings, { species = "protoplasm" } = {}) {
  const root = {
    race: { species, universe: "standard", seeded: false, chose: true },
    city: { biome: "grassland" },
    genes: { challenge: false },
    blood: { unbound: 0 },
    prestige: { Harmony: { count: 0 } },
    stats: { achieve: {} },
    tech: {},
  };
  const selected = [];
  return {
    root,
    selected,
    adapter: createCapturedEvolution({
      rootState: {
        readRoot: () => root,
        isReactivitySuppressed: () => false,
        subscribeRootReplaced: () => () => {},
      },
      controls: {
        resolve: () => undefined,
        invoke: () => ({ ok: false, reason: "unknown-method" }),
        capturedElementIds: () => [],
      },
      drawnActions: { readActionRows: () => [] },
      readSettings,
      readEvolutionAttempts: () => 0,
      loadQueuedSettings: () => {},
      universeControls: {
        selectUniverse: (id) => selected.push(id),
      },
      challengeGroups,
    }),
  };
}

// --- the section renders, and renders only controls with a captured consumer -------------------

{
  const page = createCapturedSettingsPage();
  assert.equal(
    page.root.querySelectorAll("#script_evolutionSettings").length,
    1,
    "Evolution must be drawn by the captured panel",
  );
  assert.deepEqual(page.logged, []);

  for (const settingName of [
    "userUniverseTargetName",
    "userPlanetTargetName",
    "userEvolutionTarget",
    "evolutionAutoUnbound",
    "evolutionQueueEnabled",
    "evolutionQueueRepeat",
  ]) {
    assert.equal(
      page.root.querySelectorAll(`.script_${settingName}`).length,
      1,
      `${settingName} should be drawn once`,
    );
  }
  for (const group of challenges) {
    assert.equal(
      page.root.querySelectorAll(`.script_challenge_${group[0].id}`).length,
      1,
      `challenge_${group[0].id} should be drawn once`,
    );
  }
  // No captured consumer reads these, so drawing one would be an inert control.
  for (const settingName of ["userEvolutionGenus", "evolutionBackup"]) {
    assert.equal(
      page.root.querySelectorAll(`.script_${settingName}`).length,
      0,
      `${settingName} has no captured consumer and must not be drawn`,
    );
  }
}

// --- 1. the target universe select drives captured universe selection ---------------------------

{
  const page = createCapturedSettingsPage();
  edit(page, "userUniverseTargetName", "magic");
  assert.equal(page.effective["userUniverseTargetName"], "magic");
  const runtime = evolutionRuntime(() => page.effective);
  // The game offers the universe menu only after the Big Bang, with `universe` still unchosen.
  runtime.root.race.universe = "bigbang";
  runtime.root.race.bigbang = true;
  runtime.adapter.runUniverseSelection();
  assert.deepEqual(runtime.selected, ["magic"]);

  edit(page, "userUniverseTargetName", "none");
  const quiet = evolutionRuntime(() => page.effective);
  quiet.root.race.universe = "bigbang";
  quiet.root.race.bigbang = true;
  quiet.adapter.runUniverseSelection();
  assert.deepEqual(quiet.selected, [], "None must select nothing");
}

// --- 2. the target race select drives the captured target plan ----------------------------------

{
  const page = createCapturedSettingsPage();
  edit(page, "userEvolutionTarget", "cath");
  assert.equal(page.settings.readRaw()["userEvolutionTarget"], "cath");
  const runtime = evolutionRuntime(() => page.effective);
  const decision = planEvolutionTarget(
    runtime.adapter.reader.sampleTargetSelection(),
  );
  assert.equal(decision.kind, "target");
  assert.equal(decision.id, "cath");

  edit(page, "userEvolutionTarget", "balorg");
  runtime.root.city.biome = "hellscape";
  assert.equal(
    planEvolutionTarget(runtime.adapter.reader.sampleTargetSelection()).id,
    "balorg",
  );
}

// --- 3. changing the target drops a committed target --------------------------------------------

{
  const cleared = [];
  const raw = { userEvolutionTarget: "cath", evolutionQueue: [] };
  const adapter = createCapturedEvolutionSettingsAdapter({
    getSettingsRaw: () => raw,
    clearStoredTarget: () => cleared.push("cleared"),
  });
  adapter.setTarget("balorg");
  assert.equal(raw.userEvolutionTarget, "balorg");
  assert.deepEqual(
    cleared,
    ["cleared"],
    "a new target must invalidate the committed one",
  );
}

// --- 4. challenge toggles reach captured challenge activation -----------------------------------

{
  const page = createCapturedSettingsPage();
  edit(page, "challenge_plasmid", true);
  edit(page, "challenge_trade", false);
  const runtime = evolutionRuntime(() => page.effective);
  const enabled = runtime.adapter.reader.sampleChallengeEnabled([
    "plasmid",
    "trade",
  ]);
  assert.equal(enabled["plasmid"], true);
  assert.equal(enabled["trade"], false);
}

// --- 5. queue edits go through raw storage and reach the captured queue loader -------------------

{
  const page = createCapturedSettingsPage();
  edit(page, "userEvolutionTarget", "cath");
  edit(page, "challenge_plasmid", true);
  edit(page, "evolutionQueueEnabled", true);

  // "Add New Evolution" captures the current settings into the queue.
  const prestige = page.root.querySelectorAll("#script_evolution_prestige")[0];
  prestige.value = "bioseed";
  page.root.querySelectorAll("#script_evlution_add")[0].dispatch("click");

  const queue = page.settings.readRaw()["evolutionQueue"];
  assert.equal(queue.length, 1);
  assert.equal(queue[0].userEvolutionTarget, "cath");
  assert.equal(queue[0].prestigeType, "bioseed");
  assert.equal(
    JSON.parse(page.storage.writes())["evolutionQueue"].length,
    1,
    "a queue edit must be persisted to raw storage",
  );

  // The row renders with the catalog's race and prestige labels and its star level.
  const row = page.root.querySelectorAll("#script_evolution_0")[0];
  const labels = row.querySelectorAll("span").map((span) => span.textContent);
  assert.deepEqual(labels, ["Cath", "Bioseed", "X"]);
  assert.match(
    row.querySelectorAll("td")[0].textContent,
    /1\*/,
    "one challenge gene is a two-star run",
  );

  // The captured queue loader applies it, the one authority for queue application.
  edit(page, "userEvolutionTarget", "balorg");
  const queued = createCapturedQueuedSettings({ settings: page.settings });
  queued.loadQueuedSettings();
  assert.equal(page.settings.readRaw()["userEvolutionTarget"], "cath");
  assert.equal(queued.readEvolutionAttempts(), 1);
  assert.equal(page.settings.readRaw()["evolutionQueue"].length, 0);
}

// --- 6. queue removal and reordering ------------------------------------------------------------

{
  const raw = { evolutionQueue: [], userEvolutionTarget: "cath" };
  const adapter = createCapturedEvolutionSettingsAdapter({
    getSettingsRaw: () => raw,
  });
  adapter.addCurrent("none");
  raw["userEvolutionTarget"] = "balorg";
  adapter.addCurrent("bioseed");
  assert.deepEqual(
    raw.evolutionQueue.map((entry) => entry.userEvolutionTarget),
    ["cath", "balorg"],
  );

  adapter.reorder([1, 0]);
  assert.deepEqual(
    raw.evolutionQueue.map((entry) => entry.userEvolutionTarget),
    ["balorg", "cath"],
  );

  adapter.edit(0, JSON.stringify({ userEvolutionTarget: "human" }));
  assert.equal(raw.evolutionQueue[0].userEvolutionTarget, "human");
  adapter.edit(0, "{not json");
  assert.equal(
    raw.evolutionQueue[0].userEvolutionTarget,
    "human",
    "a half-typed row must leave the stored entry alone",
  );

  adapter.remove(0);
  assert.deepEqual(
    raw.evolutionQueue.map((entry) => entry.userEvolutionTarget),
    ["cath"],
  );
}

// --- 7. an override changes behaviour without mutating raw storage ------------------------------

{
  const page = createCapturedSettingsPage();
  edit(page, "userEvolutionTarget", "cath");
  page.settings.readRaw()["overrides"]["userEvolutionTarget"] = [
    {
      type1: "Boolean",
      arg1: true,
      cmp: "==",
      type2: "Boolean",
      arg2: true,
      ret: "balorg",
    },
  ];
  page.refreshEffectiveSettings();
  assert.equal(page.settings.readRaw()["userEvolutionTarget"], "cath");
  assert.equal(page.effective["userEvolutionTarget"], "balorg");
  const runtime = evolutionRuntime(() => page.effective);
  runtime.root.city.biome = "hellscape";
  assert.equal(
    planEvolutionTarget(runtime.adapter.reader.sampleTargetSelection()).id,
    "balorg",
  );
}

// --- 8. the Evolution reset restores defaults and keeps unrelated overrides ---------------------

{
  const page = createCapturedSettingsPage();
  edit(page, "userEvolutionTarget", "cath");
  edit(page, "challenge_plasmid", true);
  edit(page, "evolutionQueueRepeat", true);
  const overrides = page.settings.readRaw()["overrides"];
  overrides["challenge_plasmid"] = [
    {
      type1: "Boolean",
      arg1: true,
      cmp: "==",
      type2: "Boolean",
      arg2: true,
      ret: false,
    },
  ];
  overrides["autoBuild"] = [
    {
      type1: "Boolean",
      arg1: true,
      cmp: "==",
      type2: "Boolean",
      arg2: true,
      ret: true,
    },
  ];

  page.root.querySelectorAll("#script_resetevolution")[0].dispatch("click");

  const raw = page.settings.readRaw();
  assert.equal(raw["challenge_plasmid"], false);
  assert.equal(raw["evolutionQueueRepeat"], false);
  assert.equal(
    raw["overrides"]["challenge_plasmid"],
    undefined,
    "the reset owns its own dynamic challenge keys",
  );
  assert.notEqual(raw["overrides"]["autoBuild"], undefined);
}

console.log("captured Evolution settings checks passed");
