import assert from "node:assert/strict";

import { createRuntimeQueries } from "../src/game/runtime-queries.ts";

let game = {
  global: {
    race: { governor: { g: { bg: "bureaucrat" }, tasks: { one: "tax" } } },
    tech: { mad: 1 },
  },
};

const queries = createRuntimeQueries({ getGame: () => game });
assert.equal(queries.getGovernor(), "bureaucrat");
assert.equal(queries.haveTask("tax"), true);
assert.equal(queries.haveTech("mad"), true);
assert.equal(queries.isEarlyGame(), false);

game = {
  global: {
    race: { truepath: true },
    tech: { high_tech: 6 },
  },
};
assert.equal(queries.getGovernor(), "none");
assert.equal(queries.haveTask("tax"), false);
assert.equal(queries.haveTech("mad"), undefined);
assert.equal(queries.isEarlyGame(), true);

game.global.tech.high_tech = 7;
assert.equal(queries.isEarlyGame(), false);

console.log("Runtime query module tests passed");
