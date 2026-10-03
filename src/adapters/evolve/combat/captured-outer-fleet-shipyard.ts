/**
 * The Dwarf Shipyard's own draw, run against scratch DOM so the player never visits the tab.
 *
 * `drawShipYard()` is module-private in `truepath.js`. Two closures reach it, and only two:
 * `loadTab('mTabCivic')`, which the main-tab component's own `swapTab(2)` calls, and the Civic
 * component's `swapTab(govTabs)`, which the Dwarf Shipyard is `govTabs === 5` of. Both open with
 * `clearTabPanels` over every panel in that tab and then draw one of them, which is why reaching it
 * the ordinary way costs the player their Civic panel and their sub-tab.
 *
 * `#dwarfShipYard` is what makes that necessary, and it is why a Civic pass could never have done
 * it: the panel is a `b-tab-item` in the Civic tab's own `b-tabs` *render*, not markup. With that
 * render suppressed there is no `#dwarfShipYard` to append into, so `#shipPlans` is created
 * detached, `vBind({el:'#shipPlans'})` resolves nothing, and the yard is never captured — the same
 * failure the Foreign panel had, and the reason its draw lets one component mount for real. This
 * takes the other half of that answer instead of widening the Civic draw: it stands a
 * `#dwarfShipYard` of its own, in a hidden host it owns and removes, and lets the game's own draw
 * fill that. No component is really mounted, so no Vue tree is built and the controls recorded from
 * the binding options are all any consumer needs.
 *
 * Everything else the draw does is either the game's own normalization of the yard — the blueprint
 * defaults it fills in, the retired-Explorer scrub, `fleetTemplate()`, `cowPlanet()`,
 * `repairSupplyFreighters()`, all of which a real visit performs too — or output that lands in the
 * host. `updateCosts()` in particular is how the yard becomes authoritative about a design's price,
 * and `drawShips()` fills the host's own `#shipList`.
 *
 * **The player's view is not a participant.** The panel workspace opens with the player's own main
 * panel kept by name and the Civic panel answered by a disposable scratch container, so the
 * `clearTabPanels` these routes run finds nothing: the teardown helpers are all
 * `Sortable.get($('#id')[0])?.destroy()`, and every id in the player's panel is aliased for the
 * length of the draw. A workspace that cannot be opened is refused rather than run without one —
 * the pass exists so the player's Civic panel survives it.
 *
 * **Nothing the pass borrows outlives it.** `settings.civTabs`, `settings.govTabs` and
 * `settings.animated` are the gate `drawShipYard()` reads and `clearTabPanels` defers on; the
 * first two are put back to the player's own values and `animated` is switched off so no panel
 * clear is left pending in the game's own bookkeeping, all in the same synchronous call, before the
 * browser or Vue can observe any of it. `animated` must be off rather than merely restored: left
 * on, `clearTabPanels` would park each outgoing panel behind a `setTimeout` this pass drops, and a
 * later genuine clear would then skip it.
 *
 * `tabLoad` is the one condition that refuses outright. With every tab retained the Civic component's
 * own `swapTab` is a no-op by the game's guard, and the fallback route would append a second copy of
 * the whole Civic tab into a panel that already holds one - for a yard the game has drawn itself.
 *
 * Freshness is the whole question here, because `shipPlans` outlives the draw: the generation before
 * the call is read, the call must report that it drew, and the resolved control must carry a
 * generation produced after it together with every method this feature reaches for. A draw that
 * returned early — no shipyard, no `showShipYard`, a True Path run the game does not ship for — is
 * refused rather than answered with a control an earlier draw left behind.
 *
 * **The dispatch trigger is not one of those methods.** `drawShipYard()` binds `#shipPlans` with the
 * yard's design methods, and `drawShips()` binds each `#shipReg${i}` separately with the row's own:
 * `pickDest(id)`, whose closure is the only route to `sendShipTo(id, region)`, and
 * `show(id)`, which is `shipMoving(ships[id])`. Nothing in `shipPlans` can be asked for either, so
 * `captureRow()` below runs the game's own ship-list draw — `shipPlans.redraw()`, which upstream
 * defines as exactly `drawShips()` — against scratch DOM, and proves the row that draw bound belongs
 * to the ship being dispatched.
 *
 * That pass needs its own `#shipList`, because `drawShips()` clears and refills the element the
 * yard gives it: a capture that drew into the player's would leave them a yard the automation
 * redrew. The panel workspace answers that the same way it does for the establishment pass, by
 * aliasing every id under the Civic panel for the length of one synchronous draw, so the player's
 * own `#shipList` and rows cannot be resolved at all. The draw's tab gate is satisfied the same way,
 * and `settings.civTabs`/`govTabs` and the yard's own view options are put back before the browser
 * or Vue can observe any of it.
 *
 * **The player's saved view is not a participant either.** `drawShips()` omits rows for a system
 * filter, a folded location group or a folded fleet, so a yard left filtered or folded would hide
 * the very row being dispatched. Only the three fields that can hide *this* ship are touched —
 * `sys` and `group`, and the one `ffold` entry naming the target's fleet — each read first and put
 * back in the same synchronous call. No ship list is reimplemented here; the rows are the game's.
 *
 * A redraw can also re-sort and re-cluster the yard's live array, so the ship is held by identity
 * and its index is derived from the list the draw leaves behind. The row that draw bound is then
 * required to carry a generation newer than the one *that element id* held before it: a control
 * surviving an earlier draw, or one bound to whichever ship used to sit at this index, can never
 * answer for a capture.
 *
 * **A row the game already drew is used, never redrawn.** Two page states hold one: preload mode
 * (`settings.tabLoad`) has `initTabs()` load every main tab at startup, `loadTab('mTabCivic')` call
 * `drawShipYard()` itself, and `drawShips()` skip its tab gate altogether — so `#shipList` and its
 * `#shipReg${i}` rows stay bound and current, and `buildTPShip()`'s own draw refreshes them; and a yard
 * the player is looking at has just been redrawn the same way by the build that produced the ship.
 * `captureRow()` therefore looks for the game's own rendered row first, requiring the element to exist
 * inside the real `#shipList` rather than only in the registry. That check is what keeps a scratch
 * capture's leftover control — same id, still matching data, element long gone — from answering, so
 * the freshness proof below stays exactly as strict. Only when the page has drawn no row does the
 * scratch route run, and never under preload: there a missing row means the game did not produce the
 * control that mode is supposed to hold.
 */
