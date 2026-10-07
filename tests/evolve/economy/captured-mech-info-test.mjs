import assert from "node:assert/strict";

import { createCapturedMechInfoReader } from "../../../src/adapters/evolve/combat/captured-mech-info.ts";
import { createNumberFormatting } from "../../../src/formatting/numbers.ts";
import { numberSuffix } from "../../../src/config.ts";
import {
  bestDesignFigures,
  rateMechDesign,
} from "../../../src/domain/combat/mech-design.ts";
import { formatMechInfo } from "../../../src/domain/combat/mech-info.ts";
import { readCapturedMechRatingFloor } from "../../../src/domain/combat/mech-auto-choice.ts";
import { readCapturedMechState } from "../../../src/domain/combat/mech-state.ts";

const root = {
  race: { species: "human", governor: { tasks: {} } },
  settings: { qKey: false },
  portal: {
    mechbay: {
      max: 10,
      bay: 3,
      active: 3,
      scouts: 1,
      blueprint: {
        size: "small",
        chassis: "wheel",
        hardpoint: ["laser"],
        equip: ["special"],
        infernal: false,
      },
      mechs: [
        {
          size: "small",
          chassis: "wheel",
          hardpoint: ["laser"],
          equip: ["special"],
          infernal: false,
        },
        {
          size: "collector",
          chassis: "wheel",
          hardpoint: [],
          equip: ["special"],
          infernal: false,
        },
        {
          size: "small",
          chassis: "wheel",
          hardpoint: ["new-upstream-weapon"],
          equip: ["special"],
          infernal: false,
        },
      ],
    },
    purifier: { supply: 100, sup_max: 1_000, count: 1, on: 1, diff: 0 },
    spire: {
      count: 2,
      type: "sand",
      progress: 45,
      status: { gravity: true },
      boss: "snake",
    },
  },
  resource: {
    Soul_Gem: { amount: 12, max: 100, diff: 0 },
  },
  blood: { prepared: 0, wrath: 2 },
  stats: { achieve: { gladiator: { l: 1 } } },
};
const settings = {
  autoMech: true,
  mechBuild: "random",
  mechCollectorValue: 2,
};
let ensureCalls = 0;
const reader = createCapturedMechInfoReader({
  rootState: { readRoot: () => root },
  readSettings: () => settings,
  keyState: { readPressed: () => false },
  ensureLabActive: () => {
    ensureCalls += 1;
    return true;
  },
});

assert.equal(reader.ensureLabActive(), true);
assert.equal(ensureCalls, 1);
const actual = reader.readItems(3);
const state = readCapturedMechState({ root, settings, queueKeyHeld: false });
const floor = readCapturedMechRatingFloor(state);
assert.ok(floor);
const ratingFloor = { ...floor, collectorValue: 1 };
const best = bestDesignFigures(ratingFloor, () => 0);
assert.ok(best);
const formatNumber = createNumberFormatting({ numberSuffix }).getNumberString;

for (const [index, design] of state.inventory.entries()) {
  const rating = rateMechDesign(design, ratingFloor);
  const bestPower = best[design.size]?.power;
  if (rating === null || bestPower === undefined) {
    assert.equal(actual[index], undefined);
    continue;
  }
  assert.equal(
    actual[index]?.text,
    formatMechInfo(
      {
        size: design.size,
        power: rating.power,
        efficiency: rating.efficiency,
        bestPower,
        ...(design.size === "collector" ? { collectorValue: 2 } : {}),
      },
      formatNumber,
    ),
  );
}
assert.equal(actual[2], undefined, "unsupported current designs are omitted");

settings.autoMech = false;
assert.deepEqual(reader.readItems(3), [undefined, undefined, undefined]);

console.log("captured Mech Info reader checks passed");
