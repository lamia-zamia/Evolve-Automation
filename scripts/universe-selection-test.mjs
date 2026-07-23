import assert from "node:assert/strict";

import { createUniverseSelectionControls } from "../src/adapters/browser/progression-controls.ts";
import {
  createUniverseSelectionCommandExecutor,
  readUniverseSelectionInput,
} from "../src/adapters/evolve/progression/evolution/universe-selection.ts";
import { planUniverseSelection } from "../src/domain/progression/evolution/universe-selection.ts";

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
  createUniverseSelectionCommandExecutor({
    getGame: () => game,
    controls: createUniverseSelectionControls(() => document),
  }).execute(target);
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

assert.equal(
  readUniverseSelectionInput({
    getGame: () => ({ global: { race: { bigbang: true, universe: 7 } } }),
    getSettings: () => ({ userUniverseTargetName: "magic" }),
  }).universe,
  null,
  "unknown universe value is normalized at the adapter boundary",
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