import type {
  ControlCaptureCheckpoint,
  GameControlHandle,
  GameControlRegistry,
} from "../../../ports/game-control-registry.ts";
import type { GameControlSynthesis } from "../../../ports/game-control-synthesis.ts";
import type { GameMountSuppression } from "../../../ports/game-mount-suppression.ts";
import type { GamePanelWorkspace } from "../../../ports/game-panel-workspace.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";
import type {
  GameShipyardPartCatalogCandidate,
  GameShipyardPartCatalogSink,
} from "../../../ports/game-shipyard-parts.ts";
import {
  GOV_TAB_INDEX,
  GOV_TABS_SETTING,
  MAIN_TAB_CONTROL,
  MAIN_TAB_INDEX,
  MAIN_TAB_PANELS,
  MAIN_TAB_SETTING,
  SUB_TAB_CONTROLS,
} from "../captured-tab-discovery.ts";
import { isRecord, readProperty } from "../../validation.ts";

/** The control the game binds its `#shipPlans` markup to: the yard's blueprint, parts and build. */
export const CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL = "shipPlans";

/** `drawShipYard()` returns private `shipCrewSize(blueprint)` through this native method. */
export const CAPTURED_OUTER_FLEET_SHIPYARD_CREW_METHOD = "crewText";

/** The panel `drawShipYard()` draws into, and the element a shipyard host has to stand in for. */
export const CAPTURED_OUTER_FLEET_SHIPYARD_PANEL_ID = "dwarfShipYard";

/**
 * The cost row `drawShipYard()` gives the yard and `updateCosts()` owns. It is the game's only price
 * for a design, and the element a scratch cost probe stands in for when the yard is off-tab.
 */
export const CAPTURED_OUTER_FLEET_SHIPYARD_COSTS_ID = "shipYardCosts";

/** The element `drawShipYard()` gives the yard's ship list, and the one `drawShips()` refills. */
export const CAPTURED_OUTER_FLEET_SHIP_LIST_ID = "shipList";

/**
 * The prefix `drawShipRow()` gives each ship row. It is bound per row, with the ship as its data,
 * which is why the dispatch trigger and the yard's own under-way answer are asked of
 * `#shipReg${index}` rather than of `shipPlans`.
 */
export const CAPTURED_OUTER_FLEET_SHIP_ROW_PREFIX = "shipReg";

/** The ship-row method whose closure is the only route to `sendShipTo(id, region)`. */
export const CAPTURED_OUTER_FLEET_ROW_DISPATCH_METHOD = "pickDest";

/**
 * The ship row's own answer to "is this ship under way", which is `shipMoving(ships[id])`. Read by
 * index, so it is asked of the ship's position *after* the dispatch: `drawShips()` re-sorts and
 * re-clusters the yard's list, and the index a ship was built at is not the one it sails from.
 */
export const CAPTURED_OUTER_FLEET_ROW_UNDERWAY_METHOD = "show";

/** The yard's own switch to its ship list, which upstream defines as exactly `drawShips()`. */
const OUTER_FLEET_SHIPYARD_REDRAW_METHOD = "redraw";

/** The tab components' own switch method, for the main tab and for the Civic sub-tabs. */
const TAB_SWAP_METHOD = "swapTab";

/**
 * Every method this feature reaches the yard's *design* control through, so a control that answers
 * with a plausible generation but a partial binding is refused: `avail` the part gate, `setVal` the
 * blueprint write, `crewText` the crew requirement, `build` the native mechanics authority, and `redraw` the one
 * game-owned closure to `drawShips()` the row capture runs.
 *
 * Exactly what the callers ask for, and nothing else. `pickDest` and `show` are *not* here: upstream
 * binds those on each `#shipReg${i}` row, so requiring them of `shipPlans` describes a control the
 * game never builds.
 */
