/**
 * How much of a saving target's cost must still be held today to keep a promise
 * the planner already made.
 *
 * Reserving a target's whole cost makes the target own the resource outright,
 * which starves every cheaper candidate that shares it for as long as the
 * target keeps being wanted. Measuring interference against the target's
 * *current* bottleneck instead is no better: while one resource sets the
 * completion estimate, spending any other resource is scored as free, so the
 * same slack is handed out again every tick and a resource that is drained
 * repeatedly never gets to become the bottleneck. Both failures come from the
 * planner having no memory of what it previously decided was achievable.
 *
 * So a target that is being saved for carries a deadline. The deadline is set
 * once from the target's estimate, improves when the plan genuinely gets
 * better, and is never pushed back by the planner's own spending. Each resource
 * then has a floor: what must be on hand now for production to still cover the
 * rest by that day. Far from the deadline the floor is zero and the resource is
 * free; it rises only as the promised day approaches.
 */

export interface SavingCost {
  readonly resourceId: string;
  readonly amount: number;
  readonly currentQuantity: number;
  /** Production per game day, already converted from the game's per-second rate. */
  readonly ratePerDay: number;
}

/** A completion day the planner has committed to for one target. */
export interface SavingCommitment {
  readonly name: string;
  readonly deadlineDay: number;
}

export interface SavingScheduleInput {
  readonly name: string;
  readonly costs: readonly SavingCost[];
  readonly currentDay: number;
  /** The commitment carried over from the previous tick, or null. */
  readonly previous: SavingCommitment | null;
}

export interface SavingSchedule {
  readonly commitment: SavingCommitment | null;
  /** Minimum holdings per resource; absent resources are unconstrained. */
  readonly holds: Readonly<Record<string, number>>;
}

const EMPTY: SavingSchedule = Object.freeze({
  commitment: null,
  holds: Object.freeze({}),
});

export function planSavingSchedule(
  input: Readonly<SavingScheduleInput>,
): SavingSchedule {
  let eta = 0;
  let hasDeficit = false;
  for (const cost of input.costs) {
    if (cost.amount <= cost.currentQuantity) continue;
    hasDeficit = true;
    // Nothing produces this right now, so no deadline can be honoured through
    // it. A target that cannot complete must not reserve anything: that is the
    // black hole where a blocked target holds unrelated resources forever.
    if (cost.ratePerDay <= 0) return EMPTY;
    eta = Math.max(eta, (cost.amount - cost.currentQuantity) / cost.ratePerDay);
  }
  if (!hasDeficit) return EMPTY;

  const proposed = input.currentDay + eta;
  const previous = input.previous;
  // The promise is kept while it is still live and still about this target.
  // Once it expires it is re-established honestly rather than held against a
  // day that has already passed, which is also the escape hatch for production
  // genuinely collapsing.
  const carried =
    previous !== null &&
    previous.name === input.name &&
    input.currentDay < previous.deadlineDay;
  const deadlineDay = carried
    ? Math.min(previous.deadlineDay, proposed)
    : proposed;

  const daysLeft = Math.max(0, deadlineDay - input.currentDay);
  const holds: Record<string, number> = {};
  for (const cost of input.costs) {
    if (cost.ratePerDay <= 0) continue;
    // Never hold more than the target actually needs.
    const hold = Math.min(
      cost.amount,
      cost.amount - cost.ratePerDay * daysLeft,
    );
    if (hold > 0) holds[cost.resourceId] = hold;
  }
  return Object.freeze({
    commitment: Object.freeze({ name: input.name, deadlineDay }),
    holds: Object.freeze(holds),
  });
}
