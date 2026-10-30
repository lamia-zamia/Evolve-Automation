import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { createP56FoodWriterSnapshot } from "../../experiments/p56-food-stock-provenance.mjs";

const readJson = (url) =>
  JSON.parse(readFileSync(new URL(url, import.meta.url), "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const evidence = readJson(
  "../../experiments/p56-food-stock-provenance-evidence.json",
);
const mutations = readJson("../../experiments/p56-food-stock-mutations.json");
const p43 = readJson("../../experiments/p43-food-safe-jobs-timeline.json");
const p45 = readJson("../../experiments/p45-food-stock-timeline.json");
const nativeSnapshot = readFileSync(
  new URL("../../test-artifacts/game/evolve-deadspace.js", import.meta.url),
  "utf8",
);
const replayHarnessSource = readFileSync(
  new URL(
    "../../experiments/p38-quarry-production-validation-exact.mjs",
    import.meta.url,
  ),
);

assert.equal(
  evidence.pinnedGame,
  "pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f",
);
assert.equal(
  evidence.source.sourceSnapshotSha256,
  "05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7",
);
assert.equal(p43.pinnedGame, evidence.pinnedGame);
assert.equal(sha256(nativeSnapshot), evidence.source.sourceSnapshotSha256);
assert.equal(evidence.source.lineCountPreserved, true);
assert.equal(evidence.source.directWriteSites.length, 30);
assert.equal(evidence.source.writerTraceOverflow, false);
assert.equal(evidence.source.writerTraceErrors, 0);
assert.equal(evidence.transitions.count, 39);
assert.equal(evidence.transitions.p45ProseReportedEndpointStableCount, 28);
assert.equal(evidence.transitions.unchangedStarvationAndCivilianPopulation, 29);
assert.deepEqual(evidence.inputs.gatherAutomationPolicy, {
  clickLimitSetting: "buildingClickPerTick",
  buildingClickPerTick: 50,
  autoBuild: true,
  autoARPA: true,
  buildingAlwaysClick: false,
  sellFood: true,
  buyFood: false,
});
assert.equal(mutations.transitions.length, 39);
assert.equal(mutations.historicalTransitions.length, 39);
const resetTransitions = [];
for (let index = 1; index < p45.points.length; index += 1) {
  const before = p45.points[index - 1];
  const after = p45.points[index];
  if (before.foodStock < 40 && after.foodStock === 50)
    resetTransitions.push({ before, after });
}
assert.equal(resetTransitions.length, 39);
assert.equal(
  resetTransitions.filter(
    ({ before, after }) =>
      before.starvationCount === after.starvationCount &&
      before.civilianPopulation === after.civilianPopulation,
  ).length,
  29,
);
assert.equal(
  mutations.replayInputs.fixtureSha256,
  evidence.inputs.fixtureSha256,
);
assert.equal(
  mutations.replayInputs.settingsSha256,
  evidence.inputs.settingsSha256,
);
assert.equal(evidence.replay.periods, 10_000);
assert.equal(
  evidence.replay.cleanControlMatchesRetainedP43StateAndEvents,
  true,
);
assert.equal(evidence.replay.retainedNativeCallDigestsExact, false);
assert.equal(evidence.replay.sameReplayInputs, true);
assert.equal(evidence.replay.instrumentationParity, true);
assert.equal(
  sha256(replayHarnessSource),
  evidence.replay.replayHarnessCurrentSourceSha256,
);
assert.equal(evidence.replay.parity.checkpointCount, 123);
assert.equal(evidence.replay.parity.checkpointExactCount, 123);
assert.equal(evidence.replay.parity.eventsEqual, true);
assert.equal(evidence.replay.parity.finalExportEqual, true);
assert.equal(evidence.replay.parity.finalRngEqual, true);
assert.equal(evidence.replay.parity.nativeActionSequenceEqual, true);
assert.equal(evidence.replay.parity.interventionEventsEqual, true);
assert.equal(evidence.replay.nativeActionSequence.count, 108_698);
assert.equal(
  evidence.replay.nativeActionSequence.countUnit,
  "raw Chromium bridge trace records",
);
assert.equal(evidence.replay.nativeActionSequence.rawTraceRecords, 108_698);
assert.equal(
  evidence.replay.nativeActionSequence.sha256,
  "5e53745422c5194643d1d98012fb4bddd31aa3ec456466d124ef06a059c3b4be",
);
const nativeAccounting = evidence.replay.nativeInvocationAccounting;
assert.equal(nativeAccounting.armB.rawTraceRecords, 108_698);
assert.equal(nativeAccounting.armB.validatedNativeApiInvocations, 54_349);
assert.equal(nativeAccounting.armB.mutatingActionMethodInvocations, 2_149);
assert.equal(nativeAccounting.armB.readOnlyNativeCalls, 12_270);
assert.equal(nativeAccounting.armB.otherNativeControlMethodInvocations, 39_930);
assert.equal(nativeAccounting.armB.unknownMethods.length, 0);
assert.equal(
  nativeAccounting.armB.rawTraceSha256,
  "5e53745422c5194643d1d98012fb4bddd31aa3ec456466d124ef06a059c3b4be",
);
assert.equal(nativeAccounting.armB.historicalP43CheckpointCount, 123);
assert.equal(nativeAccounting.armB.historicalP43RawRecordCountsExact, true);
assert.equal(nativeAccounting.armB.historicalP43RawRecordHashesExact, true);
assert.equal(nativeAccounting.armB.reproducedP56InvocationCountsExact, true);
assert.equal(nativeAccounting.armB.reproducedP56InvocationHashesExact, true);
assert.equal(nativeAccounting.armB.transformedCountsExact, true);
assert.equal(nativeAccounting.armB.transformedHashesExact, true);
assert.deepEqual(nativeAccounting.foodRecoveryWindows, {
  count: 39,
  rawActionTraceRecords: 3_900,
  foodHarvestActionInvocations: 1_950,
  nativeFoodWriterMutations: 1_950,
  nativeFoodWriterDelta: 1_950,
});

for (const parity of [
  evidence.replay.controlRepeatParity,
  evidence.replay.instrumentedRepeatParity,
  evidence.replay.repeatedArmInstrumentationParity,
]) {
  assert.equal(parity.checkpointCount, 123);
  assert.equal(parity.checkpointExactCount, 123);
  assert.equal(parity.eventsEqual, true);
  assert.equal(parity.finalExportEqual, true);
  assert.equal(parity.finalRngEqual, true);
  assert.equal(parity.nativeActionSequenceEqual, true);
}

assert.equal(
  evidence.replay.control.runtimeBundleSha256,
  evidence.replay.instrumented.runtimeBundleSha256,
);
assert.equal(
  evidence.replay.control.policyBundleSha256,
  evidence.replay.instrumented.policyBundleSha256,
);
assert.equal(
  evidence.replay.control.p38PolicyBundleSha256,
  evidence.replay.instrumented.p38PolicyBundleSha256,
);
assert.equal(
  evidence.replay.control.replayHarnessSha256,
  evidence.replay.instrumented.replayHarnessSha256,
);

const transitionByPeriod = new Map(
  p45.points.map((point) => [point.period, point]),
);
for (const transition of mutations.transitions) {
  assert.equal(transition.phaseBoundary.exactWriterSlice, true, transition.id);
  assert.ok(transition.foodWriters.length > 0, transition.id);
  assert.equal(
    transition.writerDeltaMatchesObservedStockChange,
    true,
    transition.id,
  );
  assert.ok(
    Math.abs(transition.writerDelta - transition.observedNetStockChange) < 1e-8,
    transition.id,
  );
  assert.equal(
    transition.before.foodStock,
    transitionByPeriod.get(transition.fromPeriod).foodStock,
    transition.id,
  );
  assert.equal(
    transition.after.foodStock,
    transitionByPeriod.get(transition.toPeriod).foodStock,
    transition.id,
  );
  assert.ok(
    transition.phaseBoundary.sliceMethod.includes("P43") ||
      transition.phaseBoundary.sliceMethod.includes("checkpoint"),
    transition.id,
  );
  assert.equal(transition.foodActionWriterCount, 50, transition.id);
  assert.equal(transition.foodActionTraceRecordCount, 100, transition.id);
  assert.equal(transition.foodHarvestActionInvocationCount, 50, transition.id);
  assert.equal(transition.foodActionWriterDelta, 50, transition.id);
  assert.ok(transition.before.foodCapacity > 0, transition.id);
  assert.ok(transition.after.foodCapacity > 0, transition.id);
  assert.ok(transition.before.occupiedJobs, transition.id);
  assert.ok(transition.after.occupiedJobs, transition.id);
  assert.ok(transition.before.foodProduction > 0, transition.id);
  assert.ok(transition.before.foodConsumption > 0, transition.id);
  assert.ok(transition.supplyModes.includes("global"), transition.id);
  for (const writer of transition.foodWriters) {
    assert.ok(Number.isSafeInteger(writer.period), transition.id);
    assert.ok(writer.phase, transition.id);
    assert.ok(writer.writer, transition.id);
    assert.ok(writer.callsite, transition.id);
    assert.ok(Number.isFinite(writer.before), transition.id);
    assert.ok(Number.isFinite(writer.after), transition.id);
    assert.ok(Number.isFinite(writer.delta), transition.id);
    assert.ok(writer.poolScope, transition.id);
    assert.ok(writer.poolMode, transition.id);
    assert.ok(writer.cause, transition.id);
    assert.ok(writer.relevantInput, transition.id);
    assert.equal(writer.poolMode, "global", transition.id);
    assert.ok(writer.rootIdentity?.progressionGeneration, transition.id);
    if (writer.actionIdentity) {
      assert.equal(
        writer.actionIdentity,
        "native Food resource action invoked by existing Gather adapter",
        transition.id,
      );
      assert.equal(writer.requestedDelta, 1, transition.id);
      assert.equal(writer.delta, 1, transition.id);
      assert.match(writer.callsite, /evolve-deadspace\.js:116370:17/u);
    }
  }
}

const firstTransition = mutations.transitions.find(
  (transition) => transition.fromPeriod === 5384,
);
assert.equal(firstTransition.foodWriters.length, 57);
assert.ok(Math.abs(firstTransition.foodActionWriterDelta - 50) < 1e-8);
assert.ok(
  Math.abs(
    firstTransition.writerDelta - (50 + firstTransition.before.foodStock * -1),
  ) < 1e-8,
);
assert.equal(firstTransition.writerGroups.modRes.count, 57);

const checkpointTransition = mutations.transitions.find(
  (transition) => transition.fromPeriod === 5631,
);
assert.equal(checkpointTransition.foodWriters.length, 50);
assert.equal(checkpointTransition.foodActionWriterCount, 50);
assert.equal(checkpointTransition.writerDelta, 50);

const special = evidence.transitions.exhaustionStarvationSequence;
assert.deepEqual(special.interval, [5624, 5632]);
assert.equal(special.points.length, 9);
assert.equal(
  special.points.find((point) => point.period === 5626).foodStock,
  0,
);
assert.equal(
  special.points.find((point) => point.period === 5630).starvationCount,
  1,
);
assert.equal(
  special.points.find((point) => point.period === 5632).foodStock,
  50,
);
assert.equal(
  special.points.find((point) => point.period === 5632).starvationCount,
  1,
);
assert.equal(
  special.points.find((point) => point.period === 5632).civilianPopulation,
  3,
);
assert.equal(special.writerDeltaMatchesObservedStockChange, true);
assert.equal(special.foodWriters.length, 52);
assert.equal(special.foodActionTraceRecordCount, 100);
assert.equal(special.foodHarvestActionInvocationCount, 50);
assert.equal(special.foodActionWriterCount, 50);
assert.ok(Math.abs(special.writerDelta - 49.281421333333284) < 1e-8);
assert.ok(special.foodWriters.every((writer) => writer.writer === "modRes"));

const transformed = createP56FoodWriterSnapshot(nativeSnapshot, [
  [5384, 5392],
  [5624, 5632],
]);
assert.equal(transformed.wrappedFunctions.length, 6);
assert.equal(
  transformed.directWriteSites.length,
  evidence.source.directWriteSites.length,
);
assert.ok(
  transformed.directWriteSites.some(
    (site) =>
      site.line === 42367 &&
      site.operation === 'global["resource"][res].amount -= cost;',
  ),
);
assert.ok(
  transformed.directWriteSites.some(
    (site) => site.operation === "global.resource.Food.amount = 0;",
  ),
);
assert.ok(
  transformed.directWriteSites.some(
    (site) => site.operation === "global.resource.Food.amount = 1e4;",
  ),
);
assert.ok(
  transformed.directWriteSites.some(
    (site) => site.operation === 'global["resource"][res].amount -= cost;',
  ),
);
assert.equal(
  transformed.directWriteSites.some((site) =>
    site.operation.includes("Food.amount = 50"),
  ),
  false,
);
assert.ok(
  transformed.directWriteSites.some(
    (site) => site.operation === "global.resource[res].amount += amount;",
  ),
);
assert.ok(transformed.source.includes("__P56_FOOD_WRITES__"));
assert.ok(transformed.source.includes("global.resource.Food.amount = 0;"));
assert.equal(
  transformed.source.split(/\r?\n/u).length,
  nativeSnapshot.split(/\r?\n/u).length,
);

assert.equal(
  evidence.decision,
  "A — Native trace accounting and historical diagnostics reconciled",
);
