import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceContinuation,
  allocationValidityToken,
  cloneFrozen,
  makeRepresentativeInput,
  planSynchronously,
  startContinuation,
} from "../../experiments/p11-bounded-planner.mjs";

test("incremental budgets stop exactly, resume without repeated evaluations, and match oracle", () => {
  for (const count of [24, 71]) {
    const input = makeRepresentativeInput(count);
    const oracle = planSynchronously(input);
    for (const budget of [1, 16, 64, 256]) {
      let continuation = startContinuation(input);
      let evaluations = 0;
      let slices = 0;
      while (continuation) {
        const result = advanceContinuation(input, continuation, budget);
        slices += 1;
        evaluations += result.evaluations;
        if (result.status === "incomplete") {
          assert.equal(result.evaluations, budget);
          continuation = result.continuation;
        } else {
          assert.equal(result.status, "completed");
          assert.deepEqual(result.plan, oracle.plan);
          continuation = undefined;
        }
      }
      assert.equal(evaluations, count);
      assert.equal(slices, Math.ceil(count / budget));
    }
  }
});

test("candidate order, ties, resource constraints, and reservation constraints are deterministic", () => {
  const input = makeRepresentativeInput(24);
  const reversed = cloneFrozen({
    ...input,
    candidates: [...input.candidates].reverse(),
  });
  const reversedOracle = planSynchronously(reversed);
  assert.equal(
    reversedOracle.plan?.weight,
    planSynchronously(input).plan?.weight,
  );
  const tied = cloneFrozen({
    ...input,
    candidates: [
      { id: "first", weight: 5, cost: { Steel: 1 } },
      { id: "second", weight: 5, cost: { Steel: 1 } },
    ],
    resources: [{ id: "Steel", quantity: 10, capacity: 10, reserved: 9 }],
  });
  assert.equal(planSynchronously(tied).plan?.candidateId, "first");
  assert.equal(
    planSynchronously(
      cloneFrozen({
        ...tied,
        resources: [{ id: "Steel", quantity: 10, capacity: 10, reserved: 10 }],
      }),
    ).plan,
    null,
  );
});

test("dependency replacement invalidates and incomplete authority fails closed", () => {
  const input = makeRepresentativeInput(71);
  const continuation = startContinuation(input);
  assert.ok(continuation);
  for (const dependency of [
    "root",
    "settings",
    "controls",
    "offers",
    "resources",
    "reservations",
    "prices",
    "actionBoundary",
  ]) {
    const changed = cloneFrozen({
      ...input,
      dependencies: {
        ...input.dependencies,
        [dependency]: `${input.dependencies[dependency]}-changed`,
      },
    });
    const result = advanceContinuation(changed, continuation, 16);
    assert.equal(result.status, "invalidated", dependency);
    assert.equal(result.continuation, undefined);
    assert.equal(
      allocationValidityToken(cloneFrozen({ ...input, complete: false })),
      undefined,
    );
  }
  assert.equal(
    startContinuation(
      cloneFrozen({
        ...input,
        dependencies: { ...input.dependencies, prices: undefined },
      }),
    ),
    undefined,
  );
  const partialAction = cloneFrozen({
    ...input,
    complete: false,
    dependencies: {
      ...input.dependencies,
      actionBoundary: "partial-native-action-2",
    },
  });
  assert.equal(startContinuation(partialAction), undefined);
});

test("unrelated mutations are excluded from explicit dependency token", () => {
  const input = makeRepresentativeInput(24);
  const continuation = startContinuation(input);
  const unrelated = cloneFrozen({ ...input, unrelatedUiCounter: 100 });
  const result = advanceContinuation(unrelated, continuation, 16);
  assert.equal(result.status, "incomplete");
  assert.equal(result.continuation?.index, 16);
  for (const field of ["quantity", "capacity", "reserved"]) {
    const changedResource = cloneFrozen({
      ...input,
      resources: input.resources.map((resource, index) =>
        index === 0 ? { ...resource, [field]: resource[field] + 1 } : resource,
      ),
    });
    assert.equal(
      advanceContinuation(changedResource, continuation, 16).status,
      "invalidated",
      field,
    );
  }
});

test("a stale completed continuation cannot publish a plan", () => {
  const input = makeRepresentativeInput(24);
  const continuation = startContinuation(input);
  const changed = cloneFrozen({
    ...input,
    dependencies: { ...input.dependencies, resources: "resource-state-2" },
  });
  const result = advanceContinuation(changed, continuation, 256);
  assert.equal(result.status, "invalidated");
  assert.equal(result.plan, undefined);
});
