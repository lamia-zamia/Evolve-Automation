/**
 * The running game's own Truepath Syndicate result, read through the game bound `#<region>synd`.
 *
 * The point of every case below is that the two numbers come out of the game's *own* arithmetic and
 * not out of anything this automation can compute: `p` out of the four-digit string `syndicate()`
 * rounds before subtracting from one, and `s` out of the pre-formatting receiver `space.js`'s scan
 * display rounds. The figures are chosen so that a substitution is visible — using the ratio's raw
 * receiver instead of its rounded string, or parsing the returned percentage instead of reading the
 * receiver, both produce a different number for these inputs.
 */
import assert from "node:assert/strict";
import { installVueCapture } from "../../../src/adapters/evolve/vue-capture.ts";

import { createCapturedSyndicateMechanics } from "../../../src/adapters/evolve/captured-syndicate-mechanics.ts";
import {
  rejected,
  stale,
  SUCCEEDED,
} from "../../../src/adapters/command-outcomes.ts";
import { probeScopedNumberToFixed } from "../../../src/adapters/evolve/scoped-number-to-fixed.ts";
import {
  MAIN_TAB_CONTROL,
  MAIN_TAB_INDEX,
  MAIN_TAB_PANELS,
  MAIN_TAB_SETTING,
  SPACE_TABS_SETTING,
  SPACE_TAB_INDEX,
  SUB_TAB_CONTROLS,
} from "../../../src/adapters/evolve/captured-tab-discovery.ts";

/**
 * The page, for the only thing a probe of it needs: its own `Number` and `Object`, so the patch is
 * made and undone on the very prototype the observed code would have called.
 */
const page = { Number, Object };

/** The descriptor the page's prototype has to be left holding, compared field for field. */
function toFixedDescriptor() {
  return Object.getOwnPropertyDescriptor(Number.prototype, "toFixed");
}

function assertPrototypeRestored(before, label) {
  const after = toFixedDescriptor();
  assert.equal(
    after.configurable,
    before.configurable,
    `${label}: configurable`,
  );
  assert.equal(after.enumerable, before.enumerable, `${label}: enumerable`);
  assert.equal(after.writable, before.writable, `${label}: writable`);
  assert.equal(after.value, before.value, `${label}: toFixed was replaced`);
  assert.equal(after.get, before.get, `${label}: accessor added`);
  assert.equal(after.set, before.set, `${label}: setter added`);
}

/**
 * A stand-in for the captured `scan(r)` closure, transcribed over the two roundings the real one
 * performs. The values are the fixture's, not arithmetic: what is under test is that the probe reads
 * what the game rounded, not what the fixture meant.
 */
function scanOver({
  ratio,
  sensor,
  repeats = {},
  throws = false,
  display = true,
}) {
  return (region) => {
    if (throws) throw new Error("the game's own readout threw");
    if (!display) return `${region} is quiet`;
    // `syndicate()` builds its ratio as `1 - +(piracy / divisor).toFixed(4)`, once per call.
    for (
      let index = 0;
      index < (repeats.ratio ?? (ratio === undefined ? 0 : 1));
      index += 1
    ) {
      ratio.toFixed(4);
    }
    // `scan()` renders the sensor as `+((s + 25) / 1.25).toFixed(1) + '%'`, once per call.
    for (
      let index = 0;
      index < (repeats.sensor ?? (sensor === undefined ? 0 : 1));
      index += 1
    ) {
      ((sensor + 25) / 1.25).toFixed(1);
    }
    return `${region} rendered`;
  };
}

/** A registry holding one `#<region>synd` binding, and a record of what it was asked. */
function registryFor(scan, controlId = "spc_redsynd") {
  const handle = { elementId: controlId, generation: 1, methods: ["scan"] };
  return {
    handle,
    invoked: [],
    resolve: (elementId) => (elementId === controlId ? handle : undefined),
    invoke: (resolved, method, args = []) => {
      if (resolved !== handle || method !== "scan") {
        return { ok: false, reason: "unknown-method" };
      }
      return { ok: true, value: scan(...args) };
    },
    capturedElementIds: () => [controlId],
  };
}

function discoveryStub() {
  return {
    passes: [],
    discover(path, options) {
      this.passes.push({ path, options });
      return { outcome: { status: "succeeded" }, discovered: [] };
    },
  };
}

function mechanicsOver(pageWindow) {
  return {
    readRoundedValues(read) {
      const seen = probeScopedNumberToFixed(pageWindow, () => {
        read();
      });
      return seen === undefined
        ? { kind: "invalid" }
        : { kind: "value", value: seen };
    },
  };
}

