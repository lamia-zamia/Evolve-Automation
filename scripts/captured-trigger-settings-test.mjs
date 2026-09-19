import assert from "node:assert/strict";

import { CAPTURED_OVERRIDE_OPERAND_TYPES } from "../src/adapters/evolve/captured-override-evaluation.ts";
import {
  readCapturedTriggerActionInputs,
  readCapturedTriggerBooleanChecks,
  readCapturedTriggerChecksCatalog,
  readCapturedTriggerRows,
} from "../src/adapters/evolve/progression/build/captured-trigger-settings-catalog.ts";
import { createCapturedTriggerSettingsAdapter } from "../src/adapters/evolve/progression/build/captured-trigger-settings.ts";
import { createRecordSettingsLifecycle } from "./test-support/captured-settings.mjs";

function rowsOf(triggers) {
  return readCapturedTriggerRows(() => ({ triggers }));
}

// Rows render in priority order with the stored position as the fallback.
assert.deepEqual(
  rowsOf([
    {
      seq: 5,
      priority: 1,
      requirementType: "BuildingCount",
      requirementId: "city-farm",
      requirementCount: 2,
      actionType: "build",
      actionId: "city-farm",
      actionCount: 2,
    },
    {
      seq: 3,
      priority: 0,
      requirementType: "Boolean",
      requirementId: false,
      requirementCount: true,
      actionType: "research",
      actionId: "tech-club",
      actionCount: 0,
    },
  ]).map((row) => [row.seq, row.requirementType]),
  [
    [3, "Boolean"],
    [5, "BuildingCount"],
  ],
);

// A missing seq falls back to the stored position; malformed rows are dropped
// from the view while the raw entries stay in place.
const mixed = [
  {
    priority: 0,
    requirementType: "Boolean",
    requirementId: true,
    requirementCount: true,
    actionType: "research",
    actionId: "tech-club",
    actionCount: 0,
  },
  "broken",
  {
    seq: 9,
    priority: 1,
    requirementType: "BuildingCount",
    requirementId: "city-farm",
  },
  {
    seq: 10,
    priority: 2,
    requirementType: 7,
    requirementId: "city-farm",
    requirementCount: 1,
    actionType: "build",
    actionId: "city-farm",
    actionCount: 1,
  },
  {
    seq: 11,
    priority: 3,
    requirementType: "BuildingCount",
    requirementId: "city-farm",
    requirementCount: { nested: true },
    actionType: "build",
    actionId: "city-farm",
    actionCount: 1,
  },
];
const viewed = rowsOf(mixed);
assert.deepEqual(
  viewed.map((row) => row.seq),
  [0],
);
assert.equal(mixed.length, 5);
assert.deepEqual(
  readCapturedTriggerRows(() => ({})),
  [],
);
assert.deepEqual(
  readCapturedTriggerRows(() => null),
  [],
);
assert.ok(Object.isFrozen(viewed));

// Every condition the captured evaluator answers is offered; the legacy
// override-only checks are not captured-answered and stay absent.
const checks = readCapturedTriggerChecksCatalog();
assert.deepEqual(
  Object.keys(checks).sort(),
  [...CAPTURED_OVERRIDE_OPERAND_TYPES].sort(),
);
assert.equal(checks["chain"], undefined);
assert.equal(checks["String"], undefined);
assert.equal(checks["Number"], undefined);
assert.equal(checks["Eval"], undefined);
for (const check of Object.values(checks)) {
  assert.equal(check.options, null);
  assert.ok(check.description.length > 0);
}
// Only Boolean keeps a checkbox value: every other value is an id string, and
// a text widget must not decay a real boolean into the string "false".
assert.equal(checks["Boolean"].arg, "boolean");
assert.equal(checks["BuildingCount"].arg, "string");
assert.equal(checks["ResourceQuantity"].arg, "string");

assert.deepEqual(readCapturedTriggerActionInputs(), {
  research: { arg: "string", options: null },
  building: { arg: "string", options: null },
  project: { arg: "string", options: null },
});

const booleans = readCapturedTriggerBooleanChecks();
assert.ok(booleans.includes("BuildingUnlocked"));
assert.ok(booleans.includes("Boolean"));
assert.ok(!booleans.includes("ResourceQuantity"));
assert.ok(!booleans.includes("BuildingCount"));
for (const type of booleans) assert.ok(checks[type] !== undefined);

