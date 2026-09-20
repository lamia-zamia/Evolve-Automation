import assert from "node:assert/strict";

import { planCapturedPowerProducers } from "../src/domain/economy/production/captured-power.ts";
import { createCapturedPowerProducerAutomation } from "../src/adapters/evolve/economy/production/captured-power-producers.ts";

assert.deepEqual(
  planCapturedPowerProducers({
    unlocked: true,
    surplus: -2,
    producers: [
      { id: "mill", count: 2, on: 1 },
      { id: "oil_power", count: 1, on: 1 },
    ],
  }),
  [{ producerId: "mill", maximumOn: 2 }],
);
assert.deepEqual(
  planCapturedPowerProducers({
    unlocked: false,
    surplus: -2,
    producers: [{ id: "mill", count: 2, on: 0 }],
  }),
  [],
);
assert.deepEqual(
  planCapturedPowerProducers({
    unlocked: true,
    surplus: 1,
    producers: [{ id: "mill", count: 2, on: 0 }],
  }),
  [],
);

/**
 * Drives the automation against a mutable fake root. `onInvoke` owns every state change an
 * activation is allowed to make, so a test can model a `power_on` that returns normally and does
 * nothing at all.
 */
function runPower({ root, onInvoke, generations = {}, rootAfter }) {
  const calls = [];
  let current = root;
  const outcome = createCapturedPowerProducerAutomation({
    rootState: { readRoot: () => current },
    controls: {
      resolve: (elementId) =>
        elementId in generations
          ? {
              elementId,
              generation: generations[elementId](),
              methods: ["power_on"],
            }
          : undefined,
      invoke: (handle, method) => {
        calls.push(`${handle.elementId}:${method}`);
        const result = onInvoke(handle, calls.length);
        if (rootAfter !== undefined) current = rootAfter(calls.length, current);
        return result ?? { ok: true, value: undefined };
      },
      capturedElementIds: () => Object.keys(generations),
    },
  }).run();
  return { outcome, calls };
}

const steady = (elementId) => ({ [elementId]: () => 1 });

// 1. one activation clears the deficit.
{
  const root = {
    city: { powered: true, power: -1, mill: { count: 2, on: 0 } },
  };
  const { outcome, calls } = runPower({
    root,
    generations: steady("city-mill"),
    onInvoke: () => {
      root.city.mill.on += 1;
      root.city.power = 1;
    },
  });
  assert.deepEqual(outcome, { status: "succeeded" });
  assert.deepEqual(calls, ["city-mill:power_on"]);
  assert.equal(root.city.mill.on, 1);
}

// 2. several verified activations are required in one pass.
{
  const root = {
    city: { powered: true, power: -3, mill: { count: 5, on: 0 } },
  };
  const { outcome, calls } = runPower({
    root,
    generations: steady("city-mill"),
    onInvoke: () => {
      root.city.mill.on += 1;
      root.city.power += 1;
    },
  });
  assert.deepEqual(outcome, { status: "succeeded" });
  assert.equal(calls.length, 3);
  assert.equal(root.city.mill.on, 3);
}

// 3. the permitted maximum stops the loop even while the deficit remains.
{
  const root = {
    city: { powered: true, power: -10, mill: { count: 2, on: 0 } },
  };
  const { outcome, calls } = runPower({
    root,
    generations: steady("city-mill"),
    onInvoke: () => {
      root.city.mill.on += 1;
    },
  });
  assert.deepEqual(outcome, { status: "succeeded" });
  assert.equal(calls.length, 2);
  assert.equal(root.city.mill.on, 2);
}

// 4. the critical regression: `power_on` returns normally and changes nothing.
{
  const root = {
    city: { powered: true, power: -10, mill: { count: 5, on: 0 } },
  };
  const { outcome, calls } = runPower({
    root,
    generations: steady("city-mill"),
    onInvoke: () => {},
  });
  assert.equal(outcome.status, "stale");
  assert.equal(outcome.failure.code, "captured-power-activation-unverified");
  assert.deepEqual(calls, ["city-mill:power_on"]);
  assert.equal(root.city.mill.on, 0);
  assert.equal(root.city.power, -10);
}