function syndicateFor({ registry, discovery, regions, document } = {}) {
  return createCapturedSyndicateMechanics({
    regions: regions ?? {
      read: () => ({
        kind: "value",
        value: { zone: "inner", reachable: true, syndicateEnabled: true },
      }),
    },
    document: document ?? { getElementById: () => null },
    controls: registry ?? registryFor(scanOver({ ratio: 0.2681, sensor: 47 })),
    discovery: discovery ?? discoveryStub(),
    mechanics: mechanicsOver(page),
  });
}

// ---------------------------------------------------------------------------
// The two numbers, out of the game's own rounding.
// ---------------------------------------------------------------------------

// `p` is one minus the *rounded* ratio. The receiver carries digits beyond the game's four, so an
// answer built from it would be 0.7318999987655 and the game's own 0.7319 would be missed.
{
  const descriptor = toFixedDescriptor();
  const registry = registryFor(
    scanOver({ ratio: 0.2681000012345, sensor: 47 }),
  );
  const discovery = discoveryStub();
  const read = syndicateFor({
    registry,
    discovery,
  }).read("spc_red");
  assert.deepEqual(read, { kind: "value", value: { p: 0.7319, s: 47 } });
  assert.equal(read.value.p, 1 - Number((0.2681000012345).toFixed(4)));
  assert.notEqual(read.value.p, 1 - 0.2681000012345);
  assert.equal(registry.invoked.length, 0);
  // A control the game bound on its own is read directly, at no draw: the player is looking at that
  // panel, or a drawing is this capture already holds.
  assert.deepEqual(discovery.passes, []);
  assertPrototypeRestored(descriptor, "exact p");
}

// `s` is read from the pre-formatting receiver, not parsed out of the displayed percentage: the game
// renders `129.6%` for a sensor of 137, and the answer has to be 137.
{
  const descriptor = toFixedDescriptor();
  const registry = registryFor(scanOver({ ratio: 0.2681, sensor: 137 }));
  const read = syndicateFor({ registry }).read("spc_red");
  assert.deepEqual(read, { kind: "value", value: { p: 0.7319, s: 137 } });
  assert.equal(read.value.s, 137);
  assert.notEqual(read.value.s, Number("129.6"));
  assertPrototypeRestored(descriptor, "exact s");
}

// The game's inactive branch: `syndicate()` rounds no ratio, and the sensor it hands the display is
// zero. That is a real answer, not a missing one.
{
  const registry = registryFor(() => {
    ((0 + 25) / 1.25).toFixed(1);
    return "20%";
  });
  const read = syndicateFor({ registry }).read("spc_red");
  assert.deepEqual(read, { kind: "value", value: { p: 1, s: 0 } });
}

// ---------------------------------------------------------------------------
// Every shape that has to be refused rather than guessed at.
// ---------------------------------------------------------------------------

const refusalCases = [
  {
    label: "a second four-digit rounding",
    scan: scanOver({ ratio: 0.2681, sensor: 47, repeats: { ratio: 2 } }),
  },
  {
    label: "a second one-digit rounding",
    scan: scanOver({ ratio: 0.2681, sensor: 47, repeats: { sensor: 2 } }),
  },
  {
    label: "no ratio rounding with a sensor above zero",
    scan: scanOver({ sensor: 47 }),
  },
  {
    label: "no rounding at all",
    scan: scanOver({ display: false }),
  },
  {
    label: "a readout that throws",
    scan: scanOver({ ratio: 0.2681, sensor: 47, throws: true }),
  },
  {
    label: "a malformed return",
    scan: () => "42",
  },
  {
    label: "a ratio that is not one",
    scan: () => {
      (-4).toFixed(4);
      ((47 + 25) / 1.25).toFixed(1);
      return "-400%";
    },
  },
  {
    label: "a sensor reading that cannot be one",
    scan: () => {
      (0.2681).toFixed(4);
      Number.NaN.toFixed(1);
      return "NaN%";
    },
  },
];

for (const refusal of refusalCases) {
  const descriptor = toFixedDescriptor();
  const registry = registryFor(refusal.scan);
  const read = syndicateFor({ registry }).read("spc_red");
  assert.deepEqual(read, { kind: "invalid" }, refusal.label);
  assertPrototypeRestored(descriptor, refusal.label);
}

