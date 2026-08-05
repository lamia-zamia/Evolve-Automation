/**
 * The game's own trait purchases.
 *
 * Automation spends Genes to raise a minor trait a level, and Plasmids to
 * mutate a major trait in or out. Callers above this port name the trait and
 * decide it is affordable; which panel offers those commands, and whether the
 * game has that panel mounted at all, is this port's business.
 */
export interface GameTraitControlsPort {
  /**
   * Buys the next level of a minor trait. False means the game was not
   * offering the purchase, so a caller must not record the Genes it was about
   * to spend.
   */
  buyMinorTrait(traitName: string): boolean;

  /** Mutates a major trait in. False means nothing was spent. */
  gainTrait(traitName: string): boolean;

  /** Mutates a major trait out. False means nothing was spent. */
  purgeTrait(traitName: string): boolean;
}
