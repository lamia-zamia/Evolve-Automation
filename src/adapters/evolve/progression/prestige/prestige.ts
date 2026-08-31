import type {
  PrestigeBranch,
  PrestigeCommand,
  PrestigeInput,
} from "../../../../domain/progression/prestige/prestige.ts";
import type { GameClickMultipliersPort } from "../../../../ports/game-click-multipliers.ts";
import type {
  PrestigeExecutor,
  PrestigeReader,
} from "../../../../ports/prestige.ts";
import {
  callBoolean,
  coerceNumber,
  requireFunction,
  requireRecord,
} from "../../../validation.ts";

/**
 * Narrow gate over the already-migrated prestige-eligibility decision surface.
 * The prestige command slice consumes the eligibility results as booleans; the
 * gated branches never re-derive the eligibility view here.
 */
export interface PrestigeEligibilityGate {
  isBioseederPrestigeAvailable(): boolean;
  isCataclysmPrestigeAvailable(): boolean;
  isWhiteholePrestigeAvailable(): boolean;
  isApocalypsePrestigeAvailable(): boolean;
  isAscensionPrestigeAvailable(): boolean;
  isWitchAscensionPrestigeAvailable(demonic: boolean): boolean;
  isDemonicPrestigeAvailable(): boolean;
}

export interface PrestigeReaderDependencies {
  readonly getState: () => unknown;
  readonly getSettings: () => unknown;
  readonly getGame: () => unknown;
  readonly getResources: () => unknown;
  readonly getBuildings: () => unknown;
  readonly getTechIds: () => unknown;
  readonly getWarManager: () => unknown;
  readonly getHaveTech: () => (id: string, level?: number) => unknown;
  readonly getVueById: (id: string) => unknown;
  readonly eligibility: PrestigeEligibilityGate;
}

export function createPrestigeReader(
  dependencies: PrestigeReaderDependencies,
): PrestigeReader {
  const buildingBool = (id: string, method: string): boolean => {
    const buildings = requireRecord(dependencies.getBuildings(), "buildings");
    const building = requireRecord(buildings[id], `buildings.${id}`);
    return callBoolean(building, method, `buildings.${id}`);
  };

  const techBool = (id: string, method: string): boolean => {
    const techIds = requireRecord(dependencies.getTechIds(), "techIds");
    const tech = requireRecord(techIds[id], `techIds.${id}`);
    return callBoolean(tech, method, `techIds.${id}`);
  };

  const race = (): Record<PropertyKey, unknown> =>
    requireRecord(
      requireRecord(
        requireRecord(dependencies.getGame(), "game")["global"],
        "game.global",
      )["race"],
      "game.global.race",
    );

  const techGrants = (): Record<PropertyKey, unknown> =>
    requireRecord(
      requireRecord(
        requireRecord(dependencies.getGame(), "game")["global"],
        "game.global",
      )["tech"],
      "game.global.tech",
    );

  const madBranch = (
    settings: Record<PropertyKey, unknown>,
  ): PrestigeBranch => {
    const madVue = dependencies.getVueById("mad");
    const display =
      typeof madVue === "object" && madVue !== null
        ? Boolean((madVue as Record<PropertyKey, unknown>)["display"])
        : false;
    const armed =
      typeof madVue === "object" && madVue !== null
        ? Boolean((madVue as Record<PropertyKey, unknown>)["armed"])
        : false;
    // haveTech is a side-effect-free query, so sampling it eagerly (even when
    // display already fails the legacy `&&`) is unobservable.
    const eligible = display && Boolean(dependencies.getHaveTech()("mad"));
    const war = requireRecord(dependencies.getWarManager(), "WarManager");
    const population = requireRecord(
      requireRecord(dependencies.getResources(), "resources")["Population"],
      "resources.Population",
    );
    return {
      type: "mad",
      eligible,
      armed,
      waitForPopulation: Boolean(settings["prestigeMADWait"]),
      // The soldier counts are WarManager getters over live worker/crew fields, and the population
      // quantities come from the resource wrapper. A NaN fails every `>=` in the wait check, so it
      // holds MAD back rather than arming it.
      currentSoldiers: coerceNumber(war["currentSoldiers"]),
      maxSoldiers: coerceNumber(war["maxSoldiers"]),
      currentPopulation: coerceNumber(population["currentQuantity"]),
      maxPopulation: coerceNumber(population["maxQuantity"]),
      requiredPopulation: coerceNumber(settings["prestigeMADPopulation"]),
    };
  };

  return Object.freeze({
    samplePrestige(): PrestigeInput {
      const state = requireRecord(dependencies.getState(), "state");
      const rawGoal = state["goal"];
      const goal = typeof rawGoal === "string" ? rawGoal : "";
      const settings = requireRecord(dependencies.getSettings(), "settings");
      const { eligibility } = dependencies;

      let branch: PrestigeBranch;
      switch (settings["prestigeType"]) {
        case "mad":
          branch = madBranch(settings);
          break;
        case "bioseed":
          branch = {
            type: "bioseed",
            eligible: eligibility.isBioseederPrestigeAvailable(),
            launchUnlocked: buildingBool("GasSpaceDockLaunch", "isUnlocked"),
            prepUnlocked: buildingBool(
              "GasSpaceDockPrepForLaunch",
              "isUnlocked",
            ),
          };
          break;
        case "cataclysm":
          branch = {
            type: "cataclysm",
            eligible: eligibility.isCataclysmPrestigeAvailable(),
            loadQueuedSettings: Boolean(settings["autoEvolution"]),
            dialClickable: techBool("tech-dial_it_to_11", "isClickable"),
          };
          break;
        case "whitehole":
          branch = {
            type: "whitehole",
            eligible: eligibility.isWhiteholePrestigeAvailable(),
            exoticInfusionReady:
              techBool("tech-exotic_infusion", "isUnlocked") &&
              techBool("tech-exotic_infusion", "isAffordable"),
            // `tech.whitehole` is absent until the stellar engine first goes
            // unstable, and the game deletes it again when the hole is
            // stabilized, so the missing key is the normal state rather than a
            // malformed one.
            whiteholeLevel: coerceNumber(techGrants()["whitehole"]),
            confirmReady: techBool("tech-infusion_confirm", "isClickable"),
          };
          break;
        case "apocalypse":
          branch = {
            type: "apocalypse",
            eligible: eligibility.isApocalypsePrestigeAvailable(),
          };
          break;
        case "ascension": {
          const witchHunter = Boolean(race()["witch_hunter"]);
          branch = {
            type: "ascension",
            witchHunter,
            eligible: witchHunter
              ? eligibility.isWitchAscensionPrestigeAvailable(false)
              : eligibility.isAscensionPrestigeAvailable(),
          };
          break;
        }
        case "demonic": {
          const current = race();
          const witchHunter = Boolean(current["witch_hunter"]);
          branch = {
            type: "demonic",
            witchHunter,
            fasting: Boolean(current["fasting"]),
            eligible: witchHunter
              ? eligibility.isWitchAscensionPrestigeAvailable(true)
              : eligibility.isDemonicPrestigeAvailable(),
          };
          break;
        }
        case "terraform":
          branch = {
            type: "building-reset",
            building: "RedTerraform",
            unlocked: buildingBool("RedTerraform", "isUnlocked"),
          };
          break;
        case "matrix":
          branch = {
            type: "building-reset",
            building: "TauStarBluePill",
            unlocked: buildingBool("TauStarBluePill", "isUnlocked"),
          };
          break;
        case "apotheosis":
          branch = {
            type: "building-reset",
            building: "PalaceApotheosis",
            unlocked: buildingBool("PalaceApotheosis", "isUnlocked"),
          };
          break;
        default:
          // none, vacuum, retire, eden (handled externally), and unknown types.
          branch = { type: "noop" };
      }

      return Object.freeze({ goal, branch: Object.freeze(branch) });
    },
  });
}