// Two perfect roundings are not an answer the registry did not vouch for. A superseded binding still
// runs a live closure of an older draw, and that closure can round both values and then fail, so the
// observations on their own would be attributed to a call the registry itself reports as unsuccessful.
{
  const descriptor = toFixedDescriptor();
  const scan = scanOver({ ratio: 0.2681, sensor: 47 });
  const handle = {
    elementId: "spc_redsynd",
    generation: 1,
    methods: ["scan"],
  };
  const registry = {
    handle,
    resolve: (elementId) => (elementId === "spc_redsynd" ? handle : undefined),
    invoke: () => {
      scan("spc_red");
      return { ok: false, reason: "stale-control" };
    },
    capturedElementIds: () => ["spc_redsynd"],
  };
  assert.deepEqual(
    syndicateFor({ registry }).read("spc_red"),
    { kind: "invalid" },
    "a failed invocation was attributed to the game's answer",
  );
  assertPrototypeRestored(descriptor, "a failed invocation");
}

// Unavailable native Space authority refuses even an otherwise valid retained scan.
for (const kind of ["absent", "invalid"]) {
  const registry = registryFor(() => {
    throw new Error("unavailable authority was scanned");
  });
  const discovery = discoveryStub();
  assert.deepEqual(
    syndicateFor({
      registry,
      discovery,
      regions: { read: () => ({ kind }) },
    }).read("spc_red"),
    { kind },
  );
  assert.equal(discovery.passes.length, 0);
}

// ---------------------------------------------------------------------------
// Reaching the binding without touching the player's screen.
// ---------------------------------------------------------------------------

/** Repository-owned render behavior, with scratch DOM alive only inside the protected draw. */
function syndicateRenderFixture() {
  const vue = { createApp: () => ({}) };
  const capture = installVueCapture({ Vue: vue });
  const nodes = new Map();
  const state = { zone: "inner", reachable: true, syndicateEnabled: true };
  const fixture = {
    state,
    capture,
    nodes,
    row: true,
    child: true,
    bind: true,
    scanValid: true,
    outcome: SUCCEEDED,
    passes: [],
    scans: 0,
    liveSample: { ratio: 0.2681000012345, sensor: 47 },
    document: { getElementById: (id) => nodes.get(id) ?? null },
    draw() {
      nodes.clear();
      if (fixture.row) nodes.set("spc_red", {});
      if (fixture.child) nodes.set("spc_redsynd", {});
      if (fixture.child && fixture.bind)
        vue.createApp({
          el: "#spc_redsynd",
          methods: fixture.scanValid
            ? {
                scan(region) {
                  fixture.scans += 1;
                  return scanOver(fixture.liveSample)(region);
                },
              }
            : { scan: 42 },
        });
    },
  };
  const discovery = {
    discover(path, options) {
      fixture.passes.push({ path, options });
      const checkpoint = capture.controls.checkpoint();
      let succeeded = false;
      try {
        fixture.draw();
        options.whileDrawn();
        succeeded = fixture.outcome.status === "succeeded";
        return { outcome: fixture.outcome, discovered: [] };
      } finally {
        nodes.clear();
        if (!succeeded) capture.controls.rejectChanges(checkpoint);
      }
    },
  };
  fixture.adapter = syndicateFor({
    registry: capture.controls,
    discovery,
    document: fixture.document,
    regions: {
      read: () =>
        state.zone === "inner" || state.zone === "outer"
          ? { kind: "value", value: { ...state } }
          : { kind: "invalid" },
    },
  });
  return fixture;
}

// A single fixture region follows its own native metadata to either panel, without an ID catalogue.
for (const [zone, index] of [
  ["inner", SPACE_TAB_INDEX.space],
  ["outer", SPACE_TAB_INDEX.outerSol],
]) {
  const fixture = syndicateRenderFixture();
  fixture.state.zone = zone;
  assert.deepEqual(fixture.adapter.read("spc_red"), {
    kind: "value",
    value: { p: 0.7319, s: 47 },
  });
  assert.deepEqual(fixture.passes[0].path[1], {
    setting: SPACE_TABS_SETTING,
    control: SUB_TAB_CONTROLS[SPACE_TABS_SETTING],
    index,
  });
  assert.deepEqual(fixture.passes[0].path[0], {
    setting: MAIN_TAB_SETTING,
    control: MAIN_TAB_CONTROL,
    index: MAIN_TAB_INDEX.civilization,
  });
  assert.equal(fixture.passes[0].options.forceDraw, true);
  assert.deepEqual(fixture.passes[0].options.mount, [
    `#${MAIN_TAB_PANELS[MAIN_TAB_INDEX.civilization]}`,
  ]);
  assert.equal(
    fixture.nodes.size,
    0,
    "scratch evidence was captured before teardown",
  );
  assert.equal(fixture.adapter.read("spc_red").kind, "value");
  assert.equal(
    fixture.passes.length,
    1,
    "authoritative closure keeps the cheap path",
  );
}
{
  const fixture = syndicateRenderFixture();
  fixture.child = false;
  assert.deepEqual(fixture.adapter.read("spc_red"), {
    kind: "value",
    value: { p: 1, s: 0 },
  });
  fixture.state.zone = "outer";
  assert.deepEqual(fixture.adapter.read("spc_red"), {
    kind: "value",
    value: { p: 1, s: 0 },
  });
  assert.deepEqual(
    fixture.passes.map((pass) => pass.path[1].index),
    [SPACE_TAB_INDEX.space, SPACE_TAB_INDEX.outerSol],
  );
  fixture.state.zone = "unsupported";
  assert.deepEqual(fixture.adapter.read("spc_red"), { kind: "invalid" });
  assert.equal(fixture.passes.length, 2);
}

