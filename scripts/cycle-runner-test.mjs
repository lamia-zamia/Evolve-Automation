import assert from "node:assert/strict";

import { createCycleRunner } from "../src/application/cycle-runner.ts";
import { createSnapshotMetadata } from "../src/domain/snapshot.ts";

const calls = [];
const clockValues = [10, 11, 12, 13, 14, 15];
const snapshot = Object.freeze({
  metadata: createSnapshotMetadata({ id: "snapshot-7", capturedAtMs: 9 }),
  taxRate: 10,
});
const settings = Object.freeze({ enabled: true });
const commands = [
  {
    kind: "adjust-tax-rate",
    expectedRate: 10,
    batches: [{ operations: [{ direction: "increase", count: 1 }] }],
  },
  {
    kind: "adjust-tax-rate",
    expectedRate: 10,
    batches: [{ operations: [{ direction: "increase", count: 2 }] }],
  },
  {
    kind: "adjust-tax-rate",
    expectedRate: 10,
    batches: [{ operations: [{ direction: "increase", count: 3 }] }],
  },
];
let gameReads = 0;
let settingsReads = 0;

const logger = {
  record: (event) => calls.push(`log:${event.kind}`),
};
const publisher = {
  publish: (trace) => calls.push(`publish:${trace.results.length}`),
};
const { runCycle } = createCycleRunner({
  clock: { nowMs: () => clockValues.shift() },
  gameReader: {
    readSnapshot: () => {
      gameReads += 1;
      return snapshot;
    },
  },
  settingsReader: {
    readSettings: () => {
      settingsReads += 1;
      return settings;
    },
  },
  commandExecutor: {
    execute: (envelope) => {
      calls.push(`execute:${envelope.command.batches[0].operations[0].count}`);
      return { status: "succeeded" };
    },
  },
  logger,
  publisher,
  phases: [
    {
      name: "civic",
      planners: [
        {
          name: "tax-a",
          plan: (receivedSnapshot, receivedSettings) => {
            assert.equal(receivedSnapshot, snapshot);
            assert.equal(receivedSettings, settings);
            calls.push("plan:a");
            return commands.slice(0, 1);
          },
        },
        {
          name: "tax-b",
          plan: (receivedSnapshot, receivedSettings) => {
            assert.equal(receivedSnapshot, snapshot);
            assert.equal(receivedSettings, settings);
            calls.push("plan:b");
            return commands.slice(1);
          },
        },
      ],
    },
  ],
  getConflictKey: (command) =>
    command.batches[0].operations[0].count === 2
      ? "tax"
      : `tax-${command.batches[0].operations[0].count}`,
  maxCommandsPerCycle: 2,
});

const trace = runCycle();
assert.equal(gameReads, 1);
assert.equal(settingsReads, 1);
assert.deepEqual(calls, [
  "log:cycle-started",
  "plan:a",
  "plan:b",
  "execute:1",
  "log:command-completed",
  "execute:2",
  "log:command-completed",
  "log:command-completed",
  "publish:3",
  "log:cycle-completed",
]);
assert.equal(trace.cycleId, "cycle-1");
assert.equal(trace.snapshotId, "snapshot-7");
assert.equal(trace.startedAtMs, 10);
assert.equal(trace.completedAtMs, 14);
assert.deepEqual(
  trace.results.map(({ status, envelope }) => [
    status,
    envelope.id,
    envelope.expectedSnapshotId,
  ]),
  [
    ["succeeded", "cycle-1:command-1", "snapshot-7"],
    ["succeeded", "cycle-1:command-2", "snapshot-7"],
    ["rejected", "cycle-1:command-3", "snapshot-7"],
  ],
);
assert.deepEqual(trace.results[2].failure, {
  code: "command-limit",
  message: "cycle command limit reached",
  context: { commandIndex: 2, maximum: 2 },
});
assert.deepEqual(trace.phases, [
  {
    phase: "civic",
    planners: [
      { planner: "tax-a", commandCount: 1 },
      { planner: "tax-b", commandCount: 2 },
    ],
  },
]);

assert.throws(
  () =>
    createCycleRunner({
      clock: { nowMs: () => 0 },
      gameReader: { readSnapshot: () => snapshot },
      settingsReader: { readSettings: () => settings },
      commandExecutor: { execute: () => ({ status: "succeeded" }) },
      logger,
      publisher,
      phases: [],
      getConflictKey: () => null,
      maxCommandsPerCycle: -1,
    }),
  /non-negative integer/,
);

function createOutcomeRunner({ execute, getConflictKey, plannedCommands }) {
  let now = 20;
  return createCycleRunner({
    clock: { nowMs: () => now++ },
    gameReader: { readSnapshot: () => snapshot },
    settingsReader: { readSettings: () => settings },
    commandExecutor: { execute },
    logger: { record: () => {} },
    publisher: { publish: () => {} },
    phases: [
      {
        name: "test",
        planners: [{ name: "test-planner", plan: () => plannedCommands }],
      },
    ],
    getConflictKey,
    maxCommandsPerCycle: 10,
  });
}

const conflictExecutions = [];
const conflictTrace = createOutcomeRunner({
  execute: (envelope) => {
    conflictExecutions.push(envelope.command.batches[0].operations[0].count);
    return { status: "succeeded" };
  },
  getConflictKey: () => "tax-rate",
  plannedCommands: commands.slice(0, 2),
}).runCycle();
assert.deepEqual(conflictExecutions, [1]);
assert.deepEqual(
  conflictTrace.results.map((result) => result.status),
  ["succeeded", "rejected"],
);
assert.deepEqual(conflictTrace.results[1].failure, {
  code: "command-conflict",
  message: "conflict on tax-rate",
  context: { conflictKey: "tax-rate" },
});

let execution = 0;
const failureTrace = createOutcomeRunner({
  execute: () => {
    execution += 1;
    if (execution === 1) {
      return {
        status: "stale",
        failure: {
          code: "stale-tax-rate",
          message: "tax rate changed",
          context: { expected: 10, actual: 11 },
        },
      };
    }
    throw new Error("adapter failure");
  },
  getConflictKey: () => null,
  plannedCommands: commands.slice(0, 2),
}).runCycle();
assert.equal(failureTrace.results[0].status, "stale");
assert.deepEqual(failureTrace.results[0].failure, {
  code: "stale-tax-rate",
  message: "tax rate changed",
  context: { expected: 10, actual: 11 },
});
assert.equal(failureTrace.results[1].status, "rejected");
assert.deepEqual(failureTrace.results[1].failure, {
  code: "executor-error",
  message: "adapter failure",
});

console.log("Deterministic cycle runner tests passed");