const OUTER_FLEET_SHIPYARD_METHODS: readonly string[] = Object.freeze([
  "avail",
  "build",
  CAPTURED_OUTER_FLEET_SHIPYARD_CREW_METHOD,
  OUTER_FLEET_SHIPYARD_REDRAW_METHOD,
  "setVal",
]);

/** What a ship row's own binding must carry for this feature to reach the dispatch and its answer. */
const OUTER_FLEET_SHIP_ROW_METHODS: readonly string[] = Object.freeze([
  CAPTURED_OUTER_FLEET_ROW_DISPATCH_METHOD,
  CAPTURED_OUTER_FLEET_ROW_UNDERWAY_METHOD,
]);

/**
 * One ship row, as the game bound it. `index` is the ship's position in the yard's live list, which
 * is what every row method is read by; `elementId` is the row control to ask.
 */
export interface CapturedOuterFleetShipRow {
  readonly index: number;
  readonly elementId: string;
}

export interface CapturedOuterFleetShipyardDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  /** Absent when no Vue hook is installed; the capture then fails closed. */
  readonly synthesis: GameControlSynthesis | undefined;
  readonly mountSuppression: GameMountSuppression;
  readonly panels: GamePanelWorkspace;
  readonly getDocument: () => unknown;
  /** The page's global object, whose Vue answers a binding proxy's own value. */
  readonly getPageWindow: () => unknown;
  /**
   * Where the yard's own option markup goes on its way out of the draw. Upstream emits every
   * `shipParts` entry into this `#shipPlans`, so this is the only place the yard's part catalogue
   * exists at all, and it exists only while this draw's host is standing.
   */
  readonly parts: GameShipyardPartCatalogSink;
  /** Reports a fault in the capture itself, never a game fault. */
  readonly onEstablishError?: (detail: string) => void;
}

export interface CapturedOuterFleetShipyard {
  /** The shipyard control, whatever bound it: a real visit, or a capture this module ran. */
  control(): GameControlHandle | undefined;
  /** Whether the control carries every method this feature reaches the yard through. */
  established(control: GameControlHandle | undefined): boolean;
  /**
   * Runs the game's own shipyard draw against scratch DOM and answers the control this call
   * rebound after proving restoration, or `undefined`. A failed pass rejects every changed control
   * generation and discards its staged catalogue.
   */
  establish(): GameControlHandle | undefined;
  /**
   * The row control the yard's own last draw bound for this ship, or `undefined` when none answers
   * for it. A resolution, not a draw: it says nothing about whether that row is current.
   */
  rowFor(ship: unknown): CapturedOuterFleetShipRow | undefined;
  /**
   * Runs the game's own ship-list draw against scratch DOM and answers the row it bound for this
   * ship after proving restoration, or `undefined`. A failed pass rejects every changed control
   * generation, including sibling rows bound by the same draw.
   */
  captureRow(ship: unknown): CapturedOuterFleetShipRow | undefined;
}

/** A hidden element the capture owns and removes: the panel or list the game's draw will find. */
interface HiddenHost {
  readonly parent: unknown;
  readonly element: unknown;
}

/** Scratch markup stays distinguishable from player-rendered markup if cleanup cannot remove it. */
const OUTER_FLEET_HIDDEN_HOST_MARKER = Symbol("outer-fleet-hidden-host");

/**
 * The hidden element the game's draw will find and fill. Refused when the id is already taken: a
 * real yard owns it then, and a capture must never clear or refill the player's panel because it
 * resolved to the same element.
 */
export function hiddenHostElement(
  document: unknown,
  elementId: string,
): HiddenHost | undefined {
  if (!isRecord(document)) return undefined;
  const getElementById = readProperty(document, "getElementById");
  if (typeof getElementById === "function") {
    const owner = Reflect.apply(getElementById, document, [elementId]);
    if (owner !== null && owner !== undefined) return undefined;
  }
  const createElement = readProperty(document, "createElement");
  if (typeof createElement !== "function") return undefined;
  const parent =
    readProperty(document, "body") ?? readProperty(document, "documentElement");
  const appendChild = readProperty(parent, "appendChild");
  if (typeof appendChild !== "function") return undefined;
  const element = Reflect.apply(createElement, document, ["div"]);
  if (!isRecord(element)) return undefined;
  Reflect.set(element, OUTER_FLEET_HIDDEN_HOST_MARKER, true);
  Reflect.set(element, "id", elementId);
  const style = readProperty(element, "style");
  if (isRecord(style)) Reflect.set(style, "display", "none");
  Reflect.apply(appendChild, parent, [element]);
  return { parent, element };
}

export function removeHiddenHostElement(host: HiddenHost): boolean {
  const removeChild = readProperty(host.parent, "removeChild");
  try {
    if (typeof removeChild === "function") {
      Reflect.apply(removeChild, host.parent, [host.element]);
    } else {
      const remove = readProperty(host.element, "remove");
      if (typeof remove === "function") Reflect.apply(remove, host.element, []);
    }
  } catch {
    // The page may already have taken the host. Prove absence below even if removal threw.
  }
  const hiddenHostContains = readProperty(host.parent, "contains");
  return (
    typeof hiddenHostContains === "function" &&
    Reflect.apply(hiddenHostContains, host.parent, [host.element]) === false &&
    readProperty(host.element, "isConnected") === false
  );
}

