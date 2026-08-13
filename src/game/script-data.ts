interface ScriptDataSettings {
  autoMarket: boolean;
  autoPylon: boolean;
  buildingAlwaysClick: boolean;
  autoBuild: boolean;
  buildingClickPerTick: number;
}

interface ScriptDataState {
  globalProductionModifier: number;
}

interface ScriptDataGame {
  breakdown: {
    p: {
      Global?: Record<string, string>;
      consume: Record<string, { Trade?: number } | undefined>;
    };
  };
  global: { race: Record<string, unknown> };
}

interface RuntimeResource {
  rateOfChange: number;
  rateMods: Record<string, number>;
  currentQuantity: number;
  updateData(): void;
  finalizeData(): void;
  isUnlocked(): boolean;
}

type ScriptDataResources = Record<string, RuntimeResource> & {
  Money: RuntimeResource;
  Mana: RuntimeResource;
  Population: RuntimeResource;
  Food: RuntimeResource;
  Lumber: RuntimeResource;
  Stone: RuntimeResource;
  Chrysotile: RuntimeResource;
  Furs: RuntimeResource;
};

interface ClickableBuilding {
  isClickable(): boolean;
}

interface ScriptDataBuildings {
  RockQuarry: { count: number };
  Food: ClickableBuilding;
  Lumber: ClickableBuilding;
  Stone: ClickableBuilding;
  Chrysotile: ClickableBuilding;
  Slaughter: ClickableBuilding;
}

interface RitualSpell {
  isUnlocked(): boolean;
}

interface ScriptDataDependencies {
  getSettings: () => ScriptDataSettings;
  getState: () => ScriptDataState;
  getGame: () => ScriptDataGame;
  getResources: () => ScriptDataResources;
  getBuildings: () => ScriptDataBuildings;
  getWarManager: () => { updateGarrison(): void; updateHell(): void };
  getMarketManager: () => { updateData(): void };
  getBuildingManager: () => { updateBuildings(): void };
  getSpyManager: () => { updateForeigns(): void };
  getEjectManager: () => { updateResources(): void };
  getSupplyManager: () => { updateResources(): void };
  getNaniteManager: () => { updateResources(): void };
  getRitualManager: () => {
    Productions: Record<string, RitualSpell>;
    initIndustry(): boolean;
    spellCost(spell: RitualSpell): number;
  };
  getUpdateCraftCost: () => () => void;
  getResourcesPerClick: () => () => number;
  getTicksPerSecond: () => () => number;
  getHaveTech: () => (technology: string, level?: number) => boolean;
}

export function createScriptDataLifecycle({
  getSettings,
  getState,
  getGame,
  getResources,
  getBuildings,
  getWarManager,
  getMarketManager,
  getBuildingManager,
  getSpyManager,
  getEjectManager,
  getSupplyManager,
  getNaniteManager,
  getRitualManager,
  getUpdateCraftCost,
  getResourcesPerClick,
  getTicksPerSecond,
  getHaveTech,
}: ScriptDataDependencies) {
  function updateScriptData() {
    const WarManager = getWarManager();
    const resources = getResources();
    WarManager.updateGarrison();
    WarManager.updateHell();
    for (const id in resources) {
      resources[id]!.updateData();
    }
    getUpdateCraftCost()();
    getMarketManager().updateData();
    getBuildingManager().updateBuildings();

    const state = getState();
    state.globalProductionModifier = 1;
    for (const mod of Object.values(getGame().breakdown.p.Global ?? {})) {
      state.globalProductionModifier *= 1 + (parseFloat(mod) || 0) / 100;
    }
  }

  function finalizeScriptData() {
    const settings = getSettings();
    const game = getGame();
    const resources = getResources();
    const buildings = getBuildings();
    getSpyManager().updateForeigns();
    for (const id in resources) {
      resources[id]!.finalizeData();
    }
    getEjectManager().updateResources();
    getSupplyManager().updateResources();
    getNaniteManager().updateResources();

    if (settings.autoMarket) {
      const tradeDiff = game.breakdown.p.consume.Money?.Trade || 0;
      if (tradeDiff > 0) {
        resources.Money.rateMods.buy = tradeDiff * -1;
      } else if (tradeDiff < 0) {
        resources.Money.rateMods.sell = tradeDiff * -1;
        resources.Money.rateOfChange += resources.Money.rateMods.sell;
      }
    }
    const RitualManager = getRitualManager();
    if (settings.autoPylon && RitualManager.initIndustry()) {
      Object.values(RitualManager.Productions)
        .filter((spell) => spell.isUnlocked())
        .forEach(
          (spell) =>
            (resources.Mana.rateOfChange += RitualManager.spellCost(spell)),
        );
    }

    if (
      settings.buildingAlwaysClick ||
      (settings.autoBuild &&
        (resources.Population.currentQuantity <= 15 ||
          (buildings.RockQuarry.count < 1 && !game.global.race.sappy)))
    ) {
      const resourcesPerClick =
        getResourcesPerClick()() * getTicksPerSecond()();
      const haveTech = getHaveTech();
      const conjureMod = haveTech("conjuring", 2) ? 10 : 1;
      if (buildings.Food.isClickable() && !game.global.race.fasting) {
        resources.Food.rateOfChange +=
          resourcesPerClick * settings.buildingClickPerTick * conjureMod;
      }
      if (buildings.Lumber.isClickable()) {
        resources.Lumber.rateOfChange +=
          resourcesPerClick * settings.buildingClickPerTick * conjureMod;
      }
      if (buildings.Stone.isClickable()) {
        resources.Stone.rateOfChange +=
          resourcesPerClick * settings.buildingClickPerTick * conjureMod;
      }
      if (buildings.Chrysotile.isClickable()) {
        resources.Chrysotile.rateOfChange +=
          resourcesPerClick * settings.buildingClickPerTick * conjureMod;
      }
      if (buildings.Slaughter.isClickable()) {
        resources.Lumber.rateOfChange +=
          resourcesPerClick * settings.buildingClickPerTick;
        if (game.global.race.soul_eater && haveTech("primitive", 2)) {
          resources.Food.rateOfChange +=
            resourcesPerClick * settings.buildingClickPerTick;
        }
        if (resources.Furs.isUnlocked()) {
          resources.Furs.rateOfChange +=
            resourcesPerClick * settings.buildingClickPerTick;
        }
      }
    }
  }

  return { updateScriptData, finalizeScriptData };
}
