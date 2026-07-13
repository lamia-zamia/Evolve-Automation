import type { AutomationDependencies } from "../dependencies.ts";

type Dependencies = AutomationDependencies<
  | "QuarryManager"
  | "MineManager"
  | "ExtractorManager"
  | "getResources"
  | "getSettings"
  | "getBuildings"
  | "haveTech"
>;
export function createAutoResourceRatios({
  QuarryManager,
  MineManager,
  ExtractorManager,
  getResources,
  getSettings,
  getBuildings,
  haveTech,
}: Dependencies) {
  function autoQuarry() {
    const resources = getResources();
    const settings = getSettings();
    const buildings = getBuildings();
    // Nothing to do here with no quarry, or smoldering
    if (!QuarryManager.initIndustry()) {
      return;
    }

    let chrysotileWeigth = resources.Chrysotile.isDemanded()
      ? Number.MAX_SAFE_INTEGER
      : 100 - resources.Chrysotile.storageRatio * 100;
    let stoneWeigth = resources.Stone.isDemanded()
      ? Number.MAX_SAFE_INTEGER
      : 100 - resources.Stone.storageRatio * 100;
    if (buildings.MetalRefinery.count > 0) {
      stoneWeigth = Math.max(
        stoneWeigth,
        resources.Aluminium.isDemanded()
          ? Number.MAX_SAFE_INTEGER
          : 100 - resources.Aluminium.storageRatio * 100,
      );
    }
    chrysotileWeigth *= settings.productionChrysotileWeight;

    let currentRatio = QuarryManager.currentProduction();
    let newRatio = Math.round(
      (chrysotileWeigth / (chrysotileWeigth + stoneWeigth)) * 100,
    );

    QuarryManager.increaseProduction(newRatio - currentRatio);
  }

  function autoMine() {
    const resources = getResources();
    const settings = getSettings();
    // Nothing to do here with no mine
    if (!MineManager.initIndustry()) {
      return;
    }

    let adamantiteWeigth = resources.Adamantite.isDemanded()
      ? Number.MAX_SAFE_INTEGER
      : 100 - resources.Adamantite.storageRatio * 100;
    let aluminiumWeight = resources.Aluminium.isDemanded()
      ? Number.MAX_SAFE_INTEGER
      : 100 - resources.Aluminium.storageRatio * 100;

    adamantiteWeigth *= settings.productionAdamantiteWeight;

    let currentRatio = MineManager.currentProduction();
    let newRatio = Math.round(
      (adamantiteWeigth / (adamantiteWeigth + aluminiumWeight)) * 100,
    );

    MineManager.increaseProduction(newRatio - currentRatio);
  }

  function autoExtractor() {
    const resources = getResources();
    const settings = getSettings();
    // Nothing to do here with no moneg
    if (!ExtractorManager.initIndustry()) {
      return;
    }

    let productions = [
      { id: "common", res1: "Iron", res2: "Aluminium" },
      { id: "uncommon", res1: "Iridium", res2: "Neutronium" },
    ];
    if (haveTech("tau_roid", 5)) {
      productions.push({ id: "rare", res1: "Orichalcum", res2: "Elerium" });
    }

    for (let prod of productions) {
      let res1Weight = resources[prod.res1].isDemanded()
        ? Number.MAX_SAFE_INTEGER
        : 100 - resources[prod.res1].storageRatio * 100;
      let res2Weight = resources[prod.res2].isDemanded()
        ? Number.MAX_SAFE_INTEGER
        : 100 - resources[prod.res2].storageRatio * 100;

      res2Weight *= settings[`productionExtWeight_${prod.id}`];

      let currentRatio = ExtractorManager.currentProduction(prod.id);
      let newRatio = Math.round((res2Weight / (res1Weight + res2Weight)) * 100);

      ExtractorManager.increaseProduction(prod.id, newRatio - currentRatio);
    }
  }

  return { autoQuarry, autoMine, autoExtractor };
}