/**
 * The yard's own live ship list, which `shipPlans` binds as its `s` data. This is the game's own
 * shipyard object, so it is the only captured value that can prove a build appended a ship or that a
 * dispatch moved one; the root state is the game's pre-period clone and cannot.
 *
 * Read fresh every time: `drawShips()` replaces the array whenever it re-sorts or re-clusters the
 * yard, so a list held across a redraw is stale even though the ship objects in it are the same.
 */
export function capturedOuterFleetShipList(handle: {
  readonly data?: unknown;
}): readonly unknown[] | undefined {
  const ships = readProperty(readProperty(handle.data, "s"), "ships");
  return Array.isArray(ships) ? ships : undefined;
}

/**
 * The yard's own view options, which `shipPlans` binds as its `v` data and `drawShips()` reads
 * through `activeShipyardView()`. It is `global.space.shipyard.view`, created and backfilled by the
 * game on read, and it is saved with the yard — so anything this capture changes in it is the
 * player's setting and goes back before the call returns.
 */
function capturedOuterFleetYardView(handle: {
  readonly data?: unknown;
}): Record<PropertyKey, unknown> | undefined {
  const bound = readProperty(handle.data, "v");
  const stored = readProperty(readProperty(handle.data, "s"), "view");
  const view = isRecord(bound) ? bound : stored;
  return isRecord(view) ? view : undefined;
}

/**
 * Whether a row binding's data is this ship.
 *
 * `vBind` rewrites every component's `data` into `function(){ return Vue.reactive(original); }` before
 * `Vue.createApp` sees it, so what a captured handle carries is a reactive proxy and not the object the
 * game passed in — a direct identity comparison would refuse every real row. The page's own
 * `Vue.toRaw` is the game's answer to what such a proxy wraps, and it answers for an unproxied object
 * too, so both spellings are accepted. Without it the comparison fails closed rather than guessing.
 */
function boundShipIs(
  bound: unknown,
  ship: unknown,
  pageWindow: unknown,
): boolean {
  if (bound === ship) return true;
  const toRaw = readProperty(readProperty(pageWindow, "Vue"), "toRaw");
  if (typeof toRaw !== "function") return false;
  try {
    return Reflect.apply(toRaw, undefined, [bound]) === ship;
  } catch {
    return false;
  }
}

/** Where `ship` sits in the yard's own list right now, or `-1` when the yard no longer holds it. */
function liveShipIndex(
  ships: readonly unknown[] | undefined,
  ship: unknown,
): number {
  return ships === undefined ? -1 : ships.indexOf(ship);
}

/**
 * The element the game itself rendered for `elementId`, and only when it sits inside the container
 * the game owns and named `containerId`.
 *
 * `undefined` for everything else, deliberately including a document with no `getElementById`: this
 * is the one check that separates a row the player can see from a control the registry kept after its
 * element was taken away. A scratch capture binds `#shipReg${i}` into a `#shipList` of its own and
 * removes both, and the registry never forgets it — so a matching `data` alone proves nothing about
 * whether the game ever drew that row.
 */
export function renderedElementInside(
  document: unknown,
  containerId: string,
  elementId: string,
): unknown {
  if (!isRecord(document)) return undefined;
  const getElementById = readProperty(document, "getElementById");
  if (typeof getElementById !== "function") return undefined;
  const resolve = (id: string): unknown => {
    const found = Reflect.apply(getElementById, document, [id]);
    return found === null || found === undefined ? undefined : found;
  };
  const container = resolve(containerId);
  const element = resolve(elementId);
  if (container === undefined || element === undefined) return undefined;
  for (
    let renderedOwner: unknown = container;
    renderedOwner !== undefined && renderedOwner !== null;
    renderedOwner = readProperty(renderedOwner, "parentNode")
  ) {
    if (readProperty(renderedOwner, OUTER_FLEET_HIDDEN_HOST_MARKER) === true)
      return undefined;
  }
  const contains = readProperty(container, "contains");
  return typeof contains === "function" &&
    Reflect.apply(contains, container, [element]) === true
    ? element
    : undefined;
}

/**
 * The row the game has really drawn for this ship, or `undefined` when it has not drawn one.
 *
 * The same proof `provenShipRow` applies, plus the one only this route can apply: the element has to
 * exist in the document inside the yard's own `#shipList`. That is what preload mode and a yard the
 * player is looking at share, and it is what a scratch capture never has.
 *
 * Silent when the page simply has no rendered row, because for the lazy route that is the normal case
 * and a fault every dispatch would carry says nothing. Once the element *is* there, the control proof
 * reports: a row the page drew but whose binding is wrong is a real fault worth a line.
 */
function renderedShipRow(
  controls: GameControlRegistry,
  document: unknown,
  pageWindow: unknown,
  ship: unknown,
  reportError: (detail: string) => void,
): CapturedOuterFleetShipRow | undefined {
  const control = controls.resolve(CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL);
  const index = liveShipIndex(
    control === undefined ? undefined : capturedOuterFleetShipList(control),
    ship,
  );
  if (index < 0) return undefined;
  if (
    renderedElementInside(
      document,
      CAPTURED_OUTER_FLEET_SHIP_LIST_ID,
      `${CAPTURED_OUTER_FLEET_SHIP_ROW_PREFIX}${index}`,
    ) === undefined
  ) {
    return undefined;
  }
  return provenShipRow(controls, pageWindow, ship, reportError, () => true);
}

