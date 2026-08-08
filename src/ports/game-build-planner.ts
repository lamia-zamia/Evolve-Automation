/**
 * The build planner's live surface: the current game day, tab visibility, the
 * rendered planner panel, and the game's display formatting (times and nice
 * numbers). The panel DOM and all game-side formatting live here so the planner
 * above this port stays a pure function over its inputs and its rendered HTML.
 */
export interface GameBuildPlannerPort {
  /** Whether the browser tab is hidden; hidden tabs skip DOM writes, not sampling. */
  isPageHidden(): boolean;
  /** The current game day, shown in and used by the bottleneck sampling. */
  readDay(): number;
  /** Whether the planner panel's list element is currently rendered in the DOM. */
  plannerListPresent(): boolean;
  /** Writes the rendered build list rows into the planner panel. */
  writePlannerList(html: string): void;
  /** Writes the bottleneck-share summary bar into the planner panel. */
  writePlannerStats(html: string): void;
  /** The game's ETA formatting for a seconds duration. */
  formatPlannerTime(seconds: number): string;
  /** The game's nice-number formatting for a weighting value. */
  formatPlannerNumber(value: number): number;
}
