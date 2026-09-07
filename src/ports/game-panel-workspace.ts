/**
 * Somewhere for the game to draw that is not the page the player is looking at.
 *
 * A discovery draw goes through the game's own `loadTab`, which tears down every panel it is not
 * drawing and then rebuilds the player's one on the way back. Both halves are pure waste to an
 * automation read, and on a late save they are most of its cost. Neither is necessary: the game
 * finds its panels with `document.querySelectorAll`, so a panel that is not in the document is a
 * panel it cannot clear, and its own teardown helpers are all `if (element)` guards that become
 * no-ops for the same reason.
 *
 * So a workspace does two things for the length of one synchronous draw, and undoes both:
 *
 * - **keeps** the player's panel by detaching it, which preserves the exact nodes, Vue instances,
 *   drag handlers and listeners it already had — nothing is destroyed, so nothing is rebuilt;
 * - **scratches** the target panel by standing an empty container of the same id in its place, so
 *   everything the draw produces is discarded by removing one node instead of being walked.
 *
 * Nothing here paints: the whole draw is one task, and the document is back before the browser or
 * Vue can observe it. A workspace that could not be opened is not opened halfway.
 */

export interface PanelWorkspace {
  /**
   * Drops a container the draw fills that the caller never reads. Refuses anything that is not
   * inside the scratch panel, so it can only ever discard the draw's own output.
   */
  discard(elementId: string): boolean;
  /** Puts the document back exactly as it was. Idempotent. */
  release(): void;
  /** False once the document is no longer in the shape the workspace left it in. */
  isIntact(): boolean;
}

export interface PanelWorkspaceRequest {
  /** The player's own panel, detached so the draw cannot destroy it. */
  readonly keep?: string | undefined;
  /** The panel the draw fills, replaced by a disposable container of the same id. */
  readonly scratch: string;
}

export interface GamePanelWorkspace {
  /**
   * Opens a workspace, or answers `undefined` when it cannot be opened whole — a panel that is not
   * in the document, or a request to keep and scratch the same one. The caller then draws the
   * ordinary way rather than a half-protected way.
   */
  open(request: Readonly<PanelWorkspaceRequest>): PanelWorkspace | undefined;
}
