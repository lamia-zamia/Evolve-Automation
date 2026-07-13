export interface TickSettings {
  masterScriptToggle: boolean;
  tickRate: number;
  stateLogEnabled: boolean;
  stateLogInterval: number;
  [key: string]: unknown;
}

export interface TickState {
  goal?: string;
  forcedUpdate?: boolean;
  gameTicked?: boolean;
  scriptTick: number;
  plannerFreshTick?: number;
  stateLogTick?: number;
  soulGemLast?: number;
  [key: string]: unknown;
}

export interface TickGame {
  global: {
    race: Record<string, unknown>;
    settings: Record<string, unknown>;
  };
}

export interface TickKeyManager {
  reset: () => void;
  finish: () => void;
}

/**
 * Every automation the tick can run. These are the script's controllers plus the data-refresh and
 * UI passes that bracket them; the tick owns only the order and the settings gates.
 */
export interface TickControllers {
  updateScriptData: () => void;
  updateOverrides: () => void;
  finalizeScriptData: () => void;
  updateTabs: (update: boolean) => boolean;
  updateState: () => void;
  updateUI: () => void;
  autoEvolution: () => void;
  autoGatherResources: () => void;
  autoMarket: () => void;
  autoHell: () => void;
  autoGalaxyMarket: () => void;
  autoMiningDroid: () => void;
  autoGraphenePlant: () => void;
  autoAlchemy: () => void;
  autoPylon: () => void;
  autoQuarry: () => void;
  autoMine: () => void;
  autoExtractor: () => void;
  autoSmelter: () => void;
  autoStorage: () => void;
  autoReplicator: () => void;
  autoTrigger: () => boolean;
  autoResearch: () => void;
  autoBuild: () => void;
  autoFactory: () => void;
  autoJobs: (craftsmenOnly?: boolean) => void;
  autoFleetOuter: () => void;
  autoFleet: () => void;
  autoMech: () => void;
  autoGenetics: () => void;
  autoMinorTrait: () => void;
  autoCraft: () => void;
  autoMerc: () => void;
  autoSpy: () => void;
  autoBattle: () => void;
  autoTax: () => void;
  autoGovernment: () => void;
  autoConsume: (manager: unknown) => void;
  autoPower: () => void;
  isPrestigeAllowed: () => boolean;
  autoPrestige: () => void;
  autoShapeshift: () => void;
  autoPsychic: () => void;
  autoOcularPowers: () => void;
  autoWish: () => void;
  autoMutateTrait: () => void;
  updateBuildPlanner: () => void;
  recordStateSnapshot: () => void;
}

export interface TickOrchestrationDependencies {
  getSettings: () => TickSettings;
  getState: () => TickState;
  getGame: () => TickGame;
  getResources: () => Record<string, { currentQuantity: number }>;
  getKeyManager: () => TickKeyManager;
  getNaniteManager: () => unknown;
  getSupplyManager: () => unknown;
  getEjectManager: () => unknown;
  getControllers: () => TickControllers;
}

