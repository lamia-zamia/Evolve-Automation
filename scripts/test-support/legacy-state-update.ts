/**
 * Frozen copy of the legacy createStateUpdate factory, kept only as the parity oracle for the
 * migrated state-update slice tests. Do not wire into production.
 */
export interface StateUpdateSettings {
  activeTargetsUI: boolean;
  [key: string]: unknown;
}

export interface StateUpdateSettingsRaw {
  triggers: unknown[];
  [key: string]: unknown;
}

export interface StateUpdateState {
  goal: string;
  tooltips: Record<string, unknown>;
  moneyIncomes: number[];
  moneyMedian: number;
  astroSign: string;
  whiteholeLastExoticMass: number;
  whiteholeLastStabilise: number;
  queuedTargetsAll: unknown[];
  triggerTargets: unknown[];
  [key: string]: unknown;
}

export interface StateUpdateGame {
  global: {
    race: Record<string, unknown> & { species?: string };
    stats: { days: number };
    pillars?: Record<string, number>;
    interstellar?: { stellar_engine?: { exotic?: number } };
  };
}

export interface StateUpdateResource {
  maxCost: number;
  storageRequired: number;
  requestedQuantity: number;
  rateOfChange: number;
}

export interface StateUpdateStorageManager {
  crateValue: number;
  containerValue: number;
}

export interface StateUpdatePoly {
  crateValue: () => number;
  containerValue: () => number;
  astrologySign: () => string;
}

export interface StateUpdateTrigger {
  actionId: string;
  complete: boolean;
}

/**
 * The passes updateState drives. They are supplied as a group because the script wires them from
 * several modules, and because their call order is the contract this boundary exists to preserve.
 */
export interface StateUpdateHelpers {
  checkEvolutionResult: () => boolean;
  updateTriggerSettingsContent: () => void;
  updatePriorityTargets: () => void;
  calculateRequiredStorages: () => void;
  prioritizeDemandedResources: () => void;
  updateActiveTargetsUI: (targets: unknown[], type: string) => void;
}

export interface StateUpdateDependencies {
  getSettings: () => StateUpdateSettings;
  getSettingsRaw: () => StateUpdateSettingsRaw;
  getState: () => StateUpdateState;
  getGame: () => StateUpdateGame;
  getResources: () => Record<string, StateUpdateResource>;
  getBuildings: () => Record<string, any>;
  getStorageManager: () => StateUpdateStorageManager;
  getProjectManager: () => { updateProjects: () => void };
  getTriggerManager: () => { targetTriggers: StateUpdateTrigger[] };
  getPoly: () => StateUpdatePoly;
  getJQuery: () => any;
  getHelpers: () => StateUpdateHelpers;
  isTechnology: (target: unknown) => boolean;
  isProject: (target: unknown) => boolean;
}

