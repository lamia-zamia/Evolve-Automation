import assert from "node:assert/strict";

import { sampleCapturedEvolutionRaceCatalog } from "../src/adapters/evolve/progression/evolution/captured-evolution-race-catalog.ts";
import { createCapturedEvolution } from "../src/adapters/evolve/progression/evolution/captured-evolution.ts";
import { planEvolutionTarget } from "../src/domain/progression/evolution/evolution.ts";
import { createCapturedSettingsPage, edit } from "./captured-settings-page.mjs";

function makeRoot(overrides = {}) {
  const root = {
    race: {
      species: "protoplasm",
      universe: "standard",
      gods: "",
      jtype: "humanoid",
    },
    city: { biome: "grassland" },
    genes: { challenge: false },
    blood: { unbound: 0 },
    prestige: { Harmony: { count: 0 } },
    stats: { achieve: {}, feat: {}, synth: {} },
    pillars: {},
  };
  for (const [section, values] of Object.entries(overrides)) {
    root[section] = { ...root[section], ...values };
  }
  return root;
}

function makeSettings(overrides = {}) {
  return {
    prestigeType: "none",
    evolutionAutoUnbound: false,
    challenge_emfield: false,
    prestigeAscensionPillar: false,
    userEvolutionTarget: "auto",
    evolutionQueue: [],
    evolutionQueueEnabled: false,
    evolutionQueueRepeat: false,
    ...overrides,
  };
}

function race(result, id) {
  assert.equal(result.status, "ready");
  const value = result.races.find((entry) => entry.id === id);
  assert.ok(value, `catalog should contain ${id}`);
  return value;
}

// 1. The runtime catalog is real, ordered game vocabulary rather than a fabricated target row.
{
  const result = sampleCapturedEvolutionRaceCatalog(makeRoot(), makeSettings());
  assert.equal(result.status, "ready");
  assert.ok(result.races.length > 50);
  assert.ok(result.races.some((entry) => entry.id === "human"));
  assert.ok(result.races.some((entry) => entry.id === "mammuth"));
  assert.equal(
    result.races.some((entry) => entry.id === "protoplasm"),
    false,
  );
  assert.equal(
    result.races.some((entry) => entry.id === "porkenari"),
    false,
  );
}

// 2. An explicit target is resolved from the same catalog and keeps its real genus.
{
  const result = sampleCapturedEvolutionRaceCatalog(
    makeRoot(),
    makeSettings({ userEvolutionTarget: "human" }),
  );
  const decision = planEvolutionTarget({
    races: result.status === "ready" ? result.races : [],
    catalogAvailable: result.status === "ready",
    userEvolutionTarget: "human",
    massExtinction: false,
    queueEnabled: false,
    queueLength: 0,
    queueRepeat: false,
    evolutionAttempts: 0,
  });
  assert.deepEqual(decision, { kind: "target", id: "human", name: "Human" });
  assert.equal(race(result, "human").genus, "humanoid");
}

// 3. An unknown explicit target is never fabricated; existing planner fallback semantics apply.
{
  const result = sampleCapturedEvolutionRaceCatalog(makeRoot(), makeSettings());
  assert.deepEqual(
    planEvolutionTarget({
      races: result.status === "ready" ? result.races : [],
      catalogAvailable: true,
      userEvolutionTarget: "not-a-race",
      massExtinction: false,
      queueEnabled: false,
      queueLength: 0,
      queueRepeat: false,
      evolutionAttempts: 0,
    }),
    { kind: "target", id: "entish", name: "Ent" },
  );
}

// 4. Planet facts come from the root: a sand planet makes sand races fully habitable and aquatic
// races unavailable.
{
  const result = sampleCapturedEvolutionRaceCatalog(
    makeRoot({ city: { biome: "desert" } }),
    makeSettings(),
  );
  assert.equal(race(result, "kamel").habitability, 1);
  assert.equal(race(result, "sharkin").habitability, 0);
}

// 5. Auto Unbound exposes the game's 0.8 threshold, but does not invent full habitability.
{
  const result = sampleCapturedEvolutionRaceCatalog(
    makeRoot({ blood: { unbound: 1 } }),
    makeSettings({ evolutionAutoUnbound: true }),
  );
  assert.equal(race(result, "sharkin").habitability, 0.8);
  assert.equal(race(result, "sharkin").weighting >= 0, true);
}

