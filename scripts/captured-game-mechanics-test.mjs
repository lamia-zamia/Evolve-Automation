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
  const page = runInNewContext("({ Map, Object, Array, Function, Proxy })");
  page.Worker = FakeWorker;
  return page;
}

function structureEntry({ region, sector, struct, actionId, powered }) {
  const action = {
    id: actionId,
    title: "Relay",
    powered,
    p_fuel: () => ({ r: "Oil", a: 2 }),
    p_fuel_adjust: true,
    support: () => -1,
    support_fuel: () => [{ r: "Oil", a: 1 }],
    support_fuel_adjust: false,
    power_limit: () => 5,
    powerBalancer: () => [{ r: "Food", k: "lpmod" }, { s: 3 }],
    action: () =>
      assert.fail("mutating action must not cross the mechanics port"),
    postPower: () => assert.fail("postPower must not cross the mechanics port"),
    payCosts: () => assert.fail("payCosts must not cross the mechanics port"),
  };
  return {
    key: `${sector}:${struct}`,
    region,
    sector,
    struct,
    c_action: action,
    info: false,
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
  value: false,
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
assert.equal(capture.mechanics.readStructures().length, 6);

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
