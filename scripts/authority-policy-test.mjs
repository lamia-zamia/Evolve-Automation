import assert from "node:assert/strict";

import { createAuthorityPolicy } from "../src/policies/authority.ts";

let game = {
  global: {
    race: {},
    tech: { evil: 1 },
    civic: { govern: { type: "federation" } },
  },
};
let settings = { generalMinimumAuthority: 0 };
let resources = { Authority: { currentQuantity: 100, maxQuantity: 137 } };
let traitVal = (_trait, _index, fallback) => fallback;

const {
  getAuthorityPerSoldier,
  getAuthorityTarget,
  getPredictedAuthorityAfterRemovingSoldiers,
  getRequiredAuthorityGarrison,
} = createAuthorityPolicy({
  getGame: () => game,
  getSettings: () => settings,
  getResources: () => resources,
  traitVal: (...args) => traitVal(...args),
});

assert.equal(getAuthorityTarget(), null);
settings = { generalMinimumAuthority: -1 };
assert.equal(getAuthorityTarget(), 137);
settings = { generalMinimumAuthority: 100 };
assert.equal(getAuthorityTarget(), 100);

assert.ok(Math.abs(getAuthorityPerSoldier() - 0.8) < 1e-12);
game = {
  ...game,
  global: {
    ...game.global,
    race: { grenadier: true, high_pop: true },
    civic: { govern: { type: "dictator" } },
  },
};
traitVal = (trait, index, fallback) =>
  trait === "high_pop" && index === 1 ? 50 : fallback;
assert.ok(Math.abs(getAuthorityPerSoldier() - 0.784) < 1e-12);

game = {
  ...game,
  global: {
    ...game.global,
    race: {},
    civic: { govern: { type: "federation" } },
  },
};
traitVal = (_trait, _index, fallback) => fallback;
resources.Authority.currentQuantity = 100;
assert.equal(getRequiredAuthorityGarrison(25), 25);
resources.Authority.currentQuantity = 96;
assert.equal(getRequiredAuthorityGarrison(20), 25);
resources.Authority.currentQuantity = 110;
assert.equal(getRequiredAuthorityGarrison(25), 13);
resources.Authority.currentQuantity = 100;
assert.equal(getPredictedAuthorityAfterRemovingSoldiers(2), 98);

console.log("Authority policy module tests passed");
