import { createSnapshotMetadata } from "../../../../domain/snapshot.ts";
import type {
  CraftableStorageView,
  StorageExpansionSnapshot,
  StorageResourceCost,
} from "../../../../domain/economy/storage/storage-expansion.ts";
import type { Clock } from "../../../../ports/clock.ts";
import type { GameReader } from "../../../../ports/game-reader.ts";
import {
  requireNumber,
  requireRecord,
  type UnknownRecord,
} from "../../../validation.ts";

export interface EvolveStorageExpansionReaderDependencies {
  readonly clock: Clock;
  /** Storage capacity still required this tick; set by the caller before each cycle. */
  readonly getStorageToBuild: () => number;
  readonly getResources: () => unknown;
  readonly getBuildings: () => unknown;
  readonly getStorageManager: () => unknown;
  readonly isEarlyGame: () => unknown;
  readonly isLumberRace: () => unknown;
  readonly readDebugEnabled: () => boolean;
  /** Debug-only echo of the pre-MAD limiter setting the planner is given. */
  readonly readLimitPreMad: () => boolean;
  readonly log: (message: string) => void;
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

function describeView(label: string, view: CraftableStorageView): string {
  const costs = view.costs
    .map(
      (cost) =>
        `${cost.resourceId} ${cost.costPerUnit}/ea have ${cost.available}`,
    )
    .join(", ");
  return `${label} ${view.currentQuantity}/${view.maxQuantity} worth ${view.storagePerUnit} each (${costs || "no cost"})`;
}

/**
 * One line per expansion request, naming every input that can clamp the build to
 * zero: the free unit slots, the cost resource on hand, and the pre-MAD limiter
 * terms. Without it a zero build is indistinguishable from the planner never
 * having run.
 */
function describeSnapshot(
  snapshot: StorageExpansionSnapshot,
  limitPreMad: boolean,
): string {
  return [
    `[storage] expand ${snapshot.storageToBuild}`,
    describeView("crates", snapshot.crates),
    describeView("containers", snapshot.containers),
    `preMadLimit=${limitPreMad} early=${snapshot.isEarlyGame} lumber=${snapshot.isLumberRace}`,
    `libraries=${snapshot.library.count} libraryPlywood=${snapshot.library.plywoodCost} plywood=${snapshot.plywoodAvailable}`,
    `steelMax=${snapshot.steel.maxQuantity} steelRequired=${snapshot.steel.storageRequired} steelRatio=${snapshot.steel.storageRatio}`,
  ].join(" | ");
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

    const snapshot = Object.freeze({
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

    if (dependencies.readDebugEnabled()) {
      dependencies.log(
        describeSnapshot(snapshot, dependencies.readLimitPreMad()),
      );
    }

    return snapshot;
  }

  return Object.freeze({ readSnapshot });
}
