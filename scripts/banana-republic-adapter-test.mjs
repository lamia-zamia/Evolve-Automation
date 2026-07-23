import assert from "node:assert/strict";

import {
  readBananaRepublicGuardInput,
  readBananaRepublicObjective,
  readBananaRepublicProgress,
  readBananaRepublicSmoothieInput,
} from "../src/adapters/evolve/banana-republic.ts";
import {
  isBananaRepublicGuardActive,
  isBananaRepublicReadyForUnification,
  isBananaRepublicSmoothieComplete,
} from "../src/domain/civic/banana-republic.ts";

function makeInput() {
  const universe = "standard";
  const input = {
    settings: { achievementGuards: true, guardBananaRepublic: true },
    game: {
      global: {
        race: { banana: true },
        stats: {
          banana: Object.fromEntries(
            ["b1", "b2", "b3", "b4", "b5"].map((id) => [
              id,
              { [universe]: true },
            ]),
          ),
          feat: {},
        },
        resource: {
          Food: { trade: -500 },
          Lumber: { trade: 250 },
          Stone: { trade: 250 },
          Money: {},
        },
      },
    },
    poly: {
      universeAffix() {
        assert.equal(this, input.poly);
        return universe;
      },
    },
  };
  return input;
}

let input = makeInput();
assert.deepEqual(readBananaRepublicObjective(input.game, input.poly, "b1"), {
  status: "ready",
  complete: true,
});
assert.equal(
  readBananaRepublicObjective(input.game, input.poly, "b6").status,
  "unavailable",
);
let smoothie = readBananaRepublicSmoothieInput(input.game);
assert.equal(smoothie.status, "ready");
assert.equal(isBananaRepublicSmoothieComplete(smoothie.input), true);
let progress = readBananaRepublicProgress(input.game, input.poly);
assert.equal(progress.status, "ready");
assert.equal(isBananaRepublicReadyForUnification(progress.progress), true);
let guard = readBananaRepublicGuardInput(
  input.settings,
  input.game,
  input.poly,
);
assert.equal(guard.status, "ready");
assert.equal(isBananaRepublicGuardActive(guard.input), false);
assert.ok(Object.isFrozen(guard));
assert.ok(Object.isFrozen(guard.input));
assert.ok(Object.isFrozen(guard.input.progress));
assert.ok(Object.isFrozen(guard.input.progress.objectives));
assert.ok(Object.isFrozen(guard.input.progress.smoothie.tradeRoutes));

input.game.global.stats.banana.b3.standard = false;
guard = readBananaRepublicGuardInput(input.settings, input.game, input.poly);
assert.equal(guard.status, "ready");
assert.equal(isBananaRepublicGuardActive(guard.input), true);

input = makeInput();
input.game.global.stats.feat.banana = 1;
input.game.global.resource = {};
smoothie = readBananaRepublicSmoothieInput(input.game);
assert.equal(smoothie.status, "ready");
assert.equal(isBananaRepublicSmoothieComplete(smoothie.input), true);

input = makeInput();
input.game.global.stats.banana.b1.standard = "yes";
assert.equal(
  readBananaRepublicObjective(input.game, input.poly, "b1").status,
  "unavailable",
  "truthy malformed objective flags must not count as complete",
);
guard = readBananaRepublicGuardInput(input.settings, input.game, input.poly);
assert.deepEqual(guard, {
  status: "unavailable",
  reason: "invalid-achievement",
  field: "stats.banana.b1.standard",
  fallbackActive: true,
});

input = makeInput();
input.game.global.resource.Food.trade = Number.NaN;
assert.equal(readBananaRepublicSmoothieInput(input.game).status, "unavailable");
assert.equal(
  readBananaRepublicGuardInput(input.settings, input.game, input.poly)
    .fallbackActive,
  true,
  "malformed trade state must not release the guard",
);

input = makeInput();
input.settings.guardBananaRepublic = false;
assert.deepEqual(readBananaRepublicGuardInput(input.settings, {}, {}), {
  status: "inactive",
});
input = makeInput();
input.game.global.race.banana = false;
assert.deepEqual(
  readBananaRepublicGuardInput(input.settings, input.game, input.poly),
  { status: "inactive" },
);

console.log("Banana Republic Evolve adapter tests passed");
