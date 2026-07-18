import {
  calculateConsumeKeepRatio,
  type ConsumeCurrentView,
  type ConsumeDecision,
  type ConsumeInput,
  type ConsumeResourceView,
} from "../../domain/consume.ts";
import type { DecisionExecutor } from "../../ports/decision-executor.ts";
import type { ConsumeReader } from "../../ports/consume.ts";
import { rejected, stale, SUCCEEDED } from "../command-outcomes.ts";
import {
  requireFunction,
  requireNumber,
  requireRecord,
  type UnknownRecord,
} from "../validation.ts";

export interface ConsumeReaderDependencies {
  // TRANSITIONAL: Nanite/Supply/Eject legacy managers remain narrow bridges to
  // their current Vue controls. Their Milestone 5 adapter/bootstrap slice
  // should replace these concrete manager objects behind final ports.
  readonly getManager: () => unknown;
  readonly getResources: () => unknown;
  readonly isHungryRace: () => boolean;
}

function callBoolean(
  record: UnknownRecord,
  name: string,
  path: string,
  ...args: unknown[]
): boolean {
  return Boolean(
    Reflect.apply(
      requireFunction(record[name], `${path}.${name}`),
      record,
      args,
    ),
  );
}

function callNumber(
  record: UnknownRecord,
  name: string,
  path: string,
  ...args: unknown[]
): number {
  return requireNumber(
    Reflect.apply(
      requireFunction(record[name], `${path}.${name}`),
      record,
      args,
    ),
    `${path}.${name}()`,
  );
}

function readList(manager: UnknownRecord): unknown[] {
  const list = Reflect.apply(
    requireFunction(
      manager["managedPriorityList"],
      "ConsumeManager.managedPriorityList",
    ),
    manager,
    [],
  );
  if (!Array.isArray(list)) {
    throw new TypeError(
      "ConsumeManager.managedPriorityList() must return an array",
    );
  }
  return list;
}

function readResourceId(resource: UnknownRecord, path: string): string {
  const id = resource["id"];
  if (typeof id !== "string") {
    throw new TypeError(`${path}.id must be a string`);
  }
  return id;
}

function minimalResource(id: string, ratios: readonly number[]) {
  return Object.freeze({
    id,
    enabled: false,
    demanded: false,
    storageRequired: 0,
    requestedQuantity: 0,
    maxQuantity: 0,
    isFood: false,
    isCraftable: false,
    currentQuantity: 0,
    storageRatio: 0,
    craftableMaximum: null,
    ratioMaximums: Object.freeze(ratios.map(() => null)),
  });
}

