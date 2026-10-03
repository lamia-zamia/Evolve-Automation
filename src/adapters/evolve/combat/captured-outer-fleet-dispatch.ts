/**
 * The game's own shipyard dispatch, captured without a dispatch window.
 *
 * DeadSpace offers no direct call for sending a built ship somewhere. A ship row's
 * `pickDest(id)` asks Buefy for a modal, polls every 50 ms for the `#modalBox` that modal would
 * have produced, and then calls the module-private `shipDispatchModal(id, modal)`. That draw
 * computes the whole group — a fleet sails as one body — intersects every member's reachable
 * destinations, and builds one button per destination, each carrying the region as a class and bound
 * to a closure over `id` and that region:
 *
 *     let button = $(`<button class="button is-info ${d.region}" ${fuelReady ? '' : 'disabled'}>…`)
 *         .on('click', function () { … sendShipTo(id, d.region); … })
 *
 * `sendShipTo` is the authoritative mutation and stays the only one: it re-checks hull, crew, trip
 * and fuel, clears any trade route or patrol, claims the crew, initializes the trip, and reports
 * whether the ship actually moved. None of that is restated here.
 *
 * **`pickDest` is a ship-row method, not a yard method.** `drawShipYard()` binds `#shipPlans` with
 * the yard's design methods — `avail`, `setVal`, `crewText`, `build`, `redraw` and the rest of its
 * own — and `drawShips()` binds each `#shipReg${i}` separately, with the ship as its data. `pickDest`
 * and the row's `show(id)` exist only on that row. So a newly built ship cannot be dispatched
 * through the yard control: it needs a row of its own, and a ship built while the player is
 * elsewhere does not have one, because upstream's `buildTPShip()` calls `drawShips()` and that draw
 * opens by returning unless the Dwarf Shipyard is the panel in front of the player. The row is
 * therefore captured first, through the yard's own `redraw()` — which upstream defines as exactly
 * `drawShips()` — and this capture then enters through `shipReg${index}.pickDest(index)`.
 *
 * What this capture adds on top of that row is a way *in* that costs the player nothing:
 *
 * - `$buefy.modal.open` is a no-op, so Buefy builds no `.modal.is-active` and no
 *   `.modal-background`, and the `modal` the draw closes over stays `undefined` — the destination
 *   closure's own `if (modal && modal.close)` guard then has nothing to close;
 * - a hidden `#modalBox` capture host stands in for the markup the real modal's content string would
 *   have produced, and is removed before this returns;
 * - the page's `setInterval`/`clearInterval` are replaced for the one call, so the game's own poll
 *   for that host and the close button's poll both run synchronously, and are restored before this
 *   returns — no timer hook is left installed and a callback that throws cannot prevent that;
 * - mounting stays suppressed, so no player-visible component is created;
 * - the destination closure is taken from `addEventListener` while that one draw binds it, matched
 *   structurally — a `<button>` inside this host's `.shipDispatch` whose class list carries the
 *   requested region — and invoked directly. The game's own `$` is module-private in `dom.js` and
 *   unreachable from outside the bundle, and its `.on()` is a thin `addEventListener` wrapper, so
 *   that is the seam the closure is actually bound through.
 *
 * The interception claims one shape and nothing else: a `click` listener whose target is a `<button>`
 * whose class list contains exactly the region being dispatched to. The patrol, refit and modal
 * close controls in the same draw all carry fixed classes, so no other row can answer for it, and an
 * ambiguous match is refused rather than guessed at. Every other call goes straight to the page's own
 * `addEventListener`, and the page's own is put back before this returns.
 *
 * **Nothing captured is kept.** The closure is bound by this draw, for this ship and this region,
 * invoked inside this call, and gone when it returns. A draw that produced no row for the region, a
 * capture that refused to start, and a throw are each reported as themselves, so a failed attempt can
 * never dispatch a ship with a closure bound for an earlier one.
 *
 * The result is not read from the closure. `sendShipTo` returns whether it moved anything, but the
 * yard is asked instead: `sendShipTo()` calls `drawShips()`, which re-sorts and re-clusters the ship's
 * list, so the index a ship was built at is not the one it sails from and even the row control this
 * call invoked may have been rebound. So the ship is found again by identity in the yard's live list
 * and the row that holds it *now* is asked — its own `show(currentIndex)`, which is
 * `shipMoving(ships[currentIndex])`. Off the shipyard that redraw returns at its tab gate and the
 * row captured here is still the current one; on the shipyard the real rows have taken that element
 * id over, and they are the game's answer just as much.
 */
