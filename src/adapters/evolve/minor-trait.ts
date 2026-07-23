import type {
  MinorTraitCandidateInput,
  MinorTraitPurchaseDecision,
  MinorTraitSummaryInput,
  MinorTraitSummaryView,
} from "../../domain/traits/minor-trait.ts";
import type { DecisionExecutor } from "../../ports/decision-executor.ts";
import type { MinorTraitReader } from "../../ports/minor-trait.ts";
import { rejected, stale, SUCCEEDED } from "../command-outcomes.ts";
import {
  requireFunction,
  requireNumber,
  requireRecord,
  type UnknownRecord,
} from "../validation.ts";

export interface MinorTraitReaderDependencies {
  // TRANSITIONAL: the legacy trait-manager wrapper remains the narrow bridge
  // to current Vue-backed trait objects. The Milestone 5 trait/bootstrap slice
  // should replace it with the final Evolve reader/control implementation.
  readonly getMinorTraitManager: () => unknown;
  readonly getResources: () => unknown;
}

function readManagedList(manager: UnknownRecord): unknown[] {
  const managedPriorityList = requireFunction(
    manager["managedPriorityList"],
    "MinorTraitManager.managedPriorityList",
  );
  const list = Reflect.apply(managedPriorityList, manager, []);
  if (!Array.isArray(list)) {
    throw new TypeError(
      "MinorTraitManager.managedPriorityList() must return an array",
    );
  }
  return list;
}

function readTraitName(trait: UnknownRecord, path: string): string {
  const traitName = trait["traitName"];
  if (typeof traitName !== "string") {
    throw new TypeError(`${path}.traitName must be a string`);
  }
  return traitName;
}

function readGeneCost(trait: UnknownRecord, path: string): number {
  const geneCost = requireFunction(trait["geneCost"], `${path}.geneCost`);
  const cost = requireNumber(
    Reflect.apply(geneCost, trait, []),
    `${path}.geneCost()`,
  );
  if (cost < 0) {
    throw new TypeError(`${path}.geneCost() must be non-negative`);
  }
  return cost;
}

function readGenes(getResources: () => unknown): number {
  const resources = requireRecord(getResources(), "resources");
  const genes = requireRecord(resources["Genes"], "resources.Genes");
  return requireNumber(
    genes["currentQuantity"],
    "resources.Genes.currentQuantity",
  );
}

export function createMinorTraitReader(
  dependencies: MinorTraitReaderDependencies,
): MinorTraitReader {
  return Object.freeze({
    readSummary(): MinorTraitSummaryInput {
      const manager = requireRecord(
        dependencies.getMinorTraitManager(),
        "MinorTraitManager",
      );
      const isUnlocked = requireFunction(
        manager["isUnlocked"],
        "MinorTraitManager.isUnlocked",
      );
      if (!Reflect.apply(isUnlocked, manager, [])) {
        return Object.freeze({ unlocked: false, traits: Object.freeze([]) });
      }

      const list = readManagedList(manager);
      const traits: MinorTraitSummaryView[] = list.map((value, index) => {
        const path = `MinorTraitManager.managedPriorityList()[${index}]`;
        const trait = requireRecord(value, path);
        return Object.freeze({
          index,
          traitName: readTraitName(trait, path),
          weighting: requireNumber(trait["weighting"], `${path}.weighting`),
          initialGeneCost: readGeneCost(trait, path),
        });
      });
      return Object.freeze({ unlocked: true, traits: Object.freeze(traits) });
    },

    readCandidate(index: number): MinorTraitCandidateInput | null {
      if (!Number.isSafeInteger(index) || index < 0) {
        throw new TypeError("minor-trait index must be a non-negative integer");
      }
      const manager = requireRecord(
        dependencies.getMinorTraitManager(),
        "MinorTraitManager",
      );
      const list = readManagedList(manager);
      if (index >= list.length) {
        return null;
      }
      const path = `MinorTraitManager.managedPriorityList()[${index}]`;
      const trait = requireRecord(list[index], path);
      // Cost precedes the Genes comparison in the legacy purchase pass.
      const geneCost = readGeneCost(trait, path);
      return Object.freeze({
        index,
        traitName: readTraitName(trait, path),
        geneCost,
        currentGenes: readGenes(dependencies.getResources),
      });
    },
  });
}

export function createMinorTraitCommandExecutor(dependencies: {
  readonly getMinorTraitManager: () => unknown;
  readonly getResources: () => unknown;
}): DecisionExecutor<MinorTraitPurchaseDecision> {
  return Object.freeze({
    execute(decision: Readonly<MinorTraitPurchaseDecision>) {
      if (!Number.isFinite(decision.geneCost) || decision.geneCost < 0) {
        return rejected(
          "invalid-minor-trait-cost",
          "minor-trait gene cost must be a non-negative finite number",
        );
      }

      const resources = requireRecord(dependencies.getResources(), "resources");
      const genes = requireRecord(resources["Genes"], "resources.Genes");
      const actualGenes = requireNumber(
        genes["currentQuantity"],
        "resources.Genes.currentQuantity",
      );
      if (actualGenes !== decision.expectedGenes) {
        return stale("stale-minor-trait-genes", "Genes balance changed", {
          traitName: decision.traitName,
          expected: decision.expectedGenes,
          actual: actualGenes,
        });
      }

      const manager = requireRecord(
        dependencies.getMinorTraitManager(),
        "MinorTraitManager",
      );
      const buyTrait = requireFunction(
        manager["buyTrait"],
        "MinorTraitManager.buyTrait",
      );
      Reflect.apply(buyTrait, manager, [decision.traitName]);
      genes["currentQuantity"] = actualGenes - decision.geneCost;
      return SUCCEEDED;
    },
  });
}
