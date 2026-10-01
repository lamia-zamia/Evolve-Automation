import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { installCapturedGameMechanics } from "../src/adapters/evolve/captured-game-mechanics.ts";
import { createCapturedPowerExecutor } from "../src/adapters/evolve/economy/production/captured-power-executor.ts";

function powerExecutorFixture(region = "city", structId = "coal_power") {
  const page = runInNewContext("({ Map, Object, Array, Function, Number })");
  let period;
  const install = installCapturedGameMechanics(page, {
    subscribe(callback) {
      period = callback;
      return () => {};
    },
  });
  const root = {
    race: {},
    tech: { high_tech: 2 },
    city: { coal_power: { count: 8, on: 1 } },
    resource: { Coal: { diff: 12 } },
    settings: { showCity: true },
  };
  const binding = `${region}-${structId}`;
  root.settings.showPortal = true;
  root[region] = { [structId]: { count: 8, on: 1 } };
  const action = {
    id: binding,
    reqs: {},
    powered: () => -5,
    title: "Coal",
    on_cap: () => 5,
    postPower: () => false,
  };
  const entries = new page.Map();
  for (const [struct, currentAction] of [
    [structId, action],
    ["unused1", { id: `${region}-unused1`, reqs: {} }],
    ["unused2", { id: `${region}-unused2`, reqs: {} }],
  ]) {
    const key = `${region}:${struct}`;
    entries.set(key, {
      key,
      region,
      sector: region,
      struct,
      c_action: currentAction,
      info: false,
    });
  }
  const callbacks = new page.Map();
  const callbackRepeat = new page.Map();
  const runCallbacks = () => {
    for (const [[owner, method], args] of callbacks) {
      if (owner[method](...args)) callbackRepeat.set([owner, method], args);
    }
    callbacks.clear();
    for (const [[owner, method], args] of callbackRepeat)
      callbacks.set([owner, method], args);
    callbackRepeat.clear();
  };
  let replaced;
  let saveSupply = false;
  const logs = [];
  const session = createCapturedPowerExecutor({
    rootState: {
      readRoot: () => root,
      subscribeRootReplaced(callback) {
        replaced = callback;
        return () => {};
      },
    },
    controls: { capturedElementIds: () => [], resolve: () => undefined },
    mechanics: install.mechanics,
    readMechSaveSupply: () => saveSupply,
    setMechSaveSupply(expected, value) {
      if (expected !== saveSupply) return false;
      saveSupply = value;
      return true;
    },
    log: (message) => logs.push(message),
  });
  const adjust = (expectedStateOn, amount) => ({
    kind: "adjust-building",
    buildingId: structId,
    binding,
    expectedStateOn,
    amount,
  });
  const execute = (...operations) =>
    session.executor.execute({
      kind: "apply-power-cycle",
      expectedBuildings: [{ id: structId, binding }],
      operations,
    });
  return {
    runCallbacks,
    page,
    root,
    action,
    callbacks,
    session,
    adjust,
    execute,
    period: () => period(),
    replaced: () => replaced(),
    saveSupply: () => saveSupply,
    logs,
    install,
  };
}

