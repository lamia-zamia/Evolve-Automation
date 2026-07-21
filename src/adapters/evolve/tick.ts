import type {
  TickAutomationSnapshot,
  TickControls,
  TickPreambleSnapshot,
  TickReader,
} from "../../ports/tick.ts";
import { requireRecord } from "../validation.ts";

/** Legacy read these settings/state/game fields directly; coerce the same way it did. */
function toNumber(value: unknown): number {
  return Number(value);
}

export interface TickReaderDependencies {
  readonly getSettings: () => unknown;
  readonly getState: () => unknown;
  readonly getGame: () => unknown;
}

export function createTickReader(
  dependencies: TickReaderDependencies,
): TickReader {
  return Object.freeze({
    samplePreamble(): TickPreambleSnapshot {
      const state = requireRecord(dependencies.getState(), "state");
      const settings = requireRecord(dependencies.getSettings(), "settings");
      const game = requireRecord(dependencies.getGame(), "game");
      const global = requireRecord(game["global"], "game.global");
      const gameSettings = requireRecord(
        global["settings"],
        "game.global.settings",
      );
      const goal = state["goal"];
      return {
        goal: typeof goal === "string" ? goal : "",
        forcedUpdate: Boolean(state["forcedUpdate"]),
        gameTicked: Boolean(state["gameTicked"]),
        scriptTick: toNumber(state["scriptTick"]),
        tickRate: toNumber(settings["tickRate"]),
        accelerated: Boolean(gameSettings["at"]),
      };
    },

    sampleAutomation(): TickAutomationSnapshot {
      const state = requireRecord(dependencies.getState(), "state");
      const settings = requireRecord(dependencies.getSettings(), "settings");
      const game = requireRecord(dependencies.getGame(), "game");
      const global = requireRecord(game["global"], "game.global");
      const race = requireRecord(global["race"], "game.global.race");
      const flag = (key: string): boolean => Boolean(settings[key]);
      const goal = state["goal"];
      const stateLogTick = state["stateLogTick"];
      return {
        goal: typeof goal === "string" ? goal : "",
        masterScriptToggle: flag("masterScriptToggle"),
        truepath: Boolean(race["truepath"]),
        buildingAlwaysClick: flag("buildingAlwaysClick"),
        autoEvolution: flag("autoEvolution"),
        autoBuild: flag("autoBuild"),
        autoARPA: flag("autoARPA"),
        autoMarket: flag("autoMarket"),
        autoHell: flag("autoHell"),
        autoGalaxyMarket: flag("autoGalaxyMarket"),
        autoMiningDroid: flag("autoMiningDroid"),
        autoGraphenePlant: flag("autoGraphenePlant"),
        autoAlchemy: flag("autoAlchemy"),
        autoPylon: flag("autoPylon"),
        autoQuarry: flag("autoQuarry"),
        autoMine: flag("autoMine"),
        autoExtractor: flag("autoExtractor"),
        autoSmelter: flag("autoSmelter"),
        autoStorage: flag("autoStorage"),
        autoReplicator: flag("autoReplicator"),
        autoTrigger: flag("autoTrigger"),
        autoResearch: flag("autoResearch"),
        autoFactory: flag("autoFactory"),
        autoJobs: flag("autoJobs"),
        autoCraftsmen: flag("autoCraftsmen"),
        autoFleet: flag("autoFleet"),
        autoMech: flag("autoMech"),
        autoGenetics: flag("autoGenetics"),
        autoMinorTrait: flag("autoMinorTrait"),
        autoCraft: flag("autoCraft"),
        autoFight: flag("autoFight"),
        autoTax: flag("autoTax"),
        autoGovernment: flag("autoGovernment"),
        autoNanite: flag("autoNanite"),
        autoSupply: flag("autoSupply"),
        autoEject: flag("autoEject"),
        autoPower: flag("autoPower"),
        autoMutateTraits: flag("autoMutateTraits"),
        stateLogEnabled: flag("stateLogEnabled"),
        stateLogInterval: toNumber(settings["stateLogInterval"]),
        // Legacy defaulted an absent counter to 0 (`state.stateLogTick ?? 0`).
        stateLogTick: stateLogTick == null ? 0 : toNumber(stateLogTick),
      };
    },
  });
}

