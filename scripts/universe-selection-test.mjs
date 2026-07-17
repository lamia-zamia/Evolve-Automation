import assert from "node:assert/strict";

import { readUniverseSelectionInput } from "../src/adapters/evolve/universe-selection.ts";
import { planUniverseSelection } from "../src/domain/universe-selection.ts";

// End-to-end reader + planner + apply, matching the legacy autoUniverseSelection.
function run(scenario) {
  const clicks = [];
  const game = {
    global: {
      race: { bigbang: scenario.bigbang, universe: scenario.universe },
    },
  };
  const settings = { userUniverseTargetName: scenario.target };
  const document = {
    getElementById: (id) =>
      id === `uni-${scenario.presentTarget}`
        ? { children: [{ click: () => clicks.push(id) }] }
        : null,
  };

  const target = planUniverseSelection(
    readUniverseSelectionInput({
      getGame: () => game,
      getSettings: () => settings,
    }),
  );
  if (target !== null) {
    const action = document.getElementById(`uni-${target}`);
    if (action !== null) {
      action.children[0].click();
    }
  }
  return clicks;
}

assert.deepEqual(
  run({
    bigbang: true,
    universe: "bigbang",
    target: "magic",
    presentTarget: "magic",
  }),
  ["uni-magic"],
  "clicks the configured universe target",
);
assert.deepEqual(
  run({
    bigbang: true,
    universe: "bigbang",
    target: "magic",
    presentTarget: "none",
  }),
  [],
  "missing DOM element: no click",
);
assert.deepEqual(
  run({
    bigbang: true,
    universe: "bigbang",
    target: "none",
    presentTarget: "magic",
  }),
  [],
  "target none: no selection",
);
assert.deepEqual(
  run({
    bigbang: true,
    universe: "standard",
    target: "magic",
    presentTarget: "magic",
  }),
  [],
  "not in the bigbang selection screen: no selection",
);
assert.deepEqual(
  run({
    bigbang: false,
    universe: "bigbang",
    target: "magic",
    presentTarget: "magic",
  }),
  [],
  "bigbang not unlocked: no selection",
);

console.log("Universe selection automation regression tests passed");
