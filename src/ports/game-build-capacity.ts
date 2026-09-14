/** The game's semantic answer to whether one more copy of an action may be built. */
export interface GameBuildCapacity {
  /** Returns the private action definition's queue-capacity answer, or `undefined` if unavailable. */
  canBuildAnother(actionId: string): boolean | undefined;
}
