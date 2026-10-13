import assert from "node:assert/strict";

globalThis.__EA_TEST_SURFACE_ENABLED__ = true;
const { runResearchAutomation } =
  await import("../../../src/application/research.ts");

const first = Object.freeze({
  index: 0,
  id: "tech-rejected",
  affordable: true,
  hasCostConflict: false,
  hasTechConflict: false,
  nativeAffordable: true,
  resourceAffordable: true,
  costConflictEvidence: "none",
  exclusionEvidence: "none",
});
const second = Object.freeze({
  ...first,
  index: 1,
  id: "tech-selected",
  costConflictEvidence: "not-evaluated",
  exclusionEvidence: "not-evaluated",
});
const reads = [];
const invocations = [];
const selectedBeforeInvoke = [];
const selectionResults = [];
const result = runResearchAutomation({
  reader: {
    read(startIndex) {
      reads.push(startIndex);
      return Object.freeze({
        techs: Object.freeze(startIndex === 0 ? [first] : [second]),
      });
    },
  },
  executor: {
    execute(decision) {
      invocations.push(decision.techId);
      return decision.techId === "tech-rejected"
        ? {
            outcome: { status: "succeeded" },
            disposition: "candidate-rejected",
          }
        : { outcome: { status: "succeeded" }, disposition: "researched" };
    },
  },
  onSelection(value) {
    selectedBeforeInvoke.push(value);
  },
  onSelectionResult(value) {
    selectionResults.push(value);
  },
});

assert.equal(result.status, "succeeded");
assert.deepEqual(reads, [0, 1]);
assert.deepEqual(invocations, ["tech-rejected", "tech-selected"]);
assert.deepEqual(
  selectedBeforeInvoke.map((selection) => selection.decision.techId),
  ["tech-rejected", "tech-selected"],
);
assert.deepEqual(
  selectedBeforeInvoke.map((selection) =>
    selection.observed.map((view) => view.id),
  ),
  [["tech-rejected"], ["tech-selected"]],
  "the observer receives only the prefix the owner actually read",
);
assert.deepEqual(
  selectionResults.map((result) => result.disposition),
  ["candidate-rejected", "researched"],
  "the runtime can discard safe-click rejections and report the actual selected invocation",
);
let stoppedResult;
let stoppedInvocations = 0;
runResearchAutomation({
  reader: { read: () => ({ techs: [first, second] }) },
  executor: {
    execute() {
      stoppedInvocations += 1;
      return {
        outcome: {
          status: "rejected",
          failure: { code: "unknown", message: "uncertain" },
        },
        disposition: "stopped",
      };
    },
  },
  onSelectionResult(value) {
    stoppedResult = value;
  },
});
assert.equal(
  stoppedInvocations,
  1,
  "uncertain execution stops without a second invocation",
);
assert.equal(stoppedResult.decision.techId, "tech-rejected");
assert.equal(stoppedResult.disposition, "stopped");

{
  let invocations = 0;
  let result;
  const deferred = runResearchAutomation({
    reader: {
      read() {
        return {
          techs: [],
          interventionResult: {
            index: 3,
            actionId: "tech-foundry",
            disposition: "experiment-deferred",
            reason: "Library remains natively unaffordable",
          },
        };
      },
    },
    executor: {
      execute() {
        invocations += 1;
        return {
          outcome: { status: "succeeded" },
          disposition: "researched",
        };
      },
    },
    onSelectionResult(value) {
      result = value;
    },
  });
  assert.equal(deferred.status, "succeeded");
  assert.equal(
    invocations,
    0,
    "an explicit deferral is not a candidate rejection",
  );
  assert.equal(result.decision.index, 3);
  assert.equal(result.disposition, "experiment-deferred");
}

{
  let invocations = 0;
  const stopped = runResearchAutomation({
    reader: {
      read() {
        return {
          techs: [],
          interventionResult: {
            index: 3,
            actionId: "tech-foundry",
            disposition: "experiment-stopped",
            reason: "The native Library offer disappeared",
          },
        };
      },
    },
    executor: {
      execute() {
        invocations += 1;
        return {
          outcome: { status: "succeeded" },
          disposition: "researched",
        };
      },
    },
  });
  assert.equal(stopped.status, "rejected");
  assert.equal(invocations, 0, "missing target authority fails closed");
}
console.log("Research owner observation tests passed");
