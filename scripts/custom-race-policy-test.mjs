import assert from "node:assert/strict";

import {
  customRaceDraftMatches,
  customRacePresetHasStrandState,
  customRacePresetStrandStateMatches,
  customRacePresetTraitsMatch,
  customRacePresetOptions,
  normalizeCustomRacePresetList,
  parseCustomRacePreset,
  planCustomRaceLab,
  readCustomRacePresetSelection,
} from "../src/domain/progression/prestige/custom-race.ts";

const serialized = JSON.stringify({
  name: "Avians",
  desc: "A described race",
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
  genus: "avian",
  traitlist: ["smart", "tough"],
  ranks: { smart: 1.05, tough: 1 },
  rankVersion: 2,
  slots: { smart: 1, tough: 7 },
  recessive: 2,
  slotSpan: 24,
  span: 24,
  v: 2,
  fanaticism: false,
});
const parsed = parseCustomRacePreset(serialized);
assert.equal(parsed.ok, true);
if (!parsed.ok) throw new Error(parsed.reason);
assert.equal(customRacePresetHasStrandState(parsed.request), true);
assert.equal(JSON.parse(parsed.request.importJson).traitlist[0], "smart");
assert.equal(JSON.parse(parsed.request.importJson).slotSpan, 24);

const current = Object.freeze({
  text: Object.freeze({
    name: "Avians",
    desc: "A described race",
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
  }),
  genus: "avian",
  traits: Object.freeze(["smart", "tough"]),
  ranks: Object.freeze({ tough: 1, smart: 1.05 }),
  fanaticism: false,
  slots: Object.freeze({ smart: 1, tough: 7 }),
  recessive: 2,
  span: 24,
});
assert.equal(customRaceDraftMatches(current, parsed.request), true);
assert.equal(customRacePresetStrandStateMatches(current, parsed.request), true);
assert.equal(
  customRaceDraftMatches(
    { ...current, slots: { smart: 2, tough: 7 } },
    parsed.request,
  ),
  false,
  "a minor-slot placement is part of the preset identity",
);
assert.equal(
  customRaceDraftMatches({ ...current, recessive: 0 }, parsed.request),
  false,
  "recessive pairs affect design identity",
);
assert.equal(
  customRaceDraftMatches({ ...current, span: 12 }, parsed.request),
  false,
  "strand span affects design identity",
);
assert.equal(
  customRaceDraftMatches(
    { ...current, traits: [...current.traits].reverse() },
    parsed.request,
  ),
  true,
  "trait checkbox order does not change the set of traits",
);

// Older presets without strand fields are handed to the current game's importer for normalization.
const oldPreset = parseCustomRacePreset(
  JSON.stringify({
    name: "Old race",
    genus: "avian",
    traits: ["locked-or-current-game-owned"],
    ranks: { smart: 1.03 },
    v: 2,
  }),
);
assert.equal(oldPreset.ok, true);
if (!oldPreset.ok) throw new Error(oldPreset.reason);
assert.equal(customRacePresetHasStrandState(oldPreset.request), false);
assert.equal(
  customRacePresetTraitsMatch(
    { ...current, traits: ["locked-or-current-game-owned"] },
    oldPreset.request,
  ),
  true,
);
assert.equal(
  customRacePresetTraitsMatch({ ...current, traits: [] }, oldPreset.request),
  false,
  "a native-normalized legacy import cannot silently lose a requested trait",
);
assert.deepEqual(JSON.parse(oldPreset.request.importJson).traitlist, [
  "locked-or-current-game-owned",
]);
assert.equal(JSON.parse(oldPreset.request.importJson).rankVersion, 2);
assert.equal(
  parseCustomRacePreset(JSON.stringify({ traits: "not a list" })).ok,
  false,
  "malformed transport shape is rejected before native import",
);
assert.equal(
  parseCustomRacePreset(JSON.stringify({ genus: "avian" })).ok,
  false,
  "a preset must state its trait list instead of implicitly retaining live traits",
);
assert.equal(
  parseCustomRacePreset(JSON.stringify({ traits: [] })).ok,
  false,
  "a preset must state its genus before native import",
);
assert.equal(
  parseCustomRacePreset(JSON.stringify({ genus: "hybrid", traits: ["smart"] }))
    .ok,
  false,
  "a hybrid preset must include both lineage values",
);
assert.equal(
  parseCustomRacePreset(JSON.stringify({ ranks: { smart: "high" } })).ok,
  false,
);
assert.equal(
  parseCustomRacePreset(JSON.stringify({ hybrid: ["avian"] })).ok,
  false,
);
assert.equal(parseCustomRacePreset("not json").ok, false);
assert.equal(parseCustomRacePreset(JSON.stringify([])).ok, false);

const truncatedText = parseCustomRacePreset(
  JSON.stringify({
    name: "A".repeat(25),
    genus: "avian",
    traits: ["smart"],
    ranks: { smart: 1 },
    slots: { smart: 1 },
    recessive: 0,
    span: 12,
    v: 2,
  }),
);
assert.equal(truncatedText.ok, true);
if (!truncatedText.ok) throw new Error(truncatedText.reason);
assert.equal(
  customRaceDraftMatches(
    {
      ...current,
      text: { ...current.text, name: "A".repeat(20) },
      traits: ["smart"],
      ranks: { smart: 1 },
      slots: { smart: 1 },
      recessive: 0,
      span: 12,
    },
    truncatedText.request,
  ),
  true,
  "postconditions compare the value after DeadSpace's native text truncation",
);
assert.equal(
  customRacePresetStrandStateMatches(
    {
      ...current,
      text: { ...current.text, name: "A".repeat(20) },
      traits: ["smart"],
      ranks: { smart: 1 },
      slots: { smart: 1 },
      recessive: 0,
      span: 12,
    },
    truncatedText.request,
  ),
  true,
);

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

const decisionBase = {
  savedCustomRaceReady: true,
  canSubmit: true,
  preset: parsed,
  draftMatchesPreset: true,
  recalculation: "idle",
};
assert.deepEqual(planCustomRaceLab({ ...decisionBase, mode: "reuse" }), {
  kind: "submit",
});
assert.deepEqual(
  planCustomRaceLab({
    ...decisionBase,
    mode: "reuse",
    savedCustomRaceReady: false,
    draftMatchesPreset: false,
  }),
  { kind: "apply", request: parsed.request },
);
assert.deepEqual(
  planCustomRaceLab({
    ...decisionBase,
    mode: "reuse",
    savedCustomRaceReady: false,
    preset: { ok: false, reason: "no saved custom race" },
  }),
  { kind: "pause" },
);
assert.deepEqual(
  planCustomRaceLab({
    ...decisionBase,
    mode: "reuse",
    recalculation: "failed",
  }),
  { kind: "pause" },
);
assert.deepEqual(
  planCustomRaceLab({
    ...decisionBase,
    mode: "reuse",
    recalculation: "stale",
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
  { kind: "apply", request: parsed.request },
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
  planCustomRaceLab({
    ...decisionBase,
    mode: "import",
    recalculation: "failed",
  }),
  { kind: "pause" },
);
assert.deepEqual(
  planCustomRaceLab({
    ...decisionBase,
    mode: "import",
    recalculation: "stale",
  }),
  { kind: "pause" },
);
assert.deepEqual(
  planCustomRaceLab({ ...decisionBase, mode: "import", canSubmit: false }),
  { kind: "pause" },
);

console.log("Custom Race preset policy checks passed");
