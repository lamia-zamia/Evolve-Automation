import assert from "node:assert/strict";
import { createCapturedMarketBoard } from "../../../src/adapters/evolve/economy/market/captured-market-board.ts";

function fixture(regional) {
  let root = {
    tech: { shadow: regional ? 5 : 4 },
    race: { supplyZones: regional, supplySplit: regional },
    resource: { Food: { display: true }, Iron: { display: false } },
  };
  const controls = new Map();
  const registry = {
    capturedElementIds: () => [...controls.keys()],
    resolve: (id) => controls.get(id),
  };
  const board = createCapturedMarketBoard({ readRoot: () => root }, registry);
  const bind = (id) => {
    const handle = {
      elementId: id,
      generation: (controls.get(id)?.generation ?? 0) + 1,
      methods: [],
    };
    controls.set(id, handle);
  };
  const draw = (ids, succeed = true) => {
    assert.equal(board.beginDraw(), true);
    for (const id of ids) bind(id);
    board.observeDraw();
    return board.completeDraw(succeed && board.hasObservedRows());
  };
  return {
    board,
    controls,
    draw,
    bind,
    root: () => root,
    replace: (next) => {
      root = next;
    },
  };
}

{
  const sample = fixture(false);
  assert.equal(
    sample.board.observeDraw(),
    false,
    "no open draw has no observation",
  );
  assert.equal(sample.board.beginDraw(), true);
  sample.bind("market-qty");
  sample.bind("market-Food");
  assert.equal(
    sample.board.observeDraw(),
    true,
    "the rendered market was sampled",
  );
  assert.ok(sample.board.completeDraw(sample.board.hasObservedRows()));
}

for (const regional of [false, true]) {
  const sample = fixture(regional);
  const prefix = regional ? "bm-" : "market-";
  const firstIds = regional
    ? [`${prefix}Food`]
    : ["market-qty", `${prefix}Food`];
  const first = sample.draw(firstIds);
  assert.deepEqual(
    first?.rows.map((row) => row.elementId),
    [`${prefix}Food`],
  );
  assert.equal(
    sample.board.beginDraw(),
    false,
    "unchanged epoch does not redraw",
  );
  sample.root().resource.Iron.display = true;
  assert.equal(
    sample.board.current(),
    undefined,
    "newly displayed resource invalidates board",
  );
  assert.equal(
    sample.draw(firstIds, false),
    undefined,
    "failed redraw does not retain old board",
  );
  assert.equal(sample.board.current(), undefined);
  const second = sample.draw([...firstIds, `${prefix}Iron`]);
  assert.deepEqual(
    second?.rows.map((row) => row.elementId),
    [`${prefix}Food`, `${prefix}Iron`],
  );
  assert.equal(sample.board.isCurrent(first), false);
  // A historical row absent from the next game draw must not be admitted.
  sample.root().resource.Food.display = false;
  const third = sample.draw(
    regional ? [`${prefix}Iron`] : ["market-qty", `${prefix}Iron`],
  );
  assert.deepEqual(
    third?.rows.map((row) => row.elementId),
    [`${prefix}Iron`],
  );
  sample.bind(`${prefix}Iron`);
  assert.equal(
    sample.board.current(),
    undefined,
    "same id with new generation invalidates board",
  );
  sample.draw(regional ? [`${prefix}Iron`] : ["market-qty", `${prefix}Iron`]);
  sample.replace({ ...sample.root(), resource: { ...sample.root().resource } });
  assert.equal(
    sample.board.current(),
    undefined,
    "root replacement invalidates board",
  );
}

for (const [shadow, supplyZones, split, expected] of [
  [5, false, true, "global"],
  [5, true, true, "regional"],
  [5, true, "sol", "regional"],
  [5, true, false, "global"],
  [4, true, "sol", "global"],
  [5, false, "sol", "global"],
]) {
  const sample = fixture(expected === "regional");
  sample.root().tech.shadow = shadow;
  sample.root().race.supplyZones = supplyZones;
  sample.root().race.supplySplit = split;
  if (!supplyZones && split) {
    sample.bind("bm-Food");
    sample.bind("bm-Iron");
  }
  const board = sample.draw(
    expected === "regional" ? ["bm-Food"] : ["market-qty", "market-Food"],
  );
  assert.equal(board?.mode, expected);
  if (expected === "regional") {
    sample.root().race.supplyZones = false;
  } else if (shadow < 5) {
    sample.root().tech.shadow = 5;
  } else if (!supplyZones) {
    sample.root().race.supplyZones = true;
  } else {
    sample.root().race.supplySplit = "sol";
  }
  assert.equal(
    sample.board.current(),
    undefined,
    "supply mode change requires rediscovery",
  );
}

{
  const sample = fixture(false);
  sample.root().tech.shadow = 5;
  sample.root().race.supplySplit = true;
  sample.root().race.supplyZones = false;
  sample.bind("bm-Food");
  const board = sample.draw(["market-qty", "market-Food"]);
  assert.equal(board?.mode, "global");
  assert.deepEqual(
    board?.rows.map((row) => row.elementId),
    ["market-Food"],
    "stale Black Market controls do not change the Logistics board mode",
  );
}

{
  const sample = fixture(false);
  sample.root().race.no_trade = true;
  assert.deepEqual(
    sample.draw(["market-Food"])?.rows.map((row) => row.elementId),
    ["market-Food"],
  );
  sample.root().race.no_trade = false;
  assert.equal(
    sample.board.current(),
    undefined,
    "unlocking instant trades invalidates a route-only board",
  );
  assert.ok(sample.draw(["market-qty", "market-Food"])?.quantity);
}

{
  const sample = fixture(false);
  assert.equal(sample.board.beginDraw(), true);
  sample.bind("market-qty");
  sample.bind("market-Food");
  sample.board.observeDraw();
  const before = sample.board.epoch();
  sample.bind("market-Food"); // Player-view restoration supersedes the observed draw.
  assert.equal(sample.board.completeDraw(true), undefined);
  assert.notEqual(
    sample.board.epoch(),
    before,
    "a superseded successful draw is retryable",
  );
  assert.ok(sample.draw(["market-qty", "market-Food"]));
}

console.log("captured market board tests passed");