// 5. the producer's state disappears after the invocation.
{
  const root = {
    city: { powered: true, power: -5, mill: { count: 5, on: 0 } },
  };
  const { outcome, calls } = runPower({
    root,
    generations: steady("city-mill"),
    onInvoke: () => {
      delete root.city.mill;
    },
  });
  assert.equal(outcome.status, "stale");
  assert.equal(outcome.failure.code, "captured-power-state-changed");
  assert.equal(calls.length, 1);
}

// 6. the root is replaced after the invocation.
{
  const root = {
    city: { powered: true, power: -5, mill: { count: 5, on: 0 } },
  };
  const { outcome, calls } = runPower({
    root,
    generations: steady("city-mill"),
    onInvoke: () => {},
    rootAfter: () => ({
      city: { powered: true, power: -5, mill: { count: 5, on: 1 } },
    }),
  });
  assert.equal(outcome.status, "stale");
  assert.equal(outcome.failure.code, "captured-power-root-changed");
  assert.equal(calls.length, 1);
}

// 7. the control generation changes between activations.
{
  const root = {
    city: { powered: true, power: -5, mill: { count: 5, on: 0 } },
  };
  let generation = 1;
  const { outcome, calls } = runPower({
    root,
    generations: { "city-mill": () => generation },
    onInvoke: () => {
      root.city.mill.on += 1;
      root.city.power += 1;
      generation += 1;
    },
  });
  assert.equal(outcome.status, "stale");
  assert.equal(outcome.failure.code, "captured-power-control-redrawn");
  assert.equal(calls.length, 1);
}

// 8. the invocation itself reports failure.
{
  const root = {
    city: { powered: true, power: -5, mill: { count: 5, on: 0 } },
  };
  const { outcome, calls } = runPower({
    root,
    generations: steady("city-mill"),
    onInvoke: () => ({ ok: false, reason: "stale-control" }),
  });
  assert.equal(outcome.status, "rejected");
  assert.equal(outcome.failure.code, "captured-power-control-failed");
  assert.equal(calls.length, 1);
}

// 9. non-finite power state fails safely rather than looping.
{
  const root = {
    city: { powered: true, power: -5, mill: { count: 5, on: 0 } },
  };
  const { outcome, calls } = runPower({
    root,
    generations: steady("city-mill"),
    onInvoke: () => {
      root.city.power = Number.NaN;
    },
  });
  assert.equal(outcome.status, "stale");
  assert.equal(outcome.failure.code, "captured-power-state-changed");
  assert.equal(calls.length, 1);
}

// 10. a later producer is never attempted after an unverified action.
{
  const root = {
    city: { powered: true, power: -5, mill: { count: 5, on: 0 } },
    space: { geothermal: { count: 5, on: 0 } },
  };
  const { outcome, calls } = runPower({
    root,
    generations: { "city-mill": () => 1, "space-geothermal": () => 1 },
    onInvoke: () => {},
  });
  assert.equal(outcome.status, "stale");
  assert.equal(outcome.failure.code, "captured-power-activation-unverified");
  assert.deepEqual(calls, ["city-mill:power_on"]);
}

// A regional producer still activates through its own region-qualified element id.
{
  const root = {
    city: { powered: true, power: -1 },
    space: { geothermal: { count: 1, on: 0 } },
  };
  const { outcome, calls } = runPower({
    root,
    generations: steady("space-geothermal"),
    onInvoke: () => {
      root.space.geothermal.on += 1;
      root.city.power = 1;
    },
  });
  assert.deepEqual(outcome, { status: "succeeded" });
  assert.deepEqual(calls, ["space-geothermal:power_on"]);
}

console.log("captured-power-producers ok");
