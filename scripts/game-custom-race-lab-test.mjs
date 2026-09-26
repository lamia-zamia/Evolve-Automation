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
assert.deepEqual(
  fixture.port.applyDesign(initial.session, request, identity),
  { status: "pending" },
  "preset application requests DeadSpace customImport() rather than editing the genome directly",
);
assert.deepEqual(fixture.nativeCalls, ["customImport"]);
assert.equal(fixture.fileInput.files[0].name, "evolve-custom-race.txt");
assert.equal(fixture.fileInput.files[0].type, "text/plain");

const repricing = fixture.port.read(identity);
assert.equal(repricing?.recalculation, "pending");
assert.deepEqual(fixture.nativeCalls, ["customImport", "geneEdit"]);
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

// DeadSpace truncates imported text fields while the native import remains successful.
const longNameFixture = createDeadSpaceCustomLabFixture({
  root: { custom: {} },
});
const longNameRequest = requestFrom(makePreset({ name: "A".repeat(25) }));
const longNameIdentity = "ascension:import:long-name";
const longNameSnapshot = longNameFixture.port.read(longNameIdentity);
assert.ok(longNameSnapshot);
assert.deepEqual(
  longNameFixture.port.applyDesign(
    longNameSnapshot.session,
    longNameRequest,
    longNameIdentity,
  ),
  { status: "pending" },
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
assert.equal(JSON.parse(oldRequest.importJson).traitlist[0], "smart");
assert.deepEqual(
  fixture.port.applyDesign(
    replacementSession,
    oldRequest,
    "ascension:import:0:old",
  ),
  { status: "pending" },
);
assert.equal(
  fixture.port.read("ascension:import:0:old")?.recalculation,
  "pending",
);
assert.equal(fixture.finishNativeReprice(), true);
const oldSettled = fixture.port.read("ascension:import:0:old");
assert.equal(oldSettled?.recalculation, "settled");
assert.deepEqual(oldSettled?.draft.slots, { smart: 0 });
assert.equal(oldSettled?.draft.span, 12);
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
  assert.equal(
    filtered.port.applyDesign(
      filteredInitial.session,
      filteredRequest,
      "legacy-filtered",
    ).status,
    "pending",
  );
  filtered.port.read("legacy-filtered");
  assert.equal(filtered.finishNativeReprice(), true);
  assert.equal(filtered.port.read("legacy-filtered")?.recalculation, "failed");
  assert.equal(
    filtered.port.submit(filteredInitial.session, "legacy-filtered").status,
    "unavailable",
  );
  assert.deepEqual(filtered.nativeCalls, ["customImport", "geneEdit"]);
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
  assert.equal(
    sample.port.applyDesign(
      before.session,
      requestFrom(currentJson),
      "same-request",
    ).status,
    "pending",
  );
  assert.equal(sample.port.read("same-request")?.recalculation, "pending");
  for (let index = 0; index < 8; index += 1) sample.port.read("same-request");
  assert.equal(sample.port.read("same-request")?.recalculation, "failed");
  assert.deepEqual(sample.nativeCalls, ["customImport", "geneEdit"]);
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
  sample.port.applyDesign(before.session, requestFrom(currentJson), "no-op");
  for (let index = 0; index < 8; index += 1) sample.port.read("no-op");
  assert.equal(sample.port.read("no-op")?.recalculation, "failed");
  assert.deepEqual(sample.nativeCalls, ["customImport"]);
}

// Full current-format imports must agree with the live normalized slots/ranks before they settle.
{
  const sample = createDeadSpaceCustomLabFixture({
    root: { stats: { ascend: 0 }, custom: {} },
    behavior: { normalizeImportedSlots: true },
  });
  const before = sample.port.read("normalized");
  assert.ok(before);
  sample.port.applyDesign(
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
  sample.port.applyDesign(
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
