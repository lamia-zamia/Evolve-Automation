import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameKeyboardState } from "../../../../ports/game-key-state.ts";
import { isRecord } from "../../../validation.ts";
import { readCapturedMultiplierLatch } from "../../captured-multiplier-keys.ts";
import type {
  MarketBoard,
  MarketBoardSource,
} from "./captured-market-board.ts";

interface CapturedRouteMultiplierInput {
  readonly root: unknown;
  readonly boards: MarketBoardSource;
  readonly board: MarketBoard;
  readonly controls: GameControlRegistry;
  readonly keyState: GameKeyboardState | undefined;
}

/**
 * Whether a native regional `more()` / `less()` can only move one route right now.
 *
 * Pinned `resources.js:marketRouteMultiplier` answers the module-private `mobileRouteMultiplier`
 * below 768px and `vars.js:keyMultiplier()` above it, and the regional row methods hand that value
 * straight to `bmAdjust`, so one planned step silently commits ten routes while a ×10 key is held.
 * A postcondition cannot undo it: the mutation is already in the ledger when it is noticed. The game
 * exposes no reading of the value its next call will use, so neutrality is proven from the two
 * authorities the page already owns instead of restating the `10 * 25 * 100` product.
 *
 * The mobile picker must be the handle this board recorded, at its exact generation, reading one.
 * That is conservative on desktop too, where upstream prefers the keyboard answer — and still
 * necessary, because only the board knows which build of the picker the current draw left behind.
 *
 * The keyboard half then covers desktop, and it asks the game-equivalent question rather than a
 * physical one: not "is the mapped key down" but "is the game's own multiplier latch set". Upstream
 * latches on keydown and clears on the keyup of whatever is mapped *then*, so a mapping changed while
 * its key is still down leaves `keyMultiplier()` multiplying by ten with nothing held at all — a
 * pressed-key reconstruction cannot see that, and acting on it commits ten routes. The latch answer
 * is also unknown until the capture has seen enough of the page to know it, and unknown fails closed
 * here rather than collapsing to "not held". Anything missing, malformed, or unanswerable fails.
 */
export function isCapturedRouteMultiplierNeutral(
  input: CapturedRouteMultiplierInput,
): boolean {
  if (!input.boards.isCurrent(input.board)) return false;
  const picker = input.board.routeMultiplier;
  if (picker === undefined) return false;
  if (
    input.controls.resolve(picker.elementId)?.generation !== picker.generation
  )
    return false;
  const mobile = picker.data;
  if (!isRecord(mobile) || mobile["multiplier"] !== 1) return false;
  return (
    readCapturedMultiplierLatch(input.root, input.keyState) === "none-latched"
  );
}
