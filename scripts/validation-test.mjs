import assert from "node:assert/strict";

import {
  callBoolean,
  callNumber,
  callVoid,
  isFiniteNumber,
  isNonArrayRecord,
  isNonNegativeNumber,
  isRecord,
  requireArray,
  requireBoolean,
  requireCount,
  requireFunction,
  requireNonArrayRecord,
  requireNonEmptyString,
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

// The two guards differ only in whether an array counts as a keyed bag. `isRecord`
// is the non-throwing form of `requireRecord`, which accepts one.
assert.equal(isRecord({}), true);
assert.equal(isRecord([]), true);
assert.equal(isRecord(null), false);
assert.equal(isRecord(undefined), false);
assert.equal(
  isRecord(() => 0),
  false,
);
assert.equal(isRecord("game"), false);
assert.equal(isNonArrayRecord({}), true);
assert.equal(isNonArrayRecord([]), false);
assert.equal(isNonArrayRecord(null), false);

// The numeric guards reject what a live game field can hold besides a number.
assert.equal(isFiniteNumber(0), true);
assert.equal(isFiniteNumber(-1), true);
assert.equal(isFiniteNumber(Number.NaN), false);
assert.equal(isFiniteNumber(Number.POSITIVE_INFINITY), false);
assert.equal(isFiniteNumber("5"), false);
assert.equal(isFiniteNumber(undefined), false);
assert.equal(isNonNegativeNumber(0), true);
assert.equal(isNonNegativeNumber(-1), false);
assert.equal(isNonNegativeNumber(Number.NaN), false);
assert.equal(isNonNegativeNumber(Number.POSITIVE_INFINITY), false);

// A method call is bound to the record it was read from, so a game method reading
// its own fields through `this` sees them.
const manager = {
  fuel: 3,
  hasFuel() {
    return this.fuel;
  },
  maxOperating(bonus) {
    return this.fuel + bonus;
  },
  broken() {
    return Number.NaN;
  },
};
assert.equal(callBoolean(manager, "hasFuel", "SmelterManager"), true);
assert.equal(callNumber(manager, "maxOperating", "SmelterManager", 4), 7);

// The result is coerced for predicates and validated for numbers.
assert.equal(callBoolean({ off: () => 0 }, "off", "Manager"), false);
assert.equal(
  messageOf(() => callNumber(manager, "broken", "SmelterManager")),
  "SmelterManager.broken() must be a finite number, got number NaN",
);

// A missing method names its full path rather than failing as "not a function".
assert.equal(
  messageOf(() => callBoolean(manager, "isUnlocked", "SmelterManager")),
  "SmelterManager.isUnlocked must be a function, got undefined",
);
assert.equal(
  messageOf(() => callNumber(manager, "fuel", "SmelterManager")),
  "SmelterManager.fuel must be a function, got number 3",
);

// A void call passes its arguments and receiver like the others and discards
// whatever the method answered, including a value the others would reject.
const effects = [];
const controls = {
  id: "bay",
  drag(from, to) {
    effects.push(`${this.id}:${from}->${to}`);
    return Number.NaN;
  },
};
assert.equal(callVoid(controls, "drag", "MechManager", 3, 1), undefined);
assert.deepEqual(effects, ["bay:3->1"]);
assert.equal(
  messageOf(() => callVoid(controls, "scrap", "MechManager")),
  "MechManager.scrap must be a function, got undefined",
);

// A non-empty string rejects the empty string that `requireString` accepts, because
// every caller uses the result to look something up.
assert.equal(requireNonEmptyString("Iron", "resource.id"), "Iron");
assert.equal(requireString("", "resource.id"), "");
assert.equal(
  messageOf(() => requireNonEmptyString("", "resource.id")),
  'resource.id must be a non-empty string, got string ""',
);
assert.equal(
  messageOf(() => requireNonEmptyString(undefined, "resource.id")),
  "resource.id must be a non-empty string, got undefined",
);
assert.equal(
  messageOf(() => requireNonEmptyString(5, "resource.id")),
  "resource.id must be a non-empty string, got number 5",
);

// A keyed game bag rejects the array that `requireRecord` accepts, which would
// otherwise pass as a record whose keys are its indices.
const bag = { Types: 1 };
assert.equal(requireNonArrayRecord(bag, "GameLog"), bag);
assert.equal(
  messageOf(() => requireNonArrayRecord([1, 2], "GameLog")),
  "GameLog must be an object, got array(2)",
);
assert.equal(
  messageOf(() => requireNonArrayRecord(null, "GameLog")),
  "GameLog must be an object, got null",
);

// A count is a whole, non-negative, exactly representable number.
assert.equal(requireCount(0, "Manager.maxOperating()"), 0);
assert.equal(requireCount(7, "Manager.maxOperating()"), 7);
for (const rejected of [
  -1,
  1.5,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.MAX_SAFE_INTEGER + 1,
  "3",
]) {
  assert.match(
    messageOf(() => requireCount(rejected, "Manager.maxOperating()")),
    /^Manager\.maxOperating\(\) must be a non-negative safe integer, got /,
  );
}

console.log("Adapter validation reporting tests passed");
