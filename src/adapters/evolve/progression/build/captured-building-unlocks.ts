/**
 * Reading each region's drawn building rows from the game's own panels.
 *
 * Every region draws into one container behind one `spaceTabs` selection, verified against
 * DeadSpace 1.5.0: `drawCity` needs `spaceTabs === 0` and fills `#city`, `deepSpace` needs `2` and
 * fills `#interstellar`, `galaxySpace` `3` and `#galaxy`, `renderFortress` `4` and `#portal`,
 * `renderTauCeti` `6` and `#tauceti`, `renderEdenic` `7` and `#eden`. All of them sit under main
 * tab 1, and each clears its container before it decides whether to fill it, so a region whose
 * gate fails reads as an empty panel rather than a missing one.
 *
 * Two regions need more than one panel, because `setAction` appends a row to the container named by
 * the tab it was drawn for while taking the row's id from the action definition, so one id prefix
 * can be spread across two containers. `space(zone)` draws the inner system into `#space` at
 * `spaceTabs === 1` and the outer system into `#outerSol` at `5`, and `space-titan_spaceport`
 * therefore carries the same `space-` prefix as an inner building. `underground` is split further
 * still: `renderUnderground` fills `#underground` at `spaceTabs === 8`, while the cave perks —
 * `underground-core_tap_perk` and the rest — are drawn by `drawPerkUnderground` into
 * `#perkUnderground`, which is a *civics* sub-tab (`govTabs === 4`) under a different main tab
 * entirely. Reading only one panel of either region would report every building in the other half
 * as not offered, so a panel carries its own main tab and sub-tab setting rather than assuming
 * `spaceTabs`.
 *
 * `renderUnderground` and `renderSurface` also gate differently from every other region: they
 * return on `global.settings.showUnderground` / `showSurface` *before* clearing their container,
 * where the rest clear first and then decide whether to fill. A panel guarded that way can hold
 * rows the game is no longer offering, so it is answered from the flag instead of being drawn: the
 * tab is hidden, nothing in it is offered, and the stale markup is never read.
 *
 * The same rows carry the power switch. `setAction` draws a `span.on`/`span.off` pair onto a
 * building whose own gate passed and draws neither onto one whose gate did not, so this pass
 * answers how many copies are on and off without a second draw for the regions it already paid
 * for.
 */

import type { GameDrawnActionsReader } from "../../../../ports/game-drawn-actions.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import type { GameTabDiscovery } from "../../../../ports/game-tab-discovery.ts";
import type {
  BuildingSwitchState,
  BuildingUnlockSample,
  GameBuildingUnlockReader,
} from "../../../../ports/game-building-unlocks.ts";
import {
  GOV_TABS_SETTING,
  GOV_TAB_INDEX,
  MAIN_TAB_CONTROL,
  MAIN_TAB_INDEX,
  MAIN_TAB_SETTING,
  SPACE_TABS_SETTING,
  SPACE_TAB_INDEX,
  SUB_TAB_CONTROLS,
} from "../../captured-tab-discovery.ts";
import { isRecord, readProperty } from "../../../validation.ts";

interface RegionPanel {
  /** The container the region's `setAction` calls append into. */
  readonly container: string;
  /** The main tab the panel's sub-tab group sits under. */
  readonly mainTab: number;
  /** The sub-tab setting whose selection lets this panel draw. */
  readonly subTabSetting: string;
  /** That setting's selection for this panel. */
  readonly subTab: number;
  /**
   * A `global.settings` flag the panel's draw tests before it clears its container. When it is off
   * the panel is not drawn and whatever it holds is stale, so the panel contributes no rows and is
   * not visited: the tab is hidden and nothing in it is on offer. Absent for the panels that clear
   * first, which are answered by drawing them.
   */
  readonly shownBy?: string;
}

/** The two `global.settings` flags whose regions return before clearing their container. */
const SHOW_UNDERGROUND_SETTING = "showUnderground";
const SHOW_SURFACE_SETTING = "showSurface";

/**
 * Whether the game is currently showing a panel's tab. The flag is created only when the region
 * unlocks and is cleared again by a prestige reset, so an absent one is a tab that has never been
 * shown rather than a missing read.
 */
function isPanelShown(gameSettings: unknown, flag: string): boolean {
  if (!isRecord(gameSettings)) return false;
  return readProperty(gameSettings, flag) === true;
}

/** A panel behind a civilization sub-tab, which is all but one of them. */
function spacePanel(
  container: string,
  subTab: number,
  extra?: { readonly shownBy: string },
): RegionPanel {
  return Object.freeze({
    container,
    mainTab: MAIN_TAB_INDEX.civilization,
    subTabSetting: SPACE_TABS_SETTING,
    subTab,
    ...(extra ?? {}),
  });
}

/**
 * Region key to the panels that hold its rows. A region with more than one panel is only answered
 * when every one of them was read. The tab selections are the shared discovery coordinates; the
 * containers stay here because they name what each region draws into, not which tab that is.
 */
