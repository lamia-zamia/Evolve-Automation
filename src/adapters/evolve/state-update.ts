import type { GoalTransitionSnapshot } from "../../domain/state-update.ts";
import type {
  StateUpdateControls,
  StateUpdateReader,
  StateUpdateRefreshSnapshot,
} from "../../ports/state-update.ts";
import { coerceNumber, requireRecord } from "../validation.ts";

export interface StateUpdateReaderDependencies {
  readonly getGame: () => unknown;
  readonly getState: () => unknown;
  readonly getSettingsRaw: () => unknown;
  readonly getResources: () => unknown;
}

export function createStateUpdateReader(
  dependencies: StateUpdateReaderDependencies,
): StateUpdateReader {
  return Object.freeze({
    sampleGoalTransition(): GoalTransitionSnapshot {
      const game = requireRecord(dependencies.getGame(), "game");
      const global = requireRecord(game["global"], "game.global");
      const race = requireRecord(global["race"], "game.global.race");
      const stats = requireRecord(global["stats"], "game.global.stats");
      const state = requireRecord(dependencies.getState(), "state");
      const settingsRaw = requireRecord(
        dependencies.getSettingsRaw(),
        "settingsRaw",
      );
      const triggers = settingsRaw["triggers"];
      const species = race["species"];
      const goal = state["goal"];
      const days = stats["days"];
      return {
        // Legacy compared these with === against fixed strings/1; a non-match is preserved by
        // collapsing non-string species/goal and non-number days to values that never match.
        species: typeof species === "string" ? species : undefined,
        goal: typeof goal === "string" ? goal : "",
        day: typeof days === "number" ? days : Number.NaN,
        slow: Boolean(race["slow"]),
        hyper: Boolean(race["hyper"]),
        triggerCount: Array.isArray(triggers) ? triggers.length : 0,
      };
    },

    sampleRefresh(): StateUpdateRefreshSnapshot {
      const game = requireRecord(dependencies.getGame(), "game");
      const global = requireRecord(game["global"], "game.global");
      const state = requireRecord(dependencies.getState(), "state");
      const resources = requireRecord(dependencies.getResources(), "resources");
      const money = requireRecord(resources["Money"], "resources.Money");

      // The script owns this window, but computeMoneyWindow refills it from the coerced money rate
      // below, so a sample can legitimately be the NaN that an absent `rateOfChange` produced.
      const rawIncomes = state["moneyIncomes"];
      const moneyIncomes = Array.isArray(rawIncomes)
        ? rawIncomes.map(coerceNumber)
        : [];

      // Legacy guarded pillars with hasOwnProperty and iterated only when present.
      let pillars: Record<string, number> | undefined;
      if (Object.prototype.hasOwnProperty.call(global, "pillars")) {
        const rawPillars = requireRecord(
          global["pillars"],
          "game.global.pillars",
        );
        pillars = {};
        for (const key in rawPillars) {
          pillars[key] = coerceNumber(rawPillars[key]);
        }
      }

      // Absent stellar engine reads as 0 exotic mass, matching legacy `?? 0`.
      const interstellar = global["interstellar"];
      let exotic: unknown;
      if (typeof interstellar === "object" && interstellar !== null) {
        const engine = (interstellar as Record<string, unknown>)[
          "stellar_engine"
        ];
        if (typeof engine === "object" && engine !== null) {
          exotic = (engine as Record<string, unknown>)["exotic"];
        }
      }

      return {
        moneyIncomes,
        moneyRate: coerceNumber(money["rateOfChange"]),
        pillars,
        currentExotic: coerceNumber(exotic ?? 0),
        // Written back from `currentExotic` each refresh, so it carries that coercion forward.
        lastExoticMass: coerceNumber(state["whiteholeLastExoticMass"]),
      };
    },
  });
}

/** Live objects the refresh writes into, owned by the script's composition root. */
export interface StateUpdateControlsState {
  goal: string;
  tooltips: Record<string, unknown>;
  moneyIncomes: number[];
  moneyMedian: number;
  astroSign: string;
  whiteholeLastStabilise: number;
  whiteholeLastExoticMass: number;
}

