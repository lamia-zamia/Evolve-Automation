import assert from "node:assert/strict";

import { createGameCustomRaceLab } from "../src/adapters/browser/game-custom-race-lab.ts";
import { CUSTOM_RACE_LAB_CONTROL_ID } from "../src/ports/game-custom-race-lab.ts";

const root = {
  stats: {
    ascend: 0,
    terraform: 0,
    apotheosis: 0,
    achieve: { genus_humanoid: { l: 1 }, genus_avian: { l: 1 } },
  },
  custom: {
    race0: {
      name: "Saved",
      desc: "A saved race",
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
    },
  },
};
const genome = {
  name: "Saved",
  desc: "A saved race",
  entity: "bipeds",
  home: "Home",
  red: "Red",
  hell: "Hell",
  gas: "Gas",
  gas_moon: "Moon",
  dwarf: "Dwarf",
  titan: "Titan",
  enceladus: "Enceladus",
  triton: "Triton",
  makemake: "Makemake",
  eris: "Eris",
  genus: "humanoid",
  traitlist: ["smart"],
  ranks: { smart: 1 },
  fanaticism: false,
  genes: 10,
};
let tRanks = genome.ranks;
let pageRoot = root;
let panelPresent = true;
let mainGeneration = 1;
let summaryGeneration = 0;
let supportedMethods = new Set(["geneEdit", "swapTab", "setRace"]);
let submitted = 0;
let failNextGeneEdit = false;

function summaryControl() {
  return {
    elementId: "#traitSummary .trait_selection",
    generation: summaryGeneration,
    methods: ["tRank", "increase", "reduce"],
    data: { g: genome, t: tRanks },
  };
}

function mainControl() {
  const methods = {
    geneEdit() {
      const next = {};
      for (const trait of genome.traitlist) next[trait] = tRanks[trait] || 1;
      tRanks = next;
      genome.genes = 20 - genome.traitlist.length;
    },
    swapTab(tab) {
      assert.equal(tab, 4);
      summaryGeneration += 1;
    },
    setRace() {
      submitted += 1;
      root.stats.ascend += 1;
    },
  };
  return {
    elementId: CUSTOM_RACE_LAB_CONTROL_ID,
    generation: mainGeneration,
    methods: [...supportedMethods],
    data: { g: genome },
    methodsImpl: methods,
  };
}

const controls = {
  resolve(id) {
    if (id === CUSTOM_RACE_LAB_CONTROL_ID) {
      return panelPresent ? mainControl() : undefined;
    }
    if (id === "#traitSummary .trait_selection" && summaryGeneration > 0) {
      return summaryControl();
    }
    return undefined;
  },
  invoke(handle, method, args = []) {
    const current = this.resolve(handle.elementId);
    if (current === undefined) return { ok: false, reason: "unknown-control" };
    if (current.generation !== handle.generation)
      return { ok: false, reason: "stale-control" };
    if (handle.elementId === CUSTOM_RACE_LAB_CONTROL_ID) {
      if (!supportedMethods.has(method))
        return { ok: false, reason: "unknown-method" };
      if (method === "geneEdit" && failNextGeneEdit) {
        failNextGeneEdit = false;
        return { ok: false, reason: "test-gene-edit-failure" };
      }
      const impl = mainControl().methodsImpl[method];
      return { ok: true, value: impl(...args) };
    }
    const trait = args[0];
    if (method === "tRank") return { ok: true, value: tRanks[trait] };
    if (method === "increase") {
      const currentRank = tRanks[trait] || 1;
      if (currentRank >= 1.05) return { ok: true, value: undefined };
      tRanks[trait] = Math.round((currentRank + 0.05) * 100) / 100;
      return { ok: true, value: undefined };
    }
    if (method === "reduce") {
      const currentRank = tRanks[trait] || 1;
      tRanks[trait] = Math.round((currentRank - 0.05) * 100) / 100;
      return { ok: true, value: undefined };
    }
    return { ok: false, reason: "unknown-method" };
  },
  capturedElementIds() {
    return [CUSTOM_RACE_LAB_CONTROL_ID];
  },
};

