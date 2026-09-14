import assert from "node:assert/strict";

import { createGameKeyStateCapture } from "../src/adapters/browser/game-key-state.ts";
import { createCapturedBuildCapacity } from "../src/adapters/evolve/captured-build-capacity.ts";

function makeFixture({
  capacity = 1,
  invokeThrows = false,
  workspace = true,
  keyStateAvailable = true,
} = {}) {
  const listeners = new Map();
  const documentStub = {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    dispatchEvent(event) {
      listeners.get(event.type)?.(event);
    },
  };
  const keyState = createGameKeyStateCapture(() =>
    keyStateAvailable ? documentStub : {},
  );
  const root = {
    settings: { keyMap: { q: "q" }, qKey: false },
    tech: { queue: false },
    queue: {
      max: 0,
      display: true,
      queue: [],
    },
    city: { farm: { count: 0, progress: 0 } },
  };
  const initial = structuredClone(root);
  let currentCapacity = capacity;
  let epoch = "1";
  let now = 0;
  let actualCalls = 0;
  let invokeCalls = 0;
  const opens = [];
  let released = 0;
  const diagnostics = {
    counts: new Map(),
    readPerformanceEnabled: () => true,
    nowMs: () => now,
    recordPerformance: () => {},
    recordCount(name, amount) {
      this.counts.set(name, (this.counts.get(name) ?? 0) + amount);
    },
    flushPerformance: () => {},
  };
  const controls = {
    resolve: (elementId) =>
      elementId === "city-farm"
        ? { elementId, generation: 1, methods: ["action"] }
        : undefined,
    invoke: (_handle, method) => {
      assert.equal(method, "action");
      invokeCalls += 1;
      if (invokeThrows) throw new Error("probe failure");
      if (root.settings.qKey && keyState.readPressed("q")) {
        if (currentCapacity > 0) {
          root.queue.queue.push({
            id: "city-farm",
            q: 1,
            qs: 1,
            label: "temporary",
          });
        }
        return { ok: true, value: undefined };
      }
      actualCalls += 1;
      root.city.farm.count += 1;
      return { ok: true, value: undefined };
    },
    capturedElementIds: () => ["city-farm"],
  };
  const keyboard = {
    readGameKeyboardHandlers: () => ({
      keyDown: (init) =>
        documentStub.dispatchEvent({ type: "keydown", ...init }),
      keyUp: (init) => documentStub.dispatchEvent({ type: "keyup", ...init }),
      moveAll: null,
    }),
  };
  const panels = {
    open: (request) => {
      opens.push(request);
      if (!workspace) return undefined;
      return {
        discard: () => true,
        release: () => {
          released += 1;
        },
        isIntact: () => true,
      };
    },
  };
  const mountSuppression = {
    available: true,
    withoutMounting: (draw) => draw(),
  };
  const source = {
    readRoot: () => root,
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  };
  const capacityReader = createCapturedBuildCapacity({
    rootState: source,
    controls,
    panels,
    mountSuppression,
    keyboard,
    keyState,
    readEpoch: () => epoch,
    nowMs: () => now,
    diagnostics,
  });
  return {
    root,
    initial,
    keyState,
    capacityReader,
    diagnostics,
    setCapacity: (value) => {
      currentCapacity = value;
    },
    advance: (ms) => {
      now += ms;
    },
    replaceRootEpoch: () => {
      epoch = String(Number(epoch) + 1);
    },
    stats: () => ({ actualCalls, invokeCalls, opens, released }),
  };
}

// An accepted unit is the semantic true, and the real action body is never called.
{
  const fixture = makeFixture();
  assert.equal(fixture.capacityReader.canBuildAnother("city-farm"), true);
  assert.equal(fixture.stats().actualCalls, 0);
  assert.deepEqual(fixture.root, fixture.initial);
  assert.equal(fixture.keyState.readPressed("q"), false);
  assert.deepEqual(fixture.stats().opens, [
    { keep: "msgQueue", scratch: "buildQueue" },
  ]);
  assert.equal(fixture.stats().released, 1);
}

// A cap rejection is false, with the queue and every input restored.
{
  const fixture = makeFixture({ capacity: 0 });
  const before = structuredClone(fixture.root);
  assert.equal(fixture.capacityReader.canBuildAnother("city-farm"), false);
  assert.deepEqual(fixture.root, before);
  assert.equal(fixture.keyState.readPressed("q"), false);
}

// Existing queue entries, including their fields and order, survive an accepted probe unchanged.
{
  const fixture = makeFixture();
  const existing = { id: "other", q: 2, qs: 1, marker: "keep" };
  fixture.root.queue.max = 2;
  fixture.root.queue.queue.push(existing);
  const before = structuredClone(fixture.root);
  assert.equal(fixture.capacityReader.canBuildAnother("city-farm"), true);
  assert.deepEqual(fixture.root, before);
  assert.equal(fixture.root.queue.queue[0], existing);
}

// Exceptions do not leak the forced flags, queue unit, key press, or workspace.
{
  const fixture = makeFixture({ invokeThrows: true });
  const before = structuredClone(fixture.root);
  assert.equal(fixture.capacityReader.canBuildAnother("city-farm"), undefined);
  assert.deepEqual(fixture.root, before);
  assert.equal(fixture.keyState.readPressed("q"), false);
  assert.equal(fixture.stats().released, 1);
  assert.equal(fixture.diagnostics.counts.get("build-capacity.unsupported"), 1);
}

// The bounded cache is action-local and is invalidated by target progress and root replacement.
{
  const fixture = makeFixture();
  assert.equal(fixture.capacityReader.canBuildAnother("city-farm"), true);
  assert.equal(fixture.capacityReader.canBuildAnother("city-farm"), true);
  assert.equal(fixture.stats().invokeCalls, 1);
  assert.equal(fixture.diagnostics.counts.get("build-capacity.cache-hit"), 1);
  fixture.setCapacity(0);
  fixture.root.city.farm.count = 1;
  assert.equal(fixture.capacityReader.canBuildAnother("city-farm"), false);
  fixture.replaceRootEpoch();
  assert.equal(fixture.capacityReader.canBuildAnother("city-farm"), false);
  assert.equal(fixture.stats().invokeCalls, 3);
}

// Missing DOM workspace or key observation is unsupported rather than an unsafe fallback.
{
  const fixture = makeFixture({ workspace: false });
  assert.equal(fixture.capacityReader.canBuildAnother("city-farm"), undefined);
  assert.equal(fixture.stats().invokeCalls, 0);
  const noKey = makeFixture({ keyStateAvailable: false });
  assert.equal(noKey.capacityReader.canBuildAnother("city-farm"), undefined);
}

console.log("captured-build-capacity ok");
