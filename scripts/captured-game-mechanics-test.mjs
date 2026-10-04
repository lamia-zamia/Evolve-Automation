import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";

import { installPageCapture } from "../src/adapters/evolve/page-capture.ts";

class FakeWorker {
  constructor(url) {
    this.url = String(url);
    this.listeners = [];
  }

  addEventListener(type, listener) {
    this.listeners.push({ type, listener });
  }

  removeEventListener(type, listener) {
    this.listeners = this.listeners.filter(
      (entry) => entry.type !== type || entry.listener !== listener,
    );
  }

  dispatch(data) {
    for (const entry of [...this.listeners]) {
      if (entry.type === "message") {
        entry.listener.call(this, { data });
      }
    }
  }
}

function makePage() {
  const page = runInNewContext(`
    (function() {
      function createProbe(region, sector, struct, actionId, resourceId, factor, behavior, state) {
        const action = {
          id: actionId,
          title: function() { return "probe action"; },
          powered: function() { return 0; },
          p_fuel: function() { return { r: resourceId, a: 1 }; },
          effect: function() {
            const amount = this.p_fuel().a;
            const first = Number(amount * factor).toFixed(2);
            if (behavior === "ambiguous") Number(amount * (factor + 0.25)).toFixed(2);
            if (behavior === "throws") throw new Error("effect probe failure");
            return first;
          },
        };
        return { key: sector + ":" + struct, region, sector, struct, c_action: action, info: false, state };
      }
      return {
        Map, Object, Array, Function, Number, Proxy, createProbe,
        game: { loc: function(key) { return "translated:" + key; } },
      };
    })()
  `);
  page.Worker = FakeWorker;
  return page;
}

function structureEntry({
  region,
  sector,
  struct,
  actionId,
  powered,
  support = () => -1,
  supportTypes,
  supportFor,
  supportProvider,
  info = false,
}) {
  const action = {
    id: actionId,
    title: "Relay",
    powered,
    p_fuel: () => ({ r: "Oil", a: 2 }),
    p_fuel_adjust: true,
    support,
    support_fuel: () => [{ r: "Oil", a: 1 }],
    support_fuel_adjust: false,
    power_limit: () => 5,
    powerBalancer: () => [{ r: "Food", k: "lpmod" }, { s: 3 }],
    action: () =>
      assert.fail("mutating action must not cross the mechanics port"),
    postPower: () => assert.fail("postPower must not cross the mechanics port"),
    payCosts: () => assert.fail("payCosts must not cross the mechanics port"),
  };
  if (supportTypes !== undefined) action.s_type = supportTypes;
  if (supportFor !== undefined) action.support_for = supportFor;
  if (supportProvider !== undefined) action.support_provider = supportProvider;
  return {
    key: `${sector}:${struct}`,
    region,
    sector,
    struct,
    c_action: action,
    info,
  };
}

const page = makePage();
const nativeMapSetDescriptor = Object.getOwnPropertyDescriptor(
  page.Map.prototype,
  "set",
);
const nativeConsumeDescriptor = Object.getOwnPropertyDescriptor(
  page.Object.prototype,
  "consume",
);
const capture = installPageCapture(page);
assert.equal(capture.mechanics.readStructures(), undefined);
assert.equal(capture.mechanics.readProductionBreakdown(), undefined);
assert.deepEqual(capture.mechanics.readLocalizedText("probe_source"), {
  kind: "value",
  value: "translated:probe_source",
});

const unrelatedBefore = new page.Map();
unrelatedBefore.set("ordinary", { value: 1 });
assert.equal(capture.mechanics.readStructures(), undefined);
assert.equal("consume" in unrelatedBefore, true);

const ordinaryReceiver = new page.Object();
ordinaryReceiver.consume = "ordinary value";
assert.equal(ordinaryReceiver.consume, "ordinary value");
assert.deepEqual(Object.getOwnPropertyDescriptor(ordinaryReceiver, "consume"), {
  configurable: true,
  enumerable: true,
  value: "ordinary value",
  writable: true,
});

const arrayReceiver = new page.Array();
arrayReceiver.consume = "array value";
assert.equal(arrayReceiver.consume, "array value");
assert.equal(Object.hasOwn(arrayReceiver, "consume"), true);

const functionReceiver = new page.Function();
functionReceiver.consume = "function value";
assert.equal(functionReceiver.consume, "function value");
assert.equal(Object.hasOwn(functionReceiver, "consume"), true);