export interface ResourceAccumulator {
  maxCost: number;
  techMissionMaxCost: number;
  storageRequired: number;
  requestedQuantity: number;
}

export interface TowerBuilding {
  gameMax: number;
}

export interface SpaceDockBuilding {
  isOptionsCached: () => boolean;
  cacheOptions: () => void;
}

export interface StateUpdateBuildings {
  GateEastTower: TowerBuilding;
  GateWestTower: TowerBuilding;
  GasSpaceDock: SpaceDockBuilding;
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

export interface StateUpdateControlsDependencies {
  readonly getState: () => StateUpdateControlsState;
  readonly getResources: () => Record<string, ResourceAccumulator>;
  readonly getBuildings: () => StateUpdateBuildings;
  readonly getStorageManager: () => StateUpdateStorageManager;
  readonly getPoly: () => StateUpdatePoly;
  readonly checkEvolutionResult: () => boolean;
  readonly updateTriggerSettingsContent: () => void;
  readonly updatePriorityTargets: () => void;
  readonly updateProjects: () => void;
  readonly calculateRequiredStorages: () => void;
  readonly prioritizeDemandedResources: () => void;
  readonly updateActiveTargets: () => void;
}

export function createStateUpdateControls(
  dependencies: StateUpdateControlsDependencies,
): StateUpdateControls {
  return Object.freeze({
    checkEvolutionResult(): boolean {
      return dependencies.checkEvolutionResult();
    },
    setGoal(goal: string): void {
      dependencies.getState().goal = goal;
    },
    rebuildTriggerContent(): void {
      dependencies.updateTriggerSettingsContent();
    },
    resetResourceAccumulators(): void {
      for (const resource of Object.values(dependencies.getResources())) {
        resource.maxCost = 0;
        resource.techMissionMaxCost = 0;
        resource.storageRequired = 1;
        resource.requestedQuantity = 0;
      }
    },
    applyStorageUnitValues(): void {
      const storage = dependencies.getStorageManager();
      const poly = dependencies.getPoly();
      storage.crateValue = poly.crateValue();
      storage.containerValue = poly.containerValue();
    },
    runPlanningPasses(): void {
      dependencies.updatePriorityTargets(); // Set queuedTargets and triggerTargets
      dependencies.updateProjects(); // Set obj.cost, uses triggerTargets
      dependencies.calculateRequiredStorages(); // Uses obj.cost
      dependencies.prioritizeDemandedResources(); // Set res.requestedQuantity, uses queuedTargets and triggerTargets
    },
    resetTooltips(): void {
      dependencies.getState().tooltips = {};
    },
    applyMoneyWindow(incomes: readonly number[], median: number): void {
      const state = dependencies.getState();
      // Mutate the window in place (like legacy's shift/push) to preserve the array's identity,
      // rather than replacing it with a fresh reference.
      state.moneyIncomes.splice(0, state.moneyIncomes.length, ...incomes);
      state.moneyMedian = median;
    },
    applyAstroSign(): void {
      dependencies.getState().astroSign = dependencies
        .getPoly()
        .astrologySign();
    },
    applyTowerSize(towerSize: number): void {
      const buildings = dependencies.getBuildings();
      buildings.GateEastTower.gameMax = towerSize;
      buildings.GateWestTower.gameMax = towerSize;
    },
    applyStabilise(
      stabilisedAt: number | undefined,
      lastExoticMass: number,
    ): void {
      const state = dependencies.getState();
      if (stabilisedAt !== undefined) {
        state.whiteholeLastStabilise = stabilisedAt;
      }
      state.whiteholeLastExoticMass = lastExoticMass;
    },
    cacheSpaceDockOptions(): void {
      const dock = dependencies.getBuildings().GasSpaceDock;
      if (!dock.isOptionsCached()) {
        dock.cacheOptions();
      }
    },
    updateActiveTargets(): void {
      dependencies.updateActiveTargets();
    },
  });
}
