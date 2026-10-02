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

import { createCapturedSyndicateMechanics } from "../src/adapters/evolve/captured-syndicate-mechanics.ts";
import { probeScopedNumberToFixed } from "../src/adapters/evolve/scoped-number-to-fixed.ts";
import {
  MAIN_TAB_CONTROL,
  MAIN_TAB_INDEX,
  MAIN_TAB_PANELS,
  MAIN_TAB_SETTING,
  SPACE_TABS_SETTING,
  SPACE_TAB_INDEX,
  SUB_TAB_CONTROLS,
} from "../src/adapters/evolve/captured-tab-discovery.ts";

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
 * A page whose Syndicate is operating, which is the only state in which the game draws a readout at
 * all. One key per clause of `syndicateActive()` that a case has to switch off individually.
 */
function operatingRoot(overrides = {}) {
  return {
    race: { truepath: true, ...overrides.race },
    tech: { syndicate: 1, ...overrides.tech },
    space: {
      syndicate: { spc_red: 600 },
      shipyard: { ships: [] },
      ...overrides.space,
    },
  };
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

function syndicateFor({ root, registry, discovery }) {
  return createCapturedSyndicateMechanics({
    rootState: { readRoot: () => root },
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
  const read = syndicateFor({ root: operatingRoot(), registry }).read(
    "spc_red",
  );
  assert.deepEqual(read, { kind: "value", value: { p: 0.7319, s: 47 } });
  assert.equal(read.value.p, 1 - Number((0.2681000012345).toFixed(4)));
  assert.notEqual(read.value.p, 1 - 0.2681000012345);
  assert.equal(registry.invoked.length, 0);
  assertPrototypeRestored(descriptor, "exact p");
}

// `s` is read from the pre-formatting receiver, not parsed out of the displayed percentage: the game
// renders `129.6%` for a sensor of 137, and the answer has to be 137.
{
  const descriptor = toFixedDescriptor();
  const registry = registryFor(scanOver({ ratio: 0.2681, sensor: 137 }));
  const read = syndicateFor({ root: operatingRoot(), registry }).read(
    "spc_red",
  );
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
  const read = syndicateFor({ root: operatingRoot(), registry }).read(
    "spc_red",
  );
  assert.deepEqual(read, { kind: "value", value: { p: 1, s: 0 } });
}

// A page whose Syndicate is not operating has no readout to read, and the game answers with its own
// default without one. Each clause of `syndicateActive()` is switched off on its own.
for (const [label, root] of [
  ["shadow", operatingRoot({ tech: { shadow: 5 } })],
  ["isolation", operatingRoot({ tech: { isolation: true } })],
  ["no syndicate technology", operatingRoot({ tech: { syndicate: 0 } })],
  ["not truepath", operatingRoot({ race: { truepath: false } })],
  ["no space syndicate", operatingRoot({ space: { syndicate: undefined } })],
]) {
  const registry = registryFor(() => {
    throw new Error("a readout was read while the Syndicate was not operating");
  });
  const discovery = discoveryStub();
  const read = syndicateFor({ root, registry, discovery }).read("spc_red");
  assert.deepEqual(read, { kind: "value", value: { p: 1, s: 0 } }, label);
  assert.deepEqual(discovery.passes, [], `${label} spent a discovery pass`);
}

// The threshold itself is the game's, not this module's: one below it the Syndicate still operates
// and its readout is read.
{
  const root = operatingRoot({ tech: { shadow: 4 } });
  const registry = registryFor(scanOver({ ratio: 0.2681, sensor: 47 }));
  assert.deepEqual(syndicateFor({ root, registry }).read("spc_red"), {
    kind: "value",
    value: { p: 0.7319, s: 47 },
  });
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
  const read = syndicateFor({ root: operatingRoot(), registry }).read(
    "spc_red",
  );
  assert.deepEqual(read, { kind: "invalid" }, refusal.label);
  assertPrototypeRestored(descriptor, refusal.label);
}

// A readout the page cannot be asked about at all: no control, and a region no Space sub-tab draws.
{
  const registry = registryFor(() => "42%", "spc_nowheresynd");
  assert.deepEqual(
    syndicateFor({ root: operatingRoot(), registry }).read("spc_red"),
    {
      kind: "absent",
    },
  );
  assert.deepEqual(
    syndicateFor({ root: operatingRoot(undefined, undefined), registry }).read(
      "spc_home",
    ),
    { kind: "absent" },
  );
  assert.deepEqual(syndicateFor({ root: undefined }).read("spc_red"), {
    kind: "absent",
  });
}

// ---------------------------------------------------------------------------
// Reaching the binding without touching the player's screen.
// ---------------------------------------------------------------------------

/**
 * A registry that holds no readout until a discovery pass has run, which is the state the capture is
 * in before this feature has ever drawn the panel the readout lives on.
 */
function untilDiscovered(inner, discovery) {
  const pass = discovery.discover.bind(discovery);
  discovery.discover = (path, options) => {
    const result = pass(path, options);
    discovered = true;
    return result;
  };
  let discovered = false;
  return {
    ...inner,
    resolve: (elementId) => (discovered ? inner.resolve(elementId) : undefined),
  };
}

{
  const discovery = discoveryStub();
  const registry = untilDiscovered(
    registryFor(scanOver({ ratio: 0.2681, sensor: 47 })),
    discovery,
  );
  const syndicate = syndicateFor({
    root: operatingRoot(),
    registry,
    discovery,
  });
  assert.equal(syndicate.read("spc_red").kind, "value");
  assert.equal(discovery.passes.length, 1);
  assert.deepEqual(discovery.passes[0].path, [
    {
      setting: MAIN_TAB_SETTING,
      control: MAIN_TAB_CONTROL,
      index: MAIN_TAB_INDEX.civilization,
    },
    {
      setting: SPACE_TABS_SETTING,
      control: SUB_TAB_CONTROLS[SPACE_TABS_SETTING],
      index: SPACE_TAB_INDEX.space,
    },
  ]);
  // The Civilization panel has to be built for real, because the region containers are its own
  // render rather than markup.
  assert.deepEqual(discovery.passes[0].options, {
    mount: [`#${MAIN_TAB_PANELS[MAIN_TAB_INDEX.civilization]}`],
  });
  // A second read of the same region is a capture the capture already holds.
  assert.equal(syndicate.read("spc_red").kind, "value");
  assert.equal(discovery.passes.length, 1);
}

// An Outer System region is drawn by the other sub-tab, and its readout is a control of its own.
{
  const discovery = discoveryStub();
  const registry = untilDiscovered(
    registryFor(scanOver({ ratio: 0.2681, sensor: 47 }), "spc_titansynd"),
    discovery,
  );
  const root = operatingRoot({ space: { syndicate: { spc_titan: 600 } } });
  const syndicate = syndicateFor({ root, registry, discovery });
  assert.deepEqual(syndicate.read("spc_titan"), {
    kind: "value",
    value: { p: 0.7319, s: 47 },
  });
  assert.equal(discovery.passes.length, 1);
  assert.equal(discovery.passes[0].path[1].index, SPACE_TAB_INDEX.outerSol);
  // And it does not become the inner system's readout: each region has its own binding.
  assert.equal(syndicate.read("spc_titan").kind, "value");
  assert.equal(discovery.passes.length, 1);
}

// A region no sub-tab draws is refused without spending a pass, and a draw that captures nothing
// leaves the region unreadable rather than reporting a defended region.
{
  const discovery = discoveryStub();
  const registry = registryFor(() => "42%", "spc_nosuchsynd");
  assert.deepEqual(
    syndicateFor({ root: operatingRoot(), registry, discovery }).read(
      "spc_nowhere",
    ),
    { kind: "absent" },
  );
  assert.deepEqual(discovery.passes, []);
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
