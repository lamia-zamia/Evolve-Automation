import {
  canUsePlunderTactic,
  classifyOccupationCandidate,
  planBattle,
  type BattleOccupationTargetInput,
  type BattleParameters,
  type BattlePlunderTargetInput,
  type BattleTactic,
  type BattleTacticValues,
  type BattlefieldInput,
  type LaunchBattleDecision,
} from "../../domain/combat/battle.ts";
import type { BattleExecutor, BattleReader } from "../../ports/battle.ts";
import { rejected, stale, SUCCEEDED } from "../command-outcomes.ts";
import {
  requireBoolean,
  requireFunction,
  requireNumber,
  requireRecord,
  type UnknownRecord,
} from "../validation.ts";

export interface BattleAdapterDependencies {
  // TRANSITIONAL: SpyManager and WarManager remain narrow bridges to the
  // current Vue-backed combat controls. Replace them with the final Evolve
  // adapter when the remaining combat slices remove these managers.
  readonly getSpyManager: () => unknown;
  readonly getWarManager: () => unknown;
  readonly getGameLog: () => unknown;
  readonly getState: () => unknown;
  readonly getSettings: () => unknown;
  readonly getGame: () => unknown;
  readonly guardActive: (setting: string) => unknown;
  readonly getHealingRate: () => unknown;
  readonly traitVal: (
    trait: string,
    fallback: number,
    operation?: string | number,
  ) => unknown;
  readonly getOccupationCost: () => unknown;
  readonly getGovernmentName: (governmentId: number) => unknown;
}

interface TargetRecord {
  readonly foreign: UnknownRecord;
  readonly government: UnknownRecord;
}

