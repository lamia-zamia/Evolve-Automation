export interface SharedSpendingObservation {
  readonly id: string;
  readonly quantity: number;
}

export type SharedCommitmentEvidence =
  | Readonly<{ kind: "known"; quantity: number }>
  | Readonly<{ kind: "unknown"; reason: string }>;

export interface SharedResourceBudgetInput {
  readonly resourceId: string;
  readonly poolId: string;
  readonly stock: Readonly<SharedSpendingObservation>;
  readonly commitments: Readonly<SharedCommitmentEvidence>;
  readonly admittedGoalClaims: number;
  readonly permittedDiscretionarySpending: number;
  readonly observedNativeExpenditure: number;
}

export interface SharedResourceBudget {
  readonly resourceId: string;
  readonly poolId: string;
  readonly status: "current" | "unavailable" | "invalidated";
  readonly stockObservation: Readonly<SharedSpendingObservation> | undefined;
  readonly observedStock: number | undefined;
  readonly existingCommitments: number | undefined;
  readonly admittedGoalClaims: number;
  readonly permittedDiscretionarySpending: number;
  readonly observedNativeExpenditure: number;
  readonly reservedDiscretionarySpending: number;
  readonly pendingReservations: readonly Readonly<SharedSpendReservation>[];
  readonly budgetRemaining: number;
  readonly unavailableReason: string | undefined;
}

export interface SharedSpendReservation {
  readonly id: string;
  readonly quantity: number;
  readonly stockObservationId: string;
}

export interface SharedSpendReconciliation {
  readonly outcome: "succeeded" | "failed" | "uncertain";
  readonly observedStockAfter: Readonly<SharedSpendingObservation>;
}

function validBudgetAmount(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

/** Plans one resource/pool budget; unknown commitments never become zero. */
export function planSharedResourceBudget(
  input: Readonly<SharedResourceBudgetInput>,
): Readonly<SharedResourceBudget> {
  const base = {
    resourceId: input.resourceId,
    poolId: input.poolId,
    stockObservation: input.stock,
    observedStock: input.stock.quantity,
    existingCommitments:
      input.commitments.kind === "known"
        ? input.commitments.quantity
        : undefined,
    admittedGoalClaims: input.admittedGoalClaims,
    permittedDiscretionarySpending: input.permittedDiscretionarySpending,
    observedNativeExpenditure: input.observedNativeExpenditure,
    reservedDiscretionarySpending: 0,
    pendingReservations: Object.freeze([]),
  };
  const invalid =
    input.resourceId === "" ||
    input.poolId === "" ||
    input.stock.id === "" ||
    !validBudgetAmount(input.stock.quantity) ||
    !validBudgetAmount(input.admittedGoalClaims) ||
    !validBudgetAmount(input.permittedDiscretionarySpending) ||
    !validBudgetAmount(input.observedNativeExpenditure) ||
    (input.commitments.kind === "known" &&
      !validBudgetAmount(input.commitments.quantity));
  if (invalid || input.commitments.kind === "unknown") {
    return Object.freeze({
      ...base,
      status: "unavailable",
      budgetRemaining: 0,
      unavailableReason:
        invalid || input.commitments.kind === "known"
          ? "resource budget evidence is invalid"
          : input.commitments.reason,
    });
  }
  return Object.freeze({
    ...base,
    status: "current",
    budgetRemaining: Math.min(
      input.permittedDiscretionarySpending,
      Math.max(
        0,
        input.stock.quantity -
          input.commitments.quantity -
          input.admittedGoalClaims,
      ),
    ),
    unavailableReason: undefined,
  });
}

/** Reserves a single synchronous spend against the current per-resource budget. */
export function reserveSharedResourceSpend(
  budget: Readonly<SharedResourceBudget>,
  reservation: Readonly<SharedSpendReservation>,
  stockAtInvocation: Readonly<SharedSpendingObservation>,
): Readonly<SharedResourceBudget> {
  if (
    budget.status !== "current" ||
    budget.stockObservation?.id !== reservation.stockObservationId ||
    stockAtInvocation.id !== reservation.stockObservationId ||
    stockAtInvocation.quantity !== budget.observedStock ||
    reservation.id === "" ||
    budget.pendingReservations.some(
      (pending) => pending.id === reservation.id,
    ) ||
    !validBudgetAmount(reservation.quantity) ||
    reservation.quantity > budget.budgetRemaining
  ) {
    return Object.freeze({
      ...budget,
      status: "invalidated",
      budgetRemaining: 0,
      unavailableReason: "spend reservation lacks a current sufficient budget",
    });
  }
  return Object.freeze({
    ...budget,
    reservedDiscretionarySpending:
      budget.reservedDiscretionarySpending + reservation.quantity,
    pendingReservations: Object.freeze([
      ...budget.pendingReservations,
      Object.freeze({ ...reservation }),
    ]),
    budgetRemaining: budget.budgetRemaining - reservation.quantity,
  });
}

/** Reconciles a native owner's observed debit; any uncertain result stands down. */
export function reconcileSharedResourceSpend(
  budget: Readonly<SharedResourceBudget>,
  reservation: Readonly<SharedSpendReservation>,
  reconciliation: Readonly<SharedSpendReconciliation>,
): Readonly<SharedResourceBudget> {
  const before = budget.observedStock;
  const after = reconciliation.observedStockAfter.quantity;
  const spent = before === undefined ? Number.NaN : before - after;
  const knownReservation = budget.pendingReservations.some(
    (pending) =>
      pending.id === reservation.id &&
      pending.quantity === reservation.quantity &&
      pending.stockObservationId === reservation.stockObservationId,
  );
  const expectedObservation =
    budget.stockObservation?.id === reservation.stockObservationId;
  const validDelta =
    Number.isFinite(spent) &&
    spent >= 0 &&
    spent <= reservation.quantity &&
    reconciliation.observedStockAfter.id !== "" &&
    reconciliation.observedStockAfter.id !== reservation.stockObservationId &&
    validBudgetAmount(after);
  if (
    budget.status !== "current" ||
    !knownReservation ||
    !expectedObservation ||
    !validDelta ||
    reconciliation.outcome !== "succeeded"
  ) {
    return Object.freeze({
      ...budget,
      status: "invalidated",
      stockObservation: undefined,
      observedStock: undefined,
      budgetRemaining: 0,
      unavailableReason:
        "native spend outcome or stock delta requires a fresh observation",
    });
  }
  const remainingAllowance = Math.max(
    0,
    budget.permittedDiscretionarySpending - spent,
  );
  const availableAfter = Math.max(
    0,
    after - (budget.existingCommitments ?? 0) - budget.admittedGoalClaims,
  );
  return Object.freeze({
    ...budget,
    stockObservation: reconciliation.observedStockAfter,
    observedStock: after,
    permittedDiscretionarySpending: remainingAllowance,
    observedNativeExpenditure: budget.observedNativeExpenditure + spent,
    reservedDiscretionarySpending:
      budget.reservedDiscretionarySpending - reservation.quantity,
    pendingReservations: Object.freeze(
      budget.pendingReservations.filter(
        (pending) => pending.id !== reservation.id,
      ),
    ),
    budgetRemaining: Math.min(remainingAllowance, availableAfter),
    unavailableReason: undefined,
  });
}
