import assert from "node:assert/strict";

import {
  createResourceRatioCommandExecutors,
  readExtractorRatioInput,
  readMineRatioInput,
  readQuarryRatioInput,
} from "../src/adapters/evolve/resource-ratios.ts";
import {
  planExtractorRatios,
  planMineRatio,
  planQuarryRatio,
} from "../src/domain/resource-ratios.ts";

function resource(storageRatio, demanded = false) {
  return { storageRatio, isDemanded: () => demanded };
}

const actions = [];
const resources = {
  Chrysotile: resource(0.2),
  Stone: resource(0.6),
  Adamantite: resource(0.5),
  Aluminium: resource(0.5),
  Iron: resource(0.5),
  Iridium: resource(0.5),
  Neutronium: resource(0.5),
  Orichalcum: resource(0.5),
  Elerium: resource(0.5),
};
const dependencies = {
  getQuarryManager: () => ({
    initIndustry: () => true,
    currentProduction: () => 50,
    increaseProduction: (delta) => actions.push(["quarry", delta]),
  }),
  getMineManager: () => ({
    initIndustry: () => true,
    currentProduction: () => 20,
    increaseProduction: (delta) => actions.push(["mine", delta]),
  }),
  getExtractorManager: () => ({
    initIndustry: () => true,
    currentProduction: () => 50,
    increaseProduction: (id, delta) => actions.push(["extractor", id, delta]),
  }),
  getResources: () => resources,
  getSettings: () => ({
    productionChrysotileWeight: 2,
    productionAdamantiteWeight: 1,
    productionExtWeight_common: 2,
    productionExtWeight_uncommon: 2,
    productionExtWeight_rare: 2,
  }),
  getBuildings: () => ({ MetalRefinery: { count: 0 } }),
  haveTech: (id, level) => id === "tau_roid" && level === 5,
};
const executors = createResourceRatioCommandExecutors(dependencies);

const quarryAdjustment = planQuarryRatio(readQuarryRatioInput(dependencies));
if (quarryAdjustment !== null) executors.quarry.execute(quarryAdjustment);
const mineAdjustment = planMineRatio(readMineRatioInput(dependencies));
if (mineAdjustment !== null) executors.mine.execute(mineAdjustment);
executors.extractor.execute(
  planExtractorRatios(readExtractorRatioInput(dependencies)),
);

assert.deepEqual(actions, [
  ["quarry", 30],
  ["mine", 30],
  ["extractor", "common", 17],
  ["extractor", "uncommon", 17],
  ["extractor", "rare", 17],
]);

// Metal Refinery raises the Stone weight via Aluminium fullness.
{
  const adjustment = planQuarryRatio({
    initialised: true,
    currentRatio: 0,
    chrysotileDemanded: false,
    chrysotileStorageRatio: 0.5,
    stoneDemanded: false,
    stoneStorageRatio: 0.9,
    hasMetalRefinery: true,
    aluminiumDemanded: false,
    aluminiumStorageRatio: 0.1, // Aluminium weight 90 overrides Stone weight 10
    chrysotileWeight: 1,
  });
  // chrysotile 50, stone max(10, 90) = 90 -> round(50/140*100) = 36
  assert.equal(adjustment.delta, 36);
}

// Demanded resource forces its weight to MAX_SAFE_INTEGER.
assert.equal(
  planMineRatio({
    initialised: true,
    currentRatio: 10,
    adamantiteDemanded: true,
    adamantiteStorageRatio: 1,
    aluminiumDemanded: false,
    aluminiumStorageRatio: 0,
    adamantiteWeight: 1,
  }).delta,
  90, // adamantite MAX dominates -> round(~100) - 10
);

// Not initialised: null / empty, no production change.
assert.equal(planQuarryRatio({ initialised: false }), null);
assert.deepEqual(planExtractorRatios({ initialised: false }), []);

