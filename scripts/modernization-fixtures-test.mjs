import assert from "node:assert/strict";

import {
  createFixtureBuilder,
  createTraceRecorder,
} from "./test-support/modernization-fixtures.mjs";

const buildFixture = createFixtureBuilder({
  snapshot: { tax: { rate: 10, visible: true }, race: "human" },
  settings: { enabled: true, target: -1 },
  tags: ["base"],
});
const fixture = buildFixture({
  snapshot: { tax: { rate: 20 } },
  tags: ["override"],
});
assert.deepEqual(fixture, {
  snapshot: { tax: { rate: 20, visible: true }, race: "human" },
  settings: { enabled: true, target: -1 },
  tags: ["override"],
});
assert.equal(Object.isFrozen(fixture.snapshot.tax), true);
assert.throws(() => {
  fixture.snapshot.tax.rate = 30;
}, TypeError);

const recorder = createTraceRecorder();
recorder.managerCall("keys.set", { args: [false, false, false] });
recorder.command("tax.add", { count: 1 });
recorder.stateChange("morale.adjusted", { before: false, after: true });
recorder.log("tax-result", { level: "debug", status: "succeeded" });

const snapshot = recorder.snapshot();
assert.equal(snapshot.length, 4);
assert.equal(Object.isFrozen(snapshot), true);
assert.deepEqual(
  snapshot.map((event) => event.category),
  ["manager-call", "command", "state-change", "log"],
);
assert.throws(
  () => recorder.command("invalid", { callback() {} }),
  /plain data/,
);

console.log("Modernization fixture and trace helper tests passed");
