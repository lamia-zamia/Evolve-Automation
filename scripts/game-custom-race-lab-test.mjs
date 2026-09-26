import assert from "node:assert/strict";

import { parseCustomRacePreset } from "../src/domain/progression/prestige/custom-race.ts";
import { createDeadSpaceCustomLabFixture } from "./deadspace-lab-fixture.mjs";

function makePreset(overrides = {}) {
  return JSON.stringify({
    name: "Avians",
    desc: "A strand-based race",
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
    ranks: { smart: 1.25, tough: 1 },
    rankVersion: 2,
    slots: { smart: 1, tough: 7 },
    recessive: 2,
    slotSpan: 24,
    span: 24,
    v: 2,
    fanaticism: false,
    ...overrides,
  });
}

function requestFrom(json) {
  const result = parseCustomRacePreset(json);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error(result.reason);
  return result.request;
}

function startPresetApplication(fixture, session, request, identity) {
  const firstCall = fixture.nativeCalls.length;
  assert.equal(
    fixture.port.applyDesign(session, request, identity).status,
    "pending",
  );
  const calls = () => fixture.nativeCalls.slice(firstCall);
  assert.deepEqual(calls(), ["reset"]);
  assert.equal(fixture.fileInput.files, null);
  assert.equal(fixture.port.read(identity)?.recalculation, "pending");
  assert.deepEqual(
    calls(),
    ["reset"],
    "the importer waits until reset's deferred reprice redraws the strand",
  );
  assert.equal(fixture.finishNativeReprice(), true);
  assert.equal(fixture.genome.recessive, 0);
  assert.equal(fixture.port.read(identity)?.recalculation, "pending");
  assert.deepEqual(calls(), ["reset", "customImport"]);
}

const root = {
  stats: { ascend: 0 },
  custom: {},
};
const fixture = createDeadSpaceCustomLabFixture({ root });
const identity = "ascension:import:0:avian-v2";
const initial = fixture.port.read(identity);
assert.ok(
  initial,
  "the current #celestialLab data.g / #traitSlots surface is readable",
);
assert.equal(initial.savedCustomRaceExists, true);
assert.equal(initial.savedCustomRaceReady, true);
assert.equal(
  fixture.port.readCurrentSavedRaceJson(),
  fixture.port.readSavedRaceJson("race0"),
  "reuse reads the saved slot selected by the mounted genome",
);
assert.deepEqual(initial.draft.slots, { smart: 2, tough: 7 });
assert.equal(initial.draft.recessive, 2);
assert.equal(initial.draft.span, 24);
assert.equal(
  initial.draft.version,
  undefined,
  "v is saved-format metadata, not a live genome field",
);
assert.deepEqual(fixture.nativeCalls, []);

const manuallyEdited = createDeadSpaceCustomLabFixture({
  root: { stats: { ascend: 0 }, custom: {} },
  open: true,
});
manuallyEdited.genome.slots.smart = 3;
const editedSnapshot = manuallyEdited.port.read("ascension:reuse:legacy-check");
assert.equal(editedSnapshot?.savedCustomRaceReady, false);
assert.equal(
  editedSnapshot?.savedCustomRaceJson,
  manuallyEdited.port.readSavedRaceJson("race0"),
  "the live draft is checked against the saved race record, not its first observation",
);

// The imported layout includes a minor-slot trait, a recessive pair, and a non-default span.
const currentJson = makePreset();
const request = requestFrom(currentJson);
assert.deepEqual(JSON.parse(request.importJson).traitlist, ["smart", "tough"]);
assert.equal(JSON.parse(request.importJson).rankVersion, 2);
startPresetApplication(fixture, initial.session, request, identity);
assert.deepEqual(fixture.nativeCalls, ["reset", "customImport"]);
assert.equal(fixture.fileInput.files[0].name, "evolve-custom-race.txt");
assert.equal(fixture.fileInput.files[0].type, "text/plain");

const repricing = fixture.port.read(identity);
assert.equal(repricing?.recalculation, "pending");
assert.deepEqual(fixture.nativeCalls, ["reset", "customImport", "geneEdit"]);
assert.equal(fixture.port.read(identity)?.recalculation, "pending");
assert.equal(
  fixture.finishNativeReprice(),
  true,
  "the fake DeadSpace nextTick rebuilds tRanks and redraws the strand",
);
const settled = fixture.port.read(identity);
assert.equal(settled?.recalculation, "settled");
assert.equal(settled?.appliedPresetIdentity, identity);
assert.equal(settled?.draft.genus, "avian");
assert.deepEqual(settled?.draft.traits, ["smart", "tough"]);
assert.deepEqual(settled?.draft.ranks, { smart: 1.25, tough: 1 });
assert.deepEqual(settled?.draft.slots, { smart: 1, tough: 7 });
assert.equal(settled?.draft.recessive, 2);
assert.equal(settled?.draft.span, 24);