// Only an emitted row in a successful draw can establish inactive Syndicate state.
for (const fault of [
  "no-row",
  "no-participation",
  "missing-binding",
  "invalid-binding",
  "stale-row",
  "stale-child",
  "unreadable-document",
  "missing-document",
  "no-observer",
]) {
  const fixture = syndicateRenderFixture();
  if (fault === "no-row") {
    fixture.row = false;
    fixture.child = false;
  }
  if (fault === "no-participation") {
    fixture.state.syndicateEnabled = false;
    fixture.child = false;
  }
  if (fault === "missing-binding") fixture.bind = false;
  if (fault === "invalid-binding") fixture.scanValid = false;
  if (fault === "stale-row") {
    fixture.child = false;
    fixture.nodes.set("spc_red", {});
    fixture.draw = () => {};
  }
  if (fault === "stale-child") {
    fixture.nodes.set("spc_redsynd", {});
    fixture.draw = () => {
      fixture.nodes.set("spc_red", {});
    };
  }
  if (fault === "unreadable-document")
    fixture.document.getElementById = () => {
      throw new Error("unreadable DOM");
    };
  if (fault === "missing-document") fixture.document.getElementById = undefined;
  if (fault === "no-observer")
    fixture.adapter = syndicateFor({
      registry: fixture.capture.controls,
      document: fixture.document,
    });
  assert.deepEqual(fixture.adapter.read("spc_red"), { kind: "invalid" }, fault);
  assert.equal(fixture.scans, 0, fault);
}

// Failed draw/restoration cannot authorize its captured generation, even on a later read.
for (const outcome of [
  rejected("tab-draw-failed"),
  rejected("tab-restore-failed"),
  stale("stale-tab-control"),
]) {
  const fixture = syndicateRenderFixture();
  fixture.outcome = outcome;
  assert.deepEqual(fixture.adapter.read("spc_red"), { kind: "invalid" });
  assert.equal(fixture.capture.controls.resolve("spc_redsynd"), undefined);
  fixture.child = false;
  assert.deepEqual(fixture.adapter.read("spc_red"), { kind: "invalid" });
  assert.equal(fixture.scans, 0);
  fixture.outcome = SUCCEEDED;
  assert.deepEqual(fixture.adapter.read("spc_red"), {
    kind: "value",
    value: { p: 1, s: 0 },
  });
  // The rejected retained handle must not override this later no-child draw.
  assert.deepEqual(fixture.adapter.read("spc_red"), {
    kind: "value",
    value: { p: 1, s: 0 },
  });
  fixture.child = true;
  assert.equal(fixture.adapter.read("spc_red").kind, "value");
}

// Inactive render answers are never cached; live scan closures also observe an inactive result.
{
  const fixture = syndicateRenderFixture();
  fixture.child = false;
  assert.deepEqual(fixture.adapter.read("spc_red"), {
    kind: "value",
    value: { p: 1, s: 0 },
  });
  fixture.child = true;
  assert.deepEqual(fixture.adapter.read("spc_red"), {
    kind: "value",
    value: { p: 0.7319, s: 47 },
  });
  fixture.liveSample = { sensor: 0 };
  assert.deepEqual(fixture.adapter.read("spc_red"), {
    kind: "value",
    value: { p: 1, s: 0 },
  });
  assert.equal(fixture.passes.length, 2);
  // Invalidate the binding as a later real draw can, then prove inactivity via fresh DOM evidence.
  const checkpoint = fixture.capture.controls.checkpoint();
  fixture.draw();
  fixture.capture.controls.rejectChanges(checkpoint);
  fixture.child = false;
  assert.deepEqual(fixture.adapter.read("spc_red"), {
    kind: "value",
    value: { p: 1, s: 0 },
  });
  assert.equal(fixture.passes.length, 3);
}

