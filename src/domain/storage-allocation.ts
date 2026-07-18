export const STORAGE_ALLOCATION_DEBOUNCE_TICKS = 3;

export interface StorageAllocationResourceInput {
  readonly id: string;
  readonly unlocked: boolean;
  readonly managed: boolean;
  readonly currentQuantity: number;
  readonly maxQuantity: number;
  readonly maxStorage: number;
  readonly storageRequired: number;
  readonly minStorage: number;
  readonly currentCrates: number;
  readonly currentContainers: number;
  readonly storeOverflow: boolean;
  readonly autoSellEnabled: boolean;
  readonly autoSellRatio: number;
}

export interface StorageCostInput {
  readonly resourceId: string;
  readonly quantity: number;
}

export interface StorageTargetInput {
  readonly costs: readonly StorageCostInput[];
  readonly isList: boolean;
  readonly label: string;
  readonly unlocked: boolean;
  readonly autoBuildEnabled: boolean;
}

export interface StorageTargetSourceInput {
  readonly kind:
    | "safe-current"
    | "minimum"
    | "overflow"
    | "queued"
    | "triggered"
    | "fleet"
    | "technology"
    | "project"
    | "building"
    | "required";
  readonly enabled: boolean;
  readonly targets: readonly StorageTargetInput[];
}

export interface StorageAllocationInput {
  readonly initialized: boolean;
  readonly crateValue: number;
  readonly containerValue: number;
  readonly freeCrates: number;
  readonly freeContainers: number;
  readonly assignExtra: boolean;
  readonly assignPart: boolean;
  readonly safeReassign: boolean;
  readonly noTrade: boolean;
  readonly autoMarket: boolean;
  readonly debug: boolean;
  readonly resources: readonly StorageAllocationResourceInput[];
  readonly priorityResourceIds: readonly string[];
  readonly targetSources: readonly StorageTargetSourceInput[];
}

export interface StorageRawAssignment {
  readonly resourceId: string;
  readonly expectedCrates: number;
  readonly expectedContainers: number;
  readonly desiredCrates: number;
  readonly desiredContainers: number;
  readonly expectedMaximum: number;
  readonly currentQuantity: number;
  readonly storageRequired: number;
  readonly driver: string | null;
}

export interface StorageRawPlan {
  readonly crateValue: number;
  readonly containerValue: number;
  readonly expectedFreeCrates: number;
  readonly expectedFreeContainers: number;
  readonly storageToBuild: number;
  readonly assignments: readonly StorageRawAssignment[];
  readonly expectedPriorityResourceIds: readonly string[];
  readonly debug: boolean;
}

export interface StorageDebounceEntry {
  readonly direction?: number;
  readonly ticks?: number;
  readonly previous?: number;
  readonly locked?: number;
}

export interface StorageAllocationState {
  readonly crates: Readonly<Record<string, StorageDebounceEntry>>;
  readonly containers: Readonly<Record<string, StorageDebounceEntry>>;
}

export interface StorageAdjustment {
  readonly resourceId: string;
  readonly expectedCrates: number;
  readonly expectedContainers: number;
  readonly crateDelta: number;
  readonly containerDelta: number;
  readonly expectedMaximum: number;
}

export interface ApplyStorageAllocationDecision {
  readonly kind: "apply-storage-allocation";
  readonly crateValue: number;
  readonly containerValue: number;
  readonly expectedFreeCrates: number;
  readonly expectedFreeContainers: number;
  readonly expectedPriorityResourceIds: readonly string[];
  readonly adjustments: readonly StorageAdjustment[];
  readonly logs: readonly string[];
}

interface MutableAssignment {
  crate: number;
  container: number;
  amount: number;
}

interface MutableDebounceEntry {
  direction?: number;
  ticks?: number;
  previous?: number;
  locked?: number;
}

interface AllocationItem {
  readonly target: StorageTargetInput;
  readonly costs: ReadonlyMap<string, number>;
}

function mapValue<K, V>(map: ReadonlyMap<K, V>, key: K, label: string): V {
  const value = map.get(key);
  if (value === undefined) {
    throw new TypeError(`missing ${label}`);
  }
  return value;
}

