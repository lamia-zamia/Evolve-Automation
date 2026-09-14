/**
 * What the construction cycle observed while it ran, published for the features that need it.
 *
 * These are observations, not decisions. Everything here is a by-product of work the cycle already
 * does — the affordability it samples and the candidate list it sorts — so reading it costs nothing
 * and describes the cycle that produced it.
 */

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
  /** The supply pool the candidate draws from, when the game names one. */
  readonly pool?: string;
  readonly cost: Readonly<Record<string, number>>;
}

export interface ConstructionObservations {
  /**
   * The current saving target, or null when everything wanted is affordable. It is the last
   * finished cycle's judgement, because affordability is sampled as that cycle runs.
   */
  readSavingTarget(): SavingTarget | null;
  /**
   * The Knowledge the highest-weighted candidate that does not itself raise the Knowledge cap
   * needs, or 0. The Knowledge gate compares it against capacity: a target the player cannot even
   * store the Knowledge for is a capacity problem, not an affordability one. Known from the
   * candidate list alone, so it describes the current cycle.
   */
  readKnowledgeRequirement(): number;
}
