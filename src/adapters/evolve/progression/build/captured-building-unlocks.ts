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
 * The same rows say which buildings have a power switch at all. `setAction` draws a
 * `span.on`/`span.off` pair onto a building whose own gate passed — `switchable()`, or `powered`
 * with `high_tech >= 2` and `checkPowerRequirements`, all of them reads of the module-lexical
 * definition — and draws neither onto one whose gate did not. That is a discovery answer and is
 * kept here.
 *
 * The counts in those spans are not. `on` is a live field of the game's own state record and the
 * ceiling is the row component's own `on_cap()`, both readable at any time, so re-reading a
 * player's power allocation must not cost a draw. What this pass records instead is where each
 * switch's state record lives — see `BuildingStateAddress`, and `captured-building-switch-states`
 * for the cycle-rate read that uses it.
 */

import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameDrawnActionsReader } from "../../../../ports/game-drawn-actions.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import type { GameTabDiscovery } from "../../../../ports/game-tab-discovery.ts";
import type {
  BuildingStateAddress,
  BuildingUnlockCatalog,
  GameBuildingUnlockCatalogReader,
} from "../../../../ports/game-building-unlocks.ts";
import {
  GOV_TABS_SETTING,
  GOV_TAB_INDEX,
  MAIN_TAB_CONTROL,
  MAIN_TAB_INDEX,
  MAIN_TAB_SETTING,
  SPACE_TABS_SETTING,
  SPACE_TAB_INDEX,
  SPACE_TAB_PANELS,
  SPACE_TAB_SHOWN_BY,
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

/**
 * The two regions whose draw returns on their visibility flag *before* clearing their container.
 * Every space tab has such a flag; only these two are answered from it, because only for these two
 * does a hidden tab mean the container still holds rows the game has stopped offering.
 */
const SHOW_UNDERGROUND_SETTING = shownBySetting(SPACE_TAB_INDEX.underground);
const SHOW_SURFACE_SETTING = shownBySetting(SPACE_TAB_INDEX.surface);

/** The visibility flag a space tab is listed under, refusing an index the table does not name. */
function shownBySetting(subTab: number): string {
  const setting = SPACE_TAB_SHOWN_BY[subTab];
  if (setting === undefined) {
    throw new Error(`no visibility flag for spaceTabs ${subTab}`);
  }
  return setting;
}

/**
 * Whether the game is currently showing a panel's tab. The flag is created only when the region
 * unlocks and is cleared again by a prestige reset, so an absent one is a tab that has never been
 * shown rather than a missing read.
 */
function isPanelShown(gameSettings: unknown, flag: string): boolean {
  if (!isRecord(gameSettings)) return false;
  return readProperty(gameSettings, flag) === true;
}

/**
 * A panel behind a civilization sub-tab, which is all but one of them. The container comes from
 * the shared tab table rather than being repeated here, so the sweep that only knows tab indices
 * and this table that only knows region keys name the same element.
 */
function spacePanel(
  subTab: number,
  extra?: { readonly shownBy: string },
): RegionPanel {
  const container = SPACE_TAB_PANELS[subTab];
  if (container === undefined) {
    throw new Error(`no panel container for spaceTabs ${subTab}`);
  }
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
 * when every one of them was read.
 */
const REGION_PANELS: Readonly<Record<string, readonly RegionPanel[]>> =
  Object.freeze({
    city: Object.freeze([spacePanel(SPACE_TAB_INDEX.city)]),
    space: Object.freeze([
      spacePanel(SPACE_TAB_INDEX.space),
      spacePanel(SPACE_TAB_INDEX.outerSol),
    ]),
    interstellar: Object.freeze([spacePanel(SPACE_TAB_INDEX.interstellar)]),
    galaxy: Object.freeze([spacePanel(SPACE_TAB_INDEX.galaxy)]),
    portal: Object.freeze([spacePanel(SPACE_TAB_INDEX.portal)]),
    tauceti: Object.freeze([spacePanel(SPACE_TAB_INDEX.tauceti)]),
    eden: Object.freeze([spacePanel(SPACE_TAB_INDEX.eden)]),
    underground: Object.freeze([
      spacePanel(SPACE_TAB_INDEX.underground, {
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
      spacePanel(SPACE_TAB_INDEX.surface, {
        shownBy: SHOW_SURFACE_SETTING,
      }),
    ]),
  });

/**
 * Recovers the two keys that address a drawn switch's state record in the game root.
 *
 * The binding the game hands its own row component says which record it drew from: `data.act` *is*
 * `global[action][type]`. That reference is used once, here, while the draw is still on screen,
 * and then thrown away — the game reassigns `global` on every save load, prestige and reactivity
 * restore, and the superseded proxy stays readable and silently wrong. What is kept is the pair of
 * plain keys, which still names the right record in whatever root comes next.
 *
 * The element id is only a hint. `city-farm` is `global.city.farm` and the check costs one lookup,
 * but a definition carrying its own `region` keeps its id and moves its record — a cataclysm start
 * draws `space-nanite_factory` out of `global.city` — so a miss falls back to the same key under
 * another region, and then, if even that misses, to identity alone.
 */
function locateBuildingState(
  root: unknown,
  elementId: string,
  act: unknown,
): Readonly<BuildingStateAddress> | undefined {
  if (!isRecord(root) || !isRecord(act)) return undefined;
  const separator = elementId.indexOf("-");
  const type = separator > 0 ? elementId.slice(separator + 1) : "";
  if (type.length > 0) {
    const region = elementId.slice(0, separator);
    if (readProperty(readProperty(root, region), type) === act) {
      return Object.freeze({ region, type });
    }
    for (const candidate of Object.keys(root)) {
      const record = root[candidate];
      if (isRecord(record) && readProperty(record, type) === act) {
        return Object.freeze({ region: candidate, type });
      }
    }
  }
  for (const candidate of Object.keys(root)) {
    const record = root[candidate];
    if (!isRecord(record)) continue;
    for (const key of Object.keys(record)) {
      if (record[key] === act) {
        return Object.freeze({ region: candidate, type: key });
      }
    }
  }
  return undefined;
}

/**
 * Whether two catalogs are the same answer, which is what lets an unchanged resample widen the
 * interval before the next draw. Deliberately blind to power state: none of it is here.
 */
export function sameBuildingUnlockCatalog(
  previous: Readonly<BuildingUnlockCatalog>,
  next: Readonly<BuildingUnlockCatalog>,
): boolean {
  if (
    previous.unlocked.size !== next.unlocked.size ||
    previous.regions.size !== next.regions.size ||
    previous.switches.size !== next.switches.size
  ) {
    return false;
  }
  for (const id of previous.unlocked) if (!next.unlocked.has(id)) return false;
  for (const region of previous.regions) {
    if (!next.regions.has(region)) return false;
  }
  for (const [id, address] of previous.switches) {
    const after = next.switches.get(id);
    if (
      after === undefined ||
      after.region !== address.region ||
      after.type !== address.type
    ) {
      return false;
    }
  }
  return true;
}

export interface CapturedBuildingUnlocksDependencies {
  readonly rootState: GameRootStateSource;
  readonly discovery: GameTabDiscovery;
  readonly drawnActions: GameDrawnActionsReader;
  /** Supplies each drawn row's own Vue binding, which is how its state record is addressed. */
  readonly controls: GameControlRegistry;
  /** Reports a region that could not be drawn. That region is omitted, never guessed at. */
  readonly onSkipped?: (region: string, reason: string) => void;
  /**
   * Reports a drawn switch whose state record could not be found in the current root. That row
   * keeps its place in the offer set and loses only its power counts.
   */
  readonly onUnlocatedSwitch?: (elementId: string) => void;
}

export function createCapturedBuildingUnlocks(
  dependencies: CapturedBuildingUnlocksDependencies,
): GameBuildingUnlockCatalogReader {
  const { rootState, discovery, drawnActions, controls } = dependencies;
  const reportSkipped = dependencies.onSkipped ?? (() => {});
  const reportUnlocated = dependencies.onUnlocatedSwitch ?? (() => {});

  return Object.freeze({
    read(
      regions: ReadonlySet<string>,
    ): Readonly<BuildingUnlockCatalog> | undefined {
      if (regions.size === 0) return undefined;
      const root = rootState.readRoot();
      if (root === undefined) {
        reportSkipped("*", "the game root has not been captured yet");
        return undefined;
      }
      const gameSettings = readProperty(root, "settings");

      const unlocked = new Set<string>();
      const sampled = new Set<string>();
      const switches = new Map<string, Readonly<BuildingStateAddress>>();
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
        const addresses = new Map<string, Readonly<BuildingStateAddress>>();
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
                // Only the rows the game drew a switch onto have a power state at all. The counts
                // it rendered into those spans are deliberately not taken: they are restated live
                // every cycle, and reading them here would tie a player's power allocation to the
                // next draw.
                if (action.state === undefined) continue;
                const address = locateBuildingState(
                  root,
                  action.id,
                  readProperty(controls.resolve(action.id)?.data, "act"),
                );
                if (address === undefined) reportUnlocated(action.id);
                else addresses.set(action.id, address);
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
        for (const [id, address] of addresses) switches.set(id, address);
        sampled.add(region);
      }
      if (sampled.size === 0) return undefined;
      return Object.freeze({
        unlocked: Object.freeze(unlocked) as ReadonlySet<string>,
        regions: Object.freeze(sampled) as ReadonlySet<string>,
        switches: Object.freeze(switches) as ReadonlyMap<
          string,
          Readonly<BuildingStateAddress>
        >,
      });
    },
  });
}
