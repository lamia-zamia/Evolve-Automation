import type {
  CraftCandidateInput,
  CraftDecision,
  CraftGateInput,
  CraftMaterialView,
} from "../../domain/craft.ts";
import type { CraftReader } from "../../ports/craft.ts";
import type { DecisionExecutor } from "../../ports/decision-executor.ts";
import { rejected, stale, SUCCEEDED } from "../command-outcomes.ts";
import {
  requireFunction,
  requireNumber,
  requireRecord,
  type UnknownRecord,
} from "../validation.ts";

export interface CraftReaderDependencies {
  readonly getResources: () => unknown;
  readonly getGame: () => unknown;
  readonly getFoundryList: () => unknown;
  readonly ticksPerSecond: () => number;
}

interface CraftSession {
  readonly resources: UnknownRecord;
  readonly foundryList: unknown[];
}

function callBoolean(record: UnknownRecord, name: string, path: string) {
  return Boolean(
    Reflect.apply(requireFunction(record[name], `${path}.${name}`), record, []),
  );
}

function readFoundryList(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError("foundryList must be an array");
  }
  return value;
}

function readCraftableId(craftable: UnknownRecord, path: string): string {
  const id = craftable["id"];
  if (typeof id !== "string") {
    throw new TypeError(`${path}.id must be a string`);
  }
  return id;
}

function readPositiveCost(value: unknown, path: string): number {
  const cost = requireNumber(value, path);
  if (cost <= 0) {
    throw new TypeError(`${path} must be positive`);
  }
  return cost;
}

export function createCraftReader(
  dependencies: CraftReaderDependencies,
): CraftReader {
  let session: CraftSession | null = null;

  return Object.freeze({
    readGate(): CraftGateInput {
      // Preserve the legacy acquisition order before either guard is checked.
      const resources = requireRecord(dependencies.getResources(), "resources");
      const game = requireRecord(dependencies.getGame(), "game");
      const foundryList = readFoundryList(dependencies.getFoundryList());
      session = Object.freeze({ resources, foundryList });

      const population = requireRecord(
        resources["Population"],
        "resources.Population",
      );
      const populationUnlocked = callBoolean(
        population,
        "isUnlocked",
        "resources.Population",
      );
      if (!populationUnlocked) {
        return Object.freeze({ populationUnlocked: false, noCraft: false });
      }
      const global = requireRecord(game["global"], "game.global");
      const race = requireRecord(global["race"], "game.global.race");
      return Object.freeze({
        populationUnlocked: true,
        noCraft: Boolean(race["no_craft"]),
      });
    },

    readCandidate(index: number): CraftCandidateInput | null {
      if (!Number.isSafeInteger(index) || index < 0) {
        throw new TypeError("craft index must be a non-negative safe integer");
      }
      if (session === null) {
        throw new Error("craft gate must be read before candidates");
      }
      if (index >= session.foundryList.length) {
        return null;
      }

      const path = `foundryList[${index}]`;
      const craftable = requireRecord(session.foundryList[index], path);
      const unlocked = callBoolean(craftable, "isUnlocked", path);
      if (!unlocked) {
        return Object.freeze({
          index,
          craftableId: null,
          unlocked: false,
          autoCraftEnabled: false,
          materials: Object.freeze([]),
        });
      }
      const autoCraftEnabled = Boolean(craftable["autoCraftEnabled"]);
      if (!autoCraftEnabled) {
        return Object.freeze({
          index,
          craftableId: null,
          unlocked: true,
          autoCraftEnabled: false,
          materials: Object.freeze([]),
        });
      }

      const craftableId = readCraftableId(craftable, path);
      const cost = requireRecord(craftable["cost"], `${path}.cost`);
      if (Object.keys(cost).length === 0) {
        throw new TypeError(`${path}.cost must contain at least one material`);
      }
      const materials: CraftMaterialView[] = [];
      for (const resourceId in cost) {
        const materialPath = `${path}.cost.${resourceId}`;
        const costPerCraft = readPositiveCost(cost[resourceId], materialPath);
        const resource = requireRecord(
          session.resources[resourceId],
          `resources.${resourceId}`,
        );
        const currentQuantity = requireNumber(
          resource["currentQuantity"],
          `resources.${resourceId}.currentQuantity`,
        );
        const maxQuantity = requireNumber(
          resource["maxQuantity"],
          `resources.${resourceId}.maxQuantity`,
        );
        const craftPreserve = requireNumber(
          craftable["craftPreserve"],
          `${path}.craftPreserve`,
        );
        const base = {
          resourceId,
          costPerCraft,
          currentQuantity,
          maxQuantity,
          craftPreserve,
        };

        if (callBoolean(craftable, "isDemanded", path)) {
          const thresholdPreserve = requireNumber(
            craftable["craftPreserve"],
            `${path}.craftPreserve`,
          );
          const availableQuantity =
            currentQuantity < maxQuantity * (thresholdPreserve + 0.05)
              ? currentQuantity
              : requireNumber(
                  resource["spareQuantity"],
                  `resources.${resourceId}.spareQuantity`,
                );
          materials.push(
            Object.freeze({ ...base, mode: "demanded", availableQuantity }),
          );
          continue;
        }

        if (callBoolean(resource, "isDemanded", `resources.${resourceId}`)) {
          materials.push(Object.freeze({ ...base, mode: "blocked" }));
          break;
        }
        const cappedForPriority = callBoolean(
          resource,
          "isCapped",
          `resources.${resourceId}`,
        );
        if (
          !cappedForPriority &&
          requireNumber(
            resource["usefulRatio"],
            `resources.${resourceId}.usefulRatio`,
          ) < requireNumber(craftable["usefulRatio"], `${path}.usefulRatio`)
        ) {
          materials.push(Object.freeze({ ...base, mode: "blocked" }));
          break;
        }

        if (
          requireNumber(
            craftable["currentQuantity"],
            `${path}.currentQuantity`,
          ) <
          requireNumber(craftable["storageRequired"], `${path}.storageRequired`)
        ) {
          materials.push(
            Object.freeze({
              ...base,
              mode: "required",
              availableQuantity: requireNumber(
                resource["spareQuantity"],
                `resources.${resourceId}.spareQuantity`,
              ),
            }),
          );
          continue;
        }

        const resourceRequired = requireNumber(
          resource["storageRequired"],
          `resources.${resourceId}.storageRequired`,
        );
        if (
          currentQuantity < resourceRequired &&
          !callBoolean(resource, "isCapped", `resources.${resourceId}`)
        ) {
          materials.push(Object.freeze({ ...base, mode: "blocked" }));
          break;
        }
        const rateOfChange = requireNumber(
          resource["rateOfChange"],
          `resources.${resourceId}.rateOfChange`,
        );
        const ticks = requireNumber(
          dependencies.ticksPerSecond(),
          "ticksPerSecond()",
        );
        if (ticks <= 0) {
          throw new TypeError("ticksPerSecond() must be positive");
        }
        materials.push(
          Object.freeze({
            ...base,
            mode: "income",
            rateOfChange,
            ticksPerSecond: ticks,
          }),
        );
      }

      return Object.freeze({
        index,
        craftableId,
        unlocked: true,
        autoCraftEnabled: true,
        materials: Object.freeze(materials),
      });
    },
  });
}

