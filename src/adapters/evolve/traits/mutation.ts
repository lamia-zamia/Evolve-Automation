import type {
  MutationCurrencyId,
  MutationCurrencyView,
  MutationDecision,
  MutationInput,
  MutationKind,
  MutationTraitView,
} from "../../../domain/traits/mutation.ts";
import type { DecisionExecutor } from "../../../ports/decision-executor.ts";
import type { MutationReader } from "../../../ports/mutation.ts";
import { rejected, stale, SUCCEEDED } from "../../command-outcomes.ts";
import {
  requireFunction,
  requireNumber,
  requireRecord,
  requireString,
  type UnknownRecord,
} from "../../validation.ts";

export interface MutationReaderDependencies {
  // TRANSITIONAL: the legacy trait manager is the narrow bridge to the
  // current Vue-backed mutation controls. The Milestone 5 trait/bootstrap
  // slice should replace it with the final Evolve control implementation.
  readonly getMutableTraitManager: () => unknown;
  readonly getGame: () => unknown;
  readonly getResources: () => unknown;
}

export interface MutationExecutorDependencies extends MutationReaderDependencies {
  readonly getGameLog: () => unknown;
}

function currencyIdFromGame(getGame: () => unknown): MutationCurrencyId {
  const game = requireRecord(getGame(), "game");
  const global = requireRecord(game["global"], "game.global");
  const race = requireRecord(global["race"], "game.global.race");
  return race["universe"] === "antimatter" ? "AntiPlasmid" : "Plasmid";
}

function readCurrency(
  getResources: () => unknown,
  currencyId: MutationCurrencyId,
): MutationCurrencyView {
  const resources = requireRecord(getResources(), "resources");
  const currency = requireRecord(
    resources[currencyId],
    `resources.${currencyId}`,
  );
  const name = currency["name"];
  if (typeof name !== "string") {
    throw new TypeError(`resources.${currencyId}.name must be a string`);
  }
  return Object.freeze({
    id: currencyId,
    name,
    currentQuantity: requireNumber(
      currency["currentQuantity"],
      `resources.${currencyId}.currentQuantity`,
    ),
  });
}

function readPriorityList(manager: UnknownRecord): unknown[] {
  const priorityList = manager["priorityList"];
  if (!Array.isArray(priorityList)) {
    throw new TypeError("MutableTraitManager.priorityList must be an array");
  }
  return priorityList;
}

function readMutationCost(
  trait: UnknownRecord,
  kind: MutationKind,
  path: string,
): number {
  const mutationCost = requireFunction(
    trait["mutationCost"],
    `${path}.mutationCost`,
  );
  const cost = requireNumber(
    Reflect.apply(mutationCost, trait, [kind]),
    `${path}.mutationCost(${kind})`,
  );
  if (cost < 0) {
    throw new TypeError(`${path}.mutationCost(${kind}) must be non-negative`);
  }
  return cost;
}

function actionableTrait(
  trait: UnknownRecord,
  index: number,
  kind: MutationKind,
  canGain: boolean,
  canPurge: boolean,
  path: string,
): MutationTraitView {
  // Legacy reads cost before the manager command and the display name while
  // constructing its log. Snapshot both before mutation so the command can
  // validate every required surface before changing the game.
  const mutationCost = readMutationCost(trait, kind, path);
  return Object.freeze({
    index,
    canGain,
    canPurge,
    mutationCost,
    traitName: requireString(trait["traitName"], `${path}.traitName`),
    displayName: requireString(trait["name"], `${path}.name`),
  });
}