let proxyDefineCalls = 0;
const proxyTarget = new page.Object();
const proxyReceiver = new page.Proxy(proxyTarget, {
  defineProperty(target, property, descriptor) {
    proxyDefineCalls += 1;
    return Reflect.defineProperty(target, property, descriptor);
  },
});
proxyReceiver.consume = "proxy value";
assert.equal(proxyTarget.consume, "proxy value");
assert.equal(proxyDefineCalls, 1);

const primitiveAssignment = new page.Function(
  "receiver",
  "'use strict'; receiver.consume = 'cannot create';",
);
assert.throws(() => primitiveAssignment("primitive"), { name: "TypeError" });

const ownPropertyReceiver = new page.Object();
ownPropertyReceiver.consume = "old value";
ownPropertyReceiver.consume = "new value";
assert.equal(ownPropertyReceiver.consume, "new value");
assert.equal(Object.hasOwn(ownPropertyReceiver, "consume"), true);

const nonExtensibleReceiver = new page.Object();
page.Object.preventExtensions(nonExtensibleReceiver);
assert.throws(
  () => {
    nonExtensibleReceiver.consume = "cannot create";
  },
  { name: "TypeError" },
);
const sloppyAssignment = new page.Function(
  "receiver",
  "receiver.consume = 'cannot create';",
);
assert.throws(
  () => sloppyAssignment(nonExtensibleReceiver),
  { name: "TypeError" },
  "the temporary setter throws rather than reporting a failed write as success",
);
assert.equal(Object.hasOwn(nonExtensibleReceiver, "consume"), false);

const falseCandidate = new page.Map();
falseCandidate.set(
  "not-the-entry-key",
  structureEntry({
    region: "space",
    sector: "spc_home",
    struct: "relay",
    actionId: "space-relay",
    powered: () => -1,
  }),
);
assert.equal(
  capture.mechanics.readStructures(),
  undefined,
  "a coherent-looking row with an unrelated map key is rejected",
);

let unrelatedGetterCalls = 0;
const accessorCandidate = new page.Map();
accessorCandidate.set("spc_home:relay", {
  key: "spc_home:relay",
  region: "space",
  sector: "spc_home",
  struct: "relay",
  info: false,
  c_action: {
    id: "space-spc_home-relay",
    get powered() {
      unrelatedGetterCalls += 1;
      return () => -1;
    },
  },
});
assert.equal(capture.mechanics.readStructures(), undefined);
assert.equal(
  unrelatedGetterCalls,
  0,
  "the structural probe does not execute accessor properties on an unrelated map",
);

const singleEntryCandidate = new page.Map();
const plausibleEntry = structureEntry({
  region: "space",
  sector: "spc_plausible",
  struct: "relay",
  actionId: "space-spc_plausible-relay",
  powered: () => -1,
});
singleEntryCandidate.set(plausibleEntry.key, plausibleEntry);
assert.equal(
  capture.mechanics.readStructures(),
  undefined,
  "one structurally plausible row does not identify a private registry",
);

let liveGlobal = { space: { relay: { watts: -2 } } };
const entries = new page.Map();
const first = structureEntry({
  region: "space",
  sector: "spc_home",
  struct: "relay",
  actionId: "space-spc_home-relay",
  powered: () => liveGlobal.space.relay.watts,
});
entries.set(first.key, first);
assert.equal(capture.mechanics.readStructures(), undefined);
assert.notDeepEqual(
  Object.getOwnPropertyDescriptor(page.Map.prototype, "set"),
  nativeMapSetDescriptor,
);

const second = structureEntry({
  region: "interstellar",
  sector: "int_home",
  struct: "relay",
  actionId: "interstellar-int_home-relay",
  powered: () => -4,
});
entries.set(second.key, second);
assert.equal(capture.mechanics.readStructures(), undefined);
const third = structureEntry({
  region: "space",
  sector: "spc_red",
  struct: "relay",
  actionId: "space-spc_red-relay",
  powered: () => -3,
});
entries.set(third.key, third);
assert.deepEqual(
  Object.getOwnPropertyDescriptor(page.Map.prototype, "set"),
  nativeMapSetDescriptor,
  "the exact native Map.set descriptor is restored inside the third matching call",
);

