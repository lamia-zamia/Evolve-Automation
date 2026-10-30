import assert from "node:assert/strict";
import { countNativeTraceCalls } from "../../experiments/p54-1-activation-lifecycle-correction-evidence.mjs";

const trace = [
  { order: 0, period: 720, elementId: "buildQueue", method: "setData" },
  { order: 1, period: 720, elementId: "buildQueue", method: "setData" },
  { order: 2, period: 720, elementId: "buildQueue", method: "setData" },
  { order: 3, period: 720, elementId: "buildQueue", method: "setData" },
  { order: 4, period: 720, elementId: "city-rock_quarry", method: "action" },
  { order: 5, period: 720, elementId: "city-rock_quarry", method: "action" },
];

assert.deepEqual(
  countNativeTraceCalls(
    trace,
    (entry) =>
      entry.period === 720 &&
      entry.elementId === "buildQueue" &&
      entry.method === "setData",
  ),
  { rawTraceRows: 4, nativeApiInvocations: 2 },
);
assert.deepEqual(countNativeTraceCalls(trace), {
  rawTraceRows: 6,
  nativeApiInvocations: 3,
});
assert.throws(() => countNativeTraceCalls(trace.slice(0, -1)), /call pairs/);
assert.throws(
  () =>
    countNativeTraceCalls([
      ...trace.slice(0, 2),
      { ...trace[2], order: 8 },
      trace[3],
    ]),
  /identify one native call/,
);
assert.throws(
  () => countNativeTraceCalls([trace[0], { ...trace[1], method: "action" }]),
  /identify one native call/,
);

console.log("ok P54.1 native trace row and API invocation accounting");
