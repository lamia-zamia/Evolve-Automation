import assert from "node:assert/strict";

import { createCapturedPrestigeControl } from "../src/bootstrap/captured-prestige-control.ts";
import {
  CAPTURED_BUILDING_PRESTIGE_ACTIONS,
  CAPTURED_WITCH_ASCENSION_ACTION,
} from "../src/adapters/evolve/progression/prestige/captured-mad.ts";
import {
  createDeadSpaceCustomLabFixture,
  createDeadSpaceTerraformLabFixture,
} from "./deadspace-lab-fixture.mjs";

function presetJson({ name = "Avians", hybrid = false } = {}) {
  return JSON.stringify({
    name,
    desc: `${name} from a named preset`,
    entity: "winged bipeds",
    home: "Aerie",
    red: "Ember",
    hell: "Cinder",
    gas: "Cloud",
    gas_moon: "Nest",
    dwarf: "Perch",
    titan: "Titan II",
    enceladus: "Moon II",
    triton: "Moon III",
    makemake: "Perch II",
    eris: "Perch III",
    genus: hybrid ? "hybrid" : "avian",
    ...(hybrid ? { hybrid: ["avian", "small"] } : {}),
    traitlist: ["smart", "tough"],
    ranks: { smart: 1.25, tough: 1 },
    rankVersion: 2,
    slots: { smart: 1, tough: 7 },
    recessive: 2,
    slotSpan: 24,
    span: 24,
    v: 2,
    fanaticism: false,
  });
}

function makeRoot({ witchHunter = false } = {}) {
  return {
    settings: { qKey: false, touch: false },
    race: {
      species: "human",
      universe: witchHunter ? "magic" : "standard",
      ...(witchHunter ? { witch_hunter: true, fasting: false } : {}),
    },
    tech: { forbidden: 4, dish_reset: 2 },
    stats: {
      terraform: 0,
      ascend: 0,
      apotheosis: 0,
      descend: 0,
      achieve: {
        genus_humanoid: { l: 1 },
        genus_avian: { l: 1 },
        lamentis: { l: 1 },
      },
    },
    portal: witchHunter
      ? {
          absorption_chamber: { count: 100 },
          soul_capacitor: { energy: 100000000 },
        }
      : undefined,
    pillars: witchHunter ? { human: 1 } : undefined,
    custom: {},
  };
}

function scenario({
  prestigeType = "ascension",
  mode = "reuse",
  saved = true,
  hybrid = prestigeType === "apotheosis",
  labInitiallyOpen = false,
  mutateDraftBeforePrestige = false,
  witchHunter = false,
  presets = [{ name: "Avians", json: presetJson() }],
  behavior = {},
  autoReset = true,
  customPortTransform,
} = {}) {
  let root = makeRoot({ witchHunter });
  let goal = "Standard";
  let submissions = 0;
  const activities = [];
  const trace = [];
  const settings = {
    prestigeType,
    prestigeCustomRaceMode: mode,
    prestigeCustomRacePreset: "0",
    prestigeCustomRacePresets: presets,
    prestigeAscensionPillar: true,
  };
  const stat =
    prestigeType === "terraform"
      ? "terraform"
      : prestigeType === "apotheosis"
        ? "apotheosis"
        : "ascend";
  const customLab = createDeadSpaceCustomLabFixture({
    root,
    hybrid,
    saved,
    open: labInitiallyOpen,
    behavior,
    onSetRace: ({ root: targetRoot }) => {
      submissions += 1;
      if (autoReset) targetRoot.stats[stat] += 1;
    },
  });
  if (mutateDraftBeforePrestige) customLab.genome.slots.smart = 3;
  const terraformLab = createDeadSpaceTerraformLabFixture({
    root,
    open: false,
    score: 2,
    onSetPlanet: ({ root: targetRoot }) => {
      submissions += 1;
      if (autoReset) targetRoot.stats.terraform += 1;
    },
  });
  const customRaceLab =
    customPortTransform === undefined
      ? customLab.port
      : customPortTransform(customLab);
  const actionId = witchHunter
    ? CAPTURED_WITCH_ASCENSION_ACTION
    : CAPTURED_BUILDING_PRESTIGE_ACTIONS[prestigeType].elementId;
  const actionRegion = witchHunter
    ? "portal"
    : CAPTURED_BUILDING_PRESTIGE_ACTIONS[prestigeType].region;
  const controls = {
    resolve(id) {
      return id === actionId
        ? { elementId: id, generation: 1, methods: ["action"] }
        : undefined;
    },
    invoke(handle, method) {
      if (handle.elementId !== actionId || method !== "action") {
        return { ok: false, reason: "unknown-control" };
      }
      trace.push([handle.elementId, method]);
      if (prestigeType === "terraform") terraformLab.setOpen(true);
      else customLab.setOpen(true);
      return { ok: true, value: undefined };
    },
    capturedElementIds: () => [actionId],
  };
  const prestige = createCapturedPrestigeControl({
    rootState: customLab.rootState,
    controls,
    customRaceLab,
    terraformLab: terraformLab.port,
    readSettings: () => settings,
    readGoal: () => goal,
    setGoal: (next) => {
      goal = next;
      trace.push(["goal", next]);
    },
    readBuildingResetActions: (regions) => {
      assert.deepEqual(regions, [actionRegion]);
      return new Set([actionId]);
    },
    resources: {
      readResources: () => ({
        resources: new Map([["Harmony", { amount: 1 }]]),
      }),
    },
    onActivity: (entry) => activities.push(entry.message),
  });

  return {
    root,
    settings,
    customLab,
    terraformLab,
    activities,
    trace,
    run() {
      prestige.run();
      customLab.finishNativeReprice();
    },
    repeat(count) {
      for (let index = 0; index < count; index += 1) this.run();
    },
    manualSubmit() {
      root.stats[stat] += 1;
      customLab.setOpen(false);
    },
    replaceRoot(next) {
      root = next;
      customLab.setRoot(next);
    },
    get goal() {
      return goal;
    },
    get submissions() {
      return submissions;
    },
    get actionId() {
      return actionId;
    },
  };
}

