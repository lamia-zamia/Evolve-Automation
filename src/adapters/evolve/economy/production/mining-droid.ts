import type {
  MiningDroidCurrent,
  MiningDroidDecision,
  MiningDroidPlanningInput,
  MiningDroidProductionInput,
} from "../../../../domain/economy/production/mining-droid.ts";
import type { DecisionExecutor } from "../../../../ports/decision-executor.ts";
import type { MiningDroidReader } from "../../../../ports/mining-droid.ts";
import { rejected, stale, SUCCEEDED } from "../../../command-outcomes.ts";
import {
  callBoolean,
  callNumber,
  requireCount,
  requireFunction,
  requireNonEmptyString,
  requireNumber,
  requireRecord,
  type UnknownRecord,
} from "../../../validation.ts";

interface MiningDroidSession {
  readonly manager: UnknownRecord;
  readonly productions: ReadonlyMap<string, UnknownRecord>;
}

function readProductions(manager: UnknownRecord): {
  readonly values: readonly UnknownRecord[];
  readonly byId: ReadonlyMap<string, UnknownRecord>;
} {
  const productions = requireRecord(
    manager["Productions"],
    "DroidManager.Productions",
  );
  const values: UnknownRecord[] = [];
  const byId = new Map<string, UnknownRecord>();
  for (const [key, value] of Object.entries(productions)) {
    const path = `DroidManager.Productions.${key}`;
    const production = requireRecord(value, path);
    const id = requireNonEmptyString(production["id"], `${path}.id`);
    if (byId.has(id)) {
      throw new TypeError(`DroidManager.Productions has duplicate id ${id}`);
    }
    values.push(production);
    byId.set(id, production);
  }
  return Object.freeze({ values: Object.freeze(values), byId });
}

export function createMiningDroidReader(
  getManager: () => unknown,
): MiningDroidReader {
  let session: MiningDroidSession | null = null;

  return Object.freeze({
    readPlanningInput(): MiningDroidPlanningInput {
      const manager = requireRecord(getManager(), "DroidManager");
      if (!callBoolean(manager, "initIndustry", "DroidManager")) {
        session = null;
        return Object.freeze({
          initialised: false,
          maximum: 0,
          productions: Object.freeze([]),
        });
      }

      const rawProductions = readProductions(manager);
      session = Object.freeze({
        manager,
        productions: rawProductions.byId,
      });
      const partial = rawProductions.values.map((production, index) => {
        const path = `DroidManager.Productions[${index}]`;
        const id = requireNonEmptyString(production["id"], `${path}.id`);
        const weighting = requireNumber(
          production["weighting"],
          `${path}.weighting`,
        );
        if (weighting <= 0) {
          return { production, id, weighting, priority: 0, demanded: false };
        }
        const resource = requireRecord(
          production["resource"],
          `${path}.resource`,
        );
        return {
          production,
          resource,
          id,
          weighting,
          priority: requireNumber(production["priority"], `${path}.priority`),
          demanded: callBoolean(resource, "isDemanded", `${path}.resource`),
        };
      });
      const maximum = requireCount(
        callNumber(manager, "maxOperating", "DroidManager"),
        "DroidManager.maxOperating()",
      );
      const productions: MiningDroidProductionInput[] = partial.map((entry) => {
        const effectivePriority = entry.demanded
          ? Math.max(entry.priority, 100)
          : entry.priority;
        const useful =
          maximum > 0 && entry.weighting > 0 && effectivePriority !== 0
            ? callBoolean(
                requireRecord(
                  entry.production["resource"],
                  `DroidManager production ${entry.id}.resource`,
                ),
                "isUseful",
                `DroidManager production ${entry.id}.resource`,
              )
            : false;
        return Object.freeze({
          id: entry.id,
          weighting: entry.weighting,
          priority: entry.priority,
          demanded: entry.demanded,
          useful,
        });
      });
      return Object.freeze({
        initialised: true,
        maximum,
        productions: Object.freeze(productions),
      });
    },

    readCurrent(
      productionIds: readonly string[],
    ): readonly MiningDroidCurrent[] {
      if (session === null) {
        throw new Error(
          "mining-droid planning input must be read before current allocations",
        );
      }
      const activeSession = session;
      const seen = new Set<string>();
      const current = productionIds.map((productionId) => {
        if (seen.has(productionId)) {
          throw new TypeError(
            `duplicate mining-droid production id ${productionId}`,
          );
        }
        seen.add(productionId);
        const production = activeSession.productions.get(productionId);
        if (production === undefined) {
          throw new TypeError(
            `unknown mining-droid production id ${productionId}`,
          );
        }
        const count = requireCount(
          callNumber(
            activeSession.manager,
            "currentProduction",
            "DroidManager",
            production,
          ),
          `DroidManager.currentProduction(${productionId})`,
        );
        return Object.freeze({ productionId, count });
      });
      return Object.freeze(current);
    },
  });
}