const raw = {
  autoTrigger: true,
  triggers: [
    {
      seq: 0,
      priority: 0,
      requirementType: "BuildingCount",
      requirementId: "space-moon_base",
      requirementCount: 1,
      actionType: "build",
      actionId: "space-iridium_mine",
      actionCount: 1,
      complete: true,
    },
  ],
};
const prompts = [];
const adapter = createCapturedTriggerSettingsAdapter({
  getSettingsRaw: () => raw,
  promptEval: (message, value) => prompts.push([message, value]),
});

const model = adapter.readTriggerSettingsReadModel();
assert.equal(model.sectionId, "trigger");
assert.equal(model.sectionName, "Trigger");
assert.equal(model.rows.length, 1);
assert.equal(model.checks["BuildingCount"].arg, "string");

adapter.addDefault();
assert.deepEqual(raw.triggers[1], {
  seq: 1,
  priority: 1,
  requirementType: "Boolean",
  requirementId: false,
  requirementCount: 1,
  actionType: "research",
  actionId: "tech-club",
  actionCount: 0,
  complete: false,
});

// Edits reset the dependent fields and clear completion, like the panel writer.
adapter.update(0, "requirementId", "city-farm");
assert.equal(raw.triggers[0].requirementId, "city-farm");
assert.equal(raw.triggers[0].complete, false);
adapter.update(0, "requirementType", "ResourceQuantity");
assert.equal(raw.triggers[0].requirementId, false);
assert.equal(raw.triggers[0].requirementCount, 1);
adapter.update(0, "actionType", "arpa");
assert.equal(raw.triggers[0].actionId, "");
assert.equal(raw.triggers[0].actionCount, 0);
adapter.update(99, "actionType", "build");
assert.equal(raw.triggers.length, 2);

// Evalize shows the Eval form for copying and discards the prompt result.
adapter.evalize(0);
assert.deepEqual(prompts, [
  ["Eval of this condition:", '_("ResourceQuantity",false)'],
]);
raw.triggers[0].requirementType = "Eval";
raw.triggers[0].requirementId = "game.global.resource.Food.amount > 0";
adapter.evalize(0);
assert.equal(prompts[1][1], "game.global.resource.Food.amount > 0");
adapter.evalize(99);
assert.equal(prompts.length, 2);

// Duplicate inserts the clone before the source and renumbers by position.
adapter.duplicate(1);
assert.equal(raw.triggers.length, 3);
assert.deepEqual(
  raw.triggers.map((row) => [row.seq, row.priority, row.actionId]),
  [
    [0, 0, ""],
    [1, 1, "tech-club"],
    [2, 2, "tech-club"],
  ],
);
assert.equal(raw.triggers[1].complete, false);
adapter.duplicate(99);
assert.equal(raw.triggers.length, 3);

adapter.reorder([2, 0, 1]);
assert.deepEqual(
  raw.triggers.map((row) => row.priority),
  [1, 2, 0],
);
assert.deepEqual(
  raw.triggers.map((row) => row.seq),
  [0, 1, 2],
);

adapter.remove(1);
assert.deepEqual(
  raw.triggers.map((row) => [row.seq, row.priority]),
  [
    [0, 0],
    [1, 1],
  ],
);
adapter.remove(99);
assert.equal(raw.triggers.length, 2);

const sectionLifecycle = createRecordSettingsLifecycle({
  raw,
  rootState: { readRoot: () => ({}) },
  controls: { resolve: () => undefined, capturedElementIds: () => [] },
});

sectionLifecycle.resetSection("trigger");
assert.deepEqual(raw.triggers, []);
assert.equal(raw.autoTrigger, false);

// Mutations without a stored list are no-ops rather than crashes.
const empty = {};
const quiet = createCapturedTriggerSettingsAdapter({
  getSettingsRaw: () => empty,
});
quiet.addDefault();
quiet.update(0, "actionType", "build");
quiet.remove(0);
quiet.duplicate(0);
quiet.evalize(0);
quiet.reorder([0]);
assert.deepEqual(empty, {});

console.log("captured trigger settings ok");
