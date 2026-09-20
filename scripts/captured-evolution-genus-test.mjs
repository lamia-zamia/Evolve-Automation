import assert from "node:assert/strict";

import { planEvolutionGenusSelection } from "../src/domain/progression/evolution/evolution.ts";
import { createCapturedEvolution } from "../src/adapters/evolve/progression/evolution/captured-evolution.ts";
import { CAPTURED_EVOLUTION_GENERA } from "../src/adapters/evolve/progression/evolution/captured-evolution-catalog.ts";
import { createCapturedEvolutionSettingsAdapter } from "../src/adapters/evolve/progression/evolution/captured-evolution-settings.ts";
import { createCapturedSettingsPage, edit } from "./captured-settings-page.mjs";

const genusAction = (genus, actionId, unlocked = true) => ({
  genus,
  actionId,
  unlocked,
});

// Ordinary races do not offer a choice, even while the game has the global genus-selection phase.
assert.deepEqual(
  planEvolutionGenusSelection({
    available: true,
    genusSelectionActive: true,
    targetOffersChoice: false,
    targetGenera: [],
    preferredGenus: "fungi",
    selectedGenus: null,
    actions: [genusAction("fungi", "chitin")],
  }),
  { kind: "skip" },
);

// A compatible hybrid preference selects the exact game action, not a made-up DOM control.
assert.deepEqual(
  planEvolutionGenusSelection({
    available: true,
    genusSelectionActive: true,
    targetOffersChoice: true,
    targetGenera: ["eldritch", "giant"],
    preferredGenus: "giant",
    selectedGenus: null,
    actions: [genusAction("giant", "gigantism")],
  }),
  { kind: "click", genus: "giant", actionId: "gigantism" },
);

// Stale, unavailable, or already-selected preferences do not fall through to another candidate.
for (const input of [
  {
    available: true,
    genusSelectionActive: true,
    targetOffersChoice: true,
    targetGenera: ["eldritch"],
    preferredGenus: "giant",
    selectedGenus: null,
    actions: [genusAction("eldritch", "eldritch")],
  },
  {
    available: true,
    genusSelectionActive: true,
    targetOffersChoice: true,
    targetGenera: ["giant"],
    preferredGenus: "giant",
    selectedGenus: null,
    actions: [],
  },
  {
    available: false,
    genusSelectionActive: true,
    targetOffersChoice: true,
    targetGenera: ["giant"],
    preferredGenus: "giant",
    selectedGenus: null,
    actions: [genusAction("giant", "gigantism")],
  },
  {
    available: true,
    genusSelectionActive: true,
    targetOffersChoice: true,
    targetGenera: ["giant"],
    preferredGenus: "giant",
    selectedGenus: "giant",
    actions: [genusAction("giant", "gigantism")],
  },
]) {
  assert.deepEqual(planEvolutionGenusSelection(input), { kind: "skip" });
}

function makeRuntime({ mutateTech = true } = {}) {
  const root = {
    race: { species: "protoplasm" },
    evolution: { gselect: true },
    tech: { evo_giant: 1 },
  };
  const settings = {
    userEvolutionTarget: "beholder",
    userEvolutionGenus: "giant",
  };
  const invoked = [];
  const runtime = createCapturedEvolution({
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls: {
      resolve: (id) =>
        id === "evolution-gigantism"
          ? { elementId: id, generation: 1, methods: ["action"] }
          : undefined,
      invoke: (handle) => {
        invoked.push(handle.elementId);
        if (mutateTech) root.tech.evo_giant = 2;
        else root.evolution.unrelated = 1;
        return { ok: true, value: undefined };
      },
      capturedElementIds: () => ["evolution-gigantism"],
    },
    drawnActions: {
      read: () => [{ id: "evolution-gigantism", cost: { DNA: 1 } }],
      exists: () => true,
    },
    readSettings: () => settings,
    readEvolutionAttempts: () => 0,
    loadQueuedSettings: () => {},
    universeControls: { selectUniverse: () => true },
    challengeGroups: [],
  });
  return { root, runtime, invoked };
}

// The real captured adapter samples the drawn action, invokes it once, and observes the tech
// postcondition that sentience() later consumes.
{
  const { runtime, root, invoked } = makeRuntime();
  const before = runtime.reader.sampleEvolutionGenusSelection("beholder");
  assert.equal(before.targetOffersChoice, true);
  assert.equal(before.actions[0].actionId, "gigantism");
  assert.equal(before.selectedGenus, null);
  const choice = planEvolutionGenusSelection(before);
  assert.deepEqual(choice, {
    kind: "click",
    genus: "giant",
    actionId: "gigantism",
  });
  assert.equal(runtime.executor.clickEvolution(choice.actionId), true);
  assert.deepEqual(invoked, ["evolution-gigantism"]);
  assert.equal(
    runtime.reader.sampleEvolutionGenusSelection("beholder").selectedGenus,
    "giant",
  );
  assert.equal(root.tech.evo_giant, 2);
}

// An action wrapper that mutates unrelated state is not a successful genus selection.
{
  const { runtime, invoked } = makeRuntime({ mutateTech: false });
  const choice = planEvolutionGenusSelection(
    runtime.reader.sampleEvolutionGenusSelection("beholder"),
  );
  assert.equal(runtime.executor.clickEvolution(choice.actionId), true);
  assert.deepEqual(invoked, ["evolution-gigantism"]);
  assert.equal(
    runtime.reader.sampleEvolutionGenusSelection("beholder").selectedGenus,
    null,
    "the caller must stop after an unobserved genus postcondition",
  );
}

// The settings option list and runtime acceptance list are the same catalog.
{
  const page = createCapturedSettingsPage();
  const settingsAdapter = createCapturedEvolutionSettingsAdapter({
    getSettingsRaw: () => page.settings.readRaw(),
  });
  const genusControl = settingsAdapter
    .readEvolutionSettingsReadModel()
    .controls.find((control) => control.settingName === "userEvolutionGenus");
  assert.ok(genusControl && "options" in genusControl);
  assert.deepEqual(
    genusControl.options.map((option) => option.val),
    CAPTURED_EVOLUTION_GENERA.map((genus) => genus.id),
  );
  edit(page, "userEvolutionGenus", "giant");
  assert.equal(page.effective.userEvolutionGenus, "giant");
  const raw = { userEvolutionTarget: "beholder", userEvolutionGenus: "giant" };
  const secondSettingsAdapter = createCapturedEvolutionSettingsAdapter({
    getSettingsRaw: () => raw,
  });
  assert.ok(
    secondSettingsAdapter
      .readEvolutionSettingsReadModel()
      .controls.some((control) => control.settingName === "userEvolutionGenus"),
  );
}

console.log("captured Evolution genus checks passed");
