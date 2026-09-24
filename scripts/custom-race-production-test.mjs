import assert from "node:assert/strict";

import { createCapturedPrestigeControl } from "../src/bootstrap/captured-prestige-control.ts";
import { createGameCustomRaceLab } from "../src/adapters/browser/game-custom-race-lab.ts";
import { CAPTURED_BUILDING_PRESTIGE_ACTIONS } from "../src/adapters/evolve/progression/prestige/captured-mad.ts";
import { CUSTOM_RACE_LAB_CONTROL_ID } from "../src/ports/game-custom-race-lab.ts";

const presetJson = JSON.stringify({
  name: "Avians",
  desc: "A race from a named preset",
  entity: "winged bipeds",
  home: "Aerie",
  red: "Ember",
  hell: "Cinder",
  gas: "Cloud",
  gas_moon: "Nest",
  dwarf: "Perch",
  genus: "avian",
  traitlist: ["smart"],
  ranks: { smart: 1 },
  fanaticism: false,
  rankVersion: 2,
});

function scenario({ mode, savedRace = false, preset = presetJson }) {
  const trace = [];
  const settings = {
    prestigeType: "ascension",
    prestigeCustomRaceMode: mode,
    prestigeCustomRacePreset: "0",
    prestigeCustomRacePresets: [{ name: "Avians", json: preset }],
  };
  const root = {
    settings: { qKey: false, touch: false },
    race: { species: "human", universe: "standard" },
    stats: {
      terraform: 0,
      ascend: 0,
      apotheosis: 0,
      achieve: { genus_humanoid: { l: 1 }, genus_avian: { l: 1 } },
    },
    custom: savedRace
      ? {
          race0: {
            name: "Saved",
            desc: "Saved design",
            entity: "bipeds",
            home: "Home",
            red: "Red",
            hell: "Hell",
            gas: "Gas",
            gas_moon: "Moon",
            dwarf: "Dwarf",
            genus: "humanoid",
            traits: ["smart"],
            ranks: { smart: 1 },
            fanaticism: false,
          },
        }
      : {},
  };
  const genome = savedRace
    ? {
        name: "Saved",
        desc: "Saved design",
        entity: "bipeds",
        home: "Home",
        red: "Red",
        hell: "Hell",
        gas: "Gas",
        gas_moon: "Moon",
        dwarf: "Dwarf",
        titan: "Titan",
        enceladus: "Moon 2",
        triton: "Moon 3",
        makemake: "Dwarf 2",
        eris: "Dwarf 3",
        genus: "humanoid",
        traitlist: ["smart"],
        ranks: { smart: 1 },
        fanaticism: false,
        genes: 10,
      }
    : {
        name: "Zombie",
        desc: "Undead",
        entity: "undead",
        home: "Grave",
        red: "Brains",
        hell: "Rigor",
        gas: "Decompose",
        gas_moon: "Bones",
        dwarf: "Double Tap",
        titan: "Necromancer",
        enceladus: "Skeleton",
        triton: "Rot",
        makemake: "Shamble",
        eris: "Zombieland",
        genus: "humanoid",
        traitlist: [],
        ranks: {},
        fanaticism: false,
        genes: 10,
      };
  let tRanks = genome.ranks;
  let labOpen = false;
  let summaryGeneration = 0;
  let submitted = 0;
  const openerId = CAPTURED_BUILDING_PRESTIGE_ACTIONS.ascension.elementId;
  const mainHandle = () => ({
    elementId: CUSTOM_RACE_LAB_CONTROL_ID,
    generation: 1,
    methods: ["geneEdit", "swapTab", "setRace"],
    data: { g: genome },
  });
  const summaryHandle = () => ({
    elementId: "#traitSummary .trait_selection",
    generation: summaryGeneration,
    methods: ["tRank", "increase", "reduce"],
    data: { g: genome, t: tRanks },
  });
  const controls = {
    resolve(id) {
      if (id === openerId)
        return { elementId: id, generation: 1, methods: ["action"] };
      if (id === CUSTOM_RACE_LAB_CONTROL_ID && labOpen) return mainHandle();
      if (id === "#traitSummary .trait_selection" && summaryGeneration > 0)
        return summaryHandle();
      return undefined;
    },
    invoke(handle, method, args = []) {
      const current = this.resolve(handle.elementId);
      if (!current) return { ok: false, reason: "unknown-control" };
      if (current.generation !== handle.generation)
        return { ok: false, reason: "stale-control" };
      if (handle.elementId === openerId) {
        labOpen = true;
        trace.push("open-lab");
        return { ok: true, value: undefined };
      }
      if (handle.elementId === CUSTOM_RACE_LAB_CONTROL_ID) {
        if (method === "geneEdit") {
          const next = {};
          for (const trait of genome.traitlist)
            next[trait] = tRanks[trait] || 1;
          tRanks = next;
          genome.genes = 10;
          trace.push("geneEdit");
          return { ok: true, value: undefined };
        }
        if (method === "swapTab") {
          summaryGeneration += 1;
          return { ok: true, value: undefined };
        }
        if (method === "setRace") {
          submitted += 1;
          root.stats.ascend += 1;
          root.custom.race0 = {
            ...genome,
            traits: [...genome.traitlist],
            ranks: { ...tRanks },
          };
          labOpen = false;
          trace.push("setRace");
          return { ok: true, value: undefined };
        }
      }
      const trait = args[0];
      if (method === "tRank") return { ok: true, value: tRanks[trait] };
      if (method === "increase") {
        tRanks[trait] = Math.round(((tRanks[trait] || 1) + 0.05) * 100) / 100;
        return { ok: true, value: undefined };
      }
      if (method === "reduce") {
        tRanks[trait] = Math.round(((tRanks[trait] || 1) - 0.05) * 100) / 100;
        return { ok: true, value: undefined };
      }
      return { ok: false, reason: "unknown-method" };
    },
    capturedElementIds: () => [openerId],
  };
  const customRaceLab = createGameCustomRaceLab({
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls,
    getDocument: () => ({
      querySelector: (selector) =>
        labOpen &&
        (selector === "#celestialLab" ||
          selector === "#celestialLab .create button")
          ? {}
          : null,
      querySelectorAll: () => [{ className: "field tsmart" }],
    }),
  });
  let goal = "Standard";
  const activities = [];
  const prestige = createCapturedPrestigeControl({
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls,
    customRaceLab,
    readSettings: () => settings,
    readGoal: () => goal,
    setGoal: (next) => {
      goal = next;
    },
    readBuildingResetActions: (regions) => {
      assert.deepEqual(regions, ["interstellar"]);
      return new Set([openerId]);
    },
    onActivity: (entry) => activities.push(entry.message),
  });
  return {
    root,
    genome,
    trace,
    activities,
    run: () => prestige.run(),
    get goal() {
      return goal;
    },
    get labOpen() {
      return labOpen;
    },
    get submitted() {
      return submitted;
    },
    manualSubmit: () => {
      root.stats.ascend += 1;
      labOpen = false;
    },
  };
}

