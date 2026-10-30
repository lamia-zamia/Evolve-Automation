import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  compareP43NativeCallDiagnostics,
  normalizeNativeInvocationTrace,
  parseNativeTraceJsonl,
  p43LegacyRawDigestInput,
  p43NativeCallDigestInput,
  summarizeNativeInvocationTrace,
} from "../../experiments/p56-native-invocation-accounting.mjs";

const readJson = (url) =>
  JSON.parse(readFileSync(new URL(url, import.meta.url), "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const evidence = readJson(
  "../../experiments/p56-food-stock-provenance-evidence.json",
);
const p43 = readJson("../../experiments/p43-food-safe-jobs-timeline.json");
const mutations = readJson("../../experiments/p56-food-stock-mutations.json");
const accounting = evidence.replay.nativeInvocationAccounting;

function pair(order, period, elementId, method, args = []) {
  return [
    { order, period, elementId, method, args },
    {
      order: order + 1,
      period,
      elementId,
      method,
      args: ["<after-call>"],
    },
  ];
}

const sampleTrace = [
  ...pair(0, 8, "undefined-food", "action"),
  ...pair(2, 8, "civ-farmer", "setDefault"),
  ...pair(4, 8, "city-lumber", "action"),
  ...pair(6, 8, "city-lumber", "setData"),
  ...pair(8, 9, "tech-agriculture", "action"),
  ...pair(10, 9, "other-control", "action"),
  ...pair(12, 9, "foreign", "vis"),
];

const normalizedSample = normalizeNativeInvocationTrace(sampleTrace);
assert.equal(normalizedSample.length, 7);
assert.equal(normalizedSample[0].args.length, 0);
assert.equal(
  p43LegacyRawDigestInput(sampleTrace, 8).length,
  6,
  "the historical filter counts both raw records for each match",
);
assert.equal(
  p43NativeCallDigestInput(
    normalizedSample.filter((entry) => entry.period <= 8),
  ).length,
  3,
  "the current filter counts one validated call per adjacent pair",
);
assert.deepEqual(summarizeNativeInvocationTrace(sampleTrace), {
  rawTraceRecords: 14,
  validatedNativeApiInvocations: 7,
  mutatingActionMethodInvocations: 4,
  readOnlyNativeCalls: 1,
  otherNativeControlMethodInvocations: 2,
  unknownMethods: [],
  rawTraceSha256: sha256(JSON.stringify(sampleTrace)),
  methodCounts: {
    action: 4,
    setData: 1,
    setDefault: 1,
    vis: 1,
  },
});

for (const invalidTrace of [
  sampleTrace.slice(0, -1),
  sampleTrace.map((entry, index) =>
    index === 1 ? { ...entry, order: 99 } : entry,
  ),
  sampleTrace.map((entry, index) =>
    index === 1 ? { ...entry, period: 99 } : entry,
  ),
  sampleTrace.map((entry, index) =>
    index === 1 ? { ...entry, elementId: "wrong-id" } : entry,
  ),
  sampleTrace.map((entry, index) =>
    index === 1 ? { ...entry, method: "wrong-method" } : entry,
  ),
])
  assert.throws(() => normalizeNativeInvocationTrace(invalidTrace));

const sampleCurrent = [8, 9].map((period) => {
  const legacyInput = p43LegacyRawDigestInput(sampleTrace, period);
  const currentInput = p43NativeCallDigestInput(
    normalizedSample.filter((entry) => entry.period <= period),
  );
  return {
    period,
    nativeCallsCount: currentInput.length,
    nativeCallsSha256: sha256(JSON.stringify(currentInput)),
    legacyCallsCount: legacyInput.length,
    legacyCallsSha256: sha256(JSON.stringify(legacyInput)),
  };
});
const sampleHistorical = sampleCurrent.map((checkpoint) => ({
  period: checkpoint.period,
  nativeCallsCount: checkpoint.legacyCallsCount,
  nativeCallsSha256: checkpoint.legacyCallsSha256,
}));
const sampleReproduced = sampleCurrent.map((checkpoint) => ({
  period: checkpoint.period,
  nativeCallsCount: checkpoint.nativeCallsCount,
  nativeCallsSha256: checkpoint.nativeCallsSha256,
}));
const sampleComparison = compareP43NativeCallDiagnostics(
  sampleTrace,
  sampleHistorical,
  sampleReproduced,
);
assert.equal(sampleComparison.length, 2);
assert.ok(
  sampleComparison.every(
    (entry) =>
      entry.historicalCountMatches &&
      entry.historicalHashMatches &&
      entry.reproducedCountMatches &&
      entry.reproducedHashMatches &&
      entry.transformedCountMatches &&
      entry.transformedHashMatches,
  ),
);

for (const arm of ["armA", "armB"]) {
  const armName = arm === "armA" ? "A" : "B";
  const traceText = readFileSync(
    new URL(
      `../../experiments/p56-native-invocation-trace-arm-${armName.toLowerCase()}.jsonl`,
      import.meta.url,
    ),
    "utf8",
  );
  const rawTrace = parseNativeTraceJsonl(traceText);
  const armEvidence = accounting[arm];
  const summary = summarizeNativeInvocationTrace(rawTrace);
  assert.equal(summary.rawTraceRecords, armEvidence.rawTraceRecords, arm);
  assert.equal(
    summary.validatedNativeApiInvocations,
    armEvidence.validatedNativeApiInvocations,
    arm,
  );
  assert.equal(summary.rawTraceSha256, armEvidence.rawTraceSha256, arm);
  assert.equal(summary.unknownMethods.length, 0, arm);
  assert.equal(rawTrace.length % 2, 0, arm);

  const reproduced = armEvidence.checkpointComparisons.map((entry) => ({
    period: entry.period,
    nativeCallsCount: entry.reproducedCount,
    nativeCallsSha256: entry.reproducedSha256,
  }));
  const comparison = compareP43NativeCallDiagnostics(
    rawTrace,
    p43[arm].checkpoints,
    reproduced,
  );
  assert.equal(comparison.length, 123, arm);
  assert.deepEqual(comparison, armEvidence.checkpointComparisons, arm);
  assert.ok(
    comparison.every(
      (entry) =>
        entry.historicalCountMatches &&
        entry.historicalHashMatches &&
        entry.reproducedCountMatches &&
        entry.reproducedHashMatches &&
        entry.transformedCountMatches &&
        entry.transformedHashMatches,
    ),
    arm,
  );
}

const bTrace = parseNativeTraceJsonl(
  readFileSync(
    new URL(
      "../../experiments/p56-native-invocation-trace-arm-b.jsonl",
      import.meta.url,
    ),
    "utf8",
  ),
);
const bCalls = normalizeNativeInvocationTrace(bTrace);
const foodActionTraceRows = bTrace.filter(
  (entry) => entry.method === "action" && entry.elementId === "undefined-food",
);
const foodActionInvocations = bCalls.filter(
  (entry) => entry.method === "action" && entry.elementId === "undefined-food",
);
assert.equal(bTrace.length, 108_698);
assert.equal(
  accounting.armB.rawTraceSha256,
  "5e53745422c5194643d1d98012fb4bddd31aa3ec456466d124ef06a059c3b4be",
);
assert.equal(bCalls.length, 54_349);
assert.equal(foodActionTraceRows.length, 3_900);
assert.equal(foodActionInvocations.length, 1_950);
assert.equal(mutations.transitions.length, 39);
assert.equal(
  mutations.transitions.reduce(
    (sum, transition) => sum + transition.foodActionTraceRecordCount,
    0,
  ),
  3_900,
);
assert.equal(
  mutations.transitions.reduce(
    (sum, transition) => sum + transition.foodHarvestActionInvocationCount,
    0,
  ),
  1_950,
);
assert.equal(
  mutations.transitions.reduce(
    (sum, transition) => sum + transition.foodActionWriterCount,
    0,
  ),
  1_950,
);
