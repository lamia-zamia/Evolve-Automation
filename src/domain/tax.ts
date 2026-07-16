import type {
  AdjustTaxRateCommand,
  TaxAdjustmentOperation,
} from "./commands.ts";
import type { GameSnapshot, SnapshotMetadata } from "./snapshot.ts";

export type TaxUnavailableReason =
  "morale-already-adjusted" | "controls-unavailable" | "taxes-hidden";

export interface UnavailableTaxSnapshot extends GameSnapshot {
  readonly status: "unavailable";
  readonly reason: TaxUnavailableReason;
}

export interface ReadyTaxSnapshot extends GameSnapshot {
  readonly status: "ready";
  readonly tax: Readonly<{
    currentRate: number;
    minimumRate: number;
    maximumRate: number;
  }>;
  readonly morale: Readonly<{
    current: number;
    projected: number;
    maximum: number;
  }>;
  readonly money: Readonly<{
    storageRatio: number;
    demanded: boolean;
  }>;
  readonly authority: Readonly<{
    current: number;
    maximum: number;
    unlocked: boolean;
  }>;
  readonly banana: boolean;
}

export type TaxSnapshot = UnavailableTaxSnapshot | ReadyTaxSnapshot;

export interface TaxSettings {
  readonly requestedRate: number;
  readonly minimumRate: number;
  readonly minimumMorale: number;
  readonly maximumMorale: number;
  readonly manageAuthority: boolean;
  readonly authorityTarget: number;
}

export function unavailableTaxSnapshot(
  metadata: SnapshotMetadata,
  reason: TaxUnavailableReason,
): UnavailableTaxSnapshot {
  return Object.freeze({ metadata, status: "unavailable", reason });
}

function operation(
  direction: TaxAdjustmentOperation["direction"],
  count: number,
): TaxAdjustmentOperation {
  return Object.freeze({ direction, count });
}

function forcedOperations(currentRate: number, targetRate: number) {
  const operations: TaxAdjustmentOperation[] = [];
  const decreaseCount =
    currentRate > targetRate ? Math.ceil(currentRate - targetRate) : 0;
  const rateAfterDecrease = currentRate - decreaseCount;
  const increaseCount =
    rateAfterDecrease < targetRate
      ? Math.ceil(targetRate - rateAfterDecrease)
      : 0;
  if (decreaseCount > 0) {
    operations.push(operation("decrease", decreaseCount));
  }
  if (increaseCount > 0) {
    operations.push(operation("increase", increaseCount));
  }
  return operations;
}

export function planTax(
  snapshot: Readonly<TaxSnapshot>,
  settings: Readonly<TaxSettings>,
): readonly AdjustTaxRateCommand[] {
  if (snapshot.status === "unavailable") return [];

  const { currentRate, maximumRate } = snapshot.tax;
  let minimumRate = snapshot.tax.minimumRate;
  if (settings.requestedRate !== -1) {
    const targetRate = Math.min(
      Math.max(settings.requestedRate, minimumRate),
      maximumRate,
    );
    return Object.freeze([
      Object.freeze({
        kind: "adjust-tax-rate",
        expectedRate: currentRate,
        batches: Object.freeze([
          Object.freeze({
            operations: Object.freeze(
              forcedOperations(currentRate, targetRate),
            ),
          }),
        ]),
      }),
    ]);
  }

  if (snapshot.money.storageRatio < 0.9 && !snapshot.banana) {
    minimumRate = Math.max(minimumRate, settings.minimumRate);
  }
  const optimalRate = snapshot.banana
    ? minimumRate
    : snapshot.money.demanded
      ? maximumRate
      : Math.round(
          (maximumRate - minimumRate) *
            Math.max(0, 0.9 - snapshot.money.storageRatio),
        ) + minimumRate;

  let maximumMorale = snapshot.morale.maximum;
  if (!snapshot.banana) {
    if (currentRate < 20) {
      maximumMorale -= 10 - Math.floor(currentRate / 2);
    }
    if (optimalRate < 20) {
      maximumMorale += 10 - Math.floor(minimumRate / 2);
    }
  }
  if (snapshot.money.storageRatio < 0.9) {
    maximumMorale = Math.min(maximumMorale, settings.maximumMorale);
  }

  let minimumMorale = settings.minimumMorale;
  if (
    settings.manageAuthority &&
    settings.authorityTarget !== 0 &&
    snapshot.authority.unlocked &&
    snapshot.authority.current <
      (settings.authorityTarget < 0
        ? snapshot.authority.maximum
        : settings.authorityTarget)
  ) {
    minimumMorale = Math.min(minimumMorale, 100);
    maximumMorale = Math.min(maximumMorale, 100);
  }

  const batches: { readonly operations: readonly TaxAdjustmentOperation[] }[] =
    [];
  if (
    currentRate < maximumRate &&
    snapshot.morale.current >= minimumMorale + 1 &&
    (currentRate < optimalRate ||
      snapshot.morale.current >= maximumMorale + 1 ||
      (snapshot.morale.projected >= snapshot.morale.current + 1 &&
        optimalRate >= 20))
  ) {
    batches.push(
      Object.freeze({
        operations: Object.freeze([operation("increase", 1)]),
      }),
    );
  }
  if (
    currentRate > minimumRate &&
    snapshot.morale.current < maximumMorale &&
    (currentRate > optimalRate || snapshot.morale.current < minimumMorale)
  ) {
    batches.push(
      Object.freeze({
        operations: Object.freeze([operation("decrease", 1)]),
      }),
    );
  }
  if (batches.length === 0) return [];
  return Object.freeze([
    Object.freeze({
      kind: "adjust-tax-rate",
      expectedRate: currentRate,
      batches: Object.freeze(batches),
    }),
  ]);
}