function sourceEnabled(
  source: Readonly<StorageTargetSourceInput>,
  input: Readonly<StorageAllocationInput>,
): boolean {
  if (!source.enabled) return false;
  if (source.kind === "safe-current") return input.safeReassign;
  if (source.kind === "required") return input.assignPart;
  return true;
}

function targetEligible(
  source: Readonly<StorageTargetSourceInput>,
  target: Readonly<StorageTargetInput>,
): boolean {
  return source.kind !== "project" && source.kind !== "building"
    ? true
    : target.unlocked && target.autoBuildEnabled;
}

function buildAllocationItems(
  input: Readonly<StorageAllocationInput>,
  managedIds: readonly string[],
): readonly AllocationItem[] {
  const result: AllocationItem[] = [];
  for (const source of input.targetSources) {
    if (!sourceEnabled(source, input)) continue;
    const groups = new Map(
      managedIds.map((id) => [id, [] as AllocationItem[]]),
    );
    for (const target of source.targets) {
      if (!targetEligible(source, target)) continue;
      const costs = new Map(
        target.costs.map((cost) => [cost.resourceId, cost.quantity]),
      );
      for (const resourceId of managedIds) {
        if (costs.get(resourceId)) {
          mapValue(groups, resourceId, `storage group ${resourceId}`).push({
            target,
            costs,
          });
          break;
        }
      }
    }
    for (const resourceId of managedIds) {
      const group = mapValue(groups, resourceId, `storage group ${resourceId}`);
      group.sort(
        (left, right) =>
          (right.costs.get(resourceId) ?? 0) -
          (left.costs.get(resourceId) ?? 0),
      );
      result.push(...group);
    }
  }
  return Object.freeze(result);
}

function freezeDebounceMap(
  map: Readonly<Record<string, MutableDebounceEntry>>,
): Readonly<Record<string, StorageDebounceEntry>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(map).map(([key, value]) => [
        key,
        Object.freeze({ ...value }),
      ]),
    ),
  );
}

function debounce(
  entry: MutableDebounceEntry,
  desired: number,
  current: number,
): number {
  if (entry.locked !== undefined) {
    if (desired >= entry.locked || desired <= entry.locked - 2) {
      delete entry.locked;
    } else {
      return entry.locked;
    }
  }
  if (desired === current) {
    entry.direction = 0;
    entry.ticks = 0;
    return desired;
  }
  const direction = desired > current ? 1 : -1;
  if (entry.direction === direction) {
    entry.ticks = (entry.ticks ?? 0) + 1;
  } else {
    entry.direction = direction;
    entry.ticks = 1;
  }
  if ((entry.ticks ?? 0) < STORAGE_ALLOCATION_DEBOUNCE_TICKS) {
    return current;
  }
  entry.direction = 0;
  entry.ticks = 0;
  if (entry.previous === desired) {
    entry.locked = Math.max(current, desired);
    return entry.locked;
  }
  entry.previous = current;
  return desired;
}