// The game keeps populating the retained Map after native behavior is restored.
const fourth = structureEntry({
  region: "galaxy",
  sector: "gxy_home",
  struct: "relay",
  actionId: "galaxy-gxy_home-relay",
  powered: () => -5,
});
entries.set(fourth.key, fourth);
const definitions = capture.mechanics.readStructures();
assert.equal(definitions.length, 4);
assert.deepEqual(
  definitions.map(({ entryKey, region, sector, struct }) => ({
    entryKey,
    region,
    sector,
    struct,
  })),
  [
    {
      entryKey: "spc_home:relay",
      region: "space",
      sector: "spc_home",
      struct: "relay",
    },
    {
      entryKey: "int_home:relay",
      region: "interstellar",
      sector: "int_home",
      struct: "relay",
    },
    {
      entryKey: "spc_red:relay",
      region: "space",
      sector: "spc_red",
      struct: "relay",
    },
    {
      entryKey: "gxy_home:relay",
      region: "galaxy",
      sector: "gxy_home",
      struct: "relay",
    },
  ],
  "same short struct names in different worlds remain separate identities",
);
assert.notEqual(definitions[0].entryKey, definitions[1].entryKey);
assert.deepEqual(definitions[0].readTitle(), {
  kind: "value",
  value: "Relay",
});
assert.deepEqual(definitions[0].readPowered(), { kind: "value", value: -2 });
assert.equal(definitions[0].ownsPowered, true);
assert.deepEqual(definitions[0].readSwitchable(), { kind: "absent" });
liveGlobal = { space: { relay: { watts: -7 } } };
assert.equal(
  definitions[0].readPowered().value,
  -7,
  "a retained game-owned read closure observes the replacement live root",
);
assert.deepEqual(definitions[1].readPowered(), { kind: "value", value: -4 });
assert.deepEqual(definitions[0].readFuel(), {
  kind: "value",
  value: [{ resourceId: "Oil", amount: 2 }],
});
assert.deepEqual(definitions[0].readFuelAdjustmentRequested(), {
  kind: "value",
  value: true,
});
assert.deepEqual(definitions[0].readSupport(), { kind: "value", value: -1 });
assert.deepEqual(definitions[0].readSupportFuel(), {
  kind: "value",
  value: [{ resourceId: "Oil", amount: 1 }],
});
assert.deepEqual(definitions[0].readSupportFuelAdjustmentDisabled(), {
  kind: "value",
  value: true,
});
assert.deepEqual(definitions[0].readPowerLimit(), { kind: "value", value: 5 });
assert.deepEqual(definitions[0].readPowerBalancer(), {
  kind: "value",
  value: [
    { kind: "resource", resourceId: "Food", stateField: "lpmod" },
    { kind: "support", amount: 3 },
  ],
});
assert.deepEqual(definitions[0].readSupportTypes(), { kind: "absent" });
assert.deepEqual(definitions[0].readSupportProvider(), { kind: "absent" });
assert.deepEqual(definitions[0].readSupportTopology(), {
  kind: "value",
  value: {
    anchorEntryKey: null,
    unlimited: false,
    enabled: { kind: "value", value: true },
  },
});
assert.equal("c_action" in definitions[0], false);
assert.equal("action" in definitions[0], false);
assert.equal("postPower" in definitions[0], false);
assert.equal("payCosts" in definitions[0], false);
assert.equal("invoke" in capture.mechanics, false);
assert.equal("uninstall" in capture.mechanics, false);

const falseResultAction = structureEntry({
  region: "space",
  sector: "spc_elsewhere",
  struct: "relay",
  actionId: "space-spc_elsewhere-relay",
  powered: () => false,
});
falseResultAction.c_action.p_fuel = () => false;
falseResultAction.c_action.powerBalancer = () => false;
falseResultAction.c_action.title = () => "Dynamic relay";
falseResultAction.c_action.p_fuel_adjust = false;
delete falseResultAction.c_action.support_fuel_adjust;
delete falseResultAction.c_action.power_limit;
entries.set(falseResultAction.key, falseResultAction);
const falseResultDefinition = capture.mechanics
  .readStructures()
  .find((entry) => entry.entryKey === falseResultAction.key);
assert.deepEqual(falseResultDefinition.readPowered(), {
  kind: "value",
  value: 0,
});
assert.equal(falseResultDefinition.ownsPowered, true);
let liveSwitchable = true;
falseResultAction.c_action.switchable = function () {
  assert.equal(this, falseResultAction.c_action);
  return liveSwitchable;
};
assert.deepEqual(falseResultDefinition.readSwitchable(), {
  kind: "value",
  value: true,
});
liveSwitchable = false;
assert.deepEqual(falseResultDefinition.readSwitchable(), {
  kind: "value",
  value: false,
});
falseResultAction.c_action.switchable = () => "true";
assert.deepEqual(falseResultDefinition.readSwitchable(), { kind: "invalid" });
falseResultAction.c_action.switchable = () => {
  throw new Error("switchable failed");
};
assert.deepEqual(falseResultDefinition.readSwitchable(), { kind: "invalid" });
delete falseResultAction.c_action.powered;
const unpoweredDefinition = capture.mechanics
  .readStructures()
  .find((entry) => entry.entryKey === falseResultAction.key);