// DeadSpace's truthy import assignment cannot clear a zero recessive count over an existing draft.
// Keep this regression against the real importer behavior; the adapter must clear it through a
// native operation before it applies the preset.
{
  const sample = createDeadSpaceCustomLabFixture({
    root: { stats: { ascend: 0 }, custom: {} },
  });
  const before = sample.port.read("zero-recessive");
  assert.ok(before);
  assert.equal(before.draft.recessive, 2);
  startPresetApplication(
    sample,
    before.session,
    requestFrom(makePreset({ recessive: 0 })),
    "zero-recessive",
  );
  assert.equal(sample.genome.recessive, 0);
  sample.port.read("zero-recessive");
  assert.equal(sample.finishNativeReprice(), true);
  assert.equal(
    sample.port.read("zero-recessive")?.recalculation,
    "settled",
    "a current-format recessive: 0 preset clears the existing pair",
  );
}

// DeadSpace truncates imported text fields while the native import remains successful.
const longNameFixture = createDeadSpaceCustomLabFixture({
  root: { custom: {} },
});
const longNameRequest = requestFrom(makePreset({ name: "A".repeat(25) }));
const longNameIdentity = "ascension:import:long-name";
const longNameSnapshot = longNameFixture.port.read(longNameIdentity);
assert.ok(longNameSnapshot);
startPresetApplication(
  longNameFixture,
  longNameSnapshot.session,
  longNameRequest,
  longNameIdentity,
);
longNameFixture.port.read(longNameIdentity);
assert.equal(longNameFixture.finishNativeReprice(), true);
assert.equal(
  longNameFixture.port.read(longNameIdentity)?.recalculation,
  "settled",
);
assert.equal(longNameFixture.genome.name, "A".repeat(20));

// A v1/old-format file is fed to the game importer with its native traitlist alias. The current
// game's own normalization supplies slots and the base span before the adapter settles it.
const oldJson = JSON.stringify({
  name: "Old Avians",
  desc: "An older saved race",
  entity: "winged bipeds",
  home: "Aerie",
  red: "Ember",
  hell: "Cinder",
  gas: "Cloud",
  gas_moon: "Nest",
  dwarf: "Perch",
  genus: "avian",
  traits: ["smart"],
  ranks: { smart: 2 },
  rankVersion: 1,
});
const oldRequest = requestFrom(oldJson);
const replacementSession = fixture.port.read("ascension:import:0:old")?.session;
assert.ok(replacementSession);
assert.equal(fixture.genome.recessive, 2);
assert.equal(JSON.parse(oldRequest.importJson).traitlist[0], "smart");
startPresetApplication(
  fixture,
  replacementSession,
  oldRequest,
  "ascension:import:0:old",
);
assert.equal(
  fixture.port.read("ascension:import:0:old")?.recalculation,
  "pending",
);
assert.equal(fixture.genome.recessive, 0);
assert.equal(fixture.finishNativeReprice(), true);
const oldSettled = fixture.port.read("ascension:import:0:old");
assert.equal(oldSettled?.recalculation, "settled");
assert.deepEqual(oldSettled?.draft.slots, { smart: 0 });
assert.equal(oldSettled?.draft.span, 12);
assert.equal(
  oldSettled?.draft.recessive,
  0,
  "a legacy preset without recessive does not inherit the loaded race's pair",
);
assert.equal(
  oldSettled?.draft.ranks.smart,
  1.33,
  "the current game's importer converts legacy ranks",
);

// The native importer filters traits the live game cannot retain. Do not claim a legacy preset
// was applied or submit after that silent reduction changes the requested trait set.
{
  const filtered = createDeadSpaceCustomLabFixture({
    root: { stats: { ascend: 0 }, custom: {} },
  });
  const filteredInitial = filtered.port.read("legacy-filtered");
  assert.ok(filteredInitial);
  const filteredRequest = requestFrom(
    JSON.stringify({
      name: "Old Avians",
      desc: "An older saved race",
      genus: "avian",
      traits: ["smart", "locked"],
      ranks: { smart: 2, locked: 1 },
    }),
  );
  startPresetApplication(
    filtered,
    filteredInitial.session,
    filteredRequest,
    "legacy-filtered",
  );
  filtered.port.read("legacy-filtered");
  assert.equal(filtered.finishNativeReprice(), true);
  assert.equal(filtered.port.read("legacy-filtered")?.recalculation, "failed");
  assert.equal(
    filtered.port.submit(filteredInitial.session, "legacy-filtered").status,
    "unavailable",
  );
  assert.deepEqual(filtered.nativeCalls, ["reset", "customImport", "geneEdit"]);
}

// The game's strand redraw is part of the completion signal. Calling geneEdit successfully but
// failing to rebuild ranks/slots never becomes settled.
{
  const behavior = { noOpReprice: true };
  const sample = createDeadSpaceCustomLabFixture({
    root: { stats: { ascend: 0 }, custom: {} },
    behavior,
  });
  const before = sample.port.read("same-request");
  assert.ok(before);
  startPresetApplication(
    sample,
    before.session,
    requestFrom(currentJson),
    "same-request",
  );
  assert.equal(sample.port.read("same-request")?.recalculation, "pending");
  for (let index = 0; index < 8; index += 1) sample.port.read("same-request");
  assert.equal(sample.port.read("same-request")?.recalculation, "failed");
  assert.deepEqual(sample.nativeCalls, ["reset", "customImport", "geneEdit"]);
}

