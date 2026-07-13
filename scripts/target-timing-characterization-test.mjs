import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
const sandbox = {
  __EA_TEST_HOOKS__: hooks,
  console,
  localStorage: { getItem: () => null },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  $: () => ({ ready() {} }),
};
sandbox.window = sandbox;
sandbox.window.location = "https://pmotschmann.github.io/Evolve/";

vm.runInNewContext(source, sandbox, {
  filename: "evolve_automation.user.js",
  timeout: 10_000,
});

assert.equal(typeof hooks.getMultiSegmentedTimeLeft, "function");
assert.equal(typeof hooks.makeTargetTimingProject, "function");
assert.equal(typeof hooks.setTargetTimingTestContext, "function");

hooks.setTargetTimingTestContext({
  game: {
    global: {
      resource: {
        Money: { amount: 20, diff: 10 },
        Stone: { amount: 0, diff: 5 },
        Knowledge: { amount: 0, diff: 0 },
      },
    },
  },
  poly: { timeFormat: (seconds) => `${seconds}s` },
});

assert.deepEqual(
  {
    ...hooks.getMultiSegmentedTimeLeft({
      gameMax: 5,
      count: 3,
      cost: { Money: 100, Stone: 10 },
    }),
  },
  { resource: "Money", timeLeft: "18s" },
);

const project = hooks.makeTargetTimingProject(40, 20, {
  Money: 100,
  Stone: 10,
});
assert.deepEqual(
  { ...hooks.getMultiSegmentedTimeLeft(project) },
  { resource: "Money", timeLeft: "28s" },
);

assert.deepEqual(
  {
    ...hooks.getMultiSegmentedTimeLeft({
      gameMax: 1,
      count: 0,
      cost: { Knowledge: 50 },
    }),
  },
  { resource: "Knowledge", timeLeft: "Never" },
);
assert.deepEqual(
  {
    ...hooks.getMultiSegmentedTimeLeft({
      gameMax: 1,
      count: 0,
      cost: { Money: 10 },
    }),
  },
  { resource: "", timeLeft: "0s" },
);

console.log("Target timing bundled characterization tests passed");