import type {
  CapturedOuterFleetDispatch,
  CapturedOuterFleetDispatchCapture,
  CapturedOuterFleetDispatchRequest,
} from "../../../ports/captured-outer-fleet-dispatch.ts";
import type { GameControlRegistry } from "../../../ports/game-control-registry.ts";
import type { GameControlSynthesis } from "../../../ports/game-control-synthesis.ts";
import type { GameMountSuppression } from "../../../ports/game-mount-suppression.ts";
import { isRecord, readProperty } from "../../validation.ts";
import {
  CAPTURED_OUTER_FLEET_ROW_DISPATCH_METHOD,
  CAPTURED_OUTER_FLEET_ROW_UNDERWAY_METHOD,
  CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL,
  capturedOuterFleetShipList,
  type CapturedOuterFleetShipyard,
} from "./captured-outer-fleet-shipyard.ts";

type AnyFunction = (this: unknown, ...args: unknown[]) => unknown;

/** The host `shipDispatchModal` appends its destination rows into, named by the modal content. */
const DISPATCH_CAPTURE_HOST_ID = "modalBox";
/** Buefy's marker for a modal the player can currently see. */
const ACTIVE_MODAL_SELECTOR = ".modal.is-active";
/** The receiver addition that leaves Buefy no window to open. */
const DISPATCH_SYNTHETIC_OPEN_METHODS = ["$buefy.modal.open"] as const;
/** The class the draw gives the destination list, and the only place a destination row lives. */
const DISPATCH_LIST_CLASS = "shipDispatch";

/** One destination closure this draw bound, and the row it belongs to. */
interface CapturedDestination {
  readonly node: unknown;
  readonly listener: AnyFunction;
}

const EMPTY_DESTINATIONS: readonly CapturedDestination[] = Object.freeze([]);

interface DispatchCaptureHost {
  readonly parent: unknown;
  readonly element: unknown;
}

export interface CapturedOuterFleetDispatchDependencies {
  readonly controls: GameControlRegistry;
  /** The yard whose own draw binds the ship rows this capture dispatches through. */
  readonly shipyard: CapturedOuterFleetShipyard;
  /** Absent when no Vue hook is installed; the capture then fails closed. */
  readonly synthesis: GameControlSynthesis | undefined;
  readonly mountSuppression: GameMountSuppression;
  readonly getDocument: () => unknown;
  /** The page's global object, whose timer functions the game's poll resolves through. */
  readonly getPageWindow: () => unknown;
  /** Reports a fault in the capture itself, never a game fault. */
  readonly onCaptureError?: (detail: string) => void;
}

function activePlayerModals(document: unknown): readonly unknown[] | undefined {
  const querySelectorAll = readProperty(document, "querySelectorAll");
  if (typeof querySelectorAll !== "function") return undefined;
  let result: unknown;
  try {
    result = Reflect.apply(querySelectorAll, document, [ACTIVE_MODAL_SELECTOR]);
  } catch {
    return undefined;
  }
  const length = readProperty(result, "length");
  if (
    typeof length !== "number" ||
    !Number.isSafeInteger(length) ||
    length < 0
  ) {
    return undefined;
  }
  return Object.freeze(
    Array.from({ length }, (_, index) =>
      readProperty(result, String(index)),
    ).filter((modal) => modal !== undefined && modal !== null),
  );
}

/**
 * The hidden `#modalBox` the game's poll and draw will find. Refused when one already exists: a real
 * modal owns that id then, and a capture must never append into — or be mistaken for — the player's.
 */
function dispatchCaptureHost(
  document: unknown,
): DispatchCaptureHost | undefined {
  if (!isRecord(document)) return undefined;
  const querySelector = readProperty(document, "querySelector");
  if (typeof querySelector === "function") {
    try {
      if (
        Reflect.apply(querySelector, document, [
          `#${DISPATCH_CAPTURE_HOST_ID}`,
        ]) != null
      ) {
        return undefined;
      }
    } catch {
      return undefined;
    }
  }
  const createElement = readProperty(document, "createElement");
  if (typeof createElement !== "function") return undefined;
  const parent =
    readProperty(document, "body") ?? readProperty(document, "documentElement");
  const appendChild = readProperty(parent, "appendChild");
  if (typeof appendChild !== "function") return undefined;
  const element = Reflect.apply(createElement, document, ["div"]);
  if (!isRecord(element)) return undefined;
  Reflect.set(element, "id", DISPATCH_CAPTURE_HOST_ID);
  const style = readProperty(element, "style");
  if (isRecord(style)) Reflect.set(style, "display", "none");
  Reflect.apply(appendChild, parent, [element]);
  return { parent, element };
}