// Production bootstrap path: Ascension opens the game lab, imported design is applied, game-owned
// recost settles over two runtime samples, and only then does the captured setRace control submit.
{
  const flow = scenario({ mode: "import" });
  flow.run();
  assert.equal(flow.goal, "Reset");
  flow.run();
  assert.equal(flow.labOpen, true);
  flow.run();
  assert.equal(flow.trace.includes("geneEdit"), true);
  flow.run();
  assert.equal(flow.submitted, 0, "pending game recost cannot submit");
  flow.run();
  assert.equal(flow.submitted, 1);
  assert.equal(flow.root.stats.ascend, 1);
  assert.deepEqual(flow.root.custom.race0.traits, ["smart"]);
  assert.equal(flow.root.custom.race0.genus, "avian");
  assert.equal(flow.root.custom.race0.name, "Avians");
  assert.deepEqual(flow.activities, ["Prestiged"]);
}

// Reuse mode pauses if the correct saved custom does not exist; it never submits the initial Zombie.
{
  const flow = scenario({ mode: "reuse", savedRace: false });
  flow.run();
  flow.run();
  flow.run();
  assert.equal(flow.labOpen, true);
  assert.equal(flow.submitted, 0);
}

// Pause mode leaves the native lab available. A manual submit is recognized from the game's reset
// counter and terminates the pending transaction without the automation submitting a second time.
{
  const flow = scenario({ mode: "pause", savedRace: true });
  flow.run();
  flow.run();
  flow.run();
  assert.equal(flow.submitted, 0);
  flow.manualSubmit();
  flow.run();
  assert.equal(flow.submitted, 0);
  assert.deepEqual(flow.activities, ["Prestiged"]);
}

console.log("Custom race production composition checks passed");
