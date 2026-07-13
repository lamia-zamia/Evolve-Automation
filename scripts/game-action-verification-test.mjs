import assert from "node:assert/strict";

import { createGameActionVerification } from "../src/validation/game-actions.ts";

let game = {
  actions: {
    city: { known: { id: "known" } },
    space: {},
    interstellar: {},
    portal: {},
    galaxy: {},
    tauceti: {},
    eden: {},
  },
};
let buildings = { Known: { id: "known" } };
const logs = [];
const verification = createGameActionVerification({
  getGame: () => game,
  getBuildings: () => buildings,
  log: (...values) => logs.push(values),
});

verification.verifyGameActions();
assert.deepEqual(logs, []);

const missing = { id: "missing-id" };
game = {
  actions: {
    city: { missing },
    space: {},
    interstellar: {},
    portal: {},
    galaxy: {},
    tauceti: {},
    eden: {},
  },
};
buildings = {};
verification.verifyGameActions();
assert.equal(
  logs[0][0],
  "Game action key not found in script: missing (missing-id)",
);
assert.equal(logs[1][0], missing);

console.log("Game action verification module tests passed");
