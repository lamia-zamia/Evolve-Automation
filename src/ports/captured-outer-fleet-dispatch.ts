/**
 * The game's own shipyard dispatch, reached without a dispatch window.
 *
 * Upstream offers no direct call for sending a built ship somewhere, and no yard method either:
 * `drawShipYard()` binds `#shipPlans` with the design methods, and `drawShips()` binds each
 * `#shipReg${i}` separately with the row's own — `pickDest(id)`, whose closure is the only route to
 * `sendShipTo(id, region)`, and `show(id)`, which is `shipMoving(ships[id])`. So the caller arrives
 * through a ship row: the capture runs the yard's own `redraw()` (upstream's `drawShips()`) against
 * scratch DOM first, because a ship built while the player was elsewhere has no row bound at all —
 * upstream's `buildTPShip()` calls `drawShips()`, and that draw returns at its own tab gate — and
 * then the dispatch draw it binds is taken without anything on screen.
 *
 * `sendShipTo` is the authoritative mutation: hull, crew, trip and fuel viability, fleets, routes,
 * patrols and travel initialization all live in it. Nothing captured is kept: the destination closure
 * is bound by the draw that ran for this ship and this region, invoked inside that call, and gone
 * when the call returns. A capture that fails — no shipyard control, no row, no modal host, a draw
 * that offered nothing, a throw — reports which of those it was, and never falls back to an earlier
 * one.
 */

/** One ship, and the region it is being sent to. */
export interface CapturedOuterFleetDispatchRequest {
  /** The ship's position in the shipyard's own list, as the game numbers it. */
  readonly index: number;
  /** The region, as the game names it. The game's own destination row must carry this. */
  readonly region: string;
}

/**
 * What one attempt did.
 *
 * `launched` is the only success, and it is the game's own answer rather than an inference: the ship
 * row holding this ship reports it under way after the closure ran. Everything else is a refusal or a
 * failure, and each is reported as itself so a caller can tell "the game said no" from "we never
 * reached the game".
 */
export type CapturedOuterFleetDispatch =
  /** The game's own destination closure ran and the shipyard now reports the ship under way. */
  | { readonly kind: "launched" }
  /**
   * The draw built no destination row for that region: unreachable, or the whole group held back by
   * hull, crew or reachability. Nothing was invoked — the game offered nothing to invoke.
   */
  | { readonly kind: "no-destination" }
  /**
   * The game's own destination closure ran and did not put the ship under way. The row may have been
   * disabled for fuel and `sendShipTo` re-checks everything anyway, so the refusal is the game's, not
   * a local replica's; the same answer covers a yard whose own row for the ship cannot be read back.
   */
  | { readonly kind: "refused" }
  /**
   * The closure could not be reached: no shipyard control, no ship row to dispatch through, no modal
   * host to draw into, a suppressed capture, or a draw that threw. Nothing was invoked.
   */
  | { readonly kind: "unreachable" };

export interface CapturedOuterFleetDispatchCapture {
  /**
   * True while a real `.modal.is-active` is on screen. The game's dispatch draw and its destination
   * closures both reach outside the window they were given — the close button it appends clicks a
   * global `.modal .modal-close`, and the draw redraws the yard — so a dispatch must not run beside
   * a window the player owns. A caller stands down instead; nothing here ever opens or closes one.
   */
  blockedByPlayerModal(): boolean;
  dispatchShipyardShip(
    request: Readonly<CapturedOuterFleetDispatchRequest>,
  ): CapturedOuterFleetDispatch;
}