interface BattleSession {
  readonly manager: UnknownRecord;
  readonly spyManager: UnknownRecord;
  readonly game: UnknownRecord;
  readonly parameters: Readonly<BattleParameters>;
  readonly battlefield: Readonly<BattlefieldInput>;
  readonly targets: ReadonlyMap<number, TargetRecord>;
  readonly raid: number;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${path} must be a string`);
  }
  return value;
}

function readTrait(
  dependencies: BattleAdapterDependencies,
  trait: string,
  fallback: number,
  operation?: string | number,
): number {
  return requireNumber(
    dependencies.traitVal(trait, fallback, operation),
    `traitVal(${trait})`,
  );
}

function readTarget(
  value: unknown,
  path: string,
): {
  readonly input: Omit<
    BattlePlunderTargetInput,
    "minimumSoldiers" | "maximumSoldiers"
  >;
  readonly record: TargetRecord;
} {
  const foreign = requireRecord(value, path);
  const government = requireRecord(foreign["gov"], `${path}.gov`);
  return {
    input: Object.freeze({
      governmentId: requireNumber(foreign["id"], `${path}.id`),
      policy: requireString(foreign["policy"], `${path}.policy`),
      released: Boolean(foreign["released"]),
      occupied: Boolean(government["occ"]),
      annexed: Boolean(government["anx"]),
      purchased: Boolean(government["buy"]),
      spyCount: requireNumber(government["spy"], `${path}.gov.spy`),
    }),
    record: Object.freeze({ foreign, government }),
  };
}

function decisionsMatch(
  left: Readonly<LaunchBattleDecision>,
  right: Readonly<LaunchBattleDecision>,
): boolean {
  return (
    left.kind === right.kind &&
    left.governmentId === right.governmentId &&
    left.expectedReleased === right.expectedReleased &&
    left.expectedOccupied === right.expectedOccupied &&
    left.expectedAnnexed === right.expectedAnnexed &&
    left.expectedPurchased === right.expectedPurchased &&
    left.spyCount === right.spyCount &&
    left.tactic === right.tactic &&
    left.battalionSize === right.battalionSize &&
    left.releaseControl === right.releaseControl &&
    left.hellPatrolsToRemove === right.hellPatrolsToRemove &&
    left.hellGarrisonToRemove === right.hellGarrisonToRemove
  );
}

function targetStillMatches(
  target: TargetRecord,
  decision: Readonly<LaunchBattleDecision>,
): boolean {
  return (
    Boolean(target.foreign["released"]) === decision.expectedReleased &&
    Boolean(target.government["occ"]) === decision.expectedOccupied &&
    Boolean(target.government["anx"]) === decision.expectedAnnexed &&
    Boolean(target.government["buy"]) === decision.expectedPurchased &&
    target.government["spy"] === decision.spyCount
  );
}

const EMPTY_TACTICS: BattleTacticValues = Object.freeze([
  Number.POSITIVE_INFINITY,
  Number.POSITIVE_INFINITY,
  Number.POSITIVE_INFINITY,
  Number.POSITIVE_INFINITY,
  Number.POSITIVE_INFINITY,
]);

export function createBattleAdapter(dependencies: BattleAdapterDependencies): {
  readonly reader: BattleReader;
  readonly executor: BattleExecutor;
} {
  let cycleManager: UnknownRecord | null = null;
  let cycleSpyManager: UnknownRecord | null = null;
  let cycleGame: UnknownRecord | null = null;
  let cycleMinimumAdvantage = 0;
  let cycleMaximumAdvantage = 0;
  let session: BattleSession | null = null;

  const reader: BattleReader = Object.freeze({
    readCycle() {
      cycleManager = null;
      cycleSpyManager = null;
      cycleGame = null;
      cycleMinimumAdvantage = 0;
      cycleMaximumAdvantage = 0;
      session = null;

      const manager = requireRecord(dependencies.getWarManager(), "WarManager");
      const spyManager = requireRecord(
        dependencies.getSpyManager(),
        "SpyManager",
      );
      const state = requireRecord(dependencies.getState(), "state");
      const settings = requireRecord(dependencies.getSettings(), "settings");
      const game = requireRecord(dependencies.getGame(), "game");

      const unavailable = Object.freeze({
        available: false,
        wounded: 0,
        deadSoldiers: 0,
        currentCityGarrison: 0,
        maxCityGarrison: 0,
        availableGarrison: 0,
        healthySoldiersPercent: 0,
        livingSoldiersPercent: 0,
        protectMode: "never",
        minimumAdvantage: 0,
        maximumAdvantage: 0,
        maximumSiegeBattalion: 0,
        recruitmentProgress: 0,
        recruitmentRate: 0,
        healingRate: 0,
        scalesArmor: 0,
        armorTechnology: 0,
        armoredDivisor: 1,
        frailPenalty: 0,
        highPopulationMultiplier: 1,
        ragePlanet: false,
        autoHell: false,
        hellAvailable: false,
        maximumSoldiers: 0,
        hellReservedSoldiers: 0,
        hellSoldiers: 0,
        hellGarrison: 0,
        hellPatrolSize: 1,
        occupationCost: 0,
        portalVisible: false,
        unificationEnabled: false,
        occupyLast: false,
      });

      if (!manager["_garrisonVue"] || !spyManager["_foreignVue"]) {
        return unavailable;
      }
      const maxCityGarrison = requireNumber(
        manager["maxCityGarrison"],
        "WarManager.maxCityGarrison",
      );
      if (
        maxCityGarrison <= 0 ||
        state["goal"] === "Reset" ||
        requireBoolean(
          settings["foreignPacifist"],
          "settings.foreignPacifist",
        ) ||
        dependencies.guardActive("guardPacifist")
      ) {
        return unavailable;
      }

      const global = requireRecord(game["global"], "game.global");
      const civic = requireRecord(global["civic"], "game.global.civic");
      const garrison = requireRecord(
        civic["garrison"],
        "game.global.civic.garrison",
      );
      const tech = requireRecord(global["tech"], "game.global.tech");
      const city = requireRecord(global["city"], "game.global.city");
      const planetTraits = city["ptrait"];
      if (!Array.isArray(planetTraits)) {
        throw new TypeError("game.global.city.ptrait must be an array");
      }
      const gameSettings = requireRecord(
        global["settings"],
        "game.global.settings",
      );
      const autoHell = requireBoolean(
        settings["autoHell"],
        "settings.autoHell",
      );
      const hellAvailable = Boolean(manager["_hellVue"]);
      const readHell = autoHell && hellAvailable;
      const protectMode = requireString(
        settings["foreignProtect"],
        "settings.foreignProtect",
      );
      const mayProtect = protectMode === "always" || protectMode === "auto";

      cycleManager = manager;
      cycleSpyManager = spyManager;
      cycleGame = game;
      cycleMinimumAdvantage = requireNumber(
        settings["foreignMinAdvantage"],
        "settings.foreignMinAdvantage",
      );
      cycleMaximumAdvantage = requireNumber(
        settings["foreignMaxAdvantage"],
        "settings.foreignMaxAdvantage",
      );
      return Object.freeze({
        available: true,
        wounded: requireNumber(manager["wounded"], "WarManager.wounded"),
        deadSoldiers: requireNumber(
          manager["deadSoldiers"],
          "WarManager.deadSoldiers",
        ),
        currentCityGarrison: requireNumber(
          manager["currentCityGarrison"],
          "WarManager.currentCityGarrison",
        ),
        maxCityGarrison,
        availableGarrison: requireNumber(
          manager["availableGarrison"],
          "WarManager.availableGarrison",
        ),
        healthySoldiersPercent: requireNumber(
          settings["foreignAttackHealthySoldiersPercent"],
          "settings.foreignAttackHealthySoldiersPercent",
        ),
        livingSoldiersPercent: requireNumber(
          settings["foreignAttackLivingSoldiersPercent"],
          "settings.foreignAttackLivingSoldiersPercent",
        ),
        protectMode,
        minimumAdvantage: cycleMinimumAdvantage,
        maximumAdvantage: cycleMaximumAdvantage,
        maximumSiegeBattalion: requireNumber(
          settings["foreignMaxSiegeBattalion"],
          "settings.foreignMaxSiegeBattalion",
        ),
        recruitmentProgress: requireNumber(
          garrison["progress"],
          "game.global.civic.garrison.progress",
        ),
        recruitmentRate: requireNumber(
          garrison["rate"],
          "game.global.civic.garrison.rate",
        ),
        healingRate:
          protectMode === "auto"
            ? requireNumber(dependencies.getHealingRate(), "healing rate")
            : 1,
        scalesArmor: mayProtect ? readTrait(dependencies, "scales", 0) : 0,
        armorTechnology: mayProtect
          ? tech["armor"] === undefined
            ? 0
            : requireNumber(tech["armor"], "game.global.tech.armor")
          : 0,
        armoredDivisor: mayProtect
          ? readTrait(dependencies, "armored", 0, "-")
          : 1,
        frailPenalty: mayProtect ? readTrait(dependencies, "frail", 0) : 0,
        highPopulationMultiplier: mayProtect
          ? readTrait(dependencies, "high_pop", 0, 1)
          : 1,
        ragePlanet: planetTraits.includes("rage"),
        autoHell,
        hellAvailable,
        maximumSoldiers: readHell
          ? requireNumber(manager["maxSoldiers"], "WarManager.maxSoldiers")
          : 0,
        hellReservedSoldiers: readHell
          ? requireNumber(
              manager["hellReservedSoldiers"],
              "WarManager.hellReservedSoldiers",
            )
          : 0,
        hellSoldiers: readHell
          ? requireNumber(manager["hellSoldiers"], "WarManager.hellSoldiers")
          : 0,
        hellGarrison: readHell
          ? requireNumber(manager["hellGarrison"], "WarManager.hellGarrison")
          : 0,
        hellPatrolSize: readHell
          ? requireNumber(
              manager["hellPatrolSize"],
              "WarManager.hellPatrolSize",
            )
          : 1,
        occupationCost: requireNumber(
          dependencies.getOccupationCost(),
          "occupation cost",
        ),
        portalVisible: Boolean(gameSettings["showPortal"]),
        unificationEnabled: requireBoolean(
          settings["foreignUnification"],
          "settings.foreignUnification",
        ),
        occupyLast: requireBoolean(
          settings["foreignOccupyLast"],
          "settings.foreignOccupyLast",
        ),
      });
    },

    readBattlefield(parameters: Readonly<BattleParameters>) {
      const manager = cycleManager;
      const spyManager = cycleSpyManager;
      const game = cycleGame;
      if (manager === null || spyManager === null || game === null) {
        throw new Error("battle cycle has not been sampled");
      }
      const getSoldiers = requireFunction(
        manager["getSoldiersForAdvantage"],
        "WarManager.getSoldiersForAdvantage",
      );
      const targets = new Map<number, TargetRecord>();
      const occupationTargets: BattleOccupationTargetInput[] = [];
      const rawForeigns = spyManager["foreignActive"];
      if (!Array.isArray(rawForeigns)) {
        throw new TypeError("SpyManager.foreignActive must be an array");
      }

      for (let index = 0; index < rawForeigns.length; index++) {
        const path = `SpyManager.foreignActive[${index}]`;
        const candidate = readTarget(rawForeigns[index], path);
        targets.set(candidate.input.governmentId, candidate.record);
        if (candidate.input.policy !== "Occupy" || candidate.input.occupied) {
          continue;
        }
        const minimumSiegeSoldiers = requireNumber(
          Reflect.apply(getSoldiers, manager, [
            cycleMinimumAdvantage,
            4,
            candidate.input.governmentId,
          ]),
          `minimum siege soldiers for ${candidate.input.governmentId}`,
        );
        const capacity =
          parameters.autoHell && parameters.hellAvailable
            ? parameters.maximumSoldiers - parameters.hellReservedSoldiers
            : parameters.maxCityGarrison;
        if (minimumSiegeSoldiers > capacity) {
          occupationTargets.push(
            Object.freeze({
              ...candidate.input,
              minimumSiegeSoldiers,
              maximumSiegeSoldiers: 0,
            }),
          );
          continue;
        }
        const maximumSiegeSoldiers = requireNumber(
          Reflect.apply(getSoldiers, manager, [
            cycleMaximumAdvantage,
            4,
            candidate.input.governmentId,
          ]),
          `maximum siege soldiers for ${candidate.input.governmentId}`,
        );
        const occupationTarget = Object.freeze({
          ...candidate.input,
          minimumSiegeSoldiers,
          maximumSiegeSoldiers,
        });
        occupationTargets.push(occupationTarget);
        if (
          classifyOccupationCandidate(parameters, occupationTarget) !== "skip"
        ) {
          break;
        }
      }

      let currentTarget: BattlePlunderTargetInput | null = null;
      const rawCurrentTarget = spyManager["foreignTarget"];
      const occupationResolved = occupationTargets.some(
        (target) => classifyOccupationCandidate(parameters, target) !== "skip",
      );
      if (rawCurrentTarget && !occupationResolved) {
        const target = readTarget(rawCurrentTarget, "SpyManager.foreignTarget");
        targets.set(target.input.governmentId, target.record);
        const minimumSoldiers = [...EMPTY_TACTICS] as number[];
        const maximumSoldiers = [...EMPTY_TACTICS] as number[];
        const startingTactic =
          !parameters.unificationEnabled || parameters.occupyLast ? 4 : 3;
        for (let rawTactic = startingTactic; rawTactic >= 0; rawTactic--) {
          const tactic = rawTactic as BattleTactic;
          minimumSoldiers[tactic] = requireNumber(
            Reflect.apply(getSoldiers, manager, [
              parameters.minimumAdvantage,
              tactic,
              target.input.governmentId,
            ]),
            `minimum soldiers for tactic ${tactic}`,
          );
          if (
            !canUsePlunderTactic(
              parameters,
              tactic,
              minimumSoldiers[tactic] ?? Number.POSITIVE_INFINITY,
            )
          ) {
            continue;
          }
          maximumSoldiers[tactic] = requireNumber(
            Reflect.apply(getSoldiers, manager, [
              parameters.maximumAdvantage,
              tactic,
              target.input.governmentId,
            ]),
            `maximum soldiers for tactic ${tactic}`,
          );
          break;
        }
        currentTarget = Object.freeze({
          ...target.input,
          minimumSoldiers: Object.freeze(minimumSoldiers) as BattleTacticValues,
          maximumSoldiers: Object.freeze(maximumSoldiers) as BattleTacticValues,
        });
      }

      const battlefield = Object.freeze({
        currentTarget,
        occupationTargets: Object.freeze(occupationTargets),
      });
      session = Object.freeze({
        manager,
        spyManager,
        game,
        parameters,
        battlefield,
        targets,
        raid: requireNumber(manager["raid"], "WarManager.raid"),
      });
      return battlefield;
    },
  });

  const executor: BattleExecutor = Object.freeze({
    execute(decision: Readonly<LaunchBattleDecision>) {
      const active = session;
      if (active === null) {
        return stale("battle-session-missing", "battle session is missing");
      }
      if (
        dependencies.getWarManager() !== active.manager ||
        dependencies.getSpyManager() !== active.spyManager ||
        dependencies.getGame() !== active.game
      ) {
        return stale("battle-source-changed", "battle source changed");
      }
      const expected = planBattle(active.parameters, active.battlefield);
      if (expected === null || !decisionsMatch(expected, decision)) {
        return rejected(
          "invalid-battle-decision",
          "battle decision does not match the sampled plan",
        );
      }
      const target = active.targets.get(decision.governmentId);
      if (
        target === undefined ||
        !targetStillMatches(target, decision) ||
        active.manager["raid"] !== active.raid
      ) {
        return stale("battle-state-changed", "battle state changed");
      }

      const release = decision.releaseControl
        ? requireFunction(active.manager["release"], "WarManager.release")
        : null;
      const removeHellPatrol =
        decision.hellPatrolsToRemove > 0
          ? requireFunction(
              active.manager["removeHellPatrol"],
              "WarManager.removeHellPatrol",
            )
          : null;
      const removeHellGarrison =
        decision.hellGarrisonToRemove > 0
          ? requireFunction(
              active.manager["removeHellGarrison"],
              "WarManager.removeHellGarrison",
            )
          : null;
      const setTactic = requireFunction(
        active.manager["setTactic"],
        "WarManager.setTactic",
      );
      const deltaBattalion = decision.battalionSize - active.raid;
      const addBattalion =
        deltaBattalion > 0
          ? requireFunction(
              active.manager["addBattalion"],
              "WarManager.addBattalion",
            )
          : null;
      const removeBattalion =
        deltaBattalion < 0
          ? requireFunction(
              active.manager["removeBattalion"],
              "WarManager.removeBattalion",
            )
          : null;
      const getCampaignTitle = requireFunction(
        active.manager["getCampaignTitle"],
        "WarManager.getCampaignTitle",
      );
      const getAdvantage = requireFunction(
        active.manager["getAdvantage"],
        "WarManager.getAdvantage",
      );
      const launchCampaign = requireFunction(
        active.manager["launchCampaign"],
        "WarManager.launchCampaign",
      );
      const armyRating = requireFunction(
        active.game["armyRating"],
        "game.armyRating",
      );
      const gameLog = requireRecord(dependencies.getGameLog(), "GameLog");
      const logSuccess = requireFunction(
        gameLog["logSuccess"],
        "GameLog.logSuccess",
      );
      const governmentName = requireString(
        dependencies.getGovernmentName(decision.governmentId),
        `government name ${decision.governmentId}`,
      );

      session = null;
      if (release !== null) {
        Reflect.apply(release, active.manager, [decision.governmentId]);
      } else {
        if (removeHellPatrol !== null) {
          Reflect.apply(removeHellPatrol, active.manager, [
            decision.hellPatrolsToRemove,
          ]);
        }
        if (removeHellGarrison !== null) {
          Reflect.apply(removeHellGarrison, active.manager, [
            decision.hellGarrisonToRemove,
          ]);
        }
      }
      Reflect.apply(setTactic, active.manager, [decision.tactic]);
      if (addBattalion !== null) {
        Reflect.apply(addBattalion, active.manager, [deltaBattalion]);
      }
      if (removeBattalion !== null) {
        Reflect.apply(removeBattalion, active.manager, [-deltaBattalion]);
      }

      const campaignTitle = requireString(
        Reflect.apply(getCampaignTitle, active.manager, [decision.tactic]),
        `campaign title ${decision.tactic}`,
      );
      const raid = requireNumber(active.manager["raid"], "WarManager.raid");
      const battalionRating = requireNumber(
        Reflect.apply(armyRating, active.game, [raid, "army"]),
        "game.armyRating",
      );
      const advantagePercent = requireNumber(
        Reflect.apply(getAdvantage, active.manager, [
          battalionRating,
          decision.tactic,
          decision.governmentId,
        ]),
        "WarManager.getAdvantage",
      ).toFixed(1);
      Reflect.apply(logSuccess, gameLog, [
        "attack",
        `Launching ${campaignTitle} campaign against ${governmentName} with ${
          decision.spyCount < 1 ? "~" : ""
        }${advantagePercent}% advantage.`,
        ["combat"],
      ]);
      Reflect.apply(launchCampaign, active.manager, [decision.governmentId]);
      return SUCCEEDED;
    },
  });

  return Object.freeze({ reader, executor });
}