// Adapter: legacy refreshes resources/settings before initIndustry, but does
// not inspect their returned values when the industry is unavailable.
{
  const getterCalls = [];
  const input = readMineRatioInput({
    getMineManager: () => ({ initIndustry: () => false }),
    getResources: () => (getterCalls.push("resources"), null),
    getSettings: () => (getterCalls.push("settings"), null),
  });
  assert.equal(input.initialised, false);
  assert.deepEqual(getterCalls, ["resources", "settings"]);
  assert.ok(Object.isFrozen(input));
}

// tau_roid < 5 omits the rare extractor production.
{
  const input = readExtractorRatioInput({
    ...dependencies,
    haveTech: () => false,
  });
  assert.deepEqual(
    input.productions.map((p) => p.id),
    ["common", "uncommon"],
  );
}

function legacyResourceRatios(deps) {
  function autoQuarry() {
    const scenarioResources = deps.getResources();
    const scenarioSettings = deps.getSettings();
    const buildings = deps.getBuildings();
    if (!deps.QuarryManager.initIndustry()) return;
    let chrysotileWeight = scenarioResources.Chrysotile.isDemanded()
      ? Number.MAX_SAFE_INTEGER
      : 100 - scenarioResources.Chrysotile.storageRatio * 100;
    let stoneWeight = scenarioResources.Stone.isDemanded()
      ? Number.MAX_SAFE_INTEGER
      : 100 - scenarioResources.Stone.storageRatio * 100;
    if (buildings.MetalRefinery.count > 0) {
      stoneWeight = Math.max(
        stoneWeight,
        scenarioResources.Aluminium.isDemanded()
          ? Number.MAX_SAFE_INTEGER
          : 100 - scenarioResources.Aluminium.storageRatio * 100,
      );
    }
    chrysotileWeight *= scenarioSettings.productionChrysotileWeight;
    const target = Math.round(
      (chrysotileWeight / (chrysotileWeight + stoneWeight)) * 100,
    );
    deps.QuarryManager.increaseProduction(
      target - deps.QuarryManager.currentProduction(),
    );
  }

  function autoMine() {
    const scenarioResources = deps.getResources();
    const scenarioSettings = deps.getSettings();
    if (!deps.MineManager.initIndustry()) return;
    let adamantiteWeight = scenarioResources.Adamantite.isDemanded()
      ? Number.MAX_SAFE_INTEGER
      : 100 - scenarioResources.Adamantite.storageRatio * 100;
    const aluminiumWeight = scenarioResources.Aluminium.isDemanded()
      ? Number.MAX_SAFE_INTEGER
      : 100 - scenarioResources.Aluminium.storageRatio * 100;
    adamantiteWeight *= scenarioSettings.productionAdamantiteWeight;
    const target = Math.round(
      (adamantiteWeight / (adamantiteWeight + aluminiumWeight)) * 100,
    );
    deps.MineManager.increaseProduction(
      target - deps.MineManager.currentProduction(),
    );
  }

  function autoExtractor() {
    const scenarioResources = deps.getResources();
    const scenarioSettings = deps.getSettings();
    if (!deps.ExtractorManager.initIndustry()) return;
    const productions = [
      { id: "common", res1: "Iron", res2: "Aluminium" },
      { id: "uncommon", res1: "Iridium", res2: "Neutronium" },
    ];
    if (deps.haveTech("tau_roid", 5)) {
      productions.push({ id: "rare", res1: "Orichalcum", res2: "Elerium" });
    }
    for (const production of productions) {
      const res1 = scenarioResources[production.res1];
      const res2 = scenarioResources[production.res2];
      const res1Weight = res1.isDemanded()
        ? Number.MAX_SAFE_INTEGER
        : 100 - res1.storageRatio * 100;
      const res2Weight =
        (res2.isDemanded()
          ? Number.MAX_SAFE_INTEGER
          : 100 - res2.storageRatio * 100) *
        scenarioSettings[`productionExtWeight_${production.id}`];
      const target = Math.round((res2Weight / (res1Weight + res2Weight)) * 100);
      deps.ExtractorManager.increaseProduction(
        production.id,
        target - deps.ExtractorManager.currentProduction(production.id),
      );
    }
  }

  autoQuarry();
  autoMine();
  autoExtractor();
}