/** The script's controller bag, wired by the composition root. */
export interface TickControllerBag {
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

export interface TickControlsState {
  gameTicked: boolean;
  scriptTick: number;
  plannerFreshTick: number;
  stateLogTick: number;
  soulGemLast: number;
}

export interface TickKeyManager {
  reset: () => void;
  finish: () => void;
}

export interface TickControlsDependencies {
  readonly getControllers: () => TickControllerBag;
  readonly getKeyManager: () => TickKeyManager;
  readonly getState: () => TickControlsState;
  readonly getResources: () => { Soul_Gem: { currentQuantity: number } };
  readonly getNaniteManager: () => unknown;
  readonly getSupplyManager: () => unknown;
  readonly getEjectManager: () => unknown;
}

export function createTickControls(
  dependencies: TickControlsDependencies,
): TickControls {
  const c = () => dependencies.getControllers();
  return Object.freeze({
    markGameTickConsumed(): void {
      dependencies.getState().gameTicked = false;
    },
    setScriptTick(scriptTick: number): void {
      dependencies.getState().scriptTick = scriptTick;
    },
    setPlannerFreshTick(scriptTick: number): void {
      dependencies.getState().plannerFreshTick = scriptTick;
    },
    setStateLogTick(stateLogTick: number): void {
      dependencies.getState().stateLogTick = stateLogTick;
    },
    recordSoulGem(): void {
      dependencies.getState().soulGemLast =
        dependencies.getResources().Soul_Gem.currentQuantity;
    },

    updateScriptData: () => c().updateScriptData(),
    updateOverrides: () => c().updateOverrides(),
    finalizeScriptData: () => c().finalizeScriptData(),
    updateTabs: () => c().updateTabs(true),
    updateState: () => c().updateState(),
    updateUI: () => c().updateUI(),
    keyManagerReset: () => dependencies.getKeyManager().reset(),
    keyManagerFinish: () => dependencies.getKeyManager().finish(),

    autoEvolution: () => c().autoEvolution(),
    autoGatherResources: () => c().autoGatherResources(),
    autoMarket: () => c().autoMarket(),
    autoHell: () => c().autoHell(),
    autoGalaxyMarket: () => c().autoGalaxyMarket(),
    autoMiningDroid: () => c().autoMiningDroid(),
    autoGraphenePlant: () => c().autoGraphenePlant(),
    autoAlchemy: () => c().autoAlchemy(),
    autoPylon: () => c().autoPylon(),
    autoQuarry: () => c().autoQuarry(),
    autoMine: () => c().autoMine(),
    autoExtractor: () => c().autoExtractor(),
    autoSmelter: () => c().autoSmelter(),
    autoStorage: () => c().autoStorage(),
    autoReplicator: () => c().autoReplicator(),
    autoTrigger: () => c().autoTrigger(),
    autoResearch: () => c().autoResearch(),
    autoBuild: () => c().autoBuild(),
    autoFactory: () => c().autoFactory(),
    autoJobs(craftsmenOnly?: boolean): void {
      // Preserve legacy's exact call arity: full jobs is a zero-arg call, not autoJobs(undefined).
      if (craftsmenOnly === undefined) {
        c().autoJobs();
      } else {
        c().autoJobs(craftsmenOnly);
      }
    },
    autoFleetOuter: () => c().autoFleetOuter(),
    autoFleet: () => c().autoFleet(),
    autoMech: () => c().autoMech(),
    autoGenetics: () => c().autoGenetics(),
    autoMinorTrait: () => c().autoMinorTrait(),
    autoCraft: () => c().autoCraft(),
    autoMerc: () => c().autoMerc(),
    autoSpy: () => c().autoSpy(),
    autoBattle: () => c().autoBattle(),
    autoTax: () => c().autoTax(),
    autoGovernment: () => c().autoGovernment(),
    consumeNanite: () => c().autoConsume(dependencies.getNaniteManager()),
    consumeSupply: () => c().autoConsume(dependencies.getSupplyManager()),
    consumeEject: () => c().autoConsume(dependencies.getEjectManager()),
    autoPower: () => c().autoPower(),
    isPrestigeAllowed: () => c().isPrestigeAllowed(),
    autoPrestige: () => c().autoPrestige(),
    autoShapeshift: () => c().autoShapeshift(),
    autoPsychic: () => c().autoPsychic(),
    autoOcularPowers: () => c().autoOcularPowers(),
    autoWish: () => c().autoWish(),
    autoMutateTrait: () => c().autoMutateTrait(),
    updateBuildPlanner: () => c().updateBuildPlanner(),
    recordStateSnapshot: () => c().recordStateSnapshot(),
  });
}
