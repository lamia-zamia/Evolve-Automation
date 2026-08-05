/**
 * The game's own covert operations.
 *
 * Espionage is offered only inside the modal a foreign power's spy panel
 * opens. Callers above this port pick the operation, decide it is worth
 * running, and get the modal open; which control inside it commits the
 * operation is this port's business.
 */
export interface GameEspionageControlsPort {
  /**
   * Runs a covert operation against a foreign power in the open modal. False
   * means the modal was not offering that operation, so nothing was spent.
   */
  performEspionage(operation: string, govIndex: number): boolean;
}
