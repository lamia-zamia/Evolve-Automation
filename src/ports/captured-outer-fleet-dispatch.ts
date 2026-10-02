/**
 * The game's own shipyard dispatch, reached without a dispatch window.
 *
 * Upstream offers no direct call for sending a built ship somewhere. A ship row's `pickDest(id)`
 * asks Buefy for a modal, polls every 50 ms for the `#modalBox` that modal would have produced, and
 * then calls the module-private `shipDispatchModal(id, modal)`, which builds one button per
 * reachable region and binds each to a closure over `id` and that region. Those closures are the
 * only route to `sendShipTo(id, region)`, and `sendShipTo` is the authoritative mutation: hull,
 * crew, trip and fuel viability, fleets, routes, patrols and travel initialization all live in it.
 *
 * So a caller must arrive through that closure rather than restate any of it. This capture does,
 * without anything on screen, and never keeps what it takes: the closure is bound by the draw that
 * ran for this ship and this region, invoked inside that call, and gone when the call returns. A
 * capture that fails — no shipyard control, no modal host, a draw that offered nothing, a throw —
 * reports which of those it was, and never falls back to an earlier one.
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
 * `launched` is the only success, and it is the game's own answer rather than an inference: the
 * shipyard reports the ship as under way after the closure ran. Everything else is a refusal or a
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
   * The game's own destination closure ran and declined. The row may have been disabled for fuel,
   * and `sendShipTo` re-checks everything anyway; the refusal is the game's, not a local replica's.
   */
  | { readonly kind: "refused" }
  /**
   * The closure could not be reached: no shipyard control, no modal host to draw into, a suppressed
   * capture, or a draw that threw. Nothing was invoked.
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
