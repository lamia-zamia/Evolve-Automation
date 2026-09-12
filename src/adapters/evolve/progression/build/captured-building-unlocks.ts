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
 * The `space` region is the exception and needs both of its panels. `space(zone)` draws the inner
 * system into `#space` at `spaceTabs === 1` and the outer system into `#outerSol` at `5`, but
 * `setAction` remaps the outer tab back to `space` before taking the id, so an outer building such
 * as `space-titan_spaceport` carries the same `space-` prefix as an inner one. Reading only one of
 * the two would report every building in the other half as not offered.
 */

import type { GameDrawnActionsReader } from "../../../../ports/game-drawn-actions.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import type { GameTabDiscovery } from "../../../../ports/game-tab-discovery.ts";
import type {
  BuildingUnlockSample,
  GameBuildingUnlockReader,
} from "../../../../ports/game-building-unlocks.ts";
import {
  MAIN_TAB_CONTROL,
  MAIN_TAB_SETTING,
  SUB_TAB_CONTROLS,
} from "../../captured-tab-discovery.ts";

/** The main tab every building region is drawn under. */
const BUILDING_TAB_INDEX = 1;

interface RegionPanel {
  /** The container the region's `setAction` calls append into. */
  readonly container: string;
  /** The `spaceTabs` selection that lets that region draw. */
  readonly subTab: number;
}

/**
 * Region key to the panels that hold its rows. A region with more than one panel is only answered
 * when every one of them was read.
 */
const REGION_PANELS: Readonly<Record<string, readonly RegionPanel[]>> =
  Object.freeze({
    city: Object.freeze([Object.freeze({ container: "#city", subTab: 0 })]),
    space: Object.freeze([
      Object.freeze({ container: "#space", subTab: 1 }),
      Object.freeze({ container: "#outerSol", subTab: 5 }),
    ]),
    interstellar: Object.freeze([
      Object.freeze({ container: "#interstellar", subTab: 2 }),
    ]),
    galaxy: Object.freeze([Object.freeze({ container: "#galaxy", subTab: 3 })]),
    portal: Object.freeze([Object.freeze({ container: "#portal", subTab: 4 })]),
    tauceti: Object.freeze([
      Object.freeze({ container: "#tauceti", subTab: 6 }),
    ]),
    eden: Object.freeze([Object.freeze({ container: "#eden", subTab: 7 })]),
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
      if (rootState.readRoot() === undefined) {
        reportSkipped("*", "the game root has not been captured yet");
        return undefined;
      }
      const subTabControl = SUB_TAB_CONTROLS["spaceTabs"];
      if (subTabControl === undefined) {
        reportSkipped("*", "the space-tab control is unavailable");
        return undefined;
      }

      const unlocked = new Set<string>();
      const sampled = new Set<string>();
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
        let complete = true;
        for (const panel of panels) {
          const path = Object.freeze([
            Object.freeze({
              setting: MAIN_TAB_SETTING,
              control: MAIN_TAB_CONTROL,
              index: BUILDING_TAB_INDEX,
            }),
            Object.freeze({
              setting: "spaceTabs",
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
        sampled.add(region);
      }
      if (sampled.size === 0) return undefined;
      return Object.freeze({
        unlocked: Object.freeze(unlocked) as ReadonlySet<string>,
        regions: Object.freeze(sampled) as ReadonlySet<string>,
      });
    },
  });
}
