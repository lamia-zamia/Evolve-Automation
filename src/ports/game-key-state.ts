/** The page's observed keyboard state, kept by an adapter at document start. */

/**
 * The three mappings `vars.js:keyMultiplier` reads. `q` is a queue key and never multiplies, so it
 * has no latch. Named here so the browser adapter that folds the event stream and the evolve adapter
 * that reads the settings cannot drift apart.
 */
export type GameMultiplierLatchName = "x10" | "x25" | "x100";

export const GAME_MULTIPLIER_LATCH_NAMES: readonly GameMultiplierLatchName[] =
  Object.freeze(["x10", "x25", "x100"]);

/**
 * Physical key state: which keys the page has observed as down.
 *
 * This answers "is the key down now", which is what restoring a modifier or reading a queue key
 * needs. It is *not* what the game's own multiplier latch reports — see `GameMultiplierLatchReader`.
 */
export interface GameKeyStateReader {
  /** Whether the page has observed the named key as pressed, or `undefined` when unavailable. */
  readPressed(key: string | number): boolean | undefined;
}

/**
 * The game's private multiplier latch, as the next native call will see it.
 *
 * Pinned `vars.js:keyMultiplier` reads module-private booleans that `main.js` rewrites from keydown,
 * keyup, and mousemove using the mappings configured at each event. A latch is cleared only by the
 * keyup of whatever is mapped *then*, so a mapping changed while its key is still down leaves it set
 * for the rest of the session with nothing physically held. Deriving this from `readPressed` answers
 * a different question, and answering it wrong commits ten routes where one was planned.
 */
export interface GameMultiplierLatchReader {
  /**
   * `true` latched, `false` known clear, `undefined` when the page has not delivered enough
   * evidence to say. Only a caller about to mutate through a native multiplier closure needs this,
   * and for that caller `undefined` is not a licence to proceed.
   */
  readMultiplierLatch(name: GameMultiplierLatchName): boolean | undefined;
}

/**
 * The one document-start keyboard capture, answering both questions from a single event stream.
 * A caller needs the physical answer, the latched answer, or — as the page capture hands it out —
 * both; nothing else in the script may observe either directly.
 */
export interface GameKeyboardState
  extends GameKeyStateReader, GameMultiplierLatchReader {}