const fixture = powerExecutorFixture();
assert.equal(
  fixture.execute(fixture.adjust(1, 2)).status,
  "stale",
  "missing postPower queue fails before mutation",
);
assert.equal(fixture.root.city.coal_power.on, 1);
fixture.callbacks.set([fixture.action, "postPower"], [true]);
fixture.callbacks.clear();
fixture.runCallbacks();
fixture.period();
assert.equal(fixture.execute(fixture.adjust(1, 3)).status, "succeeded");
assert.equal(fixture.root.city.coal_power.on, 4);
assert.deepEqual([...fixture.callbacks.values()], [[true]]);
assert.equal(fixture.execute(fixture.adjust(1, 1)).status, "stale");
assert.equal(
  fixture.execute(fixture.adjust(4, 2)).status,
  "stale",
  "game-owned on_cap is respected",
);
fixture.callbacks.clear();
assert.equal(fixture.execute(fixture.adjust(4, -3)).status, "succeeded");
assert.equal(fixture.root.city.coal_power.on, 1);
assert.deepEqual([...fixture.callbacks.values()], [[false]]);
const before = JSON.stringify(fixture.root);
fixture.root.city.coal_power.on = 5;
fixture.action.on_cap = () => 3;
assert.equal(
  fixture.execute(fixture.adjust(5, -2), fixture.adjust(3, 1)).status,
  "stale",
  "projected repeated-binding increase must respect cap before any effect",
);
assert.equal(fixture.root.city.coal_power.on, 5);
fixture.action.on_cap = () => 5;
fixture.root.city.coal_power.on = 1;
assert.equal(
  fixture.execute(fixture.adjust(1, 1), {
    kind: "set-mech-save-supply",
    expected: true,
    value: false,
  }).status,
  "stale",
  "Mech state is preflighted before switching",
);
assert.equal(fixture.root.city.coal_power.on, 1);
assert.equal(
  fixture.execute(
    { kind: "set-resource-rate", resourceId: "Coal", expected: 12, value: -99 },
    {
      kind: "set-power-model",
      resourceId: "Power",
      expectedCurrent: 0,
      expectedRate: 0,
      value: 999,
    },
    {
      kind: "set-description",
      buildingId: "coal_power",
      binding: "city-coal_power",
      expected: "Coal",
      value: "Model description",
    },
    { kind: "set-mech-save-supply", expected: false, value: true },
    { kind: "log", message: "Power changed" },
  ).status,
  "succeeded",
);
assert.equal(
  JSON.stringify(fixture.root),
  before,
  "bookkeeping never changes game production",
);
assert.equal(
  fixture.session.readDescription("city-coal_power"),
  "Model description",
);
assert.equal(fixture.action.desc, undefined);
assert.equal(fixture.saveSupply(), true);
assert.deepEqual(fixture.logs, ["Power changed"]);
assert.equal(
  fixture.execute({
    kind: "set-mech-save-supply",
    expected: false,
    value: false,
  }).status,
  "stale",
);
let changingOn = 1;
Object.defineProperty(fixture.root.city.coal_power, "on", {
  configurable: true,
  get: () => changingOn,
  set(value) {
    changingOn = value;
    fixture.replaced();
  },
});
assert.equal(
  fixture.execute(fixture.adjust(1, 3)).status,
  "stale",
  "generation changes during mutation cannot report success",
);
assert.equal(changingOn, 2, "stop immediately when the generation changes");
assert.equal(fixture.session.readDescription("city-coal_power"), undefined);
fixture.install.uninstall();
const diverted = powerExecutorFixture();
diverted.callbacks.set([diverted.action, "postPower"], [true]);
diverted.runCallbacks();
diverted.period();
let divertedOn = 1;
Object.defineProperty(diverted.root.city.coal_power, "on", {
  get: () => divertedOn,
  set(value) {
    divertedOn = value + 1;
  },
});
assert.equal(
  diverted.execute(diverted.adjust(1, 3)).status,
  "stale",
  "a returned mutation does not prove the transition",
);
assert.equal(divertedOn, 3, "stop after observing an unexpected transition");
diverted.install.uninstall();
for (const struct of [
  "bireme",
  "transport",
  "purifier",
  "mechbay",
  "port",
  "base_camp",
]) {
  const special = powerExecutorFixture("portal", struct);
  special.callbacks.set([special.action, "postPower"], [true]);
  special.callbacks.clear();
  special.runCallbacks();
  special.period();
  assert.equal(
    special.execute(special.adjust(1, 2)).status,
    "succeeded",
    `${struct} uses the same semantic executor`,
  );
  assert.equal(special.root.portal[struct].on, 3);
  special.install.uninstall();
}
const emptyStartup = powerExecutorFixture();
const iteratorBeforeRestore = emptyStartup.page.Map.prototype[Symbol.iterator];
emptyStartup.runCallbacks();
emptyStartup.period();
assert.notEqual(
  emptyStartup.page.Map.prototype[Symbol.iterator],
  iteratorBeforeRestore,
  "startup iterator hook is restored",
);
assert.equal(
  emptyStartup.execute(emptyStartup.adjust(1, 2)).status,
  "succeeded",
  "empty startup callback pass captures queue for later progression",
);
emptyStartup.install.uninstall();

const ambiguousStartup = powerExecutorFixture();
ambiguousStartup.runCallbacks();
const otherQueue = new ambiguousStartup.page.Map();
const otherRepeat = new ambiguousStartup.page.Map();
for (const ignored of otherQueue) void ignored;
otherQueue.clear();
for (const ignored of otherRepeat) void ignored;
otherRepeat.clear();
ambiguousStartup.period();
assert.equal(
  ambiguousStartup.execute(ambiguousStartup.adjust(1, 2)).status,
  "stale",
  "ambiguous callback ownership fails closed",
);
assert.equal(ambiguousStartup.root.city.coal_power.on, 1);
ambiguousStartup.install.uninstall();
console.log("captured Power executor tests passed");
