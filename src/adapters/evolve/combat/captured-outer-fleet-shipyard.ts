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
 * `tabLoad` is the one condition that refuses outright. With every tab retained, both routes are
 * no-ops by the game's own guard, and running them without that guard would clear panels this
 * workspace does not cover.
 *
 * Freshness is the whole question here, because `shipPlans` outlives the draw: the generation before
 * the call is read, the call must report that it drew, and the resolved control must carry a
 * generation produced after it together with every method this feature reaches for. A draw that
 * returned early — no shipyard, no `showShipYard`, a True Path run the game does not ship for — is
 * refused rather than answered with a control an earlier draw left behind.
 */
import type {
  GameControlHandle,
  GameControlRegistry,
} from "../../../ports/game-control-registry.ts";
import type { GameControlSynthesis } from "../../../ports/game-control-synthesis.ts";
import type { GameMountSuppression } from "../../../ports/game-mount-suppression.ts";
import type { GamePanelWorkspace } from "../../../ports/game-panel-workspace.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";
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

/** The control the game binds its `#shipPlans` markup to: blueprint, parts, build, dispatch. */
export const CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL = "shipPlans";

/** The panel `drawShipYard()` draws into, and the element a shipyard host has to stand in for. */
export const CAPTURED_OUTER_FLEET_SHIPYARD_PANEL_ID = "dwarfShipYard";

/** The ship-row method whose closure is the only route to `sendShipTo(id, region)`. */
export const CAPTURED_OUTER_FLEET_DISPATCH_TRIGGER_METHOD = "pickDest";

/**
 * The yard's own answer to "is this ship under way", which is `shipMoving(ships[id])`. Read by
 * index, so it is asked of the ship's position *after* the dispatch: `drawShips()` re-sorts and
 * re-clusters the yard's list, and the index a ship was built at is not the one it sails from.
 */
export const CAPTURED_OUTER_FLEET_UNDERWAY_METHOD = "show";

/** The tab components' own switch method, for the main tab and for the Civic sub-tabs. */
const TAB_SWAP_METHOD = "swapTab";

/**
 * Every method this feature reaches the yard through, so a control that answers with a plausible
 * generation but a partial binding is refused. `build` is the build itself, `pickDest` the dispatch,
 * `show` the postcondition, `drawShips` what `setVal` and `build` redraw through, and `powerText`
 * the power gate.
 */
const OUTER_FLEET_SHIPYARD_METHODS: readonly string[] = Object.freeze([
  "build",
  "drawShips",
  "pickDest",
  "powerText",
  "show",
]);

export interface CapturedOuterFleetShipyardDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  /** Absent when no Vue hook is installed; the capture then fails closed. */
  readonly synthesis: GameControlSynthesis | undefined;
  readonly mountSuppression: GameMountSuppression;
  readonly panels: GamePanelWorkspace;
  readonly getDocument: () => unknown;
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
   * rebound, or `undefined` when it rebound nothing. Never carried past the call.
   */
  establish(): GameControlHandle | undefined;
}

interface ShipyardHost {
  readonly parent: unknown;
  readonly element: unknown;
}

/**
 * The hidden `#dwarfShipYard` the game's draw will find and fill. Refused when the id is already
 * taken: a real shipyard owns it then, and a capture must never clear or refill the player's panel
 * because it resolved to the same element.
 */
function capturedShipyardHost(document: unknown): ShipyardHost | undefined {
  if (!isRecord(document)) return undefined;
  const getElementById = readProperty(document, "getElementById");
  if (typeof getElementById === "function") {
    const owner = Reflect.apply(getElementById, document, [
      CAPTURED_OUTER_FLEET_SHIPYARD_PANEL_ID,
    ]);
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
  Reflect.set(element, "id", CAPTURED_OUTER_FLEET_SHIPYARD_PANEL_ID);
  const style = readProperty(element, "style");
  if (isRecord(style)) Reflect.set(style, "display", "none");
  Reflect.apply(appendChild, parent, [element]);
  return { parent, element };
}

function removeCapturedShipyardHost(host: ShipyardHost): void {
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

function shipyardControlGeneration(controls: GameControlRegistry): number {
  return (
    controls.resolve(CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL)?.generation ?? 0
  );
}

function reboundShipyardControl(
  controls: GameControlRegistry,
  minimumGeneration: number,
): GameControlHandle | undefined {
  const control = controls.resolve(CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL);
  return control !== undefined &&
    control.generation > minimumGeneration &&
    OUTER_FLEET_SHIPYARD_METHODS.every((method) =>
      control.methods.includes(method),
    )
    ? control
    : undefined;
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

export function createCapturedOuterFleetShipyard(
  dependencies: CapturedOuterFleetShipyardDependencies,
): CapturedOuterFleetShipyard {
  const reportError = dependencies.onEstablishError ?? (() => {});
  let establishing = false;

  return Object.freeze({
    control(): GameControlHandle | undefined {
      return dependencies.controls.resolve(
        CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL,
      );
    },
    established(control: GameControlHandle | undefined): boolean {
      return (
        control !== undefined &&
        OUTER_FLEET_SHIPYARD_METHODS.every((method) =>
          control.methods.includes(method),
        )
      );
    },
    establish(): GameControlHandle | undefined {
      const synthesis = dependencies.synthesis;
      if (establishing || synthesis === undefined || !synthesis.available) {
        return undefined;
      }
      if (!dependencies.mountSuppression.available) return undefined;
      establishing = true;
      try {
        const settings = readProperty(
          dependencies.rootState.readRoot(),
          "settings",
        );
        if (!isRecord(settings)) return undefined;
        if (settings["tabLoad"] === true) {
          reportError(
            "the game retains every tab, so neither route to the shipyard draw would run",
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
        const host = capturedShipyardHost(dependencies.getDocument());
        if (host === undefined) {
          workspace.release();
          reportError(
            `no scratch ${CAPTURED_OUTER_FLEET_SHIPYARD_PANEL_ID} could be stood up`,
          );
          return undefined;
        }
        let drew = false;
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
        } finally {
          settings[MAIN_TAB_SETTING] = playerMainTab;
          settings[GOV_TABS_SETTING] = playerSubTab;
          settings["animated"] = playerAnimated;
          removeCapturedShipyardHost(host);
          workspace.release();
          if (!workspace.isIntact()) {
            reportError("the workspace could not put the panels back");
          }
        }
        if (!drew) {
          reportError("the shipyard draw did not run");
          return undefined;
        }
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
        }
        return control;
      } catch (error) {
        reportError(String(error));
        return undefined;
      } finally {
        establishing = false;
      }
    },
  });
}