export function planStorageAllocation(
  input: Readonly<StorageAllocationInput>,
): StorageRawPlan | null {
  if (
    !input.initialized ||
    input.crateValue <= 0 ||
    input.containerValue <= 0
  ) {
    return null;
  }
  const resources = new Map(
    input.resources.map((resource) => [resource.id, resource]),
  );
  if (resources.size !== input.resources.length) {
    throw new TypeError("duplicate storage resource id");
  }
  const managedIds = input.priorityResourceIds.filter((id) => {
    const resource = mapValue(resources, id, `storage resource ${id}`);
    return resource.unlocked && resource.managed;
  });
  if (managedIds.length === 0) return null;

  let totalCrates = input.freeCrates;
  let totalContainers = input.freeContainers;
  const adjustments = new Map<string, MutableAssignment>();
  const modifiers = new Map<string, number>();
  for (const id of managedIds) {
    const resource = mapValue(resources, id, `storage resource ${id}`);
    const sellAllowed =
      !input.noTrade &&
      input.autoMarket &&
      resource.autoSellEnabled &&
      resource.autoSellRatio > 0;
    modifiers.set(
      id,
      input.assignExtra
        ? sellAllowed
          ? 1.03 / resource.autoSellRatio
          : 1.03
        : 1,
    );
    adjustments.set(id, {
      crate: 0,
      container: 0,
      amount:
        resource.maxQuantity -
        (resource.currentCrates * input.crateValue +
          resource.currentContainers * input.containerValue),
    });
    totalCrates += resource.currentCrates;
    totalContainers += resource.currentContainers;
  }

  let storageToBuild = 0;
  const drivers = new Map<string, string>();
  const items = buildAllocationItems(input, managedIds);
  nextItem: for (const item of items) {
    const currentAssignment = new Map<
      string,
      { crate: number; container: number }
    >();
    let remainingCrates = totalCrates;
    let remainingContainers = totalContainers;
    for (const [resourceId, quantity] of item.costs) {
      const resource = mapValue(
        resources,
        resourceId,
        `target resource ${resourceId}`,
      );
      const adjustment = adjustments.get(resourceId);
      const modifier = item.target.isList
        ? 1
        : adjustment === undefined
          ? 1
          : mapValue(modifiers, resourceId, `storage modifier ${resourceId}`);
      if (adjustment === undefined) {
        if (resource.maxQuantity >= quantity) continue;
        continue nextItem;
      }
      if (adjustment.amount >= quantity * modifier) continue;
      if (
        !item.target.isList &&
        resource.maxStorage >= 0 &&
        resource.maxStorage < quantity * modifier
      ) {
        continue nextItem;
      }
      let missing =
        Math.min(
          resource.maxStorage >= 0
            ? resource.maxStorage
            : Number.MAX_SAFE_INTEGER,
          quantity * modifier,
        ) - adjustment.amount;
      const available =
        remainingCrates * input.crateValue +
        remainingContainers * input.containerValue;
      if (item.target.isList || missing <= available) {
        const assignment = { crate: 0, container: 0 };
        currentAssignment.set(resourceId, assignment);
        if (missing > 0 && remainingCrates > 0) {
          const count = Math.min(
            Math.ceil(missing / input.crateValue),
            remainingCrates,
          );
          remainingCrates -= count;
          missing -= count * input.crateValue;
          assignment.crate = count;
        }
        if (missing > 0 && remainingContainers > 0) {
          const count = Math.min(
            Math.ceil(missing / input.containerValue),
            remainingContainers,
          );
          remainingContainers -= count;
          missing -= count * input.containerValue;
          assignment.container = count;
        }
        if (missing > 0) {
          storageToBuild = Math.max(storageToBuild, missing);
        }
      } else {
        storageToBuild = Math.max(storageToBuild, missing - available);
        continue nextItem;
      }
    }
    for (const [resourceId, assignment] of currentAssignment) {
      const adjustment = mapValue(
        adjustments,
        resourceId,
        `storage adjustment ${resourceId}`,
      );
      if (input.debug && (assignment.crate > 0 || assignment.container > 0)) {
        const quantity = item.costs.get(resourceId) ?? 0;
        drivers.set(
          resourceId,
          `${item.target.label} (qty=${quantity.toFixed(
            1,
          )}, missing≈${(quantity - adjustment.amount).toFixed(1)})`,
        );
      }
      adjustment.crate += assignment.crate;
      adjustment.container += assignment.container;
      adjustment.amount +=
        assignment.crate * input.crateValue +
        assignment.container * input.containerValue;
    }
    totalCrates = remainingCrates;
    totalContainers = remainingContainers;
  }

  return Object.freeze({
    crateValue: input.crateValue,
    containerValue: input.containerValue,
    expectedFreeCrates: input.freeCrates,
    expectedFreeContainers: input.freeContainers,
    storageToBuild,
    assignments: Object.freeze(
      managedIds.map((resourceId) => {
        const resource = mapValue(
          resources,
          resourceId,
          `storage resource ${resourceId}`,
        );
        const adjustment = mapValue(
          adjustments,
          resourceId,
          `storage adjustment ${resourceId}`,
        );
        return Object.freeze({
          resourceId,
          expectedCrates: resource.currentCrates,
          expectedContainers: resource.currentContainers,
          desiredCrates: adjustment.crate,
          desiredContainers: adjustment.container,
          expectedMaximum: resource.maxQuantity,
          currentQuantity: resource.currentQuantity,
          storageRequired: resource.storageRequired,
          driver: drivers.get(resourceId) ?? null,
        });
      }),
    ),
    expectedPriorityResourceIds: Object.freeze([...input.priorityResourceIds]),
    debug: input.debug,
  });
}