// Ascension reuses the saved race loaded into the mounted genome and submits through setRace.
{
  const flow = scenario({
    prestigeType: "ascension",
    mode: "reuse",
    saved: true,
  });
  flow.repeat(4);
  assert.equal(flow.submissions, 1);
  assert.equal(flow.root.stats.ascend, 1);
  assert.deepEqual(flow.activities, ["Prestiged"]);
  assert.deepEqual(flow.trace, [
    ["goal", "Reset"],
    [flow.actionId, "action"],
  ]);
}

// An already-open lab can be manually edited before its first automation sample. Reuse resets the
// native draft, waits for its deferred repricing, and restores the actual saved race before setRace.
{
  const flow = scenario({
    prestigeType: "ascension",
    mode: "reuse",
    saved: true,
    labInitiallyOpen: true,
    mutateDraftBeforePrestige: true,
  });
  flow.repeat(7);
  assert.equal(flow.submissions, 1);
  assert.equal(flow.root.stats.ascend, 1);
  assert.deepEqual(flow.customLab.genome.slots, { smart: 2, tough: 7 });
  assert.deepEqual(flow.customLab.nativeCalls.slice(0, 4), [
    "reset",
    "customImport",
    "geneEdit",
    "setRace",
  ]);
}

// Without a saved custom the game shows its default Zombie. Reuse does not submit that draft.
{
  const flow = scenario({
    prestigeType: "ascension",
    mode: "reuse",
    saved: false,
  });
  assert.equal(flow.customLab.genome.name, "Zombie");
  flow.repeat(10);
  assert.equal(flow.submissions, 0);
  assert.equal(flow.root.stats.ascend, 0);
}

// Import waits for native reset/reprice, calls the file importer, then waits for its reprice/redraw before submit.
{
  const flow = scenario({
    prestigeType: "ascension",
    mode: "import",
    saved: false,
  });
  flow.repeat(7);
  assert.equal(flow.submissions, 1);
  assert.equal(flow.root.stats.ascend, 1);
  assert.equal(flow.customLab.genome.name, "Avians");
  assert.deepEqual(flow.customLab.genome.slots, { smart: 1, tough: 7 });
  assert.equal(flow.customLab.genome.recessive, 2);
  assert.equal(flow.customLab.genome.span, 24);
  assert.deepEqual(flow.activities, ["Prestiged"]);
}

// Pause leaves the game-owned lab open for manual editing and submission. The captured runtime
// observes the native reset counter and never calls setRace itself.
{
  const flow = scenario({
    prestigeType: "ascension",
    mode: "pause",
    saved: true,
  });
  flow.repeat(4);
  assert.equal(flow.submissions, 0);
  flow.customLab.genome.name = "Manually edited";
  flow.manualSubmit();
  flow.run();
  assert.equal(flow.submissions, 0);
  assert.deepEqual(flow.activities, ["Prestiged"]);
}