assert.equal(unpoweredDefinition.ownsPowered, false);
assert.deepEqual(unpoweredDefinition.readPowered(), { kind: "absent" });
falseResultAction.c_action.switchable = () => true;
assert.deepEqual(unpoweredDefinition.readSwitchable(), {
  kind: "value",
  value: true,
});
assert.deepEqual(falseResultDefinition.readTitle(), {
  kind: "value",
  value: "Dynamic relay",
});
assert.deepEqual(falseResultDefinition.readFuel(), {
  kind: "value",
  value: false,
});
assert.deepEqual(falseResultDefinition.readFuelAdjustmentRequested(), {
  kind: "value",
  value: false,
});
assert.deepEqual(falseResultDefinition.readPowerBalancer(), {
  kind: "value",
  value: false,
});
assert.deepEqual(falseResultDefinition.readSupportFuelAdjustmentDisabled(), {
  kind: "absent",
});
assert.deepEqual(falseResultDefinition.readPowerLimit(), { kind: "absent" });

const invalidResultAction = structureEntry({
  region: "space",
  sector: "spc_invalid",
  struct: "relay",
  actionId: "space-spc_invalid-relay",
  powered: () => Number.NaN,
});
delete invalidResultAction.c_action.title;
invalidResultAction.c_action.p_fuel_adjust = "false";
entries.set(invalidResultAction.key, invalidResultAction);
const invalidResultDefinition = capture.mechanics
  .readStructures()
  .find((entry) => entry.entryKey === invalidResultAction.key);
assert.deepEqual(invalidResultDefinition.readPowered(), { kind: "invalid" });
assert.deepEqual(invalidResultDefinition.readTitle(), { kind: "absent" });
invalidResultAction.c_action.title = 7;
assert.deepEqual(invalidResultDefinition.readTitle(), { kind: "invalid" });
assert.deepEqual(invalidResultDefinition.readFuelAdjustmentRequested(), {
  kind: "invalid",
});

const coercibleFuelAction = structureEntry({
  region: "space",
  sector: "spc_coercible_fuel",
  struct: "generator",
  actionId: "space-spc_coercible_fuel-generator",
  powered: () => "-2",
});
coercibleFuelAction.c_action.p_fuel = () => ({ r: "Oil", a: "2.5" });
entries.set(coercibleFuelAction.key, coercibleFuelAction);
const coercibleFuelDefinition = capture.mechanics
  .readStructures()
  .find((entry) => entry.entryKey === coercibleFuelAction.key);
assert.deepEqual(coercibleFuelDefinition.readPowered(), {
  kind: "value",
  value: -2,
});
assert.deepEqual(coercibleFuelDefinition.readFuel(), {
  kind: "value",
  value: [{ resourceId: "Oil", amount: 2.5 }],
});
coercibleFuelAction.c_action.power_reqs = { advanced_power: "2" };
assert.deepEqual(coercibleFuelDefinition.readPowerRequirements(), {
  kind: "value",
  value: [{ techId: "advanced_power", level: 2 }],
});

const probeState = { unchanged: true };
const spaceProbe = page.createProbe(
  "space",
  "spc_probe",
  "space_probe",
  "space-space_probe",
  "Oil",
  0.25,
  "ok",
  probeState,
);
entries.set(spaceProbe.key, spaceProbe);
const spaceProbeFuelDescriptor = Object.getOwnPropertyDescriptor(
  spaceProbe.c_action,
  "p_fuel",
);
const nativeToFixedDescriptor = Object.getOwnPropertyDescriptor(
  page.Number.prototype,
  "toFixed",
);
assert.deepEqual(
  capture.mechanics
    .readStructures()
    .find((entry) => entry.entryKey === spaceProbe.key)
    .readFuel(),
  { kind: "value", value: [{ resourceId: "Oil", amount: 1 }] },
);
assert.deepEqual(
  capture.mechanics.readAdjustedFuelFactor("space", "Oil"),
  { kind: "value", value: 0.25 },
  "the action effect exposes the exact fuel_adjust(..., true) factor before rounding",
);
assert.deepEqual(probeState, { unchanged: true });
assert.deepEqual(
  Object.getOwnPropertyDescriptor(spaceProbe.c_action, "p_fuel"),
  spaceProbeFuelDescriptor,
  "the original p_fuel descriptor is restored after a successful probe",
);
assert.deepEqual(
  Object.getOwnPropertyDescriptor(page.Number.prototype, "toFixed"),
  nativeToFixedDescriptor,
  "the page realm toFixed descriptor is restored after a successful probe",
);

