import assert from "node:assert/strict";
import { createOverrideFailureReporter } from "../src/adapters/evolve/override-failure-log.ts";

let windowOpen = false;
let recordShownMessages = false;
const logged = [];
const lastMsgAll = {};

const reporter = createOverrideFailureReporter({
  getGameModal: () => ({ isOpen: () => windowOpen }),
  getGame: () => ({ global: { lastMsg: { all: lastMsgAll } } }),
  getGameLog: () => ({
    logDanger: (kind, message, categories) => {
      logged.push({ kind, message, categories });
      if (recordShownMessages) {
        lastMsgAll[`m${logged.length}`] = { m: message };
      }
    },
  }),
});

const unknownOperand = {
  settingKey: "autoBuild",
  conditionNumber: 1,
  reason: { kind: "unknown-operand-type", operandType: "Missing" },
};
const typeMismatch = {
  settingKey: "tickRate",
  conditionNumber: 2,
  reason: { kind: "type-mismatch", expected: "number", actual: "string" },
};

// --- Each failure becomes one danger message naming its setting and condition number ---
reporter.report([unknownOperand, typeMismatch]);
assert.equal(logged.length, 2);
assert.deepEqual(logged[0], {
  kind: "special",
  message:
    "Condition 1 for setting autoBuild invalid! Fix or remove it. (Missing variable not found)",
  categories: ["events", "major_events"],
});
assert.match(logged[1].message, /^Condition 2 for setting tickRate invalid!/);
logged.length = 0;

// --- Nothing is logged while a script window is open ---
windowOpen = true;
reporter.report([unknownOperand]);
assert.equal(logged.length, 0);
windowOpen = false;

// --- An empty report is not a game read at all ---
reporter.report([]);
assert.equal(logged.length, 0);

// --- A message left on screen by an earlier pass is not repeated ---
recordShownMessages = true;
reporter.report([unknownOperand]);
reporter.report([unknownOperand]);
assert.equal(logged.length, 1);
// A different failure still gets through while the first is on screen.
reporter.report([unknownOperand, typeMismatch]);
assert.equal(logged.length, 2);
assert.match(logged[1].message, /^Condition 2 for setting tickRate invalid!/);

console.log("Override failure log adapter tests passed");