function removeDispatchCaptureHost(host: DispatchCaptureHost): void {
  const removeChild = readProperty(host.parent, "removeChild");
  try {
    if (typeof removeChild === "function") {
      Reflect.apply(removeChild, host.parent, [host.element]);
      return;
    }
    const remove = readProperty(host.element, "remove");
    if (typeof remove === "function") Reflect.apply(remove, host.element, []);
  } catch {
    // The page already took the host, or refused to; nothing here may escape.
  }
}

/**
 * Runs the game's poll callbacks against the capture host instead of waiting 50 ms for it.
 *
 * The callbacks are flushed after `pickDest` returns rather than at registration, because upstream
 * closes each interval handle over the very expression that registers it — `const attach` in the
 * close button, `let checkExist` in the dispatch poll — and a callback that ran during registration
 * would read its own handle before it is assigned.
 *
 * The replacement only claims a callback it can run; anything else is the page's own timer, so the
 * game's real behavior is what still answers it. The page's functions are put back before this
 * returns, and a callback that throws cannot prevent that.
 */
function dispatchFlushedTimers(
  pageWindow: unknown,
  reportError: (detail: string) => void,
  run: () => void,
): void {
  if (!isRecord(pageWindow)) {
    run();
    return;
  }
  const originalSetInterval = readProperty(pageWindow, "setInterval");
  if (typeof originalSetInterval !== "function") {
    run();
    return;
  }
  const originalClearInterval = readProperty(pageWindow, "clearInterval");
  const immediateHandles = new Set<unknown>();
  const queued: Array<{
    readonly callback: AnyFunction;
    readonly self: unknown;
    readonly args: readonly unknown[];
  }> = [];
  let flushing = false;
  const immediateSetInterval = function (
    this: unknown,
    ...args: unknown[]
  ): unknown {
    const [callback, ...rest] = args;
    if (flushing || typeof callback !== "function") {
      return Reflect.apply(originalSetInterval, this, args);
    }
    const handle = Object.freeze({ outerFleetDispatchTimer: true });
    immediateHandles.add(handle);
    // The cast is confined to this edge, after the callable check above.
    queued.push({ callback: callback as AnyFunction, self: this, args: rest });
    return handle;
  };
  const immediateClearInterval = function (
    this: unknown,
    ...args: unknown[]
  ): void {
    if (immediateHandles.delete(args[0])) return;
    if (typeof originalClearInterval === "function") {
      Reflect.apply(originalClearInterval, this, args);
    }
  };
  Reflect.set(pageWindow, "setInterval", immediateSetInterval);
  Reflect.set(pageWindow, "clearInterval", immediateClearInterval);
  try {
    run();
    flushing = true;
    // Bounded: a callback that keeps registering work cannot hold the cycle open.
    for (let round = 0; queued.length > 0 && round < 16; round += 1) {
      const next = queued.shift();
      if (next === undefined) break;
      try {
        Reflect.apply(next.callback, next.self, next.args);
      } catch (error) {
        reportError(`timer callback threw: ${String(error)}`);
      }
    }
  } finally {
    flushing = false;
    // Restored only if nothing replaced them meanwhile, so a page that re-hooked the timers keeps
    // its own hook.
    if (readProperty(pageWindow, "setInterval") === immediateSetInterval) {
      Reflect.set(pageWindow, "setInterval", originalSetInterval);
    }
    if (readProperty(pageWindow, "clearInterval") === immediateClearInterval) {
      Reflect.set(pageWindow, "clearInterval", originalClearInterval);
    }
  }
}

/** Whether a node carries `region` among its classes, the draw's own marker for a destination. */
function dispatchButtonFor(node: unknown, region: string): boolean {
  const tag = readProperty(node, "tagName");
  if (typeof tag !== "string" || tag.toLowerCase() !== "button") return false;
  const classes = readProperty(node, "classList");
  const contains = readProperty(classes, "contains");
  if (typeof contains !== "function") return false;
  return Reflect.apply(contains, classes, [region]) === true;
}