const interstellarProbe = page.createProbe(
  "tauceti",
  "tau_home",
  "fuel_probe",
  "tauceti-fuel_probe",
  "Helium_3",
  0.75,
  "ok",
  probeState,
);
entries.set(interstellarProbe.key, interstellarProbe);
assert.deepEqual(
  capture.mechanics.readAdjustedFuelFactor("interstellar", "Helium_3"),
  { kind: "value", value: 0.75 },
  "the action effect exposes the exact int_fuel_adjust factor",
);
for (const [mode, resourceId, region, factor] of [
  ["space", "Helium_3", "space", 0.33],
  ["space", "Super_Fuel", "space", 0.44],
  ["interstellar", "Deuterium", "tauceti", 0.66],
  ["interstellar", "Super_Fuel", "tauceti", 0.88],
]) {
  const probe = page.createProbe(
    region,
    `${region}_${resourceId}`,
    `fuel_probe_${resourceId}`,
    `${region}-fuel_probe_${resourceId}`,
    resourceId,
    factor,
    "ok",
    probeState,
  );
  entries.set(probe.key, probe);
  assert.deepEqual(
    capture.mechanics.readAdjustedFuelFactor(mode, resourceId),
    { kind: "value", value: factor },
    `${mode} fuel adjustment preserves the captured ${resourceId} factor`,
  );
  entries.delete(probe.key);
}

const failedProbe = page.createProbe(
  "space",
  "spc_probe",
  "failed_probe",
  "space-failed_probe",
  "Oil",
  0.5,
  "throws",
  probeState,
);
entries.set(failedProbe.key, failedProbe);
const failedFuelDescriptor = Object.getOwnPropertyDescriptor(
  failedProbe.c_action,
  "p_fuel",
);
assert.deepEqual(
  capture.mechanics.readAdjustedFuelFactor("space", "Oil"),
  { kind: "invalid" },
  "a throwing candidate rejects the factor rather than guessing from another action",
);
assert.deepEqual(probeState, { unchanged: true });
assert.deepEqual(
  Object.getOwnPropertyDescriptor(failedProbe.c_action, "p_fuel"),
  failedFuelDescriptor,
  "the original p_fuel descriptor is restored after a failed probe",
);
assert.deepEqual(
  Object.getOwnPropertyDescriptor(page.Number.prototype, "toFixed"),
  nativeToFixedDescriptor,
  "the page realm toFixed descriptor is restored after a failed probe",
);
entries.delete(failedProbe.key);

const ambiguousProbe = page.createProbe(
  "space",
  "spc_probe",
  "ambiguous_probe",
  "space-ambiguous_probe",
  "Oil",
  0.5,
  "ambiguous",
  probeState,
);
entries.set(ambiguousProbe.key, ambiguousProbe);
assert.deepEqual(
  capture.mechanics.readAdjustedFuelFactor("space", "Oil"),
  { kind: "invalid" },
  "multiple values scaling with the probe amount are rejected as ambiguous",
);
assert.deepEqual(
  Object.getOwnPropertyDescriptor(page.Number.prototype, "toFixed"),
  nativeToFixedDescriptor,
);

// The private Map is the action catalog, while live root lists are the current game priority.
const reorderedRoot = {
  power: [
    fourth.key,
    "stale:entry",
    first.key,
    "not-captured:entry",
    second.key,
  ],
  support: {
    moon: [second.key, "stale:support", first.key, "not-captured:entry"],
  },
};
assert.deepEqual(
  capture.mechanics
    .readPowerOrder(reorderedRoot)
    .value.map((entry) => entry.entryKey),
  [fourth.key, first.key, second.key],
  "the live Power array controls order and stale keys are skipped",
);
assert.deepEqual(
  capture.mechanics
    .readSupportOrder(reorderedRoot, "moon")
    .value.map((entry) => entry.entryKey),
  [second.key, first.key],
  "each live support array controls order independently of Map insertion",
);
assert.deepEqual(capture.mechanics.readPowerOrder({ power: "bad" }), {
  kind: "invalid",
});
assert.deepEqual(capture.mechanics.readSupportOrder({}, "moon"), {
  kind: "absent",
});

