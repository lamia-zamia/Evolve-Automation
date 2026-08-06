/**
 * The game's own keyboard bindings.
 *
 * The game applies modifier keys (Shift, Control, Alt, Meta) exactly as a
 * keyboard would when the script re-issues its own key events. This port
 * exposes the game's registered keydown/keyup/mousemove handlers so the
 * automation can replay synthetic key events with the same effect the
 * physical keys would have had. Which handlers exist, and whether a synthetic
 * event must be cloned into the page first, is the browser adapter's business.
 */
export interface GameKeyboardHandlers {
  /**
   * Replays the game's keydown binding for a synthetic key event, or null
   * when the game has no keydown binding to replay.
   */
  readonly keyDown: ((event: unknown) => void) | null;

  /**
   * Replays the game's keyup binding for a synthetic key event, or null
   * when the game has no keyup binding to replay.
   */
  readonly keyUp: ((event: unknown) => void) | null;

  /**
   * Replays the game's combined binding (`mousemove`) that reacts to a
   * modifier chord, or null when the game binds each modifier key alone.
   */
  readonly moveAll: ((event: unknown) => void) | null;
}

export interface GameKeyboardHandlersPort {
  /**
   * Resolves the game's current keyboard bindings. The game registers its
   * handlers with the page, so the bindings can change between boots (for
   * example, when the script restores the page's own jQuery copy); callers
   * re-resolve rather than caching the result.
   */
  readGameKeyboardHandlers(): GameKeyboardHandlers;

  /**
   * Whether the page's jQuery currently carries the game's keydown binding.
   * The page-shell uses this to decide whether the script's own jQuery copy
   * has replaced the game's and must be released.
   */
  hasKeydownBinding(): boolean;
}
