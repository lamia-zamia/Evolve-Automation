/**
 * A one-shot invocation of a game-captured method against a synthetic receiver.
 *
 * Some game methods exist only to open something. DeadSpace's `foreign.trigModal(gov)` is the sole
 * route to the module-private `drawEspModal(gov)`, whose `vBind` methods are the game's own
 * espionage operations; the methods themselves read services off `this`, so calling one against the
 * registry's plain receiver bag fails on a missing `$buefy`. Reaching them without drawing the
 * thing they would draw means supplying a receiver whose services do nothing.
 *
 * This is deliberately narrower than "call any method with any `this`":
 *
 * - the additions are named as dotted paths of no-op callables, not as values, so nothing can be
 *   passed in through here — not a function, not a captured object, not a live game reference;
 * - the additions are layered over a fresh receiver bag for that one call, so the control's own
 *   receiver and the captured registry are never mutated;
 * - nothing here returns the raw method, so the game's closures stay inside the capture layer;
 * - `GameControlRegistry.invoke()` is unchanged, and this is the only way to supply the extras.
 */
import type { GameControlResult } from "./game-control-registry.ts";

export interface GameControlSyntheticReceiver {
  /** Dotted `this` paths that must answer a no-op callable, e.g. `$buefy.modal.open`. */
  readonly noOpMethods: readonly string[];
}

export interface GameControlSynthesisRequest {
  readonly elementId: string;
  readonly method: string;
  readonly args?: readonly unknown[];
  readonly receiver?: GameControlSyntheticReceiver | undefined;
}

export interface GameControlSynthesis {
  /** False once the capture is uninstalled; a caller must fail rather than fall back. */
  readonly available: boolean;
  /**
   * Runs one captured method once, against the current build of the control. A missing or
   * superseded control, an unknown method, and a throw are reported exactly as
   * `GameControlRegistry.invoke` reports them.
   */
  invoke(request: Readonly<GameControlSynthesisRequest>): GameControlResult;
}
