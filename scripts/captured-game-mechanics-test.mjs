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
  const page = runInNewContext("({ Map, Object })");
  page.Worker = FakeWorker;
  return page;
}

function structureEntry({ region, sector, struct, actionId, powered }) {
  const action = {
    id: actionId,
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
assert.deepEqual(
  Object.getOwnPropertyDescriptor(page.Map.prototype, "set"),
  nativeMapSetDescriptor,
  "the exact native Map.set descriptor is restored inside the matching call",
);

// The game keeps populating the retained Map after native behavior is restored.
const second = structureEntry({
  region: "interstellar",
  sector: "int_home",
  struct: "relay",
  actionId: "interstellar-int_home-relay",
  powered: () => -4,
});
entries.set(second.key, second);
const definitions = capture.mechanics.readStructures();
assert.equal(definitions.length, 2);
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
  ],
  "same short struct names in different worlds remain separate identities",
);
assert.notEqual(definitions[0].entryKey, definitions[1].entryKey);
assert.equal(definitions[0].readPowered(), -2);
liveGlobal = { space: { relay: { watts: -7 } } };
assert.equal(
  definitions[0].readPowered(),
  -7,
  "a retained game-owned read closure observes the replacement live root",
);
assert.equal(definitions[1].readPowered(), -4);
assert.deepEqual(definitions[0].readFuel(), [{ resourceId: "Oil", amount: 2 }]);
assert.equal(definitions[0].readFuelAdjustmentRequested(), true);
assert.equal(definitions[0].readSupport(), -1);
assert.deepEqual(definitions[0].readSupportFuel(), [
  { resourceId: "Oil", amount: 1 },
]);
assert.equal(definitions[0].readSupportFuelAdjustmentDisabled(), true);
assert.equal(definitions[0].readPowerLimit(), 5);
assert.deepEqual(definitions[0].readPowerBalancer(), [
  { kind: "resource", resourceId: "Food", stateField: "lpmod" },
  { kind: "support", amount: 3 },
]);
assert.equal("c_action" in definitions[0], false);
assert.equal("action" in definitions[0], false);
assert.equal("postPower" in definitions[0], false);
assert.equal("payCosts" in definitions[0], false);
assert.equal("invoke" in capture.mechanics, false);
assert.equal("uninstall" in capture.mechanics, false);

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
assert.equal(capture.mechanics.readStructures().length, 2);

// One inherited assignment captures the p-ledger owner and then removes the prototype hook.
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
