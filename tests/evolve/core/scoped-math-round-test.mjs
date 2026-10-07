import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { probeScopedMathRound } from "../../../src/adapters/evolve/scoped-math-round.ts";

const page = runInNewContext("({ Math })");
const original = Object.getOwnPropertyDescriptor(page.Math, "round");
assert.equal(page.Math.round(9.5), 10);
let callbackResult;
const values = probeScopedMathRound(page, () => {
  callbackResult = [
    page.Math.round(-1.5),
    page.Math.round(-1.6),
    page.Math.round(2.5),
  ];
});
assert.deepEqual(callbackResult, [-1, -2, 3]);
assert.deepEqual(values, [
  { input: -1.5, result: -1 },
  { input: -1.6, result: -2 },
  { input: 2.5, result: 3 },
]);
assert.deepEqual(Object.getOwnPropertyDescriptor(page.Math, "round"), original);
assert.equal(
  probeScopedMathRound(page, () => {
    Object.defineProperty(page.Math, "round", { ...original, value: () => 99 });
  }),
  undefined,
);
assert.deepEqual(Object.getOwnPropertyDescriptor(page.Math, "round"), original);
assert.equal(page.Math.round(3.5), 4);
assert.equal(values.length, 3);
assert.equal(
  probeScopedMathRound(page, () => {
    assert.equal(
      probeScopedMathRound(page, () => {}),
      undefined,
    );
  }).length,
  0,
);
assert.equal(
  probeScopedMathRound(page, () => {
    throw new Error("native closure");
  }),
  undefined,
);
assert.deepEqual(Object.getOwnPropertyDescriptor(page.Math, "round"), original);
assert.equal(
  probeScopedMathRound(page, () => page.Math.round(Number.NaN)),
  undefined,
);
assert.deepEqual(Object.getOwnPropertyDescriptor(page.Math, "round"), original);
