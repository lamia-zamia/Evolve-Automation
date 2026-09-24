import assert from "node:assert/strict";

import {
  customRaceDraftMatches,
  customRacePresetOptions,
  normalizeCustomRacePresetList,
  parseCustomRacePreset,
  planCustomRaceLab,
  readCustomRacePresetSelection,
} from "../src/domain/progression/prestige/custom-race.ts";

const facts = {
  availableTraits: ["smart", "tough"],
  availableGenera: ["humanoid", "avian", "small"],
  hybridLab: false,
};
const serialized = JSON.stringify({
  name: "Race name beyond twenty",
  desc: "A described race",
  entity: "clever bipeds",
  home: "Home",
  red: "Red",
  hell: "Hell",
  gas: "Gas",
  gas_moon: "Moon",
  dwarf: "Dwarf",
  makemake: "Outer name",
  genus: "avian",
  traits: ["smart", "tough"],
  ranks: { smart: 1.05 },
  fanaticism: "smart",
  rankVersion: 2,
});
const parsed = parseCustomRacePreset(serialized, facts);
assert.equal(parsed.ok, true);
if (!parsed.ok) throw new Error(parsed.reason);
assert.equal(parsed.design.text.name, "Race name beyond twe");
assert.equal(parsed.design.text.makemake, "Outer name");
assert.deepEqual(parsed.design.ranks, { smart: 1.05, tough: 1 });
assert.equal(parsed.design.fanaticism, "smart");
assert.equal(
  parseCustomRacePreset(
    JSON.stringify({ ...JSON.parse(serialized), name: " " }),
    facts,
  ).ok,
  true,
  "required text uses the game's nonempty length check",
);

const current = Object.freeze({
  text: parsed.design.text,
  genus: "avian",
  traits: Object.freeze(["smart", "tough"]),
  ranks: Object.freeze({ tough: 1, smart: 1.05 }),
  fanaticism: "smart",
});
assert.equal(customRaceDraftMatches(current, parsed.design), true);
assert.equal(
  customRaceDraftMatches(
    { ...current, traits: [...current.traits].reverse() },
    parsed.design,
  ),
  true,
  "trait checkbox order does not change the design",
);
assert.equal(
  customRaceDraftMatches(current, { ...parsed.design, genus: "humanoid" }),
  false,
);

assert.equal(
  parseCustomRacePreset(
    JSON.stringify({ ...JSON.parse(serialized), traits: ["smart", "smart"] }),
    facts,
  ).ok,
  false,
  "duplicate selected traits are rejected",
);
assert.equal(
  parseCustomRacePreset(
    JSON.stringify({ ...JSON.parse(serialized), traits: ["locked"] }),
    facts,
  ).ok,
  false,
  "traits absent from the mounted lab are rejected",
);
assert.equal(
  parseCustomRacePreset(
    JSON.stringify({ ...JSON.parse(serialized), genus: "locked" }),
    facts,
  ).ok,
  false,
  "unavailable genera are rejected",
);
assert.equal(
  parseCustomRacePreset(
    JSON.stringify({ ...JSON.parse(serialized), ranks: { smart: 1.03 } }),
    facts,
  ).ok,
  false,
  "rank values must use DeadSpace's current step size and range",
);
const legacyRanks = parseCustomRacePreset(
  JSON.stringify({
    ...JSON.parse(serialized),
    rankVersion: 1,
    ranks: { smart: 2, tough: 3 },
  }),
  facts,
);
assert.equal(legacyRanks.ok, true);
if (legacyRanks.ok) {
  assert.deepEqual(legacyRanks.design.ranks, { smart: 1.33, tough: 1.67 });
}
assert.equal(
  parseCustomRacePreset(
    JSON.stringify({ ...JSON.parse(serialized), ranks: { smart: 1.33 } }),
    facts,
  ).ok,
  true,
  "current exports preserve the imported legacy rank tiers",
);
assert.equal(
  parseCustomRacePreset("not json", facts).ok,
  false,
  "invalid JSON fails closed",
);

const hybridParsed = parseCustomRacePreset(
  JSON.stringify({ ...JSON.parse(serialized), genus: "avian" }),
  { ...facts, hybridLab: true },
);
assert.equal(hybridParsed.ok, true);
if (hybridParsed.ok) {
  assert.equal(hybridParsed.design.genus, "hybrid");
  assert.deepEqual(hybridParsed.design.hybrid, ["avian", "humanoid"]);
}
const hybridSlotParsed = parseCustomRacePreset(
  JSON.stringify({
    ...JSON.parse(serialized),
    genus: "hybrid",
    hybrid: ["avian", "small"],
  }),
  facts,
);
assert.equal(hybridSlotParsed.ok, true);
if (hybridSlotParsed.ok) assert.equal(hybridSlotParsed.design.genus, "avian");

const settings = {
  prestigeCustomRacePreset: "1",
  prestigeCustomRacePresets: [
    { name: "A", json: "{}" },
    { name: "B", json: "{}" },
  ],
};
assert.deepEqual(readCustomRacePresetSelection(settings), {
  index: 1,
  preset: { name: "B", json: "{}" },
});
assert.deepEqual(
  customRacePresetOptions(settings).map(({ val, label }) => [val, label]),
  [
    ["0", "A"],
    ["1", "B"],
  ],
);
assert.equal(
  normalizeCustomRacePresetList({ prestigeCustomRacePresets: "bad" })[0]?.name,
  "General",
);
assert.equal(
  readCustomRacePresetSelection({ prestigeCustomRacePreset: "bad" }).index,
  0,
);

const readyPreset = parsed;
const decisionBase = {
  savedCustomRaceExists: true,
  canSubmit: true,
  preset: readyPreset,
  draftMatchesPreset: true,
  recalculation: "idle",
  genes: 0,
};
assert.deepEqual(planCustomRaceLab({ ...decisionBase, mode: "reuse" }), {
  kind: "submit",
});
assert.deepEqual(
  planCustomRaceLab({
    ...decisionBase,
    mode: "reuse",
    savedCustomRaceExists: false,
  }),
  { kind: "pause" },
);
assert.deepEqual(planCustomRaceLab({ ...decisionBase, mode: "pause" }), {
  kind: "pause",
});
assert.deepEqual(
  planCustomRaceLab({
    ...decisionBase,
    mode: "import",
    draftMatchesPreset: false,
  }),
  { kind: "apply", design: parsed.design },
);
assert.deepEqual(
  planCustomRaceLab({
    ...decisionBase,
    mode: "import",
    recalculation: "pending",
  }),
  { kind: "wait" },
);
assert.deepEqual(
  planCustomRaceLab({ ...decisionBase, mode: "import", genes: -1 }),
  { kind: "pause" },
);
assert.deepEqual(
  planCustomRaceLab({ ...decisionBase, mode: "import", canSubmit: false }),
  { kind: "pause" },
);

console.log("Custom race policy checks passed");
