/**
 * The page's shared surfaces the script's own UI touches: the document's
 * visibility and scroll position, the mech-stats panel inputs the script
 * renders, and the celestial lab's create button.
 *
 * This is page surface rather than a game capability. Callers above this port
 * know what they want ("is the tab visible?", "click the lab's create
 * button"); they do not know which element id a checkbox has or how a button
 * is clicked.
 */

/** The mech-stats panel's toggle row, sampled for one calculation. */
export interface GameMechStatsInput {
  readonly special: boolean;
  readonly gravity: boolean;
  readonly efficient: boolean;
  readonly compact: boolean;
  /** The raw input value; the caller parses and sanitizes it. */
  readonly scouts: string;
}

export interface GameUiSurfacePort {
  /** True while the page is not parked behind the browser's other tabs. */
  isPageVisible(): boolean;
  /** The current scroll offset, whichever element carries it. */
  readScrollTop(): number;
  /** Restore the scroll offset after the script rebuilt DOM the page scrolls around. */
  resetScrollTop(value: number): void;
  /** The player's current mech-stats selections, for one calculation. */
  readMechStatsInputs(): GameMechStatsInput;
  /**
   * How many elements carrying `className` sit inside the element with id
   * `containerId`, or 0 when no such container exists. The UI repair pass asks
   * this once per script-owned panel every tick to notice a redraw that
   * destroyed its nodes, so it is a count rather than a selector: a descendant
   * selector re-parses and re-walks the whole subtree, which measured 6-11x
   * dearer than a class lookup scoped to the container.
   */
  countByClassIn(containerId: string, className: string): number;
  /** True when the celestial lab has rendered its create button. */
  isLabCreateAvailable(): boolean;
  /** Click the celestial lab's create button. No-op when it is absent. */
  clickLabCreate(): void;
}