const fields = ["smart", "tough"].map((trait) => ({
  className: `field t${trait}`,
}));
const lab = createGameCustomRaceLab({
  rootState: {
    readRoot: () => pageRoot,
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  controls,
  getDocument: () => ({
    querySelector: (selector) =>
      selector === "#celestialLab" ||
      selector === "#celestialLab .create button"
        ? {}
        : null,
    querySelectorAll: () => fields,
  }),
});

const initial = lab.read("ascension");
assert.ok(initial, "the mounted captured lab has a readable draft");
assert.equal(initial.draft.genus, "humanoid");
assert.deepEqual(initial.availableTraits, ["smart", "tough"]);
assert.deepEqual(initial.availableGenera, ["humanoid", "avian"]);
assert.equal(initial.savedCustomRaceExists, true);
assert.equal(initial.canSubmit, true);

const requested = {
  text: {
    name: "Imported",
    desc: "Imported description",
    makemake: "Far name",
  },
  genus: "avian",
  traits: ["smart"],
  ranks: { smart: 1.05 },
  fanaticism: "smart",
};
assert.deepEqual(lab.applyDesign(initial.session, requested), {
  status: "applied",
});
assert.equal(genome.name, "Imported");
assert.equal(genome.desc, "Imported description");
assert.equal(genome.makemake, "Far name");
assert.equal(genome.genus, "avian");
assert.deepEqual(genome.traitlist, ["smart"]);
assert.equal(
  tRanks.smart,
  1.05,
  "rank changes use the game's captured rank controls",
);
assert.equal(genome.fanaticism, "smart");

const recosting = lab.read("ascension");
assert.equal(recosting?.recalculation, "pending");
const settled = lab.read("ascension");
assert.equal(settled?.recalculation, "settled");
assert.equal(
  settled?.genes,
  19,
  "the adapter reads the game-owned gene balance",
);
assert.deepEqual(
  lab.applyDesign(initial.session, {
    ...requested,
    ranks: { smart: 1.33 },
  }),
  { status: "applied" },
);
assert.equal(
  tRanks.smart,
  1.33,
  "captured import supports a native legacy rank tier",
);
assert.equal(lab.read("ascension")?.recalculation, "pending");
assert.equal(lab.read("ascension")?.recalculation, "settled");

const beforeFailedApply = lab.read("ascension").draft;
failNextGeneEdit = true;
assert.deepEqual(
  lab.applyDesign(initial.session, {
    ...requested,
    text: { ...requested.text, name: "Failed apply" },
    ranks: { smart: 1.35 },
  }),
  { status: "stale", reason: "test-gene-edit-failure" },
);
const restoredPending = lab.read("ascension");
assert.equal(
  restoredPending?.draft.ranks.smart,
  beforeFailedApply.ranks.smart,
  "a failed recost restores the previously captured rank",
);
assert.equal(restoredPending?.draft.text.name, beforeFailedApply.text.name);
assert.equal(restoredPending?.recalculation, "pending");
assert.equal(lab.read("ascension")?.recalculation, "settled");
assert.deepEqual(lab.submit(initial.session, "ascension"), {
  status: "applied",
});
assert.equal(submitted, 1);
assert.equal(root.stats.ascend, 1);

const saved = JSON.parse(lab.readSavedRaceJson("race0"));
assert.deepEqual(saved.traitlist, ["smart"]);
assert.equal(saved.rankVersion, 2);
assert.equal(Object.hasOwn(saved, "traits"), false);

// A control redraw or a replacement game root invalidates the opaque session identity.
mainGeneration += 1;
const replacement = lab.read("ascension");
assert.ok(replacement);
assert.notEqual(replacement.session.identity, initial.session.identity);
assert.equal(lab.applyDesign(initial.session, requested).status, "stale");
pageRoot = { ...root };
assert.equal(lab.submit(replacement.session, "ascension").status, "stale");

panelPresent = false;
assert.equal(lab.read("ascension"), undefined, "an absent panel fails closed");
panelPresent = true;
supportedMethods = new Set(["geneEdit", "swapTab"]);
assert.equal(
  lab.read("ascension"),
  undefined,
  "missing submit method fails closed",
);

console.log("Captured game custom race lab checks passed");