export function createConsumeReader(
  dependencies: ConsumeReaderDependencies,
): ConsumeReader {
  return Object.freeze({
    read(): ConsumeInput {
      const manager = requireRecord(
        dependencies.getManager(),
        "ConsumeManager",
      );
      if (!callBoolean(manager, "initIndustry", "ConsumeManager")) {
        return Object.freeze({
          initialised: false,
          useful: false,
          maximum: 0,
          storageShift: 0,
          hungryRace: false,
          ratios: Object.freeze([]),
          resources: Object.freeze([]),
          current: Object.freeze([]),
        });
      }

      const list = readList(manager);
      const useful = callBoolean(manager, "isUseful", "ConsumeManager");
      const maximum = useful
        ? callNumber(manager, "maxConsume", "ConsumeManager")
        : 0;
      let ratios: readonly number[] = Object.freeze([]);
      if (useful) {
        const rawRatios = Reflect.apply(
          requireFunction(manager["useRatio"], "ConsumeManager.useRatio"),
          manager,
          [],
        );
        if (!Array.isArray(rawRatios)) {
          throw new TypeError("ConsumeManager.useRatio() must return an array");
        }
        ratios = Object.freeze(
          rawRatios.map((ratio, index) =>
            requireNumber(ratio, `ConsumeManager.useRatio()[${index}]`),
          ),
        );
      }

      const shouldInspectResources =
        useful && maximum > 0 && ratios.length > 0 && list.length > 0;
      const storageShift = shouldInspectResources
        ? requireNumber(manager["storageShift"], "ConsumeManager.storageShift")
        : 0;
      const allResources = shouldInspectResources
        ? requireRecord(dependencies.getResources(), "resources")
        : null;
      const food = allResources?.["Food"];

      const resources: ConsumeResourceView[] = [];
      let hungryRace: boolean | null = null;
      for (let index = 0; index < list.length; index++) {
        const path = `ConsumeManager.managedPriorityList()[${index}]`;
        const raw = requireRecord(list[index], path);
        const id = readResourceId(raw, path);
        if (!shouldInspectResources) {
          resources.push(minimalResource(id, ratios));
          continue;
        }

        const enabled = callBoolean(
          manager,
          "resEnabled",
          "ConsumeManager",
          id,
        );
        if (!enabled) {
          resources.push(minimalResource(id, ratios));
          continue;
        }
        const demanded = callBoolean(raw, "isDemanded", path);
        if (demanded) {
          resources.push(
            Object.freeze({
              ...minimalResource(id, ratios),
              enabled,
              demanded,
            }),
          );
          continue;
        }

        const storageRequired = requireNumber(
          raw["storageRequired"],
          `${path}.storageRequired`,
        );
        const requestedQuantity = requireNumber(
          raw["requestedQuantity"],
          `${path}.requestedQuantity`,
        );
        const maxQuantity = requireNumber(
          raw["maxQuantity"],
          `${path}.maxQuantity`,
        );
        const isFood = raw === food;
        const needsHunger =
          isFood && ratios.some((ratio) => ratio !== -1 || storageRequired > 1);
        if (needsHunger && hungryRace === null) {
          hungryRace = dependencies.isHungryRace();
        }
        const keepView = {
          storageRequired,
          requestedQuantity,
          maxQuantity,
          isFood,
        };
        const isCraftable = callBoolean(raw, "isCraftable", path);
        const currentQuantity = requireNumber(
          raw["currentQuantity"],
          `${path}.currentQuantity`,
        );
        const storageRatio = requireNumber(
          raw["storageRatio"],
          `${path}.storageRatio`,
        );
        const effectiveHungry = hungryRace ?? true;
        const craftableMaximum =
          isCraftable && currentQuantity > storageRequired * storageShift
            ? callNumber(manager, "maxConsumeCraftable", "ConsumeManager", raw)
            : null;
        const ratioMaximums = ratios.map((ratio) => {
          if (isCraftable) {
            return null;
          }
          const keepRatio = calculateConsumeKeepRatio(
            ratio,
            keepView,
            storageShift,
            effectiveHungry,
          );
          if (keepRatio === null) {
            return null;
          }
          const queryRatio =
            storageRatio > keepRatio
              ? keepRatio
              : storageRatio >= 0.999 && keepRatio >= 1
                ? storageRatio
                : null;
          if (queryRatio === null) {
            return null;
          }
          return callNumber(
            manager,
            "maxConsumeForRatio",
            "ConsumeManager",
            raw,
            queryRatio,
          );
        });
        resources.push(
          Object.freeze({
            id,
            enabled,
            demanded,
            ...keepView,
            isCraftable,
            currentQuantity,
            storageRatio,
            craftableMaximum,
            ratioMaximums: Object.freeze(ratioMaximums),
          }),
        );
      }

      const uniqueIds = Object.keys(
        Object.fromEntries(resources.map((resource) => [resource.id, 0])),
      );
      const current: ConsumeCurrentView[] = uniqueIds.map((id) =>
        Object.freeze({
          id,
          count: callNumber(manager, "currentConsume", "ConsumeManager", id),
        }),
      );
      return Object.freeze({
        initialised: true,
        useful,
        maximum,
        storageShift,
        hungryRace: hungryRace ?? true,
        ratios,
        resources: Object.freeze(resources),
        current: Object.freeze(current),
      });
    },
  });
}

export function createConsumeCommandExecutor(
  getManager: () => unknown,
): DecisionExecutor<ConsumeDecision> {
  return Object.freeze({
    execute(decision: Readonly<ConsumeDecision>) {
      const activeAdjustments = decision.adjustments.filter(
        (adjustment) => adjustment.delta !== 0,
      );
      if (activeAdjustments.length === 0) {
        return SUCCEEDED;
      }
      const manager = requireRecord(getManager(), "ConsumeManager");
      const currentConsume = requireFunction(
        manager["currentConsume"],
        "ConsumeManager.currentConsume",
      );
      const consumeLess = activeAdjustments.some(
        (adjustment) => adjustment.delta < 0,
      )
        ? requireFunction(manager["consumeLess"], "ConsumeManager.consumeLess")
        : null;
      const consumeMore = activeAdjustments.some(
        (adjustment) => adjustment.delta > 0,
      )
        ? requireFunction(manager["consumeMore"], "ConsumeManager.consumeMore")
        : null;

      for (const adjustment of activeAdjustments) {
        if (!Number.isSafeInteger(adjustment.delta)) {
          return rejected(
            "invalid-consume-adjustment",
            "consume adjustment must be a safe integer",
          );
        }
        const actual = requireNumber(
          Reflect.apply(currentConsume, manager, [adjustment.resourceId]),
          `ConsumeManager.currentConsume(${adjustment.resourceId})`,
        );
        if (actual !== adjustment.expectedCurrent) {
          return stale(
            "stale-consume-allocation",
            "consume allocation changed",
            {
              resourceId: adjustment.resourceId,
              expected: adjustment.expectedCurrent,
              actual,
            },
          );
        }
      }

      for (const adjustment of activeAdjustments) {
        if (adjustment.delta < 0 && consumeLess !== null) {
          Reflect.apply(consumeLess, manager, [
            adjustment.resourceId,
            adjustment.delta * -1,
          ]);
        }
      }
      for (const adjustment of activeAdjustments) {
        if (adjustment.delta > 0 && consumeMore !== null) {
          Reflect.apply(consumeMore, manager, [
            adjustment.resourceId,
            adjustment.delta,
          ]);
        }
      }
      return SUCCEEDED;
    },
  });
}
