import assert from "node:assert/strict";

import { createTraitValue } from "../src/game/trait-value.ts";

let game = {
  global: { race: { strong: true } },
  traits: { strong: { vars: () => [10] } },
};
const { traitVal } = createTraitValue({ getGame: () => game });
assert.equal(traitVal("strong", 0, "+"), 1.1);

game = {
  global: { race: { strong: true } },
  traits: { strong: { vars: () => [50] } },
};
assert.equal(traitVal("strong", 0, "+"), 1.5);
game.global.race.strong = false;
assert.equal(traitVal("strong", 0, "+"), 1);
assert.equal(traitVal("strong", 0, 3), 3);

console.log("Trait value module tests passed");