/**
 * Takes the `click` listeners the draw binds while it runs, and hands them back afterwards.
 *
 * Only a `click` listener whose target is a `<button>` whose class list carries `region` is claimed.
 * That is the draw's own destination row and nothing else: the patrol, refit and modal-close
 * controls in the same draw carry fixed classes. Everything else, including every non-`click`
 * listener, goes to the page's own `addEventListener` untouched.
 */
function dispatchInterceptedListeners(
  pageWindow: unknown,
  region: string,
  reportError: (detail: string) => void,
  run: () => void,
): readonly CapturedDestination[] {
  const prototype = readProperty(
    readProperty(pageWindow, "EventTarget"),
    "prototype",
  );
  const original = readProperty(prototype, "addEventListener");
  if (!isRecord(prototype) || typeof original !== "function") {
    reportError("the page exposes no addEventListener to intercept");
    run();
    return EMPTY_DESTINATIONS;
  }
  const claimed: CapturedDestination[] = [];
  const intercepted = function (this: unknown, ...args: unknown[]): unknown {
    const [type, listener] = args;
    const result = Reflect.apply(original, this, args);
    if (
      type === "click" &&
      typeof listener === "function" &&
      dispatchButtonFor(this, region)
    ) {
      claimed.push({ node: this, listener: listener as AnyFunction });
    }
    return result;
  };
  Reflect.set(prototype, "addEventListener", intercepted);
  try {
    run();
  } finally {
    // Restored only if nothing replaced it meanwhile.
    if (readProperty(prototype, "addEventListener") === intercepted) {
      Reflect.set(prototype, "addEventListener", original);
    }
  }
  return Object.freeze(claimed);
}

/** Whether a claimed row is one of this host's own destination buttons. */
function dispatchRowOfHost(
  candidate: CapturedDestination,
  host: DispatchCaptureHost,
): boolean {
  const contains = readProperty(host.element, "contains");
  if (typeof contains !== "function") return false;
  if (Reflect.apply(contains, host.element, [candidate.node]) !== true) {
    return false;
  }
  const closest = readProperty(candidate.node, "closest");
  if (typeof closest !== "function") return false;
  const list = Reflect.apply(closest, candidate.node, [
    `.${DISPATCH_LIST_CLASS}`,
  ]);
  const listContains = readProperty(host.element, "contains");
  return (
    list !== null &&
    list !== undefined &&
    typeof listContains === "function" &&
    Reflect.apply(listContains, host.element, [list]) === true
  );
}

/**
 * Whether the yard now reports this ship as under way, through the row that holds it now.
 *
 * `sendShipTo` calls `drawShips()`, and that redraw re-sorts and re-clusters the yard's list
 * whenever the yard is the panel in front of the player — so the index a ship was built at is not
 * necessarily the one it sails from, and the row control this call invoked may have been rebound. The
 * ship is therefore located by identity again, and the row that carries it after the dispatch is the
 * one asked; off the shipyard that redraw returns at its own tab gate and leaves the row captured
 * here current, and on the shipyard the real rows have taken the same element id over.
 *
 * A row that cannot be proven to be this ship's row is not asked at all: `undefined` here is a failed
 * postcondition, never a claim that the ship stayed put.
 */
function shipUnderway(
  dependencies: CapturedOuterFleetDispatchDependencies,
  ship: unknown,
): boolean {
  const row = dependencies.shipyard.rowFor(ship);
  if (row === undefined) return false;
  const handle = dependencies.controls.resolve(row.elementId);
  if (handle === undefined) return false;
  const underway = dependencies.controls.invoke(
    handle,
    CAPTURED_OUTER_FLEET_ROW_UNDERWAY_METHOD,
    [row.index],
  );
  return underway.ok && underway.value === true;
}

/**
 * A no-op event, because the captured closure is the game's own `.on()` wrapper and may reach for
 * `preventDefault` when the handler answers `false`.
 */
const DISPATCH_NOOP_EVENT = Object.freeze({
  preventDefault: () => {},
  stopPropagation: () => {},
});

