/**
 * The game page's shell: the DOM the automation mounts its long-lived
 * observers on, and the readiness marker the boot waits for.
 *
 * This is page composition rather than a game capability — the observers feed
 * script-owned callbacks (`tooltipObserver`, `filterLog`) and the readiness
 * probe guards the boot retry loop.
 * The page's own structure (which element id means what) is this port's
 * business, not the boot's.
 */
export interface GamePageShellPort {
  /**
   * Mounts the mutation observers the boot needs for the whole session: the
   * main content (tooltips), the body (modal mounting, routed through the
   * modal port), and the message log (log filtering). The port owns the
   * element lookups and the observer lifetime.
   */
  mountObservers(): void;

  /**
   * Whether the page has finished mounting its last elements. The boot waits
   * on this before touching the game, because the automation's DOM is only
   * safe to sample once the whole shell exists.
   */
  isPageReady(): boolean;
}