export function createMutationReader(
  dependencies: MutationReaderDependencies,
): MutationReader {
  return Object.freeze({
    read(): MutationInput {
      const manager = requireRecord(
        dependencies.getMutableTraitManager(),
        "MutableTraitManager",
      );
      const isUnlocked = requireFunction(
        manager["isUnlocked"],
        "MutableTraitManager.isUnlocked",
      );
      if (!Reflect.apply(isUnlocked, manager, [])) {
        return Object.freeze({
          unlocked: false,
          currency: null,
          traits: Object.freeze([]),
        });
      }

      // Legacy selects the currency before scanning the ordered trait list,
      // but reads its fields only when an actionable trait is found.
      const currencyId = currencyIdFromGame(dependencies.getGame);
      const views: MutationTraitView[] = [];
      let currency: MutationCurrencyView | null = null;
      const list = readPriorityList(manager);
      for (let index = 0; index < list.length; index++) {
        const path = `MutableTraitManager.priorityList[${index}]`;
        const trait = requireRecord(list[index], path);
        const canGainMethod = requireFunction(
          trait["canGain"],
          `${path}.canGain`,
        );
        const canGain = Boolean(Reflect.apply(canGainMethod, trait, []));
        if (canGain) {
          views.push(actionableTrait(trait, index, "gain", true, false, path));
          currency = readCurrency(dependencies.getResources, currencyId);
          break;
        }

        const canPurgeMethod = requireFunction(
          trait["canPurge"],
          `${path}.canPurge`,
        );
        const canPurge = Boolean(Reflect.apply(canPurgeMethod, trait, []));
        if (canPurge) {
          views.push(actionableTrait(trait, index, "purge", false, true, path));
          currency = readCurrency(dependencies.getResources, currencyId);
          break;
        }
        views.push(
          Object.freeze({
            index,
            canGain: false,
            canPurge: false,
            traitName: null,
            displayName: null,
            mutationCost: null,
          }),
        );
      }

      return Object.freeze({
        unlocked: true,
        currency,
        traits: Object.freeze(views),
      });
    },
  });
}

export function createMutationCommandExecutor(
  dependencies: MutationExecutorDependencies,
): DecisionExecutor<MutationDecision> {
  return Object.freeze({
    execute(decision: Readonly<MutationDecision>) {
      if (
        !Number.isFinite(decision.mutationCost) ||
        decision.mutationCost < 0
      ) {
        return rejected(
          "invalid-mutation-cost",
          "mutation cost must be a non-negative finite number",
        );
      }

      const actualCurrencyId = currencyIdFromGame(dependencies.getGame);
      if (actualCurrencyId !== decision.currencyId) {
        return stale("stale-mutation-universe", "mutation universe changed", {
          expectedCurrencyId: decision.currencyId,
          actualCurrencyId,
        });
      }

      const resources = requireRecord(dependencies.getResources(), "resources");
      const currency = requireRecord(
        resources[decision.currencyId],
        `resources.${decision.currencyId}`,
      );
      const actualQuantity = requireNumber(
        currency["currentQuantity"],
        `resources.${decision.currencyId}.currentQuantity`,
      );
      if (actualQuantity !== decision.expectedCurrencyQuantity) {
        return stale(
          "stale-mutation-currency",
          "mutation currency balance changed",
          {
            currencyId: decision.currencyId,
            expected: decision.expectedCurrencyQuantity,
            actual: actualQuantity,
          },
        );
      }

      const manager = requireRecord(
        dependencies.getMutableTraitManager(),
        "MutableTraitManager",
      );
      const list = readPriorityList(manager);
      const trait =
        typeof list[decision.index] === "object" &&
        list[decision.index] !== null
          ? (list[decision.index] as UnknownRecord)
          : null;
      const actualTraitName =
        trait !== null && typeof trait["traitName"] === "string"
          ? trait["traitName"]
          : null;
      if (trait === null || actualTraitName !== decision.traitName) {
        return stale("stale-mutation-trait", "mutation trait list changed", {
          index: decision.index,
          expectedTraitName: decision.traitName,
          actualTraitName,
        });
      }

      const methodName = decision.kind === "gain" ? "gainTrait" : "purgeTrait";
      const mutate = requireFunction(
        manager[methodName],
        `MutableTraitManager.${methodName}`,
      );
      const gameLog = requireRecord(dependencies.getGameLog(), "GameLog");
      const logSuccess = requireFunction(
        gameLog["logSuccess"],
        "GameLog.logSuccess",
      );

      Reflect.apply(mutate, manager, [decision.traitName]);
      Reflect.apply(logSuccess, gameLog, [
        "mutation",
        `Mutating ${decision.kind === "gain" ? "in" : "out"} ${decision.displayName} for ${decision.mutationCost} ${decision.currencyName}`,
        ["progress"],
      ]);
      currency["currentQuantity"] = actualQuantity - decision.mutationCost;
      return SUCCEEDED;
    },
  });
}
