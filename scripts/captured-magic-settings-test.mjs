import assert from "node:assert/strict";

import { readMagicResetContext } from "../src/adapters/evolve/captured-settings-defaults.ts";
import {
  readCapturedMagicAlchemyEntries,
  readCapturedMagicPylonEntries,
} from "../src/adapters/evolve/economy/production/captured-magic-settings-catalog.ts";
import { createCapturedMagicSettingsAdapter } from "../src/adapters/evolve/economy/production/captured-magic-settings.ts";

function makeCapturedGame() {
  const root = {
    resource: {
      Crystal: { title: "Crystal" },
      Iron: { title: "Iron", tradable: true },
      Stone: { name: "Stone" },
    },
  };
  const controlsById = new Map(
    ["alchemyCrystal", "alchemyIron", "alchemyStone"].map((id) => [
      id,
      { elementId: id, generation: 1, methods: [] },
    ]),
  );
  const controls = {
    resolve: (id) => controlsById.get(id),
    invoke: () => ({ ok: false, reason: "unknown-method" }),
    capturedElementIds: () => [...controlsById.keys()],
  };
  const rootState = {
    readRoot: () => root,
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  };
  return { root, controls, rootState };
}

const game = makeCapturedGame();

// The table and the lifecycle defaults share one catalog: alchemy resources
// in captured-control order and the fixed ritual set.
assert.deepEqual(readMagicResetContext(game.controls), {
  alchemyResourceIds: ["Crystal", "Iron", "Stone"],
  ritualProductionIds: [
    "farmer",
    "miner",
    "lumberjack",
    "science",
    "factory",
    "army",
    "hunting",
    "crafting",
  ],
});
assert.deepEqual(
  readCapturedMagicAlchemyEntries(game.root, game.controls).map((entry) => [
    entry.resourceId,
    entry.label,
    entry.color,
  ]),
  [
    ["Crystal", "Crystal", "has-text-advanced"],
    ["Iron", "Iron", "has-text-info"],
    ["Stone", "Stone", "has-text-advanced"],
  ],
);
assert.deepEqual(
  readCapturedMagicPylonEntries().map((entry) => [entry.spellId, entry.label]),
  [
    ["farmer", "Farming"],
    ["miner", "Mining"],
    ["lumberjack", "Lumber"],
    ["science", "Science"],
    ["factory", "Cement"],
    ["army", "War"],
    ["hunting", "Hunting"],
    ["crafting", "Crafting"],
  ],
);

const raw = {
  res_alchemy_Iron: false,
  res_alchemy_w_Stone: 5,
  spell_w_farmer: 7,
  overrides: {
    res_alchemy_Iron: [{ condition: "Money>0" }],
    spell_w_miner: [{ condition: "Food>0" }],
    job_farmer: [{ condition: "Food>0" }],
  },
};
const adapter = createCapturedMagicSettingsAdapter({
  rootState: game.rootState,
  controls: game.controls,
  getSettingsRaw: () => raw,
});

const model = adapter.readMagicSettingsReadModel();
assert.equal(model.sectionId, "magic");
assert.equal(model.sectionName, "Magic");
assert.deepEqual(
  model.alchemyRows.map((row) => [
    row.id,
    row.label,
    row.enabledSettingName,
    row.weightingSettingName,
  ]),
  [
    ["Crystal", "Crystal", "res_alchemy_Crystal", "res_alchemy_w_Crystal"],
    ["Iron", "Iron", "res_alchemy_Iron", "res_alchemy_w_Iron"],
    ["Stone", "Stone", "res_alchemy_Stone", "res_alchemy_w_Stone"],
  ],
);
assert.deepEqual(
  model.pylonRows.map((row) => [
    row.id,
    row.label,
    row.weightingSettingName,
  ])[0],
  ["farmer", "Farming", "spell_w_farmer"],
);
assert.equal(model.pylonRows.length, 8);

// The settings panel reads the raw persisted value. An active override is
// deliberately not allowed to turn the displayed value into the effective one.
assert.equal(raw["res_alchemy_Iron"], false);

adapter.resetToDefaults();
assert.deepEqual(
  {
    alchemyIron: raw["res_alchemy_Iron"],
    alchemyWeightStone: raw["res_alchemy_w_Stone"],
    spellFarmer: raw["spell_w_farmer"],
    spellMiner: raw["spell_w_miner"],
    spellHunting: raw["spell_w_hunting"],
    manaUse: raw["magicAlchemyManaUse"],
  },
  {
    alchemyIron: true,
    alchemyWeightStone: 0,
    spellFarmer: 1,
    spellMiner: 100,
    spellHunting: 10,
    manaUse: 0.5,
  },
);
assert.deepEqual(raw["overrides"], {
  job_farmer: [{ condition: "Food>0" }],
});

console.log("captured magic settings ok");