// The same transaction routes Apotheosis through race1 and preserves the hybrid slot data.
{
  const flow = scenario({
    prestigeType: "apotheosis",
    mode: "reuse",
    saved: true,
  });
  flow.repeat(4);
  assert.equal(flow.submissions, 1);
  assert.equal(flow.root.stats.apotheosis, 1);
  assert.equal(flow.customLab.savedSlot, "race1");
  assert.deepEqual(flow.customLab.genome.hybrid, ["avian", "small"]);
}

{
  const flow = scenario({
    prestigeType: "apotheosis",
    mode: "import",
    saved: false,
    hybrid: true,
    presets: [{ name: "Hybrid Avians", json: presetJson({ hybrid: true }) }],
  });
  flow.repeat(6);
  assert.equal(flow.submissions, 1);
  assert.equal(flow.root.stats.apotheosis, 1);
  assert.equal(flow.customLab.savedSlot, "race1");
  assert.deepEqual(flow.customLab.genome.hybrid, ["avian", "small"]);
  assert.deepEqual(flow.customLab.genome.slots, { smart: 1, tough: 7 });
}

// A race0-style preset can also enter race1; the game performs its native genus-to-hybrid
// conversion while the adapter verifies that its strand state survived the import.
{
  const flow = scenario({
    prestigeType: "apotheosis",
    mode: "import",
    saved: false,
    hybrid: true,
    presets: [
      { name: "Race0 preset", json: presetJson({ name: "Race0 preset" }) },
    ],
  });
  flow.repeat(6);
  assert.equal(flow.submissions, 1);
  assert.equal(flow.root.stats.apotheosis, 1);
  assert.deepEqual(flow.customLab.genome.hybrid, ["avian", "humanoid"]);
  assert.equal(flow.customLab.genome.genus, "hybrid");
}

// Terraform's same #celestialLab id is routed to data.p / setPlanet, never through Custom Race.
{
  const flow = scenario({ prestigeType: "terraform", mode: "import" });
  flow.repeat(4);
  assert.equal(flow.submissions, 1);
  assert.equal(flow.root.stats.terraform, 1);
  assert.deepEqual(flow.customLab.nativeCalls, []);
  assert.deepEqual(flow.terraformLab.nativeCalls, ["pEdit", "setPlanet"]);
  assert.deepEqual(flow.activities, ["Prestiged"]);
}

// A successful setPlanet call remains an unconfirmed request until terraform's counter changes,
// and the captured transaction invokes it only once while waiting.
{
  const flow = scenario({
    prestigeType: "terraform",
    mode: "reuse",
    autoReset: false,
  });
  flow.repeat(3);
  assert.equal(flow.submissions, 1);
  flow.repeat(10);
  assert.equal(flow.submissions, 1);
  assert.equal(flow.root.stats.terraform, 0);
  flow.root.stats.terraform += 1;
  flow.run();
  assert.deepEqual(flow.activities, ["Prestiged"]);
}

// Witch-Hunter's absorption chamber opens the same Custom Race transaction and only advances the
// goal after the ascension reset is observed.
{
  const flow = scenario({
    prestigeType: "ascension",
    mode: "reuse",
    saved: true,
    witchHunter: true,
  });
  flow.repeat(4);
  assert.equal(flow.submissions, 1);
  assert.equal(flow.root.stats.ascend, 1);
  assert.equal(flow.goal, "GameOverMan");
  assert.deepEqual(flow.activities, ["Prestiged"]);
}

// An invoked setRace without a reset is not success and is not spammed. A fresh Vue generation
// clears the session-local failure, reloading the saved race makes reuse safe again.
{
  const behavior = {};
  const flow = scenario({
    prestigeType: "ascension",
    mode: "reuse",
    saved: true,
    behavior,
    autoReset: false,
  });
  flow.repeat(3);
  assert.equal(flow.submissions, 1);
  flow.repeat(10);
  assert.equal(flow.submissions, 1);
  flow.customLab.reloadMountedLabFromSavedRace();
  flow.repeat(3);
  assert.equal(flow.submissions, 2, "a new session allows a deliberate retry");
}

