/**
 * The game's own foreign-affairs panel.
 *
 * The foreign panel carries the whole foreign slice's availability and spy
 * commands: whether the panel is unlocked at all gates espionage, battle, and
 * spy planning; whether a government currently disables a new spy feeds the
 * training planner; and training a spy is one command per government. Callers
 * above this port decide when to act; how the panel reports and commits each
 * command is this port's business.
 */
export interface GameForeignControlsPort {
  /**
   * Whether the game currently unlocks the foreign panel. The foreign slice
   * only runs while this is true.
   */
  isUnlocked(): boolean;

  /**
   * Whether the game currently disables spy training against a government.
   * False when the panel cannot answer, which keeps the panel's lenient
   * uninitialized state.
   */
  isSpyDisabled(governmentId: number): boolean;

  /**
   * Trains a spy against a government. False means the panel was not
   * actionable, so no spy was trained.
   */
  trainSpy(governmentId: number): boolean;
}
