/**
 * The game's own research entries.
 *
 * Automation asks a research entry three things: is the game offering it right
 * now, has it already been completed, and start it. Callers above this port
 * name the entry by the element id the game gives it; which child nodes and
 * which component method answer each question is this port's business.
 */
export interface GameResearchControlsPort {
  /** True when the entry is mounted and the game is offering its buy control. */
  isOffered(elementId: string): boolean;

  /** True when the entry has already been researched. */
  isCompleted(elementId: string): boolean;

  /**
   * Starts the research. False means the entry was no longer actionable, so a
   * caller must not record the purchase it was about to make.
   */
  start(elementId: string): boolean;
}