// Native setRace rejection is terminal for that session; a new generation recovers after the
// transient native rejection clears.
{
  const behavior = { rejectSubmission: true };
  const flow = scenario({ prestigeType: "ascension", mode: "reuse", behavior });
  flow.repeat(3);
  assert.equal(flow.submissions, 0);
  flow.repeat(5);
  assert.equal(
    flow.customLab.nativeCalls.filter((name) => name === "setRace").length,
    1,
  );
  behavior.rejectSubmission = false;
  flow.customLab.reloadMountedLabFromSavedRace();
  flow.repeat(3);
  assert.equal(flow.submissions, 1);
}

// A control redraw between sample and apply returns stale once. The transaction notices the new
// session and retries the same selected preset without carrying the old sampled design forward.
{
  const flow = scenario({
    prestigeType: "ascension",
    mode: "import",
    saved: false,
    customPortTransform(customLab) {
      let redrawAfterRead = true;
      return {
        read: (identity) => {
          const sample = customLab.port.read(identity);
          if (sample !== undefined && redrawAfterRead) {
            redrawAfterRead = false;
            customLab.redrawMain();
          }
          return sample;
        },
        applyDesign: (...args) => customLab.port.applyDesign(...args),
        submit: (...args) => customLab.port.submit(...args),
        readCurrentSavedRaceJson: () =>
          customLab.port.readCurrentSavedRaceJson(),
        readSavedRaceJson: (...args) =>
          customLab.port.readSavedRaceJson(...args),
      };
    },
  });
  flow.repeat(7);
  assert.equal(flow.submissions, 1);
  assert.equal(flow.root.stats.ascend, 1);
  assert.equal(
    flow.customLab.nativeCalls.filter((name) => name === "customImport").length,
    1,
  );
}

// A settings mode change to pause during async import prevents submission even though the native
// FileReader/reprice operation is allowed to finish in its original mounted session.
{
  const flow = scenario({
    prestigeType: "ascension",
    mode: "import",
    saved: false,
  });
  flow.repeat(3);
  flow.settings.prestigeCustomRaceMode = "pause";
  flow.repeat(10);
  assert.equal(flow.customLab.genome.name, "Avians");
  assert.equal(flow.submissions, 0);
  assert.equal(flow.root.stats.ascend, 0);
}

// Changing the selected prestige type aborts an unsubmitted Celestial Lab transaction; an old
// Ascension preset may finish its native import, but it cannot submit after the setting changes.
{
  const flow = scenario({
    prestigeType: "ascension",
    mode: "import",
    saved: false,
  });
  flow.repeat(3);
  flow.settings.prestigeType = "mad";
  flow.repeat(8);
  assert.equal(flow.submissions, 0);
  assert.equal(flow.root.stats.ascend, 0);
  assert.equal(flow.customLab.nativeCalls.includes("setRace"), false);
}

// Switching import to reuse drains the old import and then applies the actual saved race before
// submitting; the selected preset's imported design does not leak across the mode change.
{
  const flow = scenario({
    prestigeType: "ascension",
    mode: "import",
    saved: true,
  });
  flow.repeat(3);
  flow.settings.prestigeCustomRaceMode = "reuse";
  flow.repeat(10);
  assert.equal(flow.submissions, 1);
  assert.equal(flow.customLab.genome.name, "Saved");
  assert.deepEqual(flow.customLab.genome.slots, { smart: 2, tough: 7 });
}

// Changing the selected preset while A is importing drains A's native import, applies B, and
// submits only B's normalized live draft.
{
  const flow = scenario({
    prestigeType: "ascension",
    mode: "import",
    saved: false,
    presets: [
      { name: "A", json: presetJson({ name: "Race A" }) },
      { name: "B", json: presetJson({ name: "Race B" }) },
    ],
  });
  flow.repeat(3);
  flow.settings.prestigeCustomRacePreset = "1";
  flow.repeat(10);
  assert.equal(flow.submissions, 1);
  assert.equal(flow.customLab.genome.name, "Race B");
  assert.equal(
    flow.customLab.nativeCalls.filter((name) => name === "customImport").length,
    2,
  );
}

// Replacing the root while the opener transaction is pending aborts it as stale. A reset counter
// from the old transaction is not fabricated, and the fresh root is re-evaluated on later ticks.
{
  const flow = scenario({
    prestigeType: "ascension",
    mode: "reuse",
    saved: true,
  });
  flow.repeat(2);
  const replacement = makeRoot();
  flow.replaceRoot(replacement);
  flow.run();
  assert.equal(flow.submissions, 0);
  assert.equal(replacement.stats.ascend, 0);
  assert.deepEqual(flow.activities, []);
}

console.log("Custom Race and Terraform production composition checks passed");