const currentGridRoot = {
  space: { relay: { on: 1 } },
  interstellar: { relay: { on: 1 } },
  galaxy: { relay: { on: 1 } },
  power: [],
  support: {},
};
assert.deepEqual(definitions[0].readPowerGridRole(currentGridRoot), {
  kind: "value",
  value: "generator",
});
assert.deepEqual(
  definitions[0].readPowerGridRole({
    ...currentGridRoot,
    power: [first.key],
  }),
  { kind: "invalid" },
  "negative native output cannot be listed as a consumer",
);
let nativeConsumerWatts = 2;
const nativeConsumer = structureEntry({
  region: "space",
  sector: "spc_dynamic",
  struct: "consumer",
  actionId: "space-spc_dynamic-consumer",
  powered: () => nativeConsumerWatts,
  support: () => -2,
  supportTypes: ["moon", "red"],
  supportFor: { moon: 3, red: 0 },
  supportProvider: true,
  info: { support: "relay", support_unlimited: true },
});
entries.set(nativeConsumer.key, nativeConsumer);
const nativeConsumerDefinition = capture.mechanics
  .readStructures()
  .find((entry) => entry.entryKey === nativeConsumer.key);
const dynamicRoot = {
  ...currentGridRoot,
  space: { ...currentGridRoot.space, consumer: { on: 1 } },
  power: [nativeConsumer.key],
  support: { moon: [nativeConsumer.key], red: [nativeConsumer.key] },
};
assert.deepEqual(nativeConsumerDefinition.readPowerGridRole(dynamicRoot), {
  kind: "value",
  value: "consumer",
});
assert.deepEqual(nativeConsumerDefinition.readNativeSupportGrids(dynamicRoot), {
  kind: "value",
  value: [
    {
      type: "moon",
      contribution: 3,
      consumer: true,
      provider: true,
      topology: {
        anchorEntryKey: first.key,
        unlimited: true,
        enabled: { kind: "value", value: true },
      },
    },
    {
      type: "red",
      contribution: 0,
      consumer: true,
      provider: true,
      topology: {
        anchorEntryKey: first.key,
        unlimited: true,
        enabled: { kind: "value", value: true },
      },
    },
  ],
});
nativeConsumerWatts = 0;
assert.deepEqual(
  nativeConsumerDefinition.readPowerGridRole(dynamicRoot),
  { kind: "invalid" },
  "a changed powered() answer requires the native order to agree",
);
assert.deepEqual(
  nativeConsumerDefinition.readPowerGridRole({ ...dynamicRoot, power: [] }),
  {
    kind: "value",
    value: "none",
  },
);
nativeConsumerWatts = 2;
assert.deepEqual(
  nativeConsumerDefinition.readNativeSupportGrids({
    ...dynamicRoot,
    support: { moon: [], red: [nativeConsumer.key] },
  }),
  { kind: "invalid" },
  "a missing native consumer order entry fails closed",
);
assert.deepEqual(
  nativeConsumerDefinition.readPowerGridRole({
    ...dynamicRoot,
    space: { relay: { on: 1 } },
  }),
  { kind: "invalid" },
  "missing current structure state fails closed",
);
entries.delete(nativeConsumer.key);
assert.deepEqual(
  nativeConsumerDefinition.readPowerGridRole(dynamicRoot),
  { kind: "invalid" },
  "a retained descriptor cannot outlive its exact registry entry",
);

const typedSupport = structureEntry({
  region: "space",
  sector: "spc_home",
  struct: "provider",
  actionId: "space-spc_home-provider",
  powered: () => 0,
  support: () => -4,
  supportTypes: ["moon", 2, "red"],
  supportFor: {
    moon() {
      assert.equal(this, typedSupport.c_action);
      return "6";
    },
    red: "3",
  },
  supportProvider: true,
  info: {
    support: "relay",
    support_unlimited: true,
    support_condition() {
      return this.support_unlimited;
    },
  },
});
entries.set(typedSupport.key, typedSupport);
const typedSupportDefinition = capture.mechanics
  .readStructures()
  .find((entry) => entry.entryKey === typedSupport.key);
assert.deepEqual(typedSupportDefinition.readSupportTypes(), {
  kind: "value",
  value: ["moon", "red"],
});
assert.deepEqual(typedSupportDefinition.readSupportValue("moon"), {
  kind: "value",
  value: 6,
});
assert.deepEqual(typedSupportDefinition.readSupportValue("red"), {
  kind: "value",
  value: 3,
});
assert.deepEqual(typedSupportDefinition.readSupportValue("other"), {
  kind: "value",
  value: -4,
});
assert.deepEqual(typedSupportDefinition.readSupportProvider(), {
  kind: "value",
  value: true,
});
assert.deepEqual(typedSupportDefinition.readSupportTopology(), {
  kind: "value",
  value: {
    anchorEntryKey: first.key,
    unlimited: true,
    enabled: { kind: "value", value: true },
  },
});