export interface CraftExecutorDependencies {
  // TRANSITIONAL: Resource.tryCraftX remains the narrow bridge to the current
  // Vue manual-crafting control. The Milestone 5 game/bootstrap adapter should
  // replace it without changing the pure craft policy or application phases.
  readonly getResources: () => unknown;
  readonly getFoundryList: () => unknown;
}

export function createCraftCommandExecutor(
  dependencies: CraftExecutorDependencies,
): DecisionExecutor<CraftDecision> {
  return Object.freeze({
    execute(decision: Readonly<CraftDecision>) {
      if (!Number.isSafeInteger(decision.count) || decision.count < 1) {
        return rejected(
          "invalid-craft-count",
          "craft count must be a positive safe integer",
        );
      }

      const list = readFoundryList(dependencies.getFoundryList());
      const value = list[decision.index];
      const craftable =
        typeof value === "object" && value !== null
          ? (value as UnknownRecord)
          : null;
      const actualCraftableId =
        craftable !== null && typeof craftable["id"] === "string"
          ? craftable["id"]
          : null;
      if (craftable === null || actualCraftableId !== decision.craftableId) {
        return stale("stale-craft-candidate", "foundry list changed", {
          index: decision.index,
          expectedCraftableId: decision.craftableId,
          actualCraftableId,
        });
      }

      const resources = requireRecord(dependencies.getResources(), "resources");
      const writes: { resource: UnknownRecord; nextQuantity: number }[] = [];
      for (const spend of decision.spend) {
        if (!Number.isFinite(spend.amount) || spend.amount < 0) {
          return rejected(
            "invalid-craft-spend",
            "craft spend must be a non-negative finite number",
          );
        }
        const resource = requireRecord(
          resources[spend.resourceId],
          `resources.${spend.resourceId}`,
        );
        const actual = requireNumber(
          resource["currentQuantity"],
          `resources.${spend.resourceId}.currentQuantity`,
        );
        if (actual !== spend.expectedCurrentQuantity) {
          return stale(
            "stale-craft-material",
            "craft material balance changed",
            {
              resourceId: spend.resourceId,
              expected: spend.expectedCurrentQuantity,
              actual,
            },
          );
        }
        writes.push({ resource, nextQuantity: actual - spend.amount });
      }

      const tryCraftX = requireFunction(
        craftable["tryCraftX"],
        `foundryList[${decision.index}].tryCraftX`,
      );
      Reflect.apply(tryCraftX, craftable, [decision.count]);
      for (const write of writes) {
        write.resource["currentQuantity"] = write.nextQuantity;
      }
      return SUCCEEDED;
    },
  });
}