export function createMiningDroidCommandExecutor(
  // TRANSITIONAL: DroidManager remains the narrow bridge to the current Vue
  // iDroid controls. The Milestone 5 game/bootstrap adapter should replace it
  // without changing the pure allocator or application-owned apply phase.
  getManager: () => unknown,
): DecisionExecutor<MiningDroidDecision> {
  return Object.freeze({
    execute(decision: Readonly<MiningDroidDecision>) {
      const decisionIds = new Set<string>();
      for (const adjustment of decision.adjustments) {
        if (
          typeof adjustment.productionId !== "string" ||
          adjustment.productionId.length === 0 ||
          decisionIds.has(adjustment.productionId) ||
          !Number.isSafeInteger(adjustment.expectedCurrent) ||
          adjustment.expectedCurrent < 0 ||
          !Number.isSafeInteger(adjustment.delta) ||
          !Number.isSafeInteger(
            adjustment.expectedCurrent + adjustment.delta,
          ) ||
          adjustment.expectedCurrent + adjustment.delta < 0
        ) {
          return rejected(
            "invalid-mining-droid-adjustment",
            "mining-droid adjustments require unique ids and safe non-negative target allocations",
          );
        }
        decisionIds.add(adjustment.productionId);
      }
      const active = decision.adjustments.filter(
        (adjustment) => adjustment.delta !== 0,
      );
      if (active.length === 0) {
        return SUCCEEDED;
      }

      const manager = requireRecord(getManager(), "DroidManager");
      const productions = readProductions(manager).byId;
      const currentProduction = requireFunction(
        manager["currentProduction"],
        "DroidManager.currentProduction",
      );
      const decreaseProduction = active.some((entry) => entry.delta < 0)
        ? requireFunction(
            manager["decreaseProduction"],
            "DroidManager.decreaseProduction",
          )
        : null;
      const increaseProduction = active.some((entry) => entry.delta > 0)
        ? requireFunction(
            manager["increaseProduction"],
            "DroidManager.increaseProduction",
          )
        : null;

      const resolved: {
        readonly adjustment: (typeof active)[number];
        readonly production: UnknownRecord;
      }[] = [];
      for (const adjustment of active) {
        const production = productions.get(adjustment.productionId);
        if (production === undefined) {
          return stale(
            "stale-mining-droid-production",
            "mining-droid production list changed",
            { productionId: adjustment.productionId },
          );
        }
        const actual = requireCount(
          requireNumber(
            Reflect.apply(currentProduction, manager, [production]),
            `DroidManager.currentProduction(${adjustment.productionId})`,
          ),
          `DroidManager.currentProduction(${adjustment.productionId})`,
        );
        if (actual !== adjustment.expectedCurrent) {
          return stale(
            "stale-mining-droid-allocation",
            "mining-droid allocation changed",
            {
              productionId: adjustment.productionId,
              expected: adjustment.expectedCurrent,
              actual,
            },
          );
        }
        resolved.push({ adjustment, production });
      }

      for (const entry of resolved) {
        if (entry.adjustment.delta < 0 && decreaseProduction !== null) {
          Reflect.apply(decreaseProduction, manager, [
            entry.production,
            entry.adjustment.delta * -1,
          ]);
        }
      }
      for (const entry of resolved) {
        if (entry.adjustment.delta > 0 && increaseProduction !== null) {
          Reflect.apply(increaseProduction, manager, [
            entry.production,
            entry.adjustment.delta,
          ]);
        }
      }
      return SUCCEEDED;
    },
  });
}
