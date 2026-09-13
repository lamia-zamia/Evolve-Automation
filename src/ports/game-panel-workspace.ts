/**
 * Somewhere for the game to draw that is not the panel the player is looking at.
 *
 * A discovery draw goes through the game's own `loadTab`, which tears down every panel it is not
 * drawing and then rebuilds the player's one on the way back. Both halves are pure waste to an
 * automation read, and on a late save they are most of its cost. Neither is necessary: the game
 * finds its panels with `document.getElementById`, so a panel that does not answer to the id the
 * draw looks for is a panel it can neither clear nor fill, and its own teardown helpers are all
 * `if (element)` guards that become no-ops for the same reason.
 *
 * So a workspace does two things for the length of one synchronous draw, and undoes both:
 *
 * - **keeps** the player's panel by aliasing the ids in it, which leaves every node where it was —
 *   same Vue instances, same drag handlers, same listeners, same hover state — while making it
 *   invisible to the draw. Detaching it instead would cost the browser's hover state and the open
 *   tooltip, which is what the player sees as flickering;
 * - **scratches** the target panel by standing a container of the same id beside it, so everything
 *   the draw produces is discarded by removing one node instead of being walked.
 *
 * Nothing here paints: the whole draw is one task, the scratch is off-screen and hidden, and every
 * name is back before the browser or Vue can observe it. A workspace that could not be opened is
 * not opened halfway.
 */

export interface PanelWorkspace {
  /**
   * Drops a container the draw fills that the caller never reads. Refuses anything that is not
   * inside the scratch panel, so it can only ever discard the draw's own output.
   */
  discard(elementId: string): boolean;
  /** Puts every name and the document back exactly as they were. Idempotent. */
  release(): void;
  /** False once the document is no longer in the shape the workspace left it in. */
  isIntact(): boolean;
}

export interface PanelWorkspaceRequest {
  /**
   * The player's own panel, hidden from the game's lookups so the draw cannot clear it. It may name
   * the same panel as `scratch`: a path into the player's own main tab both draws it and has to
   * leave it standing, and hiding it by name answers both.
   */
  readonly keep?: string | undefined;
  /** The panel the draw fills, answered by a disposable container of the same id. */
  readonly scratch: string;
}

export interface GamePanelWorkspace {
  /**
   * Opens a workspace, or answers `undefined` when it cannot be opened whole — a panel that is not
   * in the document. The caller then draws the ordinary way rather than a half-protected way.
   */
  open(request: Readonly<PanelWorkspaceRequest>): PanelWorkspace | undefined;
}
