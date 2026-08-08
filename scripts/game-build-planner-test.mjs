import assert from "node:assert/strict";

import { createGameBuildPlannerEvolveAdapter } from "../src/adapters/evolve/game-build-planner.ts";

// Collected from an imported jQuery the way a jQuery selection draws: the
// collection exposes its index and length as own properties and every method
// (html, ...) lives on the prototype chain, exactly as `$(selector)` does.
function makeJQueryMock(htmlWrites) {
  const collectionMethod = {
    html(value) {
      htmlWrites.push([this.innerSelector, value]);
    },
  };
  function jquery(selector) {
    const collection = Object.create(collectionMethod);
    collection.length =
      selector === "#script_planner-list" ||
      selector === "#script_planner-stats-text"
        ? 1
        : 0;
    if (collection.length > 0) {
      collection.innerSelector = selector;
    }
    return collection;
  }
  return jquery;
}

function makeAdapterState(overrides = {}) {
  const htmlWrites = [];
  const dependencies = {
    game: { global: { stats: { days: 80, reset: 4 } } },
    document: { hidden: false },
    poly: { timeFormat: (seconds) => `T${seconds}` },
    niceNumber: (value) => value / 2,
    jquery: makeJQueryMock(htmlWrites),
    ...overrides,
    htmlWrites,
  };
  const adapter = createGameBuildPlannerEvolveAdapter({
    getGame: () => dependencies.game,
    getDocument: () => dependencies.document,
    getJQuery: () => dependencies.jquery,
    getPoly: () => dependencies.poly,
    getNiceNumber: (value) => dependencies.niceNumber(value),
  });
  return { adapter, dependencies };
}

const { adapter, dependencies } = makeAdapterState();

// Day and tab visibility read straight through; the day comes from the same
// validated run read the planner-stats loading uses.
assert.equal(adapter.readDay(), 80);
assert.equal(adapter.isPageHidden(), false);

// Rendering writes into whichever element the selectors resolve. Detail rows
// only render into the list; the summary bar is a separate stats element.
assert.equal(adapter.plannerListPresent(), true);
adapter.writePlannerList("<li>x</li>");
adapter.writePlannerStats("Iron 100%");
assert.deepEqual(dependencies.htmlWrites, [
  ["#script_planner-list", "<li>x</li>"],
  ["#script_planner-stats-text", "Iron 100%"],
]);

// Game formatting is applied by the compatibility object.
assert.equal(adapter.formatPlannerTime(50), "T50");
assert.equal(adapter.formatPlannerNumber(8), 4);

// A hidden tab and an unresolved planner element keep reads safe.
const hiddenState = makeAdapterState({ document: { hidden: true } });
assert.equal(hiddenState.adapter.isPageHidden(), true);

const absentListState = makeAdapterState({
  jquery() {
    return { length: 0, html() {} };
  },
});
assert.equal(absentListState.adapter.plannerListPresent(), false);
assert.equal(absentListState.adapter.isPageHidden(), false);

// An absent game still answers a day of 0 (the sample path is gated upstream
// on a loaded run, so this value never reaches the planner stats).
const noGameState = makeAdapterState({ game: undefined });
assert.equal(noGameState.adapter.readDay(), 0);

console.log("Game build-planner Evolve adapter tests passed");
