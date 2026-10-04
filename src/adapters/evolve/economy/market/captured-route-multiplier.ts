import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameKeyStateReader } from "../../../../ports/game-key-state.ts";
import { isRecord } from "../../../validation.ts";
import { readCapturedMultiplierKeys } from "../../captured-multiplier-keys.ts";
import type {
  MarketBoard,
  MarketBoardSource,
} from "./captured-market-board.ts";

interface CapturedRouteMultiplierInput {
  readonly root: unknown;
  readonly boards: MarketBoardSource;
  readonly board: MarketBoard;
  readonly controls: GameControlRegistry;
  readonly keyState: GameKeyStateReader | undefined;
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
 * The keyboard half then covers desktop: with no multiplier mapping held, upstream `keyMultiplier`
 * answers one whichever branch runs. Anything missing, malformed, or unanswerable fails closed.
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
  return readCapturedMultiplierKeys(input.root, input.keyState) === "none-held";
}
