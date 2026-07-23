import { createSnapshotMetadata } from "../../domain/snapshot.ts";
import type {
  CraftableStorageView,
  StorageExpansionSnapshot,
  StorageResourceCost,
} from "../../domain/economy/storage/storage-expansion.ts";
import type { Clock } from "../../ports/clock.ts";
import type { GameReader } from "../../ports/game-reader.ts";
import {
  requireNumber,
  requireRecord,
  type UnknownRecord,
} from "../validation.ts";

export interface EvolveStorageExpansionReaderDependencies {
  readonly clock: Clock;
  /** Storage capacity still required this tick; set by the caller before each cycle. */
  readonly getStorageToBuild: () => number;
  readonly getResources: () => unknown;
  readonly getBuildings: () => unknown;
  readonly getStorageManager: () => unknown;
  readonly isEarlyGame: () => unknown;
  readonly isLumberRace: () => unknown;
}

function readView(
  resources: UnknownRecord,
  resourceId: string,
  storagePerUnit: number,
): CraftableStorageView {
  const view = requireRecord(resources[resourceId], `resources.${resourceId}`);
  const costRecord = requireRecord(
    view["cost"],
    `resources.${resourceId}.cost`,
  );
  const costs: StorageResourceCost[] = [];
  for (const key in costRecord) {
    const costPerUnit = requireNumber(
      costRecord[key],
      `resources.${resourceId}.cost.${key}`,
    );
    const costResource = requireRecord(resources[key], `resources.${key}`);
    const available = requireNumber(
      costResource["currentQuantity"],
      `resources.${key}.currentQuantity`,
    );
    costs.push(Object.freeze({ resourceId: key, costPerUnit, available }));
  }
  return Object.freeze({
    resourceId,
    maxQuantity: requireNumber(
      view["maxQuantity"],
      `resources.${resourceId}.maxQuantity`,
    ),
    currentQuantity: requireNumber(
      view["currentQuantity"],
      `resources.${resourceId}.currentQuantity`,
    ),
    storagePerUnit,
    costs: Object.freeze(costs),
  });
}

function readPlywoodCost(library: UnknownRecord): number | null {
  const cost = library["cost"];
  if (typeof cost !== "object" || cost === null) {
    return null;
  }
  const value = (cost as UnknownRecord)["Plywood"];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function createEvolveStorageExpansionReader(
  dependencies: EvolveStorageExpansionReaderDependencies,
): GameReader<StorageExpansionSnapshot> {
  let snapshotSequence = 0;

  function readSnapshot(): StorageExpansionSnapshot {
    snapshotSequence += 1;
    const metadata = createSnapshotMetadata({
      id: `storage-expansion-snapshot-${snapshotSequence}`,
      capturedAtMs: dependencies.clock.nowMs(),
    });

    const resources = requireRecord(dependencies.getResources(), "resources");
    const storageManager = requireRecord(
      dependencies.getStorageManager(),
      "StorageManager",
    );
    const crateValue = requireNumber(
      storageManager["crateValue"],
      "StorageManager.crateValue",
    );
    const containerValue = requireNumber(
      storageManager["containerValue"],
      "StorageManager.containerValue",
    );

    const buildings = requireRecord(dependencies.getBuildings(), "buildings");
    const library = requireRecord(buildings["Library"], "buildings.Library");
    const steel = requireRecord(resources["Steel"], "resources.Steel");
    const plywood = requireRecord(resources["Plywood"], "resources.Plywood");

    return Object.freeze({
      metadata,
      storageToBuild: dependencies.getStorageToBuild(),
      crates: readView(resources, "Crates", crateValue),
      containers: readView(resources, "Containers", containerValue),
      isEarlyGame: Boolean(dependencies.isEarlyGame()),
      isLumberRace: Boolean(dependencies.isLumberRace()),
      steel: Object.freeze({
        storageRatio: requireNumber(
          steel["storageRatio"],
          "resources.Steel.storageRatio",
        ),
        maxQuantity: requireNumber(
          steel["maxQuantity"],
          "resources.Steel.maxQuantity",
        ),
        storageRequired: requireNumber(
          steel["storageRequired"],
          "resources.Steel.storageRequired",
        ),
      }),
      library: Object.freeze({
        count: requireNumber(library["count"], "buildings.Library.count"),
        plywoodCost: readPlywoodCost(library),
      }),
      plywoodAvailable: requireNumber(
        plywood["currentQuantity"],
        "resources.Plywood.currentQuantity",
      ),
    });
  }

  return Object.freeze({ readSnapshot });
}