// A native customImport no-op does not replace genome.ranks, so it times out as failed.
{
  const behavior = { ignoreImport: true };
  const sample = createDeadSpaceCustomLabFixture({
    root: { stats: { ascend: 0 }, custom: {} },
    behavior,
  });
  const before = sample.port.read("no-op");
  assert.ok(before);
  startPresetApplication(
    sample,
    before.session,
    requestFrom(currentJson),
    "no-op",
  );
  for (let index = 0; index < 8; index += 1) sample.port.read("no-op");
  assert.equal(sample.port.read("no-op")?.recalculation, "failed");
  assert.deepEqual(sample.nativeCalls, ["reset", "customImport"]);
}

// Full current-format imports must agree with the live normalized slots/ranks before they settle.
{
  const sample = createDeadSpaceCustomLabFixture({
    root: { stats: { ascend: 0 }, custom: {} },
    behavior: { normalizeImportedSlots: true },
  });
  const before = sample.port.read("normalized");
  assert.ok(before);
  startPresetApplication(
    sample,
    before.session,
    requestFrom(currentJson),
    "normalized",
  );
  sample.port.read("normalized");
  // The upstream fixture normalizer intentionally moves the requested minor-slot trait.
  sample.genome.slots.smart = 2;
  sample.finishNativeReprice();
  for (let index = 0; index < 8; index += 1) sample.port.read("normalized");
  assert.equal(sample.port.read("normalized")?.recalculation, "failed");
}

// If Vue redraws after the native import begins but before its reprice settles, the old session
// cannot submit. A fresh session can retry the same preset identity.
{
  const sample = createDeadSpaceCustomLabFixture({
    root: { stats: { ascend: 0 }, custom: {} },
  });
  const before = sample.port.read("same-preset");
  assert.ok(before);
  startPresetApplication(
    sample,
    before.session,
    requestFrom(currentJson),
    "same-preset",
  );
  sample.port.read("same-preset");
  assert.ok(sample.nativeCalls.includes("geneEdit"));
  sample.redrawMain();
  const fresh = sample.port.read("same-preset");
  assert.ok(fresh);
  assert.notEqual(fresh.session.identity, before.session.identity);
  assert.equal(
    sample.port.submit(before.session, "same-preset").status,
    "stale",
  );
  assert.equal(
    sample.port.applyDesign(
      before.session,
      requestFrom(currentJson),
      "same-preset",
    ).status,
    "stale",
  );
  assert.equal(
    sample.port.applyDesign(
      fresh.session,
      requestFrom(currentJson),
      "same-preset",
    ).status,
    "pending",
    "a transient stale session does not permanently latch this preset",
  );
}

// A replaced Vue generation or root cannot be mutated through an old opaque session.
{
  const sample = createDeadSpaceCustomLabFixture({
    root: { stats: { ascend: 0 }, custom: {} },
  });
  const before = sample.port.read("generation");
  assert.ok(before);
  sample.redrawMain();
  assert.equal(
    sample.port.applyDesign(
      before.session,
      requestFrom(currentJson),
      "generation",
    ).status,
    "stale",
  );
  const fresh = sample.port.read("root");
  assert.ok(fresh);
  sample.setRoot({ stats: { ascend: 0 }, custom: {} });
  assert.equal(
    sample.port.applyDesign(fresh.session, requestFrom(currentJson), "root")
      .status,
    "stale",
  );
}

// A native setRace false return is a rejection. An undefined return is only a submission request.
{
  const behavior = { rejectSubmission: false };
  const sample = createDeadSpaceCustomLabFixture({
    root: { stats: { ascend: 0 }, custom: {} },
    behavior,
  });
  const snapshot = sample.port.read("submit");
  assert.ok(snapshot);
  assert.deepEqual(sample.port.submit(snapshot.session, "submit"), {
    status: "requested",
  });
  behavior.rejectSubmission = true;
  assert.equal(
    sample.port.submit(snapshot.session, "submit").status,
    "rejected",
  );
}

// Current saved custom data round-trips strand state through the editor's export representation.
{
  const sample = createDeadSpaceCustomLabFixture({
    root: { stats: { ascend: 0 }, custom: {} },
    hybrid: true,
  });
  const saved = JSON.parse(sample.port.readSavedRaceJson("race1"));
  assert.equal(saved.v, 2);
  assert.equal(saved.rankVersion, 2);
  assert.equal(saved.slotSpan, 24);
  assert.deepEqual(saved.slots, { smart: 2, tough: 7 });
  assert.equal(saved.recessive, 2);
  assert.deepEqual(saved.traitlist, ["smart", "tough"]);
  assert.equal(Object.hasOwn(saved, "traits"), false);
  const hybrid = sample.port.read("apotheosis:reuse:0:");
  assert.equal(hybrid?.hybridLab, true);
  assert.deepEqual(hybrid?.draft.hybrid, ["avian", "small"]);
}

console.log("DeadSpace strand Custom Race lab contract checks passed");