// A successful draw can disprove an unchanged retained handle. Only a new generation restores it.
{
  const fixture = syndicateRenderFixture();
  assert.equal(fixture.adapter.read("spc_red").kind, "value");
  fixture.state.syndicateEnabled = false;
  fixture.child = false;
  assert.deepEqual(fixture.adapter.read("spc_red"), { kind: "invalid" });
  fixture.state.syndicateEnabled = true;
  assert.deepEqual(fixture.adapter.read("spc_red"), {
    kind: "value",
    value: { p: 1, s: 0 },
  });
  assert.deepEqual(fixture.adapter.read("spc_red"), {
    kind: "value",
    value: { p: 1, s: 0 },
  });
  assert.equal(
    fixture.scans,
    1,
    "the retained active handle overrode a later no-child draw",
  );
  fixture.child = true;
  assert.equal(fixture.adapter.read("spc_red").kind, "value");
  const passes = fixture.passes.length;
  assert.equal(fixture.adapter.read("spc_red").kind, "value");
  assert.equal(fixture.passes.length, passes);
}
{
  const fixture = syndicateRenderFixture();
  const draw = fixture.draw;
  fixture.draw = () => {
    draw();
    throw new Error("draw interrupted after binding");
  };
  assert.deepEqual(fixture.adapter.read("spc_red"), { kind: "invalid" });
  assert.equal(fixture.capture.controls.resolve("spc_redsynd"), undefined);
  assert.equal(fixture.nodes.size, 0);
  fixture.draw = draw;
  assert.equal(fixture.adapter.read("spc_red").kind, "value");
}

// Production carries neither a region catalogue nor a copy of the operating predicate.
{
  const source = await (
    await import("node:fs/promises")
  ).readFile(
    new URL(
      "../../../src/adapters/evolve/captured-syndicate-mechanics.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /SYNDICATE_REGION_TABS|syndicateOperating|shadow|isolation|truepath["']|spc_(moon|red|belt|gas|titan|eris)/,
  );
}

// ---------------------------------------------------------------------------
// The probe itself: one at a time, and never left installed.
// ---------------------------------------------------------------------------

{
  const descriptor = toFixedDescriptor();
  // A probe already in flight is refused rather than merged into the one running: two interleaved
  // observations cannot be told apart from one closure rounding something else.
  const nested = probeScopedNumberToFixed(page, () => {
    assert.equal(
      probeScopedNumberToFixed(page, () => {}),
      undefined,
    );
  });
  assert.deepEqual(
    nested,
    [],
    "a nested probe observed the outer probe's rounding",
  );
  assertPrototypeRestored(descriptor, "nested probe");

  // A page whose `toFixed` cannot be observed and restored as the same property has no probe to run.
  // Its prototype is a stand-in, never this realm's own: freezing the real one would break every
  // later probe in this file rather than this case.
  const unobservable = {};
  Object.defineProperty(unobservable, "toFixed", {
    value: (digits) => String(digits),
    configurable: false,
    enumerable: false,
    writable: false,
  });
  assert.equal(
    probeScopedNumberToFixed(
      { Number: { prototype: unobservable }, Object },
      () => {
        throw new Error("the body ran on a page this probe cannot observe");
      },
    ),
    undefined,
  );
  assert.equal(
    probeScopedNumberToFixed({ Number: { prototype: {} }, Object }, () => {
      throw new Error("the body ran on a page with no `toFixed` at all");
    }),
    undefined,
  );
  assert.equal(
    probeScopedNumberToFixed(undefined, () => {}),
    undefined,
  );
  assert.equal(
    probeScopedNumberToFixed({ Number, Object: undefined }, () => {}),
    undefined,
  );
}

// The value the game receives is the value its own `toFixed` returns, byte for byte.
{
  const seen = probeScopedNumberToFixed(page, () => {
    assert.equal((1234.5678).toFixed(4), "1234.5678");
    assert.equal((0).toFixed(1), "0.0");
    assert.equal((1e21).toFixed(1), "1e+21");
  });
  assert.deepEqual(seen, [
    { receiver: 1234.5678, digits: 4, text: "1234.5678" },
    { receiver: 0, digits: 1, text: "0.0" },
    { receiver: 1e21, digits: 1, text: "1e+21" },
  ]);
}

console.log("Captured Syndicate mechanics tests passed");
