import assert from "node:assert/strict";

import { createProgressionEpochReader } from "../src/adapters/evolve/progression-epoch.ts";

/** A captured root whose object the test mutates in place, as the game mutates its own. */
function rootSourceOf(root) {
  let notify = () => {};
  return {
    source: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: (listener) => {
        notify = listener;
        return () => {
          notify = () => {};
        };
      },
    },
    replaceRoot: () => notify(),
  };
}

function freshRoot() {
  return {
    tech: { mining: 1, smelting: 2 },
    genes: { creep: 1 },
    race: { species: "human", universe: "standard", creative: 1 },
    stats: { achieve: { explorer: { l: 1 } }, psykill: 0 },
    civic: { govern: { type: "democracy" }, farmer: { workers: 4 } },
    settings: { showCivic: true, showUnderground: false, showSurface: false },
    arpa: { lhc: { rank: 2, complete: 40 }, stock_exchange: { rank: 0 } },
    resource: { Food: { amount: 1000 }, Lumber: { amount: 50 } },
    city: { basic_housing: { count: 12 } },
  };
}

// --- what must move the epoch ----------------------------------------------

{
  const root = freshRoot();
  const { source } = rootSourceOf(root);
  const epoch = createProgressionEpochReader(source);
  const before = epoch.read();
  assert.equal(epoch.read(), before, "an unchanged root reads the same epoch");

  const moves = [
    ["a granted technology", () => (root.tech["mining"] = 2)],
    ["a newly unlocked technology", () => (root.tech["oil_well"] = 1)],
    ["a gene", () => (root.genes["queue"] = 3)],
    ["a trait appearing", () => (root.race["hardy"] = 1)],
    ["a species change", () => (root.race.species = "elven")],
    ["a universe change", () => (root.race.universe = "heavy")],
    ["an achievement", () => (root.stats.achieve["pathfinder"] = { l: 3 })],
    ["a psychic kill count", () => (root.stats.psykill = 10)],
    ["a government form", () => (root.civic.govern.type = "anarchy")],
    ["a region becoming visible", () => (root.settings.showUnderground = true)],
    ["an A.R.P.A. rank", () => (root.arpa.lhc.rank = 3)],
  ];
  let previous = before;
  for (const [what, change] of moves) {
    change();
    const next = epoch.read();
    assert.notEqual(next, previous, `${what} must move the epoch`);
    previous = next;
  }
}

// A prestige, a save load and a reactivity restore all arrive as a root replacement, and the
// reactive wrapper is cached by raw target — so the root may be the very same object.
{
  const root = freshRoot();
  const { source, replaceRoot } = rootSourceOf(root);
  const epoch = createProgressionEpochReader(source);
  const before = epoch.read();
  replaceRoot();
  assert.notEqual(
    epoch.read(),
    before,
    "a root replacement must move the epoch even when nothing else did",
  );
}

// --- what must not move it -------------------------------------------------

{
  const root = freshRoot();
  const { source } = rootSourceOf(root);
  const epoch = createProgressionEpochReader(source);
  const before = epoch.read();
  // Every one of these moves on an ordinary tick. None of them changes what a panel offers, and an
  // epoch that reacted to them would buy back the per-tick draw this reader exists to avoid.
  root.resource.Food.amount = 999_999;
  root.resource.Lumber.amount = 0;
  root.city.basic_housing.count = 40;
  root.civic.farmer.workers = 11;
  root.arpa.lhc.complete = 95;
  root.stats.achieve.explorer.l = 4;
  root.race.creative = 3;
  assert.equal(
    epoch.read(),
    before,
    "production, storage, jobs, building counts and project progress must not move the epoch",
  );
}

// Before the game has built its root there is still an epoch, and it is not the captured one.
{
  const { source } = rootSourceOf(undefined);
  const epoch = createProgressionEpochReader(source);
  assert.equal(typeof epoch.read(), "string");
  epoch.release();
}

console.log("progression-epoch ok");
