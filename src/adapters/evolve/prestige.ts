import type {
  PrestigeBranch,
  PrestigeCommand,
  PrestigeInput,
} from "../../domain/prestige.ts";
import type { PrestigeExecutor, PrestigeReader } from "../../ports/prestige.ts";
import { requireFunction, requireRecord } from "../validation.ts";

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

/** Plain coercion preserves the NaN-safe comparisons legacy MAD math relied on. */
function toNumber(value: unknown): number {
  return Number(value);
}

function callBool(
  owner: Record<PropertyKey, unknown>,
  path: string,
  method: string,
): boolean {
  const fn = requireFunction(owner[method], `${path}.${method}`);
  return Boolean(fn.call(owner));
}

export function createPrestigeReader(
  dependencies: PrestigeReaderDependencies,
): PrestigeReader {
  const buildingBool = (id: string, method: string): boolean => {
    const buildings = requireRecord(dependencies.getBuildings(), "buildings");
    const building = requireRecord(buildings[id], `buildings.${id}`);
    return callBool(building, `buildings.${id}`, method);
  };

  const techBool = (id: string, method: string): boolean => {
    const techIds = requireRecord(dependencies.getTechIds(), "techIds");
    const tech = requireRecord(techIds[id], `techIds.${id}`);
    return callBool(tech, `techIds.${id}`, method);
  };

  const race = (): Record<PropertyKey, unknown> =>
    requireRecord(
      requireRecord(
        requireRecord(dependencies.getGame(), "game")["global"],
        "game.global",
      )["race"],
      "game.global.race",
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
      currentSoldiers: toNumber(war["currentSoldiers"]),
      maxSoldiers: toNumber(war["maxSoldiers"]),
      currentPopulation: toNumber(population["currentQuantity"]),
      maxPopulation: toNumber(population["maxQuantity"]),
      requiredPopulation: toNumber(settings["prestigeMADPopulation"]),
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
  readonly getKeyManager: () => unknown;
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
        case "reset-modifier-keys": {
          const keyManager = requireRecord(
            dependencies.getKeyManager(),
            "KeyManager",
          );
          requireFunction(keyManager["set"], "KeyManager.set").call(
            keyManager,
            false,
            false,
            false,
          );
          return;
        }
        case "absorption-chamber-action": {
          const buildings = requireRecord(
            dependencies.getBuildings(),
            "buildings",
          );
          const chamber = requireRecord(
            buildings["PitAbsorptionChamber"],
            "buildings.PitAbsorptionChamber",
          );
          const vue = requireRecord(
            chamber["vue"],
            "buildings.PitAbsorptionChamber.vue",
          );
          requireFunction(
            vue["action"],
            "buildings.PitAbsorptionChamber.vue.action",
          ).call(vue);
          return;
        }
        case "load-queued-settings":
          dependencies.loadQueuedSettings();
          return;
      }
    },
  });
}