export function createStateUpdate({
  getSettings,
  getSettingsRaw,
  getState,
  getGame,
  getResources,
  getBuildings,
  getStorageManager,
  getProjectManager,
  getTriggerManager,
  getPoly,
  getJQuery,
  getHelpers,
  isTechnology,
  isProject,
}: StateUpdateDependencies) {
  /**
   * The per-tick planning refresh: it resolves what the last evolution produced, clears the
   * accumulators the planning passes write into, runs those passes in dependency order, and
   * refreshes the derived game state the controllers read afterwards.
   */
  function updateState(): void {
    const h = getHelpers();
    const settings = getSettings();
    const settingsRaw = getSettingsRaw();
    const state = getState();
    const game = getGame();
    const resources = getResources();
    const buildings = getBuildings();
    const poly = getPoly();
    const $ = getJQuery();

    if (game.global.race.species === "protoplasm") {
      state.goal = "Evolution";
    } else if (state.goal === "Evolution") {
      // Check what we got after evolution
      if (!h.checkEvolutionResult()) {
        return;
      }
      state.goal = "Standard";
      if (settingsRaw.triggers.length > 0) {
        // We've moved from evolution to standard play. There are technology descriptions that we couldn't update until now.
        h.updateTriggerSettingsContent();
      }
    } else if (
      game.global.stats.days === 1 &&
      (game.global.race.slow ||
        game.global.race.hyper ||
        game.global.race.species === "junker")
    ) {
      // Fallback check, in case if game reloaded page after evolution
      if (!h.checkEvolutionResult()) {
        return;
      }
    }

    // Reset required storage and prioritized resources
    for (const id in resources) {
      resources[id].maxCost = 0;
      resources[id].storageRequired = 1;
      resources[id].requestedQuantity = 0;
    }
    const StorageManager = getStorageManager();
    StorageManager.crateValue = poly.crateValue();
    StorageManager.containerValue = poly.containerValue();
    h.updatePriorityTargets(); // Set queuedTargets and triggerTargets
    getProjectManager().updateProjects(); // Set obj.cost, uses triggerTargets
    h.calculateRequiredStorages(); // Uses obj.cost
    h.prioritizeDemandedResources(); // Set res.requestedQuantity, uses queuedTargets and triggerTargets

    state.tooltips = {};
    state.moneyIncomes.shift();
    for (let i = state.moneyIncomes.length; i < 11; i++) {
      state.moneyIncomes.push(resources.Money.rateOfChange);
    }
    state.moneyMedian = [...state.moneyIncomes].sort((a, b) => a - b)[5];

    // This comes from the "const towerSize = (function(){" in portal.js in the game code
    let towerSize = 1000;
    if (Object.prototype.hasOwnProperty.call(game.global, "pillars")) {
      for (const pillar in game.global.pillars) {
        if (game.global.pillars[pillar]) {
          towerSize -= game.global.pillars[pillar] * 2 + 2;
        }
      }
    }
    if (towerSize < 250) {
      towerSize = 250;
    }

    state.astroSign = poly.astrologySign();

    buildings.GateEastTower.gameMax = towerSize;
    buildings.GateWestTower.gameMax = towerSize;

    // Check to see if user stabilized by detecting exotic mass going down
    if (
      (game.global.interstellar?.stellar_engine?.exotic ?? 0) <
      state.whiteholeLastExoticMass
    ) {
      state.whiteholeLastStabilise = Date.now();
    }
    state.whiteholeLastExoticMass =
      game.global.interstellar?.stellar_engine?.exotic ?? 0;

    // Space dock is special and has a modal window with more buildings!
    if (!buildings.GasSpaceDock.isOptionsCached()) {
      buildings.GasSpaceDock.cacheOptions();
    }

    if (settings.activeTargetsUI) {
      const queuedTargets = state.queuedTargetsAll;

      const triggersList = state.triggerTargets,
        buildingsList: unknown[] = [],
        researchList: unknown[] = [],
        arpaList: unknown[] = [];

      queuedTargets.forEach((target) => {
        if (isTechnology(target)) {
          researchList.push(target);
        } else if (isProject(target)) {
          arpaList.push(target);
        } else {
          buildingsList.push(target);
        }
      });

      h.updateActiveTargetsUI(triggersList, "triggers");
      h.updateActiveTargetsUI(buildingsList, "buildings");
      h.updateActiveTargetsUI(researchList, "research");
      h.updateActiveTargetsUI(arpaList, "arpa");

      // remove from queue by clicking
      $(".active-target-remove-x").click(function (this: unknown) {
        const queueId = $(this).data("queueid"),
          type = $(this).data("type");

        const $queuedItem = $(".queued").filter((id: number, el: any) => {
          return el.id.indexOf(queueId) > -1;
        });

        if (type === "triggers") {
          const clickedTrigger = getTriggerManager().targetTriggers.find(
            (trigger) => trigger.actionId.includes(queueId),
          );

          if (clickedTrigger !== undefined && clickedTrigger !== null) {
            clickedTrigger.complete = true;
          }
        } else if ($queuedItem?.length) {
          $queuedItem[0].click();
        }

        $("#active_targets-wrapper").css("height", "auto");
      });
    } else {
      $(".active-target-remove-x").off("click");
    }
  }

  return { updateState };
}