export function createTickOrchestration({
  getSettings,
  getState,
  getGame,
  getResources,
  getKeyManager,
  getNaniteManager,
  getSupplyManager,
  getEjectManager,
  getControllers,
}: TickOrchestrationDependencies) {
  /**
   * One pass of automation, driven by the game's own tick. The order below is load-bearing: several
   * controllers invalidate data that the ones after them would otherwise misread, and the comments
   * record which dependency each position is protecting.
   */
  function automate(): void {
    const state = getState();
    const settings = getSettings();
    const game = getGame();

    if (
      state.goal === "GameOverMan" ||
      state.forcedUpdate ||
      !state.gameTicked
    ) {
      return;
    }
    state.gameTicked = false;
    if (state.scriptTick < Number.MAX_SAFE_INTEGER) {
      state.scriptTick++;
    } else {
      state.scriptTick = 1;
    }
    if (
      state.scriptTick %
        (game.global.settings.at
          ? settings.tickRate * 2
          : settings.tickRate) !==
      0
    ) {
      return;
    }

    const c = getControllers();
    const KeyManager = getKeyManager();

    c.updateScriptData(); // Sync exposed data with script variables
    c.updateOverrides(); // Apply settings overrides as soon as possible
    c.finalizeScriptData(); // Second part of updating data, applying settings

    // Redraw tabs once they unlocked
    if (c.updateTabs(true)) {
      return;
    }

    // TODO: Properly sepparate updateState between updateScriptData and finalizeScriptData
    c.updateState();
    c.updateUI();
    KeyManager.reset();

    // The user has turned off the master toggle. Stop taking any actions on behalf of the player.
    // We've still updated the UI etc. above; just not performing any actions.
    if (!settings.masterScriptToggle) {
      return;
    }

    if (state.goal === "Evolution") {
      if (settings.autoEvolution) {
        c.autoEvolution();
      }
      return;
    }

    if (settings.buildingAlwaysClick || settings.autoBuild) {
      c.autoGatherResources();
    }
    if (settings.autoMarket) {
      c.autoMarket(); // Invalidates values of resources, changes are random and can't be predicted, but we won't need values anywhere else
    }
    if (settings.autoHell) {
      c.autoHell();
    }
    if (settings.autoGalaxyMarket) {
      c.autoGalaxyMarket();
    }
    if (settings.autoMiningDroid) {
      c.autoMiningDroid();
    }
    if (settings.autoGraphenePlant) {
      c.autoGraphenePlant();
    }
    if (settings.autoAlchemy) {
      c.autoAlchemy();
    }
    if (settings.autoPylon) {
      c.autoPylon();
    }
    if (settings.autoQuarry) {
      c.autoQuarry();
    }
    if (settings.autoMine) {
      c.autoMine();
    }
    if (settings.autoExtractor) {
      c.autoExtractor();
    }
    if (settings.autoSmelter) {
      c.autoSmelter();
    }
    if (settings.autoStorage) {
      // Called before autoJobs, autoFleet and autoPower - so they wont mess with quantum
      c.autoStorage();
    }
    if (settings.autoReplicator) {
      c.autoReplicator();
    }
    if (!settings.autoTrigger || !c.autoTrigger()) {
      // Only go to autoResearch and autoBuild if triggers not building anything at this very moment, to ensure they won't steal reasources from triggers
      if (settings.autoResearch) {
        c.autoResearch(); // Called before autoBuild and autoGenetics - knowledge goes to techs first
      }
      if (settings.autoBuild || settings.autoARPA) {
        c.autoBuild(); // Called after autoStorage to compensate fluctuations of quantum(caused by previous tick's adjustments) levels before weightings
        state.plannerFreshTick = state.scriptTick;
      }
    }
    if (settings.autoFactory) {
      c.autoFactory();
    }
    if (settings.autoJobs) {
      c.autoJobs();
    } else if (settings.autoCraftsmen) {
      c.autoJobs(true);
    }
    if (settings.autoFleet) {
      if (game.global.race["truepath"]) {
        c.autoFleetOuter();
      } else {
        c.autoFleet(); // Need to know Mine Layers stateOnCount, called before autoPower while it's still valid
      }
    }
    if (settings.autoMech) {
      c.autoMech(); // Called after autoBuild, to prevent stealing supplies from mechs
    }
    if (settings.autoGenetics) {
      c.autoGenetics(); // Called after autoBuild and autoResearch to prevent stealing knowledge from them
    }
    if (settings.autoMinorTrait) {
      c.autoMinorTrait(); // Called after auto assemble to utilize new genes right asap
    }
    if (settings.autoCraft) {
      c.autoCraft(); // Invalidates quantities of craftables, missing exposed craftingRatio to calculate craft result on script side
    }
    if (settings.autoFight) {
      c.autoMerc();
      c.autoSpy(); // Can unoccupy foreign power in rare occasions, without caching back new status, but such desync should not cause any harm
      c.autoBattle(); // Invalidates garrison, and adds unaccounted amount of resources after attack
    }
    if (settings.autoTax) {
      c.autoTax();
    }
    if (settings.autoGovernment) {
      c.autoGovernment();
    }
    if (settings.autoNanite) {
      c.autoConsume(getNaniteManager()); // Purge remaining rateOfChange, should be called when it won't be needed anymore
    }
    if (settings.autoSupply) {
      c.autoConsume(getSupplyManager());
    }
    if (settings.autoEject) {
      c.autoConsume(getEjectManager());
    }
    if (settings.autoPower) {
      // Called after purging of rateOfChange, to know useless resources
      c.autoPower();
    }
    if (c.isPrestigeAllowed()) {
      c.autoPrestige(); // Called after autoBattle to not launch attacks right before reset, killing soldiers
    }
    if (settings.autoMinorTrait) {
      c.autoShapeshift(); // Shifting genus can remove techs, buildings, resources, etc. Leaving broken preloaded buttons behind. This thing need to be at the very end, to prevent clicking anything before redrawing tabs
      c.autoPsychic();
      c.autoOcularPowers();
      c.autoWish();
    }
    if (settings.autoMutateTraits) {
      c.autoMutateTrait();
    }

    c.updateBuildPlanner();

    if (settings.stateLogEnabled) {
      // Count processed ticks (this runs once per working automate() cycle), so
      // the interval is predictable regardless of tickRate.
      state.stateLogTick = (state.stateLogTick ?? 0) + 1;
      if (state.stateLogTick % settings.stateLogInterval === 0) {
        c.recordStateSnapshot();
      }
    }

    KeyManager.finish();
    state.soulGemLast = getResources().Soul_Gem.currentQuantity;
  }

  return { automate };
}