function shipyardControlGeneration(controls: GameControlRegistry): number {
  return (
    controls.resolve(CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL)?.generation ?? 0
  );
}

/**
 * The `#shipPlans` the draw just produced, and only when the scratch host this pass stood is the one
 * holding it.
 *
 * The panel workspace hides the player's Civic panel by renaming it, so the element this resolves is
 * the one inside the host and not a yard the player is looking at. Answering from the host rather
 * than from the document is what makes that true by construction: a host the draw never filled has no
 * child to find, and nothing outside it is ever taken for this pass's own output.
 */
function scratchPlansElement(document: unknown, host: unknown): unknown {
  if (!isRecord(document)) return undefined;
  const getElementById = readProperty(document, "getElementById");
  const contains = readProperty(host, "contains");
  if (typeof getElementById !== "function" || typeof contains !== "function") {
    return undefined;
  }
  const plans = Reflect.apply(getElementById, document, [
    CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL,
  ]);
  return plans !== null &&
    plans !== undefined &&
    Reflect.apply(contains, host, [plans]) === true
    ? plans
    : undefined;
}

/**
 * The generation every already-captured ship row carries, read before a redraw.
 *
 * Keyed by element id rather than by ship: the target's index can change during the redraw's own
 * sorting, so what has to be compared afterwards is the row that took this id over, not the row that
 * left it.
 */
function shipRowGenerations(
  controls: GameControlRegistry,
): ReadonlyMap<string, number> {
  const before = new Map<string, number>();
  for (const elementId of controls.capturedElementIds()) {
    if (!elementId.startsWith(CAPTURED_OUTER_FLEET_SHIP_ROW_PREFIX)) continue;
    before.set(elementId, controls.resolve(elementId)?.generation ?? 0);
  }
  return before;
}

function reboundShipyardControl(
  controls: GameControlRegistry,
  minimumGeneration: number,
): GameControlHandle | undefined {
  const control = controls.resolve(CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL);
  return control !== undefined &&
    control.generation > minimumGeneration &&
    shipyardControlIsEstablished(control)
    ? control
    : undefined;
}

/** Whether the yard's design control carries every method this feature reaches it for. */
function shipyardControlIsEstablished(
  control: GameControlHandle | undefined,
): boolean {
  return (
    control !== undefined &&
    OUTER_FLEET_SHIPYARD_METHODS.every((method) =>
      control.methods.includes(method),
    )
  );
}

/**
 * The row the yard's own last draw bound for this ship, once it is proven to be this ship's row.
 *
 * Proving it takes the index from the live list rather than from the caller, because a redraw may
 * have re-sorted or re-clustered the yard, and then the row control and its `data` must both say so.
 * `requireFresh`, for the capture pass only, additionally demands that this element id carries a
 * generation newer than the one it held before the redraw: a row surviving an earlier draw, or one
 * left behind by whichever ship used to occupy this index, can never answer for it.
 */
function provenShipRow(
  controls: GameControlRegistry,
  pageWindow: unknown,
  ship: unknown,
  reportError: (detail: string) => void,
  requireFresh: (elementId: string) => boolean,
): CapturedOuterFleetShipRow | undefined {
  const control = controls.resolve(CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL);
  const index = liveShipIndex(
    control === undefined ? undefined : capturedOuterFleetShipList(control),
    ship,
  );
  if (index < 0) {
    reportError("the yard no longer lists that ship");
    return undefined;
  }
  const elementId = `${CAPTURED_OUTER_FLEET_SHIP_ROW_PREFIX}${index}`;
  const row = controls.resolve(elementId);
  if (row === undefined) {
    reportError(`the shipyard bound no ${elementId} for that ship`);
    return undefined;
  }
  if (
    !OUTER_FLEET_SHIP_ROW_METHODS.every((method) =>
      row.methods.includes(method),
    )
  ) {
    reportError(
      `${elementId} is missing ${OUTER_FLEET_SHIP_ROW_METHODS.filter(
        (method) => !row.methods.includes(method),
      ).join(", ")}`,
    );
    return undefined;
  }
  if (!boundShipIs(row.data, ship, pageWindow)) {
    reportError(`${elementId} is bound to another ship`);
    return undefined;
  }
  if (!requireFresh(elementId)) {
    reportError(`${elementId} was not rebound by this capture`);
    return undefined;
  }
  return Object.freeze({ index, elementId });
}

/**
 * The narrowest game-owned route to `drawShipYard()` that is already captured, falling back to the
 * one that captures it.
 *
 * The Civic sub-tab component is the game's own closure over the draw and is bound the first time
 * the Civic tab is loaded at all, so it is usually present and the fallback is rarely spent. When it
 * is not — a player who has never opened the Civic tab this session — the main-tab component's
 * `swapTab(2)` calls `loadTab('mTabCivic')`, which appends the Civic tab's `b-tabs`, binds the
 * sub-tab control, and then calls `drawShipYard()` itself. Either way the draw happens once, into
 * the host this pass stands.
 */