const scalarSupport = structureEntry({
  region: "space",
  sector: "spc_scalar",
  struct: "provider",
  actionId: "space-spc_scalar-provider",
  powered: () => 0,
  support: () => "2",
  supportTypes: "red",
});
entries.set(scalarSupport.key, scalarSupport);
const scalarSupportDefinition = capture.mechanics
  .readStructures()
  .find((entry) => entry.entryKey === scalarSupport.key);
assert.deepEqual(scalarSupportDefinition.readSupportTypes(), {
  kind: "value",
  value: ["red"],
});
assert.deepEqual(scalarSupportDefinition.readSupportValue("red"), {
  kind: "value",
  value: 2,
});
assert.deepEqual(
  scalarSupportDefinition.readNativeSupportGrids({
    space: { provider: { on: 1 } },
    support: { red: [] },
  }),
  {
    kind: "value",
    value: [
      {
        type: "red",
        contribution: 2,
        consumer: false,
        provider: true,
        topology: {
          anchorEntryKey: null,
          unlimited: false,
          enabled: { kind: "value", value: true },
        },
      },
    ],
  },
  "positive support output is a provider without appearing in consumer order",
);
scalarSupport.c_action.support = () => {
  throw new Error("native support failed");
};
assert.deepEqual(
  scalarSupportDefinition.readNativeSupportGrids({
    space: { provider: { on: 1 } },
    support: { red: [] },
  }),
  { kind: "invalid" },
);

const negativeProvider = structureEntry({
  region: "space",
  sector: "spc_negative_provider",
  struct: "provider",
  actionId: "space-spc_negative_provider-provider",
  powered: () => 0,
  support: () => -1,
  supportTypes: "moon",
  supportProvider: "true",
});
entries.set(negativeProvider.key, negativeProvider);
const negativeProviderDefinition = capture.mechanics
  .readStructures()
  .find((entry) => entry.entryKey === negativeProvider.key);
assert.deepEqual(
  negativeProviderDefinition.readSupportProvider(),
  {
    kind: "value",
    value: true,
  },
  "support_provider qualifies independently of support() sign",
);
assert.deepEqual(negativeProviderDefinition.readSupportValue("moon"), {
  kind: "value",
  value: -1,
});

const disabledSupport = structureEntry({
  region: "space",
  sector: "spc_disabled",
  struct: "consumer",
  actionId: "space-spc_disabled-consumer",
  powered: () => 0,
  supportTypes: "moon",
  info: { support_condition: () => 0 },
});
entries.set(disabledSupport.key, disabledSupport);
const disabledSupportDefinition = capture.mechanics
  .readStructures()
  .find((entry) => entry.entryKey === disabledSupport.key);
assert.deepEqual(
  disabledSupportDefinition.readSupportTopology().value.enabled,
  { kind: "value", value: false },
  "falsey support conditions disable the group using game truthiness",
);

const invalidCondition = structureEntry({
  region: "space",
  sector: "spc_invalid_condition",
  struct: "consumer",
  actionId: "space-spc_invalid_condition-consumer",
  powered: () => 0,
  supportTypes: "moon",
  info: {
    support_condition: () => {
      throw new Error("condition failed");
    },
  },
});
entries.set(invalidCondition.key, invalidCondition);
const invalidConditionDefinition = capture.mechanics
  .readStructures()
  .find((entry) => entry.entryKey === invalidCondition.key);
assert.deepEqual(
  invalidConditionDefinition.readSupportTopology().value.enabled,
  { kind: "invalid" },
  "a throwing support condition remains unavailable instead of becoming enabled",
);

const unresolvedSupportAnchor = structureEntry({
  region: "space",
  sector: "spc_unresolved_anchor",
  struct: "consumer",
  actionId: "space-spc_unresolved_anchor-consumer",
  powered: () => 0,
  info: { support: "missing_anchor" },
});
entries.set(unresolvedSupportAnchor.key, unresolvedSupportAnchor);
const unresolvedSupportDefinition = capture.mechanics
  .readStructures()
  .find((entry) => entry.entryKey === unresolvedSupportAnchor.key);
assert.deepEqual(
  unresolvedSupportDefinition.readSupportTopology(),
  {
    kind: "value",
    value: {
      anchorEntryKey: null,
      unlimited: false,
      enabled: { kind: "value", value: true },
    },
  },
  "the game retains a false anchor when info.support does not resolve in the region",
);

const unrelatedAfter = new page.Map();
unrelatedAfter.set(
  "unrelated-after-capture",
  structureEntry({
    region: "galaxy",
    sector: "gxy_home",
    struct: "relay",
    actionId: "galaxy-gxy_home-relay",
    powered: () => 1,
  }),
);
assert.equal(capture.mechanics.readStructures().length, 16);

