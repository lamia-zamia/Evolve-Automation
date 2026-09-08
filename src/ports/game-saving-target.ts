/**
 * The target the construction cycle is accumulating for.
 *
 * A queued item is an explicit commitment the player made; this is the implicit one the automation
 * made for itself — the highest-weighted candidate it wants, could eventually store, and cannot yet
 * afford. Without it an ordinary weighted target, however expensive, never tells crafting, the
 * production splits, the market or storage that anything is saving, and cheaper candidates spend
 * its costs as they arrive.
 *
 * It is an observation of the cycle that produced it, not a decision: the cycle that reports it has
 * already finished, so a reader is looking at the most recent completed judgement.
 */
export interface SavingTarget {
  /** The candidate's own key, as the family that offered it names it. */
  readonly name: string;
  readonly cost: Readonly<Record<string, number>>;
}

export interface SavingTargetSource {
  /** The current saving target, or null when everything wanted is affordable. */
  readSavingTarget(): SavingTarget | null;
}