// 6. With Auto Unbound disabled, the same reachable-through-blood race is locked for auto ranking.
{
  const result = sampleCapturedEvolutionRaceCatalog(
    makeRoot({ blood: { unbound: 1 } }),
    makeSettings({ evolutionAutoUnbound: false }),
  );
  assert.equal(race(result, "sharkin").weighting, -1);
  const decision = planEvolutionTarget({
    races: result.status === "ready" ? result.races : [],
    catalogAvailable: true,
    userEvolutionTarget: "auto",
    massExtinction: false,
    queueEnabled: false,
    queueLength: 0,
    queueRepeat: false,
    evolutionAttempts: 0,
  });
  assert.notEqual(decision.kind === "target" ? decision.id : "", "sharkin");
}

// 7. Hellspawn follows the game's evil-universe and Godslayer gate.
{
  const locked = sampleCapturedEvolutionRaceCatalog(
    makeRoot({ race: { universe: "evil" }, stats: { achieve: {} } }),
    makeSettings(),
  );
  const unlocked = sampleCapturedEvolutionRaceCatalog(
    makeRoot({
      race: { universe: "evil" },
      stats: { achieve: { godslayer: { e: 1 } } },
    }),
    makeSettings(),
  );
  assert.equal(race(locked, "hellspawn").habitability, 0);
  assert.equal(race(unlocked, "hellspawn").habitability, 1);
}

// 8. Named hybrids require Godslayer and use their best reachable constituent genus.
{
  const locked = sampleCapturedEvolutionRaceCatalog(
    makeRoot({ city: { biome: "eden" } }),
    makeSettings(),
  );
  const unlocked = sampleCapturedEvolutionRaceCatalog(
    makeRoot({
      city: { biome: "eden" },
      stats: { achieve: { godslayer: { e: 1 } } },
    }),
    makeSettings(),
  );
  assert.equal(race(locked, "nephilim").habitability, 0);
  assert.equal(race(unlocked, "nephilim").habitability, 1);
}

// 9. Challenge races use the game's selected variable genus, not the static "variable" label.
{
  const result = sampleCapturedEvolutionRaceCatalog(
    makeRoot({ race: { jtype: "demonic" }, genes: { challenge: true } }),
    makeSettings(),
  );
  assert.equal(race(result, "junker").genus, "demonic");
  assert.equal(race(result, "junker").habitability, 1);
}

// 10. Mass Extinction is observed from the achievement bag and does not erase catalog facts.
{
  const result = sampleCapturedEvolutionRaceCatalog(
    makeRoot({ stats: { achieve: { mass_extinction: { l: 1 } } } }),
    makeSettings(),
  );
  assert.equal(result.massExtinction, true);
  assert.equal(race(result, "human").habitability, 1);
}

// 11. Missing required facts fail closed, and the pure planner waits even when the setting says
// Auto Achievements.
{
  const root = makeRoot();
  delete root.city.biome;
  const result = sampleCapturedEvolutionRaceCatalog(root, makeSettings());
  assert.equal(result.status, "unavailable");
  assert.deepEqual(
    planEvolutionTarget({
      races: [],
      catalogAvailable: false,
      userEvolutionTarget: "auto",
      massExtinction: false,
      queueEnabled: false,
      queueLength: 0,
      queueRepeat: false,
      evolutionAttempts: 0,
    }),
    { kind: "wait" },
  );
}

// 12. The real captured settings control reaches the composed captured reader, not just a pure
// fixture: changing Auto Unbound changes the sampled weighting through the panel's effective data.
{
  const page = createCapturedSettingsPage();
  assert.equal(
    page.root.querySelectorAll(".script_evolutionAutoUnbound").length,
    1,
  );
  edit(page, "evolutionAutoUnbound", false);
  const root = makeRoot({ blood: { unbound: 1 } });
  const evolution = createCapturedEvolution({
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
    readSettings: () => page.effective,
    readEvolutionAttempts: () => 0,
    loadQueuedSettings: () => {},
    universeControls: { selectUniverse: () => true },
    challengeGroups: [],
  });
  const sample = evolution.reader.sampleTargetSelection();
  assert.equal(sample.catalogAvailable, true);
  assert.equal(
    sample.races.find((entry) => entry.id === "sharkin")?.weighting,
    -1,
  );
}

console.log("captured Evolution catalog checks passed");
