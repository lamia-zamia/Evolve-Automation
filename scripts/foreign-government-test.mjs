import assert from "node:assert/strict";

import { createForeignGovernment } from "../src/game/foreign-government.ts";

let game = {
  global: {
    race: {},
    civic: { foreign: { gov0: { spy: 0, mil: 100 } } },
  },
};
let prefix = "first";

const foreign = createForeignGovernment({
  getGame: () => game,
  getPoly: () => ({ loc: (key, args) => `${prefix}:${key}:${args[0]}` }),
});

assert.equal(foreign.getGovName(0), "foreign power 1");
assert.equal(foreign.getGovPower(0), 125);

game = {
  global: {
    race: { truepath: true },
    civic: {
      foreign: {
        gov0: { spy: 1, mil: 140, name: { s0: "oligarchy", s1: "Beta" } },
      },
    },
  },
};
prefix = "second";
assert.equal(foreign.getGovName(0), "second:civics_govoligarchy:Beta (1)");
assert.equal(foreign.getGovPower(0), 140);

console.log("Foreign government module tests passed");