export interface PrestigeExecutorDependencies {
  readonly getState: () => unknown;
  readonly getBuildings: () => unknown;
  readonly getTechIds: () => unknown;
  readonly getVueById: (id: string) => unknown;
  readonly clickMultipliers: GameClickMultipliersPort;
  readonly logPrestige: () => void;
  readonly loadQueuedSettings: () => void;
}

export function createPrestigeCommandExecutor(
  dependencies: PrestigeExecutorDependencies,
): PrestigeExecutor {
  const callBuilding = (id: string, method: string): void => {
    const buildings = requireRecord(dependencies.getBuildings(), "buildings");
    const building = requireRecord(buildings[id], `buildings.${id}`);
    requireFunction(building[method], `buildings.${id}.${method}`).call(
      building,
    );
  };

  const clickTech = (id: string): void => {
    const techIds = requireRecord(dependencies.getTechIds(), "techIds");
    const tech = requireRecord(techIds[id], `techIds.${id}`);
    requireFunction(tech["click"], `techIds.${id}.click`).call(tech);
  };

  const callMad = (method: string): void => {
    const madVue = requireRecord(dependencies.getVueById("mad"), "vue.mad");
    requireFunction(madVue[method], `vue.mad.${method}`).call(madVue);
  };

  return Object.freeze({
    execute(command: PrestigeCommand): void {
      switch (command.kind) {
        case "set-goal": {
          const state = requireRecord(dependencies.getState(), "state");
          state["goal"] = command.goal;
          return;
        }
        case "log-prestige":
          dependencies.logPrestige();
          return;
        case "arm-mad":
          callMad("arm");
          return;
        case "launch-mad":
          callMad("launch");
          return;
        case "click-building":
          callBuilding(command.id, "click");
          return;
        case "cache-building-options":
          callBuilding(command.id, "cacheOptions");
          return;
        case "click-tech":
          clickTech(command.id);
          return;
        case "reset-modifier-keys":
          dependencies.clickMultipliers.clear();
          return;
        case "absorption-chamber-action": {
          const buildings = requireRecord(
            dependencies.getBuildings(),
            "buildings",
          );
          const chamber = requireRecord(
            buildings["PitAbsorptionChamber"],
            "buildings.PitAbsorptionChamber",
          );
          requireFunction(
            chamber["activate"],
            "buildings.PitAbsorptionChamber.activate",
          ).call(chamber);
          return;
        }
        case "load-queued-settings":
          dependencies.loadQueuedSettings();
          return;
        case "mark-whitehole-reset-started": {
          // Records, for this page session only, that the reset has been
          // committed. The research slice reads it to tell an animating reset
          // apart from one a page reload interrupted.
          const state = requireRecord(dependencies.getState(), "state");
          state["whiteholeResetStarted"] = true;
          return;
        }
      }
    },
  });
}