function buildParityFixture(scenario, trace) {
  const makeResource = (id, storageRatio) => ({
    storageRatio,
    isDemanded: () => Boolean(scenario.demanded?.includes(id)),
  });
  const scenarioResources = Object.fromEntries(
    [
      ["Chrysotile", 0.2],
      ["Stone", 0.6],
      ["Adamantite", 0.5],
      ["Aluminium", 0.5],
      ["Iron", 0.4],
      ["Iridium", 0.7],
      ["Neutronium", 0.3],
      ["Orichalcum", 0.8],
      ["Elerium", 0.2],
    ].map(([id, ratio]) => [id, makeResource(id, ratio)]),
  );
  const init = () => scenario.initialised !== false;
  const QuarryManager = {
    initIndustry: init,
    currentProduction: () => 50,
    increaseProduction: (delta) => trace.push(["quarry", delta]),
  };
  const MineManager = {
    initIndustry: init,
    currentProduction: () => 20,
    increaseProduction: (delta) => trace.push(["mine", delta]),
  };
  const ExtractorManager = {
    initIndustry: init,
    currentProduction: () => 50,
    increaseProduction: (id, delta) => trace.push(["extractor", id, delta]),
  };
  return {
    QuarryManager,
    MineManager,
    ExtractorManager,
    getQuarryManager: () => QuarryManager,
    getMineManager: () => MineManager,
    getExtractorManager: () => ExtractorManager,
    getResources: () => scenarioResources,
    getSettings: () => ({
      productionChrysotileWeight: scenario.chrysotileWeight ?? 2,
      productionAdamantiteWeight: scenario.adamantiteWeight ?? 1,
      productionExtWeight_common: 2,
      productionExtWeight_uncommon: 2,
      productionExtWeight_rare: 2,
    }),
    getBuildings: () => ({
      MetalRefinery: { count: scenario.refinery ? 1 : 0 },
    }),
    haveTech: (id, level) =>
      id === "tau_roid" && level === 5 && scenario.rare !== false,
  };
}

function runLegacyParity(scenario) {
  const trace = [];
  legacyResourceRatios(buildParityFixture(scenario, trace));
  return trace;
}

function runModernParity(scenario) {
  const trace = [];
  const fixture = buildParityFixture(scenario, trace);
  const ratioExecutors = createResourceRatioCommandExecutors(fixture);
  const quarry = planQuarryRatio(readQuarryRatioInput(fixture));
  if (quarry !== null) ratioExecutors.quarry.execute(quarry);
  const mine = planMineRatio(readMineRatioInput(fixture));
  if (mine !== null) ratioExecutors.mine.execute(mine);
  ratioExecutors.extractor.execute(
    planExtractorRatios(readExtractorRatioInput(fixture)),
  );
  return trace;
}

const parityScenarios = [
  {},
  { demanded: ["Chrysotile", "Neutronium"] },
  { demanded: ["Stone", "Adamantite", "Aluminium"], refinery: true },
  { rare: false },
  { chrysotileWeight: 0.5, adamantiteWeight: 3 },
  { initialised: false },
];
parityScenarios.forEach((scenario, index) => {
  assert.deepEqual(
    runModernParity(scenario),
    runLegacyParity(scenario),
    `resource-ratio dual-run scenario ${index + 1}`,
  );
});

// Executor rejects a stale sampled ratio before issuing a mutation.
{
  const mutations = [];
  const ratioExecutors = createResourceRatioCommandExecutors({
    getQuarryManager: () => ({
      currentProduction: () => 51,
      increaseProduction: (delta) => mutations.push(delta),
    }),
    getMineManager: () => ({}),
    getExtractorManager: () => ({}),
  });
  const result = ratioExecutors.quarry.execute({
    expectedCurrentRatio: 50,
    delta: 10,
  });
  assert.equal(result.status, "stale");
  assert.deepEqual(mutations, []);
}

console.log(
  `Resource ratio automation regression tests passed (${parityScenarios.length} dual-run scenarios)`,
);
