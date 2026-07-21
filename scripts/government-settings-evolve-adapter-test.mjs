import assert from "node:assert/strict";

import { createGovernmentSettingsEvolveAdapter } from "../src/adapters/evolve/government-settings.ts";

const game = {
  loc(key) {
    assert.equal(this, game);
    return `localized:${key}`;
  },
};
const governmentManager = {
  Types: {
    anarchy: { id: "anarchy", selectable: false },
    autocracy: { id: "autocracy" },
    democracy: { id: "democracy" },
  },
};

const adapter = createGovernmentSettingsEvolveAdapter({
  getGame: () => game,
  getGovernmentManager: () => governmentManager,
  getGovernors: () => ["governor_one"],
});
const readModel = adapter.readGovernmentSettingsReadModel();

assert.deepEqual(
  readModel.controls[4].options.map(({ val, label, hint }) => ({
    val,
    label,
    hint,
  })),
  [
    { val: "none", label: "None", hint: "Do not select government" },
    {
      val: "autocracy",
      label: "localized:govern_autocracy",
      hint: "localized:govern_autocracy_desc",
    },
    {
      val: "democracy",
      label: "localized:govern_democracy",
      hint: "localized:govern_democracy_desc",
    },
  ],
);
assert.equal(
  readModel.controls[7].options[1].label,
  "localized:governor_governor_one",
);
assert.ok(Object.isFrozen(readModel));
assert.ok(Object.isFrozen(readModel.controls));
assert.ok(Object.isFrozen(readModel.controls[4].options));

assert.throws(
  () =>
    createGovernmentSettingsEvolveAdapter({
      getGame: () => ({}),
      getGovernmentManager: () => governmentManager,
      getGovernors: () => [],
    }).readGovernmentSettingsReadModel(),
  /game\.loc must be a function/,
);
assert.throws(
  () =>
    createGovernmentSettingsEvolveAdapter({
      getGame: () => game,
      getGovernmentManager: () => ({ Types: { bad: { id: 42 } } }),
      getGovernors: () => [],
    }).readGovernmentSettingsReadModel(),
  /GovernmentManager\.Types\.bad\.id must be a string/,
);
assert.throws(
  () =>
    createGovernmentSettingsEvolveAdapter({
      getGame: () => game,
      getGovernmentManager: () => governmentManager,
      getGovernors: () => [42],
    }).readGovernmentSettingsReadModel(),
  /governors\[0\] must be a string/,
);

console.log("Government settings Evolve adapter contract tests passed");
