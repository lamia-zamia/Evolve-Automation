import type {
  ConstructStorageCommand,
  StorageResourceDelta,
  StorageUnit,
} from "../../commands.ts";
import type { GameSnapshot } from "../../snapshot.ts";

export interface StorageResourceCost {
  readonly resourceId: string;
  readonly costPerUnit: number;
  readonly available: number;
}

export interface CraftableStorageView {
  /** The produced resource id ("Crates" or "Containers"). */
  readonly resourceId: string;
  readonly maxQuantity: number;
  readonly currentQuantity: number;
  /** Storage capacity one built unit provides (crateValue / containerValue). */
  readonly storagePerUnit: number;
  /** Cost resources, in the original iteration order. */
  readonly costs: readonly StorageResourceCost[];
}

export interface StorageExpansionSnapshot extends GameSnapshot {
  /** Storage capacity still required this tick (the call input). */
  readonly storageToBuild: number;
  readonly crates: CraftableStorageView;
  readonly containers: CraftableStorageView;
  readonly isEarlyGame: boolean;
  readonly isLumberRace: boolean;
  readonly steel: Readonly<{
    storageRatio: number;
    maxQuantity: number;
    storageRequired: number;
  }>;
  /** Absent Plywood cost is represented as null to preserve `undefined > x === false`. */
  readonly library: Readonly<{ count: number; plywoodCost: number | null }>;
  readonly plywoodAvailable: number;
}

export interface StorageExpansionSettings {
  readonly storageLimitPreMad: boolean;
}

function affordableUnits(view: CraftableStorageView): number {
  let cap = view.maxQuantity - view.currentQuantity;
  for (const cost of view.costs) {
    cap = Math.min(cap, cost.available / cost.costPerUnit);
  }
  return cap;
}

function constructCommand(
  unit: StorageUnit,
  view: CraftableStorageView,
  count: number,
): ConstructStorageCommand {
  const spend: StorageResourceDelta[] = view.costs.map((cost) =>
    Object.freeze({
      resourceId: cost.resourceId,
      amount: cost.costPerUnit * count,
    }),
  );
  return Object.freeze({
    kind: "construct-storage",
    unit,
    count,
    storagePerUnit: view.storagePerUnit,
    producedResourceId: view.resourceId,
    spend: Object.freeze(spend),
  });
}

/**
 * Pure equivalent of the legacy `expandStorage`, with one deliberate policy
 * correction: when the pre-MAD limiter is disabled during the early game,
 * affordable containers are preferred for the shortfall. Non-positive counts
 * are preserved so the executor reconciles the resource model identically,
 * including the over-cap negative-count case.
 */
export function planStorageExpansion(
  snapshot: Readonly<StorageExpansionSnapshot>,
  settings: Readonly<StorageExpansionSettings>,
): readonly ConstructStorageCommand[] {
  let missing = snapshot.storageToBuild;
  let crateCap = affordableUnits(snapshot.crates);
  let containerCap = affordableUnits(snapshot.containers);

  if (settings.storageLimitPreMad && snapshot.isEarlyGame) {
    if (snapshot.steel.storageRatio < 0.8) {
      containerCap = 0;
    }
    if (
      snapshot.isLumberRace &&
      snapshot.library.count < 20 &&
      snapshot.library.plywoodCost !== null &&
      snapshot.library.plywoodCost > snapshot.plywoodAvailable &&
      snapshot.steel.maxQuantity >= snapshot.steel.storageRequired
    ) {
      crateCap = 0;
    }
  }

  const commands: ConstructStorageCommand[] = [];

  // With the pre-MAD limiter disabled, an early-game container is the useful
  // unit for a small shortfall. Prefer it when Steel can actually pay for one;
  // otherwise retain the crate fallback so storage can still progress while
  // Steel is below the container cost.
  const preferContainers = !settings.storageLimitPreMad && snapshot.isEarlyGame;
  if (preferContainers && missing > 0) {
    const containersToBuild = Math.min(
      Math.floor(containerCap),
      Math.ceil(missing / snapshot.containers.storagePerUnit),
    );
    commands.push(
      constructCommand("container", snapshot.containers, containersToBuild),
    );
    missing -= containersToBuild * snapshot.containers.storagePerUnit;
  }

  const cratesToBuild = Math.min(
    Math.floor(crateCap),
    preferContainers && missing <= 0
      ? 0
      : Math.ceil(missing / snapshot.crates.storagePerUnit),
  );
  commands.push(constructCommand("crate", snapshot.crates, cratesToBuild));
  missing -= cratesToBuild * snapshot.crates.storagePerUnit;

  if (!preferContainers && missing > 0) {
    const containersToBuild = Math.min(
      Math.floor(containerCap),
      Math.ceil(missing / snapshot.containers.storagePerUnit),
    );
    commands.push(
      constructCommand("container", snapshot.containers, containersToBuild),
    );
  }

  return Object.freeze(commands);
}
