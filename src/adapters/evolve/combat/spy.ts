import {
  planSpyEspionage,
  planSpyTraining,
  type SpyCycleInput,
  type SpyDecision,
  type SpyEspionageInput,
  type SpyTrainingInput,
} from "../../../domain/combat/spy.ts";
import type { SpyExecutor, SpyReader } from "../../../ports/spy.ts";
import { rejected, stale, SUCCEEDED } from "../../command-outcomes.ts";
import {
  requireBoolean,
  requireFunction,
  requireNumber,
  requireRecord,
  requireString,
  type UnknownRecord,
} from "../../validation.ts";

interface SpySession {
  readonly manager: UnknownRecord;
  readonly view: UnknownRecord;
  readonly foreigns: unknown[];
  readonly spyMaximumSetting: number;
  readonly missionIds: Readonly<Record<string, string>>;
}

interface TrainingSample {
  readonly kind: "training";
  readonly input: Readonly<SpyTrainingInput>;
  readonly foreign: UnknownRecord;
  readonly government: UnknownRecord;
}

interface EspionageSample {
  readonly kind: "espionage";
  readonly input: Readonly<SpyEspionageInput>;
  readonly foreign: UnknownRecord;
  readonly government: UnknownRecord;
}

type SpySample = TrainingSample | EspionageSample;

export interface SpyAdapterDependencies {
  // TRANSITIONAL: SpyManager and WarManager remain the narrow bridges to the
  // current Vue/modal-backed foreign-affairs commands. Replace them with final
  // Evolve/browser adapters when the remaining combat slices remove them.
  readonly getSpyManager: () => unknown;
  readonly getWarManager: () => unknown;
  readonly getHaveTask: () => unknown;
  readonly getHaveTech: () => unknown;
  readonly shouldSaveInflationMoney: () => unknown;
  readonly getResources: () => unknown;
  readonly getSettings: () => unknown;
  readonly getPoly: () => unknown;
  readonly getGameLog: () => unknown;
  readonly getGovName: (governmentId: number) => unknown;
  readonly getGame: () => unknown;
}

function unavailableCycle(): SpyCycleInput {
  return Object.freeze({
    available: false,
    trainEnabled: false,
    advancedEspionage: false,
    foreignCount: 0,
  });
}

function readForeign(
  foreigns: unknown[],
  index: number,
): { readonly foreign: UnknownRecord; readonly government: UnknownRecord } {
  if (!Number.isSafeInteger(index) || index < 0 || index >= foreigns.length) {
    throw new RangeError(`foreign index ${index} is out of range`);
  }
  const foreign = requireRecord(
    foreigns[index],
    `SpyManager.foreignActive[${index}]`,
  );
  const government = requireRecord(
    foreign["gov"],
    `SpyManager.foreignActive[${index}].gov`,
  );
  return { foreign, government };
}

function readMissionIds(
  manager: UnknownRecord,
): Readonly<Record<string, string>> {
  const types = requireRecord(manager["Types"], "SpyManager.Types");
  const ids: Record<string, string> = {};
  for (const [name, rawType] of Object.entries(types)) {
    const type = requireRecord(rawType, `SpyManager.Types.${name}`);
    ids[name] = requireString(type["id"], `SpyManager.Types.${name}.id`);
  }
  return Object.freeze(ids);
}

function readGameRace(getGame: () => unknown): UnknownRecord {
  const game = requireRecord(getGame(), "game");
  const global = requireRecord(game["global"], "game.global");
  return requireRecord(global["race"], "game.global.race");
}

function readGovernmentPrice(
  dependencies: SpyAdapterDependencies,
  governmentId: number,
): number {
  const poly = requireRecord(dependencies.getPoly(), "poly");
  const govPrice = requireFunction(poly["govPrice"], "poly.govPrice");
  return requireNumber(
    Reflect.apply(govPrice, poly, [governmentId]),
    `poly.govPrice(${governmentId})`,
  );
}