export function createCapturedOuterFleetDispatch(
  dependencies: CapturedOuterFleetDispatchDependencies,
): CapturedOuterFleetDispatchCapture {
  const reportError = dependencies.onCaptureError ?? (() => {});
  let dispatching = false;

  return Object.freeze({
    blockedByPlayerModal(): boolean {
      const active = activePlayerModals(dependencies.getDocument());
      return active !== undefined && active.length > 0;
    },
    dispatchShipyardShip(
      request: Readonly<CapturedOuterFleetDispatchRequest>,
    ): CapturedOuterFleetDispatch {
      const synthesis = dependencies.synthesis;
      if (
        dispatching ||
        synthesis === undefined ||
        !synthesis.available ||
        !dependencies.mountSuppression.available
      ) {
        return Object.freeze({ kind: "unreachable" });
      }
      const yard = dependencies.controls.resolve(
        CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL,
      );
      const ships =
        yard === undefined ? undefined : capturedOuterFleetShipList(yard);
      const ship = ships?.[request.index];
      if (ship === undefined) {
        reportError(`no ship at ${request.index} in the yard's own list`);
        return Object.freeze({ kind: "unreachable" });
      }
      // The row this dispatch enters through is the game's own `pickDest`, and a ship built while
      // the player was elsewhere has none: `buildTPShip()`'s own `drawShips()` returns at its tab
      // gate. One capture attempt, through the yard's own `redraw()`, and nothing is retained.
      const row = dependencies.shipyard.captureRow(ship);
      if (row === undefined) {
        reportError("no ship row could be captured for that ship");
        return Object.freeze({ kind: "unreachable" });
      }
      dispatching = true;
      try {
        const host = dispatchCaptureHost(dependencies.getDocument());
        if (host === undefined) {
          reportError(
            `a real #${DISPATCH_CAPTURE_HOST_ID} already owns the id`,
          );
          return Object.freeze({ kind: "unreachable" });
        }
        let claimed: readonly CapturedDestination[] = EMPTY_DESTINATIONS;
        let destinations: readonly CapturedDestination[] = EMPTY_DESTINATIONS;
        let invoked = false;
        try {
          dependencies.mountSuppression.withoutMounting(() => {
            claimed = dispatchInterceptedListeners(
              dependencies.getPageWindow(),
              request.region,
              reportError,
              () =>
                dispatchFlushedTimers(
                  dependencies.getPageWindow(),
                  reportError,
                  () => {
                    const result = synthesis.invoke({
                      elementId: row.elementId,
                      method: CAPTURED_OUTER_FLEET_ROW_DISPATCH_METHOD,
                      args: [row.index],
                      receiver: {
                        noOpMethods: DISPATCH_SYNTHETIC_OPEN_METHODS,
                      },
                    });
                    invoked = result.ok;
                    if (!result.ok) {
                      reportError(
                        `${row.elementId} ${CAPTURED_OUTER_FLEET_ROW_DISPATCH_METHOD} failed: ${result.reason} ${result.detail ?? ""}`,
                      );
                    }
                  },
                ),
            );
            // While the host is still standing, and before anything is left to judge: a claimed row
            // is this draw's only if it is inside it.
            destinations = claimed.filter((candidate) =>
              dispatchRowOfHost(candidate, host),
            );
          });
        } finally {
          removeDispatchCaptureHost(host);
        }
        // A refused or failed invocation drew nothing at all, whatever the interception recorded.
        if (!invoked) {
          reportError(
            `the ${CAPTURED_OUTER_FLEET_ROW_DISPATCH_METHOD} invocation did not complete`,
          );
          return Object.freeze({ kind: "unreachable" });
        }
        if (destinations.length === 0) {
          reportError(
            `the dispatch draw offered no destination for ${request.region}`,
          );
          return Object.freeze({ kind: "no-destination" });
        }
        if (destinations.length > 1) {
          reportError(
            `the dispatch draw bound ${destinations.length} destinations for ${request.region}`,
          );
          return Object.freeze({ kind: "unreachable" });
        }
        const destination = destinations[0];
        if (destination === undefined) {
          return Object.freeze({ kind: "unreachable" });
        }
        try {
          Reflect.apply(destination.listener, destination.node, [
            DISPATCH_NOOP_EVENT,
          ]);
        } catch (error) {
          reportError(`the destination closure threw: ${String(error)}`);
          return Object.freeze({ kind: "unreachable" });
        }
        // Not read from the closure: the row that holds this ship now, asked after the redraw
        // `sendShipTo` triggers, which may have reordered the list or rebound the row entirely.
        return Object.freeze({
          kind: shipUnderway(dependencies, ship) ? "launched" : "refused",
        });
      } catch (error) {
        reportError(String(error));
        return Object.freeze({ kind: "unreachable" });
      } finally {
        dispatching = false;
      }
    },
  });
}
