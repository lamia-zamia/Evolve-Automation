import assert from "node:assert/strict";
import { createShrineIntelligence } from "../src/game/shrine-intelligence.ts";

let game;
let settings;
const { shrineBonusUnwanted } = createShrineIntelligence({
  getGame: () => game,
  getSettings: () => settings,
});

const magnificent = (moon, levels = {}) => ({
  global: {
    race: { magnificent: 1 },
    city: {
      calendar: { moon },
      shrine: { morale: 0, metal: 0, know: 0, tax: 0, ...levels },
    },
  },
});

// A specific configured bonus wants exactly the moon phase that raises it. The
// bands are the ones the game's own Shrine action uses.
settings = { buildingShrineType: "know" };
for (const [moon, offered] of [
  [1, "morale"],
  [6, "morale"],
  [8, "metal"],
  [13, "metal"],
  [15, "know"],
  [20, "know"],
  [22, "tax"],
  [27, "tax"],
  [0, "rotating"],
  [7, "rotating"],
  [14, "rotating"],
  [21, "rotating"],
]) {
  game = magnificent(moon);
  assert.equal(
    shrineBonusUnwanted(),
    offered !== "know",
    `moon ${moon} offers ${offered}`,
  );
}

// The rotating setting wants precisely the quarter boundaries the specific
// bonuses reject.
settings = { buildingShrineType: "rotating" };
game = magnificent(14);
assert.equal(shrineBonusUnwanted(), false);
game = magnificent(15);
assert.equal(shrineBonusUnwanted(), true);

// A moon value outside every band leaves no bonus to want.
settings = { buildingShrineType: "tax" };
game = magnificent(-1);
assert.equal(shrineBonusUnwanted(), true);

// An equal spread wants whichever counter is currently lowest, and never a
// rotating Shrine, which has no counter to fall behind.
settings = { buildingShrineType: "equally" };
game = magnificent(15, { morale: 3, metal: 3, know: 2, tax: 3 });
assert.equal(shrineBonusUnwanted(), false);
game = magnificent(15, { morale: 2, metal: 3, know: 3, tax: 3 });
assert.equal(shrineBonusUnwanted(), true);
game = magnificent(15, { morale: 2, metal: 2, know: 2, tax: 2 });
assert.equal(shrineBonusUnwanted(), false, "every counter is the lowest");
game = magnificent(7, { morale: 0, metal: 1, know: 1, tax: 1 });
assert.equal(shrineBonusUnwanted(), true);

// Any Shrine is acceptable, so the moon is never read.
let calendarReads = 0;
const countedCalendar = (moon) => {
  const state = magnificent(moon);
  Object.defineProperty(state.global.city, "calendar", {
    get() {
      calendarReads++;
      return { moon };
    },
  });
  return state;
};
settings = { buildingShrineType: "any" };
game = countedCalendar(15);
assert.equal(shrineBonusUnwanted(), false);
assert.equal(calendarReads, 0);

// So is every run that is not magnificent, and every magnificent run whose city
// does not carry the Shrine counters yet. The snapshot samples this once per
// phase rather than only when a Shrine candidate is weighted, so both states are
// reachable here and neither may throw.
settings = { buildingShrineType: "know" };
game = countedCalendar(15);
game.global.race = {};
assert.equal(shrineBonusUnwanted(), false);
assert.equal(calendarReads, 0);
game = {
  global: { race: { magnificent: 1 }, city: { calendar: { moon: 15 } } },
};
assert.equal(shrineBonusUnwanted(), false);

console.log("Shrine intelligence module tests passed");