function decisionMatches(
  expected: Readonly<SpyDecision>,
  actual: Readonly<SpyDecision>,
): boolean {
  if (
    expected.kind !== actual.kind ||
    expected.foreignIndex !== actual.foreignIndex ||
    expected.governmentId !== actual.governmentId
  ) {
    return false;
  }
  if (expected.kind === "train-spy" && actual.kind === "train-spy") {
    return expected.governmentName === actual.governmentName;
  }
  if (
    expected.kind === "release-foreign" &&
    actual.kind === "release-foreign"
  ) {
    return expected.expectedPolicy === actual.expectedPolicy;
  }
  return (
    expected.kind === "perform-espionage" &&
    actual.kind === "perform-espionage" &&
    expected.missionId === actual.missionId &&
    expected.secondaryTarget === actual.secondaryTarget
  );
}

function governmentMatchesTraining(sample: TrainingSample): boolean {
  const input = sample.input;
  return (
    sample.foreign["policy"] === input.policy &&
    sample.government["spy"] === input.spyCount &&
    Boolean(sample.government["occ"]) === input.occupied &&
    Boolean(sample.government["anx"]) === input.annexed &&
    Boolean(sample.government["buy"]) === input.purchased
  );
}

function governmentMatchesEspionage(sample: EspionageSample): boolean {
  const input = sample.input;
  return (
    sample.foreign["policy"] === input.policy &&
    sample.government["spy"] === input.spyCount &&
    sample.government["sab"] === input.sabotageProgress &&
    (input.policy !== "Betrayal" ||
      (sample.government["mil"] === input.military &&
        sample.government["hstl"] === input.hostility)) &&
    Boolean(sample.government["occ"]) === input.occupied &&
    Boolean(sample.government["anx"]) === input.annexed &&
    Boolean(sample.government["buy"]) === input.purchased
  );
}

