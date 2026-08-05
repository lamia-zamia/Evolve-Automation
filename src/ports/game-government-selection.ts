/**
 * The game's own government selection.
 *
 * Changing government is a revolution the game only offers inside the modal
 * its government panel opens. Callers above this port decide the revolution is
 * wanted and get the modal open; which control inside it commits the choice is
 * this port's business.
 */
export interface GameGovernmentSelectionPort {
  /**
   * Commits a government choice in the open modal. False means the modal was
   * not offering the choice, so no revolution happened.
   */
  selectGovernment(government: string): boolean;
}