const REGION_PANELS: Readonly<Record<string, readonly RegionPanel[]>> =
  Object.freeze({
    city: Object.freeze([spacePanel("#city", SPACE_TAB_INDEX.city)]),
    space: Object.freeze([
      spacePanel("#space", SPACE_TAB_INDEX.space),
      spacePanel("#outerSol", SPACE_TAB_INDEX.outerSol),
    ]),
    interstellar: Object.freeze([
      spacePanel("#interstellar", SPACE_TAB_INDEX.interstellar),
    ]),
    galaxy: Object.freeze([spacePanel("#galaxy", SPACE_TAB_INDEX.galaxy)]),
    portal: Object.freeze([spacePanel("#portal", SPACE_TAB_INDEX.portal)]),
    tauceti: Object.freeze([spacePanel("#tauceti", SPACE_TAB_INDEX.tauceti)]),
    eden: Object.freeze([spacePanel("#eden", SPACE_TAB_INDEX.eden)]),
    underground: Object.freeze([
      spacePanel("#underground", SPACE_TAB_INDEX.underground, {
        shownBy: SHOW_UNDERGROUND_SETTING,
      }),
      // The cave perks are a civics sub-tab, not a civilization one, and they carry the same
      // `underground-` prefix as the rows above.
      Object.freeze({
        container: "#perkUnderground",
        mainTab: MAIN_TAB_INDEX.civic,
        subTabSetting: GOV_TABS_SETTING,
        subTab: GOV_TAB_INDEX.perkUnderground,
      }),
    ]),
    surface: Object.freeze([
      spacePanel("#surface", SPACE_TAB_INDEX.surface, {
        shownBy: SHOW_SURFACE_SETTING,
      }),
    ]),
  });

export interface CapturedBuildingUnlocksDependencies {
  readonly rootState: GameRootStateSource;
  readonly discovery: GameTabDiscovery;
  readonly drawnActions: GameDrawnActionsReader;
  /** Reports a region that could not be drawn. That region is omitted, never guessed at. */
  readonly onSkipped?: (region: string, reason: string) => void;
}

export function createCapturedBuildingUnlocks(
  dependencies: CapturedBuildingUnlocksDependencies,
): GameBuildingUnlockReader {
  const { rootState, discovery, drawnActions } = dependencies;
  const reportSkipped = dependencies.onSkipped ?? (() => {});

  return Object.freeze({
    read(
      regions: ReadonlySet<string>,
    ): Readonly<BuildingUnlockSample> | undefined {
      if (regions.size === 0) return undefined;
      const root = rootState.readRoot();
      if (root === undefined) {
        reportSkipped("*", "the game root has not been captured yet");
        return undefined;
      }
      const gameSettings = readProperty(root, "settings");

      const unlocked = new Set<string>();
      const sampled = new Set<string>();
      const switchStates = new Map<string, Readonly<BuildingSwitchState>>();
      for (const region of regions) {
        const panels = REGION_PANELS[region];
        if (panels === undefined) {
          // Not a region the game draws buildings into, so there is no panel to read. The operand
          // stays unanswered rather than reporting every id under it as locked.
          reportSkipped(region, "not a building region");
          continue;
        }
        // A region is only answered when every panel holding its rows was read, because a missed
        // panel would report the buildings in it as not offered.
        const ids: string[] = [];
        const states = new Map<string, Readonly<BuildingSwitchState>>();
        let complete = true;
        for (const panel of panels) {
          // A panel whose draw checks its visibility flag before clearing is answered from that
          // flag: with the tab hidden nothing in it is offered, and its container may still hold
          // rows from before it was hidden. Reading it would report those as on offer.
          if (
            panel.shownBy !== undefined &&
            !isPanelShown(gameSettings, panel.shownBy)
          ) {
            continue;
          }
          const subTabControl = SUB_TAB_CONTROLS[panel.subTabSetting];
          if (subTabControl === undefined) {
            complete = false;
            reportSkipped(
              region,
              `the ${panel.subTabSetting} control is unavailable`,
            );
            break;
          }
          const path = Object.freeze([
            Object.freeze({
              setting: MAIN_TAB_SETTING,
              control: MAIN_TAB_CONTROL,
              index: panel.mainTab,
            }),
            Object.freeze({
              setting: panel.subTabSetting,
              control: subTabControl,
              index: panel.subTab,
            }),
          ]);
          let read = false;
          const result = discovery.discover(path, {
            isPanelDrawn: () => drawnActions.exists(panel.container),
            whileDrawn: () => {
              // The container has to be there before its emptiness means anything. Each region
              // draw clears its container and then decides whether to fill it, so a present but
              // empty panel is the game saying "nothing offered here" — while a container that
              // never materialized is a panel nobody drew, and reading zero rows from it would
              // report every building in the region as locked.
              if (!drawnActions.exists(panel.container)) return;
              for (const action of drawnActions.read(
                `${panel.container} .action`,
              )) {
                ids.push(action.id);
                // Only the rows the game drew a switch onto report one. A row without the pair
                // has no power state, which is a different answer from a region nobody drew and
                // is kept apart from one by the region set the sample carries.
                if (action.state !== undefined) {
                  states.set(action.id, action.state);
                }
              }
              read = true;
            },
          });
          if (result.outcome.status !== "succeeded" || !read) {
            complete = false;
            reportSkipped(
              region,
              result.outcome.status === "succeeded"
                ? `${panel.container} was not drawn`
                : (result.outcome.failure?.message ?? result.outcome.status),
            );
            break;
          }
        }
        if (!complete) continue;
        for (const id of ids) unlocked.add(id);
        for (const [id, state] of states) switchStates.set(id, state);
        sampled.add(region);
      }
      if (sampled.size === 0) return undefined;
      return Object.freeze({
        unlocked: Object.freeze(unlocked) as ReadonlySet<string>,
        regions: Object.freeze(sampled) as ReadonlySet<string>,
        states: Object.freeze(switchStates) as ReadonlyMap<
          string,
          Readonly<BuildingSwitchState>
        >,
      });
    },
  });
}