export function createSpyAdapter(dependencies: SpyAdapterDependencies): {
  readonly reader: SpyReader;
  readonly executor: SpyExecutor;
} {
  let session: SpySession | null = null;
  let sample: SpySample | null = null;

  const reader: SpyReader = Object.freeze({
    readCycle(): SpyCycleInput {
      session = null;
      sample = null;
      const manager = requireRecord(dependencies.getSpyManager(), "SpyManager");
      const rawView = manager["_foreignVue"];
      if (!rawView) return unavailableCycle();
      const view = requireRecord(rawView, "SpyManager._foreignVue");

      const haveTask = requireFunction(dependencies.getHaveTask(), "haveTask");
      if (
        Reflect.apply(haveTask, undefined, ["combo_spy"]) ||
        Reflect.apply(haveTask, undefined, ["spyop"])
      ) {
        return unavailableCycle();
      }
      const haveTech = requireFunction(dependencies.getHaveTech(), "haveTech");
      if (!Reflect.apply(haveTech, undefined, ["spy"])) {
        return unavailableCycle();
      }
      if (dependencies.shouldSaveInflationMoney()) return unavailableCycle();

      const advancedEspionage = Boolean(
        Reflect.apply(haveTech, undefined, ["spy", 2]),
      );
      if (!advancedEspionage) {
        const resources = requireRecord(
          dependencies.getResources(),
          "resources",
        );
        const money = requireRecord(resources["Money"], "resources.Money");
        const storageRatio = requireNumber(
          money["storageRatio"],
          "resources.Money.storageRatio",
        );
        if (storageRatio < 0.9) return unavailableCycle();
      }

      const settings = requireRecord(dependencies.getSettings(), "settings");
      const trainEnabled = requireBoolean(
        settings["foreignTrainSpy"],
        "settings.foreignTrainSpy",
      );
      const spyMaximumSetting = trainEnabled
        ? requireNumber(settings["foreignSpyMax"], "settings.foreignSpyMax")
        : 0;
      const rawForeigns = manager["foreignActive"];
      if (!Array.isArray(rawForeigns)) {
        throw new TypeError("SpyManager.foreignActive must be an array");
      }
      const missionIds = advancedEspionage
        ? readMissionIds(manager)
        : Object.freeze({});
      session = Object.freeze({
        manager,
        view,
        foreigns: rawForeigns,
        spyMaximumSetting,
        missionIds,
      });
      return Object.freeze({
        available: true,
        trainEnabled,
        advancedEspionage,
        foreignCount: rawForeigns.length,
      });
    },

    readTraining(foreignIndex: number): SpyTrainingInput {
      const active = session;
      if (active === null) throw new Error("spy cycle has not been sampled");
      const { foreign, government } = readForeign(
        active.foreigns,
        foreignIndex,
      );
      const governmentId = requireNumber(
        foreign["id"],
        `SpyManager.foreignActive[${foreignIndex}].id`,
      );
      const policy = requireString(
        foreign["policy"],
        `SpyManager.foreignActive[${foreignIndex}].policy`,
      );
      const spyDisabled = requireFunction(
        active.view["spy_disabled"],
        "SpyManager._foreignVue.spy_disabled",
      );
      const purchasePrice =
        policy === "Purchase"
          ? readGovernmentPrice(dependencies, governmentId)
          : null;
      let moneyMaximum = 0;
      if (purchasePrice !== null) {
        const resources = requireRecord(
          dependencies.getResources(),
          "resources",
        );
        const money = requireRecord(resources["Money"], "resources.Money");
        moneyMaximum = requireNumber(
          money["maxQuantity"],
          "resources.Money.maxQuantity",
        );
      }
      const governmentName = requireString(
        dependencies.getGovName(governmentId),
        `government name ${governmentId}`,
      );
      const input: SpyTrainingInput = Object.freeze({
        foreignIndex,
        governmentId,
        governmentName,
        disabled: Boolean(
          Reflect.apply(spyDisabled, active.view, [governmentId]),
        ),
        occupied: Boolean(government["occ"]),
        annexed: Boolean(government["anx"]),
        purchased: Boolean(government["buy"]),
        policy,
        spyCount: requireNumber(
          government["spy"],
          `SpyManager.foreignActive[${foreignIndex}].gov.spy`,
        ),
        spyMaximumSetting: active.spyMaximumSetting,
        purchaseMoney: requireNumber(
          active.manager["purchaseMoney"],
          "SpyManager.purchaseMoney",
        ),
        moneyMaximum,
        purchasePrice,
      });
      sample = Object.freeze({
        kind: "training",
        input,
        foreign,
        government,
      });
      return input;
    },

    readEspionage(foreignIndex: number): SpyEspionageInput {
      const active = session;
      if (active === null) throw new Error("spy cycle has not been sampled");
      const { foreign, government } = readForeign(
        active.foreigns,
        foreignIndex,
      );
      const governmentId = requireNumber(
        foreign["id"],
        `SpyManager.foreignActive[${foreignIndex}].id`,
      );
      const policy = requireString(
        foreign["policy"],
        `SpyManager.foreignActive[${foreignIndex}].policy`,
      );
      const spyCount = requireNumber(
        government["spy"],
        `SpyManager.foreignActive[${foreignIndex}].gov.spy`,
      );
      const sabotageProgress = requireNumber(
        government["sab"],
        `SpyManager.foreignActive[${foreignIndex}].gov.sab`,
      );
      const actionable =
        spyCount >= 1 && sabotageProgress === 0 && policy !== "None";
      const purchaseForeigns = actionable
        ? active.manager["purchaseForeigngs"]
        : [];
      if (!Array.isArray(purchaseForeigns)) {
        throw new TypeError("SpyManager.purchaseForeigngs must be an array");
      }
      const input: SpyEspionageInput = Object.freeze({
        foreignIndex,
        governmentId,
        policy,
        spyCount,
        sabotageProgress,
        military:
          actionable && policy === "Betrayal"
            ? requireNumber(
                government["mil"],
                `SpyManager.foreignActive[${foreignIndex}].gov.mil`,
              )
            : 0,
        hostility:
          actionable && policy === "Betrayal"
            ? requireNumber(
                government["hstl"],
                `SpyManager.foreignActive[${foreignIndex}].gov.hstl`,
              )
            : 0,
        occupied: Boolean(government["occ"]),
        annexed: Boolean(government["anx"]),
        purchased: Boolean(government["buy"]),
        purchaseMoney: actionable
          ? requireNumber(
              active.manager["purchaseMoney"],
              "SpyManager.purchaseMoney",
            )
          : 0,
        purchaseForeign: purchaseForeigns.includes(governmentId),
        elusive: actionable
          ? Boolean(readGameRace(dependencies.getGame)["elusive"])
          : false,
        isPrimaryTarget: foreign === active.manager["foreignTarget"],
        missionIds: active.missionIds,
      });
      sample = Object.freeze({
        kind: "espionage",
        input,
        foreign,
        government,
      });
      return input;
    },
  });

  const executor: SpyExecutor = Object.freeze({
    execute(decision: Readonly<SpyDecision>) {
      const active = session;
      const sampled = sample;
      if (active === null || sampled === null) {
        return stale("spy-session-missing", "spy session is missing");
      }
      if (
        dependencies.getSpyManager() !== active.manager ||
        active.manager["foreignActive"] !== active.foreigns ||
        active.manager["_foreignVue"] !== active.view
      ) {
        return stale("spy-manager-changed", "spy manager state changed");
      }

      const expected =
        sampled.kind === "training"
          ? planSpyTraining(sampled.input)
          : planSpyEspionage(sampled.input);
      if (expected === null || !decisionMatches(expected, decision)) {
        return rejected(
          "invalid-spy-decision",
          "spy decision does not match the sampled plan",
        );
      }
      if (
        (sampled.kind === "training" && !governmentMatchesTraining(sampled)) ||
        (sampled.kind === "espionage" && !governmentMatchesEspionage(sampled))
      ) {
        return stale("spy-foreign-changed", "foreign government state changed");
      }
      sample = null;

      if (decision.kind === "train-spy") {
        if (sampled.kind !== "training") {
          return rejected("invalid-spy-phase", "spy training phase changed");
        }
        const gameLog = requireRecord(dependencies.getGameLog(), "GameLog");
        const logSuccess = requireFunction(
          gameLog["logSuccess"],
          "GameLog.logSuccess",
        );
        const train = requireFunction(
          active.view["spy"],
          "SpyManager._foreignVue.spy",
        );
        Reflect.apply(logSuccess, gameLog, [
          "spying",
          `Training a spy to send against ${decision.governmentName}.`,
          ["spy"],
        ]);
        Reflect.apply(train, active.view, [decision.governmentId]);
        return SUCCEEDED;
      }

      if (sampled.kind !== "espionage") {
        return rejected("invalid-spy-phase", "spy espionage phase changed");
      }
      if (decision.kind === "release-foreign") {
        const warManager = requireRecord(
          dependencies.getWarManager(),
          "WarManager",
        );
        const release = requireFunction(
          warManager["release"],
          "WarManager.release",
        );
        Reflect.apply(release, warManager, [decision.governmentId]);
        sampled.foreign["released"] = true;
        return SUCCEEDED;
      }
      if (decision.kind === "perform-espionage") {
        const performEspionage = requireFunction(
          active.manager["performEspionage"],
          "SpyManager.performEspionage",
        );
        Reflect.apply(performEspionage, active.manager, [
          decision.governmentId,
          decision.missionId,
          decision.secondaryTarget,
        ]);
        return SUCCEEDED;
      }
      return rejected("invalid-spy-decision", "spy decision is invalid");
    },
  });

  return Object.freeze({ reader, executor });
}
