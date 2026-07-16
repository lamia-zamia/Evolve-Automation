import assert from "node:assert/strict";

import {
  assertEquivalentTraces,
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

const legacyRecorder = createTraceRecorder();
legacyRecorder.managerCall("keys.set", { args: [false, false, false] });
legacyRecorder.command("tax.add", { snapshotId: "legacy-1", count: 1 });
legacyRecorder.stateChange("morale.adjusted", { before: false, after: true });
legacyRecorder.log("tax-result", { level: "debug", status: "succeeded" });

const modernRecorder = createTraceRecorder();
modernRecorder.managerCall("keys.set", { args: [false, false, false] });
modernRecorder.command("tax.add", { snapshotId: "modern-9", count: 1 });
modernRecorder.stateChange("morale.adjusted", { before: false, after: true });
modernRecorder.log("tax-result", { level: "debug", status: "succeeded" });

const compared = assertEquivalentTraces({
  legacy: legacyRecorder.snapshot(),
  modern: modernRecorder.snapshot(),
  normalizeEvent: (event) => {
    if (event.category === "command") event.details.snapshotId = "<snapshot>";
    return event;
  },
  label: "tax pilot",
});
assert.equal(Object.isFrozen(compared.modern), true);

const incomplete = modernRecorder.snapshot().slice(0, -1);
assert.throws(
  () =>
    assertEquivalentTraces({
      legacy: legacyRecorder.snapshot(),
      modern: incomplete,
      label: "complete tax trace",
    }),
  /complete tax trace differs/,
);
assert.throws(
  () => modernRecorder.command("invalid", { callback() {} }),
  /plain data/,
);

console.log("Modernization fixture and trace helper tests passed");
