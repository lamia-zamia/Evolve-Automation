import assert from "node:assert/strict";

import {
  requireArray,
  requireBoolean,
  requireFunction,
  requireNumber,
  requireRecord,
  requireString,
} from "../src/adapters/validation.ts";

function messageOf(run) {
  try {
    run();
  } catch (error) {
    return error.message;
  }
  throw new Error("expected the validator to throw");
}

// The reason this reporting exists: a NaN read out of the live game used to be
// indistinguishable from an absent or mistyped one, so a crash report could not
// name the defect and a page refresh destroyed the evidence.
assert.equal(
  messageOf(() => requireNumber(Number.NaN, "WarManager.maxSoldiers")),
  "WarManager.maxSoldiers must be a finite number, got number NaN",
);
assert.equal(
  messageOf(() => requireNumber(undefined, "WarManager.maxSoldiers")),
  "WarManager.maxSoldiers must be a finite number, got undefined",
);
assert.equal(
  messageOf(() => requireNumber(null, "WarManager.maxSoldiers")),
  "WarManager.maxSoldiers must be a finite number, got null",
);
assert.equal(
  messageOf(() => requireNumber("5", "WarManager.maxSoldiers")),
  'WarManager.maxSoldiers must be a finite number, got string "5"',
);
assert.equal(
  messageOf(() =>
    requireNumber(Number.POSITIVE_INFINITY, "WarManager.maxSoldiers"),
  ),
  "WarManager.maxSoldiers must be a finite number, got number Infinity",
);

assert.equal(
  messageOf(() => requireRecord(null, "game.global")),
  "game.global must be an object, got null",
);
assert.equal(
  messageOf(() => requireString(7, "settings.name")),
  "settings.name must be a string, got number 7",
);
assert.equal(
  messageOf(() => requireBoolean(0, "settings.enabled")),
  "settings.enabled must be a boolean, got number 0",
);
assert.equal(
  messageOf(() => requireArray({}, "shipyard.ships")),
  "shipyard.ships must be an array, got object Object",
);
assert.equal(
  messageOf(() => requireFunction(undefined, "buildings.X.isUnlocked")),
  "buildings.X.isUnlocked must be a function, got undefined",
);

// A rejected value is never dumped: the game state behind it is enormous, and
// reading it can run game code.
const ships = [{ class: "corvette" }, { class: "frigate" }];
assert.equal(
  messageOf(() => requireNumber(ships, "WarManager.crew")),
  "WarManager.crew must be a finite number, got array(2)",
);

class Ship {}
assert.equal(
  messageOf(() => requireNumber(new Ship(), "WarManager.crew")),
  "WarManager.crew must be a finite number, got object Ship",
);

const longText = "x".repeat(200);
const truncated = messageOf(() => requireNumber(longText, "settings.note"));
assert.ok(truncated.length < 120, `message was not truncated: ${truncated}`);
assert.ok(truncated.endsWith('…"'), truncated);

// Describing a value must not itself throw, or the real defect is replaced by a
// crash inside the error path. Vue reactive proxies make this reachable.
const hostile = new Proxy(
  {},
  {
    get() {
      throw new Error("reactive getter exploded");
    },
  },
);
assert.equal(
  messageOf(() => requireNumber(hostile, "WarManager.crew")),
  "WarManager.crew must be a finite number, got object",
);

assert.equal(
  messageOf(() => requireNumber(Object.create(null), "WarManager.crew")),
  "WarManager.crew must be a finite number, got object",
);

// Values that pass are returned untouched.
assert.equal(requireNumber(0, "zero"), 0);
assert.equal(requireString("", "empty"), "");
assert.equal(requireBoolean(false, "off"), false);

console.log("Adapter validation reporting tests passed");