function drawCapturedShipyard(
  controls: GameControlRegistry,
  synthesis: GameControlSynthesis,
  reportError: (detail: string) => void,
): boolean {
  const subTabControl = SUB_TAB_CONTROLS[GOV_TABS_SETTING];
  const route =
    subTabControl !== undefined && controls.resolve(subTabControl) !== undefined
      ? { elementId: subTabControl, index: GOV_TAB_INDEX.dwarfShipYard }
      : { elementId: MAIN_TAB_CONTROL, index: MAIN_TAB_INDEX.civic };
  const result = synthesis.invoke({
    elementId: route.elementId,
    method: TAB_SWAP_METHOD,
    args: [route.index],
  });
  if (!result.ok) {
    reportError(
      `${route.elementId} ${TAB_SWAP_METHOD} failed: ${result.reason} ${result.detail ?? ""}`,
    );
  }
  return result.ok;
}

/**
 * The settings and saved view options one yard draw borrows, and puts back.
 *
 * `drawShips()` opens by returning unless the Dwarf Shipyard is the tab in front of the player, so the
 * two tab settings have to say so for the length of the call. They are the player's own saved values,
 * so both go back before anything else observes them. Answers `undefined` when the settings are not
 * a record at all — the caller then refuses, because a gate it cannot satisfy would return early and
 * the row proof would have nothing to judge.
 */
interface YardDrawBorrow {
  /** Satisfies the draw's tab gate, and neutralizes only the view fields that can hide this ship. */
  open(ship: unknown): void;
  /** Puts the tab settings and the view options back and proves their saved values. Idempotent. */
  restore(): boolean;
}

function yardDrawBorrow(
  settings: unknown,
  view: Record<PropertyKey, unknown> | undefined,
): YardDrawBorrow | undefined {
  if (!isRecord(settings)) return undefined;
  const playerMainTab = settings[MAIN_TAB_SETTING];
  const playerSubTab = settings[GOV_TABS_SETTING];
  const savedSystem = view === undefined ? undefined : view["sys"];
  const savedGroup = view === undefined ? undefined : view["group"];
  const fleets: Record<string, unknown> | undefined = isRecord(view?.["ffold"])
    ? (view?.["ffold"] as Record<string, unknown>)
    : undefined;
  /** The one folded-fleet entry this ship can be hidden by, and what it held. */
  let foldKey: string | undefined;
  let savedFold: unknown;
  return {
    open(ship: unknown): void {
      settings[MAIN_TAB_SETTING] = MAIN_TAB_INDEX.civic;
      settings[GOV_TABS_SETTING] = GOV_TAB_INDEX.dwarfShipYard;
      if (view === undefined) return;
      // `drawShips()` omits rows for a system filter, for a folded location group, and for a folded
      // fleet's escorts. Only the system filter, the grouping, and the entry naming this ship's own
      // fleet can hide *this* ship: `fold` is never read while grouping is off, and every other ship
      // keeping its fold is the player's own arrangement, not this capture's business.
      view["sys"] = "all";
      view["group"] = false;
      foldKey = undefined;
      savedFold = undefined;
      const fleetId = readProperty(ship, "fid");
      if (
        fleetId === undefined ||
        fleetId === null ||
        readProperty(ship, "flag") === true ||
        fleets === undefined
      ) {
        return;
      }
      const key = String(fleetId);
      if (fleets[key] === undefined) return;
      foldKey = key;
      savedFold = fleets[key];
      delete fleets[key];
    },
    restore(): boolean {
      settings[MAIN_TAB_SETTING] = playerMainTab;
      settings[GOV_TABS_SETTING] = playerSubTab;
      if (view === undefined) {
        return (
          Object.is(settings[MAIN_TAB_SETTING], playerMainTab) &&
          Object.is(settings[GOV_TABS_SETTING], playerSubTab)
        );
      }
      view["sys"] = savedSystem;
      view["group"] = savedGroup;
      if (foldKey !== undefined && fleets !== undefined) {
        fleets[foldKey] = savedFold;
      }
      const shipyardBorrowRestored =
        Object.is(settings[MAIN_TAB_SETTING], playerMainTab) &&
        Object.is(settings[GOV_TABS_SETTING], playerSubTab) &&
        Object.is(view["sys"], savedSystem) &&
        Object.is(view["group"], savedGroup) &&
        (foldKey === undefined ||
          (fleets !== undefined && Object.is(fleets[foldKey], savedFold)));
      foldKey = undefined;
      savedFold = undefined;
      return shipyardBorrowRestored;
    },
  };
}

