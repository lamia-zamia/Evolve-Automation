/**
 * The game page's shell: the DOM the automation mounts its long-lived
 * observers on, the readiness marker the boot waits for, and the script-tag
 * injection for a page that arrives without jQuery UI.
 *
 * This is page composition rather than a game capability — the observers feed
 * script-owned callbacks (`tooltipObserver`, `filterLog`), the readiness probe
 * guards the boot retry loop, and jQuery UI injection is a bootstrap detail.
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

  /**
   * Whether the page lacks a usable jQuery UI. A script injected without a
   * *monkey that normally supplies one must load it itself.
   */
  needsJQueryUi(): boolean;

  /**
   * Injects the jQuery UI script tag and defers to `onLoaded` when it loads
   * or `onFailed` when the injection errors. No-op when the page already has
   * jQuery UI.
   */
  loadJQueryUi(handlers: {
    readonly onLoaded: () => void;
    readonly onFailed: () => void;
  }): void;
}