// One inherited assignment captures the p-ledger owner and then removes the prototype hook.
const falseLedgerCandidate = new page.Object();
falseLedgerCandidate.Global = {};
falseLedgerCandidate.consume = { Food: {} };
assert.equal(Object.hasOwn(falseLedgerCandidate, "consume"), true);
assert.equal(
  capture.mechanics.readProductionBreakdown(),
  undefined,
  "a Global section with a nonempty consume value is not the production owner",
);

const unrelatedOwner = new page.Object();
unrelatedOwner.notes = {};
unrelatedOwner.consume = {};
assert.equal(Object.hasOwn(unrelatedOwner, "consume"), true);
assert.equal(capture.mechanics.readProductionBreakdown(), undefined);

const ledger = new page.Object();
ledger.Global = { passive: "10%" };
ledger.consume = new page.Object();
assert.deepEqual(
  Object.getOwnPropertyDescriptor(page.Object.prototype, "consume"),
  nativeConsumeDescriptor,
  "the inherited property hook is restored as soon as the production owner is identified",
);
assert.equal("consume" in unrelatedBefore, false);
ledger.Food = { workers: "4v" };
ledger.consume.Food = { "coal plant": -3 };
const firstBreakdown = capture.mechanics.readProductionBreakdown();
assert.equal(firstBreakdown.production.Food.workers, "4v");
assert.equal(firstBreakdown.consumption.Food["coal plant"], -3);
assert.equal(Object.isFrozen(firstBreakdown), true);
assert.equal(Object.isFrozen(firstBreakdown.production), true);
assert.notEqual(firstBreakdown.consumption.Food, ledger.consume.Food);
assert.throws(() => {
  firstBreakdown.consumption.Food["coal plant"] = 99;
}, TypeError);

// A later normal production cycle recreates slots on the same captured owner.
ledger.consume = { Food: { "coal plant": -8 } };
ledger.Food = { workers: "9v" };
const nextBreakdown = capture.mechanics.readProductionBreakdown();
assert.equal(nextBreakdown.consumption.Food["coal plant"], -8);
assert.equal(nextBreakdown.production.Food.workers, "9v");
assert.notEqual(nextBreakdown.consumption, firstBreakdown.consumption);

capture.uninstall();
assert.deepEqual(
  Object.getOwnPropertyDescriptor(page.Map.prototype, "set"),
  nativeMapSetDescriptor,
);
assert.deepEqual(
  Object.getOwnPropertyDescriptor(page.Object.prototype, "consume"),
  nativeConsumeDescriptor,
);

// A missed structure/ledger capture is reported as unavailable and all pending hooks are removed
// when the first game worker message completes.
const missedPage = makePage();
const missedMapSet = Object.getOwnPropertyDescriptor(
  missedPage.Map.prototype,
  "set",
);
const missedConsume = Object.getOwnPropertyDescriptor(
  missedPage.Object.prototype,
  "consume",
);
const missedCapture = installPageCapture(missedPage);
const worker = new missedPage.Worker("evolve/evolve.js");
worker.addEventListener("message", () => {});
worker.dispatch({ loop: "main", periods: 1 });
assert.equal(missedCapture.mechanics.readStructures(), undefined);
assert.equal(missedCapture.mechanics.readProductionBreakdown(), undefined);
assert.deepEqual(
  Object.getOwnPropertyDescriptor(missedPage.Map.prototype, "set"),
  missedMapSet,
);
assert.deepEqual(
  Object.getOwnPropertyDescriptor(missedPage.Object.prototype, "consume"),
  missedConsume,
);
assert.equal("consume" in missedPage.Object.prototype, false);
missedCapture.uninstall();

// Teardown also restores pending hooks when no game worker ever starts.
const tornDownPage = makePage();
const tornDownMapSet = Object.getOwnPropertyDescriptor(
  tornDownPage.Map.prototype,
  "set",
);
const tornDownConsume = Object.getOwnPropertyDescriptor(
  tornDownPage.Object.prototype,
  "consume",
);
const tornDownCapture = installPageCapture(tornDownPage);
tornDownCapture.uninstall();
assert.deepEqual(
  Object.getOwnPropertyDescriptor(tornDownPage.Map.prototype, "set"),
  tornDownMapSet,
);
assert.deepEqual(
  Object.getOwnPropertyDescriptor(tornDownPage.Object.prototype, "consume"),
  tornDownConsume,
);
assert.equal("consume" in tornDownPage.Object.prototype, false);
