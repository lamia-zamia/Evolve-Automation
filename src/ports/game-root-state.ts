/**
 * The one live game-state binding, as captured from the page rather than cloned out of it.
 *
 * `readRoot` hands back the game's own reactive object as `unknown`. Feature adapters validate it
 * into domain values; nothing outside an adapter may touch the returned value.
 */
export interface GameRootStateSource {
  /** The captured root, or `undefined` before the game has created it. */
  readRoot(): unknown;
  /**
   * True while the game has dropped its reactive wrapper for a bulk simulation (offline
   * catch-up). Reads stay correct — the captured proxy wraps the same object — but the game loop
   * is not running live periods.
   */
  isReactivitySuppressed(): boolean;
  /**
   * Fires whenever the game re-wraps its state (`setGlobal`, `restoreReactivity`). The root may
   * be the same object as before: the reactive wrapper is cached by raw target, so a replacement
   * is an event, not necessarily a new reference.
   */
  subscribeRootReplaced(listener: () => void): () => void;
}
