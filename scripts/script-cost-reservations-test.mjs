import assert from "node:assert/strict";
import { createScriptCostReservationSource } from "../src/adapters/evolve/script-cost-reservations.ts";

{
  const state = {
    conflictTargets: [
      { name: "queued building", cause: "Queue", cost: { Money: 100 } },
      { name: "Unification", cause: "Purchase", cost: { Money: 250 } },
      { name: "Wheelbarrow", cause: "Wheelbarrow", cost: { Money: 500 } },
      {
        name: "research queue",
        cause: "Research queue",
        cost: { Knowledge: 10 },
      },
    ],
  };
  const sample = createScriptCostReservationSource({
    getState: () => state,
  }).readReservations();
  assert.equal(sample.unavailable, false);
  assert.deepEqual(sample.targets, [
    { name: "Unification", cause: "Purchase", cost: { Money: 250 } },
    { name: "Wheelbarrow", cause: "Wheelbarrow", cost: { Money: 500 } },
  ]);
}

{
  const source = createScriptCostReservationSource({
    getState: () => ({
      conflictTargets: [
        { name: "broken", cause: "Trigger", cost: { Money: 0 } },
      ],
    }),
  });
  assert.equal(source.readReservations().unavailable, true);
}

{
  const source = createScriptCostReservationSource({ getState: () => ({}) });
  assert.equal(source.readReservations().unavailable, true);
}

{
  const source = createScriptCostReservationSource({
    getState: () => ({
      conflictTargets: [
        { name: "Queue data unavailable", cause: "Queue", cost: {} },
      ],
    }),
  });
  assert.deepEqual(source.readReservations(), {
    targets: [],
    unavailable: true,
  });
}

console.log("script-cost-reservations ok");