export interface FinalizedStorageAllocation {
  readonly decision: ApplyStorageAllocationDecision;
  readonly nextState: StorageAllocationState;
}

export function finalizeStorageAllocation(
  plan: Readonly<StorageRawPlan>,
  state: Readonly<StorageAllocationState>,
): FinalizedStorageAllocation {
  const crateState: Record<string, MutableDebounceEntry> = Object.fromEntries(
    Object.entries(state.crates).map(([key, value]) => [key, { ...value }]),
  );
  const containerState: Record<string, MutableDebounceEntry> =
    Object.fromEntries(
      Object.entries(state.containers).map(([key, value]) => [
        key,
        { ...value },
      ]),
    );
  const adjustments: StorageAdjustment[] = [];
  const logs: string[] = [];
  for (const assignment of plan.assignments) {
    const crateEntry =
      crateState[assignment.resourceId] ??
      (crateState[assignment.resourceId] = {});
    const containerEntry =
      containerState[assignment.resourceId] ??
      (containerState[assignment.resourceId] = {});
    const targetCrates = debounce(
      crateEntry,
      assignment.desiredCrates,
      assignment.expectedCrates,
    );
    const targetContainers = debounce(
      containerEntry,
      assignment.desiredContainers,
      assignment.expectedContainers,
    );
    const crateDelta = targetCrates - assignment.expectedCrates;
    const containerDelta = targetContainers - assignment.expectedContainers;
    adjustments.push(
      Object.freeze({
        resourceId: assignment.resourceId,
        expectedCrates: assignment.expectedCrates,
        expectedContainers: assignment.expectedContainers,
        crateDelta,
        containerDelta,
        expectedMaximum: assignment.expectedMaximum,
      }),
    );
    if (plan.debug && (crateDelta !== 0 || containerDelta !== 0)) {
      const base =
        assignment.expectedMaximum -
        (assignment.expectedCrates * plan.crateValue +
          assignment.expectedContainers * plan.containerValue);
      logs.push(
        `[storage] ${assignment.resourceId}: crates ${
          assignment.expectedCrates
        }→${targetCrates} (Δ${crateDelta >= 0 ? "+" : ""}${
          crateDelta
        }), containers ${assignment.expectedContainers}→${
          targetContainers
        } (Δ${containerDelta >= 0 ? "+" : ""}${
          containerDelta
        }) | currentQty=${assignment.currentQuantity.toFixed(
          1,
        )}, base=${base.toFixed(1)}, storageRequired=${assignment.storageRequired.toFixed(
          1,
        )}, driver=${assignment.driver ?? "none"}`,
      );
    }
  }
  return Object.freeze({
    decision: Object.freeze({
      kind: "apply-storage-allocation",
      crateValue: plan.crateValue,
      containerValue: plan.containerValue,
      expectedFreeCrates: plan.expectedFreeCrates,
      expectedFreeContainers: plan.expectedFreeContainers,
      expectedPriorityResourceIds: plan.expectedPriorityResourceIds,
      adjustments: Object.freeze(adjustments),
      logs: Object.freeze(logs),
    }),
    nextState: Object.freeze({
      crates: freezeDebounceMap(crateState),
      containers: freezeDebounceMap(containerState),
    }),
  });
}

export const EMPTY_STORAGE_ALLOCATION_STATE: StorageAllocationState =
  Object.freeze({
    crates: Object.freeze({}),
    containers: Object.freeze({}),
  });