export function createCapturedOuterFleetShipyard(
  dependencies: CapturedOuterFleetShipyardDependencies,
): CapturedOuterFleetShipyard {
  const reportError = dependencies.onEstablishError ?? (() => {});
  let drawing = false;

  return Object.freeze({
    control(): GameControlHandle | undefined {
      return dependencies.controls.resolve(
        CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL,
      );
    },
    established(control: GameControlHandle | undefined): boolean {
      return shipyardControlIsEstablished(control);
    },
    establish(): GameControlHandle | undefined {
      const synthesis = dependencies.synthesis;
      if (drawing || synthesis === undefined || !synthesis.available) {
        return undefined;
      }
      if (!dependencies.mountSuppression.available) return undefined;
      drawing = true;
      let yardPassCheckpoint: ControlCaptureCheckpoint | undefined;
      let yardPassSucceeded = false;
      try {
        const settings = readProperty(
          dependencies.rootState.readRoot(),
          "settings",
        );
        if (!isRecord(settings)) return undefined;
        if (settings["tabLoad"] === true) {
          reportError(
            "preload mode draws every tab itself, so there is no yard left to establish",
          );
          return undefined;
        }
        // Read before the draw, never cleared: a yard the player visited stays a correct answer for
        // the controls it bound, so the only honest test of *this* pass is whether the draw rebound
        // the control.
        const generationBefore = shipyardControlGeneration(
          dependencies.controls,
        );
        const civicPanel = MAIN_TAB_PANELS[MAIN_TAB_INDEX.civic];
        if (civicPanel === undefined) return undefined;
        const playerMainTab = settings[MAIN_TAB_SETTING];
        const playerSubTab = settings[GOV_TABS_SETTING];
        const playerAnimated = settings["animated"];
        const playerPanel =
          typeof playerMainTab === "number"
            ? MAIN_TAB_PANELS[playerMainTab]
            : undefined;
        // Refused rather than opened without protection: the routes below clear every panel in the
        // tab, and this is the only thing standing between them and the player's own Civic panel.
        const workspace = dependencies.panels.open({
          keep: playerPanel,
          scratch: civicPanel,
        });
        if (workspace === undefined) {
          reportError(
            "the Civic panel could not be put beyond the game's reach",
          );
          return undefined;
        }
        const host = hiddenHostElement(
          dependencies.getDocument(),
          CAPTURED_OUTER_FLEET_SHIPYARD_PANEL_ID,
        );
        if (host === undefined) {
          workspace.release();
          reportError(
            `no scratch ${CAPTURED_OUTER_FLEET_SHIPYARD_PANEL_ID} could be stood up`,
          );
          return undefined;
        }
        let drew = false;
        let yardPassRestored = false;
        let yardStagedCatalog: GameShipyardPartCatalogCandidate | undefined;
        yardPassCheckpoint = dependencies.controls.checkpoint();
        try {
          settings[MAIN_TAB_SETTING] = MAIN_TAB_INDEX.civic;
          settings[GOV_TABS_SETTING] = GOV_TAB_INDEX.dwarfShipYard;
          settings["animated"] = false;
          dependencies.mountSuppression.withoutMounting(() => {
            drew = drawCapturedShipyard(
              dependencies.controls,
              synthesis,
              reportError,
            );
          });
          // Inside the host's lifetime, because that is the whole of it: the draw has already rendered
          // the yard's entire part catalogue into `#shipPlans`, and the `finally` below takes the host
          // — and every option in it — away again. Handing it over here is what keeps this catalogue
          // from being bought later by a second draw of the same thing. A draw that produced no
          // `#shipPlans` at all is the refusal reported further down, not a reading that went wrong.
          const plans = scratchPlansElement(
            dependencies.getDocument(),
            host.element,
          );
          if (plans !== undefined)
            yardStagedCatalog = dependencies.parts.stageFrom(plans);
        } finally {
          let yardSettingsRestored = false;
          let yardHostRemoved = false;
          try {
            settings[MAIN_TAB_SETTING] = playerMainTab;
            settings[GOV_TABS_SETTING] = playerSubTab;
            settings["animated"] = playerAnimated;
            yardSettingsRestored =
              Object.is(settings[MAIN_TAB_SETTING], playerMainTab) &&
              Object.is(settings[GOV_TABS_SETTING], playerSubTab) &&
              Object.is(settings["animated"], playerAnimated);
          } finally {
            try {
              yardHostRemoved = removeHiddenHostElement(host);
            } finally {
              workspace.release();
            }
          }
          yardPassRestored =
            yardSettingsRestored && yardHostRemoved && workspace.isIntact();
          if (!yardPassRestored)
            reportError("the workspace could not put the panels back");
        }
        if (!drew) {
          reportError("the shipyard draw did not run");
          return undefined;
        }
        if (!yardPassRestored) return undefined;
        const control = reboundShipyardControl(
          dependencies.controls,
          generationBefore,
        );
        if (control === undefined) {
          reportError(
            dependencies.controls.resolve(
              CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL,
            ) === undefined
              ? `no ${CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL} captured`
              : `${CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL} was not rebound by this capture`,
          );
          return undefined;
        }
        yardStagedCatalog?.commit();
        yardPassSucceeded = true;
        return control;
      } catch (error) {
        reportError(String(error));
        return undefined;
      } finally {
        if (yardPassCheckpoint !== undefined && !yardPassSucceeded) {
          dependencies.controls.rejectChanges(yardPassCheckpoint);
        }
        drawing = false;
      }
    },

    rowFor(ship: unknown): CapturedOuterFleetShipRow | undefined {
      try {
        return provenShipRow(
          dependencies.controls,
          dependencies.getPageWindow(),
          ship,
          () => {},
          () => true,
        );
      } catch (error) {
        reportError(String(error));
        return undefined;
      }
    },

    captureRow(ship: unknown): CapturedOuterFleetShipRow | undefined {
      // A ship the yard does not list has no row to bind; refusing here also keeps the caller's
      // object identity from being an accident about a stale index.
      const control = dependencies.controls.resolve(
        CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL,
      );
      if (
        control === undefined ||
        !shipyardControlIsEstablished(control) ||
        liveShipIndex(capturedOuterFleetShipList(control), ship) < 0
      ) {
        return undefined;
      }
      const settings = readProperty(
        dependencies.rootState.readRoot(),
        "settings",
      );
      // First, the game's own row. Two states of the page have one already drawn and current, and in
      // both the scratch route below is the wrong tool: preload mode retains every tab, and a yard the
      // player is looking at is refreshed by `buildTPShip()`'s own `drawShips()` a moment earlier.
      // Redrawing either one would have the automation redraw a panel the game already owns.
      const rendered = renderedShipRow(
        dependencies.controls,
        dependencies.getDocument(),
        dependencies.getPageWindow(),
        ship,
        reportError,
      );
      if (rendered !== undefined) return rendered;
      const synthesis = dependencies.synthesis;
      if (drawing || synthesis === undefined || !synthesis.available) {
        return undefined;
      }
      if (!dependencies.mountSuppression.available) return undefined;
      drawing = true;
      let rowPassCheckpoint: ControlCaptureCheckpoint | undefined;
      let rowPassSucceeded = false;
      try {
        // Preload mode keeps every tab drawn, `loadTab('mTabCivic')` calls `drawShipYard()` itself and
        // `drawShips()` skips its tab gate entirely — so a missing row here means the game did not
        // produce the control the mode is supposed to hold, not that a draw is owed.
        if (isRecord(settings) && settings["tabLoad"] === true) {
          reportError(
            "preload mode keeps every tab drawn, so the yard's own row for that ship should already be bound and rendered",
          );
          return undefined;
        }
        const civicPanel = MAIN_TAB_PANELS[MAIN_TAB_INDEX.civic];
        if (civicPanel === undefined) return undefined;
        // The whole Civic panel is kept by name, which is what takes the player's own `#shipList` and
        // its rows out of the game's reach: `drawShips()` clears and refills whatever `#shipList`
        // resolves to, and a capture must never be the reason their yard was redrawn.
        const workspace = dependencies.panels.open({
          keep: civicPanel,
          scratch: civicPanel,
        });
        if (workspace === undefined) {
          reportError(
            "the Civic panel could not be put beyond the game's reach",
          );
          return undefined;
        }
        const list = hiddenHostElement(
          dependencies.getDocument(),
          CAPTURED_OUTER_FLEET_SHIP_LIST_ID,
        );
        if (list === undefined) {
          workspace.release();
          reportError(
            `no scratch ${CAPTURED_OUTER_FLEET_SHIP_LIST_ID} could be stood up`,
          );
          return undefined;
        }
        const borrow = yardDrawBorrow(
          settings,
          capturedOuterFleetYardView(control),
        );
        if (borrow === undefined) {
          removeHiddenHostElement(list);
          workspace.release();
          return undefined;
        }
        // Read immediately before the draw. The target's own index can change inside it, so the
        // comparison afterwards is per element id rather than per ship.
        const generationsBefore = shipRowGenerations(dependencies.controls);
        let drew = false;
        let rowPassRestored = false;
        rowPassCheckpoint = dependencies.controls.checkpoint();
        try {
          borrow.open(ship);
          dependencies.mountSuppression.withoutMounting(() => {
            const result = synthesis.invoke({
              elementId: CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL,
              method: OUTER_FLEET_SHIPYARD_REDRAW_METHOD,
            });
            drew = result.ok;
            if (!result.ok) {
              reportError(
                `${CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL} ${OUTER_FLEET_SHIPYARD_REDRAW_METHOD} failed: ${result.reason} ${result.detail ?? ""}`,
              );
            }
          });
        } finally {
          let rowBorrowRestored = false;
          let rowHostRemoved = false;
          try {
            rowBorrowRestored = borrow.restore();
          } finally {
            try {
              rowHostRemoved = removeHiddenHostElement(list);
            } finally {
              workspace.release();
            }
          }
          rowPassRestored =
            rowBorrowRestored && rowHostRemoved && workspace.isIntact();
          if (!rowPassRestored)
            reportError("the workspace could not put the panels back");
        }
        if (!drew) {
          reportError("the shipyard did not redraw its ship list");
          return undefined;
        }
        if (!rowPassRestored) return undefined;
        const provenFreshShipRow = provenShipRow(
          dependencies.controls,
          dependencies.getPageWindow(),
          ship,
          reportError,
          (elementId) => {
            const row = dependencies.controls.resolve(elementId);
            return (
              row !== undefined &&
              row.generation > (generationsBefore.get(elementId) ?? 0)
            );
          },
        );
        rowPassSucceeded = provenFreshShipRow !== undefined;
        return provenFreshShipRow;
      } catch (error) {
        reportError(String(error));
        return undefined;
      } finally {
        if (rowPassCheckpoint !== undefined && !rowPassSucceeded) {
          dependencies.controls.rejectChanges(rowPassCheckpoint);
        }
        drawing = false;
      }
    },
  });
}
