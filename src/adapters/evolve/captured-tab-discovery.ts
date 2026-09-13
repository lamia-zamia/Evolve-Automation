/**
 * One rendering pass over a tab the player is not looking at, so the game binds that tab's
 * controls and the capture picks them up.
 *
 * The game's main-tab component is bound at startup under the selector `#mainColumn div.content`,
 * and its `swapTab(index)` calls `loadTab(index)` whenever background panels are not retained. `loadTab`
 * draws that tab's panels — Civics builds jobs, the foundry, government, tax rates, the garrison
 * and foreign powers in one go — but several panels are gated a second time on their sub-tab, so a
 * path of steps is what actually names a panel. Measured against the 1.5.0 page: one pass over the
 * Civilization tab captured 40 city actions and nothing from space, because `space()` returns
 * unless `settings.spaceTabs` selects it; one pass over Civics captured all 34 job controls plus
 * the foundry, government, tax rates, garrison and foreign panels.
 *
 * Three things keep the pass from costing what a real tab switch costs. **Temporary components are
 * not mounted**: the game evaluates its offer rules and writes its markup before it calls `vBind`,
 * so the draw is authoritative without a Vue tree behind it, and the capture still records the
 * game-owned closures from the component options. **The panel already in front of the player is
 * observed where it stands**, because drawing the tab someone is looking at, to put them back on
 * the tab they are already on, is two redraws that produce what was there to begin with. And
 * **the player's panel is never touched**: a workspace hides it from the draw by aliasing the ids
 * in it, so `loadTab` cannot find it to clear it while every node stays where it was — including
 * the hover state and open tooltip a detach would cost — and there is nothing to rebuild and no
 * restoring `swapTab` at all. That holds for a path into the player's own main panel too, which is
 * both the panel the draw fills and the one that has to survive it. Only a path whose main tab
 * draws no panel this module can name falls back to the redraw.
 *
 * `settings.animated` is switched off for the pass, and that is what keeps it a pass rather than a
 * visible detour. With it on, `clearTabPanels` retains each outgoing panel behind a 300 ms
 * `setTimeout` for the slide, so the same out-and-back leaves the discovered tab mounted and
 * mid-animation after it returns — measured at 42 city action nodes and 6 `.tabFading` elements
 * still in the DOM. With it off, teardown is synchronous: the whole pass completes inside one
 * task, the browser paints no intermediate state, and nothing but the player's own tab is left
 * mounted.
 */

import type { GameControlRegistry } from "../../ports/game-control-registry.ts";
import type { GameMountSuppression } from "../../ports/game-mount-suppression.ts";
import type {
  GamePanelWorkspace,
  PanelWorkspace,
} from "../../ports/game-panel-workspace.ts";
import type { GameRootStateSource } from "../../ports/game-root-state.ts";
import type {
  GameTabDiscovery,
  TabDiscoveryOptions,
  TabDiscoveryResult,
  TabDiscoveryStep,
} from "../../ports/game-tab-discovery.ts";
import { rejected, stale, SUCCEEDED } from "../command-outcomes.ts";
import { isRecord, readProperty } from "../validation.ts";
import {
  createCountTally,
  createPhaseMeasure,
  type PhaseTimingSink,
} from "../../utils/performance.ts";

/**
 * The game binds its main-tab component to a compound selector, which the capture keeps whole
 * because the leading id alone does not name the element that was bound. Every discovery path
 * starts here.
 */
export const MAIN_TAB_CONTROL = "#mainColumn div.content";

/** The setting the main-tab component's own `v-model` writes. */
export const MAIN_TAB_SETTING = "civTabs";

/**
 * The sub-tab setting each group writes. The setting name and the `SUB_TAB_CONTROLS` key are the
 * same string upstream; naming each once keeps a rename to one edit.
 */
export const SPACE_TABS_SETTING = "spaceTabs";
export const GOV_TABS_SETTING = "govTabs";
export const MARKET_TABS_SETTING = "marketTabs";

/**
 * The game's sub-tab groups, straight from `index.js`: each main tab that has sub-tabs binds one
 * component holding them, and that component's `swapTab` writes the setting. These three are all
 * there are, and a gated panel is reached by a main-tab step followed by its sub-tab step.
 */
export const SUB_TAB_CONTROLS: Readonly<Record<string, string>> = Object.freeze(
  {
    [SPACE_TABS_SETTING]: "mTabCivil",
    [GOV_TABS_SETTING]: "mTabCivic",
    [MARKET_TABS_SETTING]: "mTabResource",
  },
);

/**
 * `index.js:mainTabPanel` — the panel each main tab draws into. Evolution and the tabs with no
 * panel of their own are deliberately absent: a pass that cannot name the panel it must protect
 * does not run, rather than clearing something it cannot put back.
 */
export const MAIN_TAB_PANELS: Readonly<Record<number, string>> = Object.freeze({
  1: "mTabCivil",
  2: "mTabCivic",
  3: "mTabResearch",
  4: "mTabResource",
  5: "mTabArpa",
  6: "mTabStats",
});

/**
 * Main-tab indices in `civTabs` order (`index.js:mainTabPanel`). Every discovery path starts with
 * one of these; an upstream renumbering is one edit here instead of a grep over every caller.
 * Evolution (0) draws no panel and is absent, like in `MAIN_TAB_PANELS`.
 */
export const MAIN_TAB_INDEX = Object.freeze({
  civilization: 1,
  civic: 2,
  research: 3,
  resources: 4,
  arpa: 5,
  stats: 6,
});

/**
 * `spaceTabs` selections in `b-tab-item` order (the civilization tab in `index.js`): 0 city,
 * 1 inner system, 2 interstellar, 3 galaxy, 4 hell fortress, 5 outer system, 6 Tau Ceti, 7 Eden,
 * 8 underground, 9 surface.
 */
export const SPACE_TAB_INDEX = Object.freeze({
  city: 0,
  space: 1,
  interstellar: 2,
  galaxy: 3,
  portal: 4,
  outerSol: 5,
  tauceti: 6,
  eden: 7,
  underground: 8,
  surface: 9,
});

/**
 * The container each `spaceTabs` panel appends its action rows into, from the region draws in
 * `space.js`, `portal.js`, `truepath.js` and `edenic.js`. One map so a caller that has a tab index
 * — the build-control sweep — and one that has a region key — the unlock catalog — cannot drift
 * apart on what an upstream rename did.
 */
export const SPACE_TAB_PANELS: Readonly<Record<number, string>> = Object.freeze(
  {
    [SPACE_TAB_INDEX.city]: "#city",
    [SPACE_TAB_INDEX.space]: "#space",
    [SPACE_TAB_INDEX.interstellar]: "#interstellar",
    [SPACE_TAB_INDEX.galaxy]: "#galaxy",
    [SPACE_TAB_INDEX.portal]: "#portal",
    [SPACE_TAB_INDEX.outerSol]: "#outerSol",
    [SPACE_TAB_INDEX.tauceti]: "#tauceti",
    [SPACE_TAB_INDEX.eden]: "#eden",
    [SPACE_TAB_INDEX.underground]: "#underground",
    [SPACE_TAB_INDEX.surface]: "#surface",
  },
);

/**
 * The `global.settings` flag whose truth makes each space sub-tab visible, from the `b-tab-item`
 * list in `index.js`. The game sets these as a run reaches each region, so they are its own answer
 * to "does this tab exist yet" — free to read, and the only thing that makes drawing a region tab
 * worth the pass.
 */
export const SPACE_TAB_SHOWN_BY: Readonly<Record<number, string>> =
  Object.freeze({
    [SPACE_TAB_INDEX.city]: "showCity",
    [SPACE_TAB_INDEX.space]: "showSpace",
    [SPACE_TAB_INDEX.interstellar]: "showDeep",
    [SPACE_TAB_INDEX.galaxy]: "showGalactic",
    [SPACE_TAB_INDEX.portal]: "showPortal",
    [SPACE_TAB_INDEX.outerSol]: "showOuter",
    [SPACE_TAB_INDEX.tauceti]: "showTau",
    [SPACE_TAB_INDEX.eden]: "showEden",
    [SPACE_TAB_INDEX.underground]: "showUnderground",
    [SPACE_TAB_INDEX.surface]: "showSurface",
  });

/**
 * The build-control sweep covers every space tab but the city: the bare main-tab path draws
 * whatever the player already has selected, and each of these gets its own pass. Derived from
 * the table so a new upstream tab joins the sweep with it.
 */
export const SPACE_TAB_SWEEP: readonly number[] = Object.freeze(
  Object.values(SPACE_TAB_INDEX).filter(
    (index) => index !== SPACE_TAB_INDEX.city,
  ),
);

/**
 * `govTabs` selections in `b-tab-item` order (the civics tab in `index.js`): 0 government,
 * 1 industry, 2 power grid, 3 military, and the gated perk tabs after it.
 */
export const GOV_TAB_INDEX = Object.freeze({
  civic: 0,
  industry: 1,
  powerGrid: 2,
  military: 3,
  perkUnderground: 4,
  mechLab: 5,
  dwarfShipYard: 6,
  psychicPowers: 7,
  supernatural: 8,
});

/**
 * `marketTabs` selections in `b-tab-item` order (the resources tab in `index.js`): 0 market,
 * 1 storage, 2 ejector, 3 supply, 4 alchemy, 5 supply zones.
 */
export const MARKET_TAB_INDEX = Object.freeze({
  market: 0,
  storage: 1,
  ejector: 2,
  supply: 3,
  alchemy: 4,
  supplyZones: 5,
});

const NOTHING: readonly string[] = Object.freeze([]);

export interface CapturedTabDiscoveryDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly mountSuppression: GameMountSuppression;
  readonly panels: GamePanelWorkspace;
  /**
   * Optional, explicitly enabled measurement of what the passes cost. A draw is the most expensive
   * thing this module does, and the counters below are what tell a caller whether its pass was a
   * draw at all, and whether the draw found anything that was not already captured.
   */
  readonly diagnostics?: PhaseTimingSink | undefined;
}

/**
 * The counter and phase name a path is tallied under: the tab selections it walks, which is what
 * distinguishes one pass from another. Built only while diagnostics are on.
 */
function describeTabPath(path: readonly Readonly<TabDiscoveryStep>[]): string {
  return path.map((step) => `${step.setting}:${step.index}`).join("/");
}

function failure(code: string, message: string): TabDiscoveryResult {
  return Object.freeze({
    outcome: rejected(code, message),
    discovered: NOTHING,
  });
}

/** Observing a panel that is already there discovers nothing: the game bound it when it drew it. */
function observed(whileDrawn: (() => void) | undefined): TabDiscoveryResult {
  if (whileDrawn !== undefined) {
    try {
      whileDrawn();
    } catch (error) {
      return failure("tab-observer-failed", String(error));
    }
  }
  return Object.freeze({ outcome: SUCCEEDED, discovered: NOTHING });
}

function isValidStep(step: unknown): boolean {
  const index = readProperty(step, "index");
  return (
    typeof readProperty(step, "setting") === "string" &&
    typeof readProperty(step, "control") === "string" &&
    typeof index === "number" &&
    Number.isSafeInteger(index) &&
    index >= 0
  );
}

export function createCapturedTabDiscovery(
  dependencies: CapturedTabDiscoveryDependencies,
): GameTabDiscovery {
  const { rootState, controls, mountSuppression, panels, diagnostics } =
    dependencies;

  return Object.freeze({
    discover(
      path: readonly Readonly<TabDiscoveryStep>[],
      options: Readonly<TabDiscoveryOptions> = {},
    ): TabDiscoveryResult {
      // Sampled per call, like every other measured phase, so the toggle takes effect on a page
      // that is already running instead of being frozen at construction.
      const tally = createCountTally(diagnostics);
      const measureDraw = createPhaseMeasure(diagnostics);
      tally.count("discovery.request");
      const refused = (code: string, message: string): TabDiscoveryResult => {
        tally.count("discovery.refused");
        return failure(code, message);
      };
      const { whileDrawn, isPanelDrawn, discard, mount } = options;
      const first = path[0];
      if (first === undefined) {
        return refused("empty-tab-path", "a discovery path names no panel");
      }
      if (!path.every(isValidStep)) {
        return refused(
          "invalid-tab-step",
          "a discovery step needs a setting, a control, and a non-negative index",
        );
      }
      const settings = readProperty(rootState.readRoot(), "settings");
      if (!isRecord(settings)) {
        return refused(
          "game-state-not-captured",
          "the game has not created its settings yet",
        );
      }
      // The panel is in front of the player already — every step names the tab their own settings
      // select. The game keeps that panel current itself, so there is nothing to draw and no reason
      // to touch their view.
      if (path.every((step) => settings[step.setting] === step.index)) {
        if (isPanelDrawn === undefined || isPanelDrawn()) {
          // The cheap answer: the game keeps this panel current itself, so the pass costs a read
          // and no draw at all. Counted apart from a draw because that is the whole difference.
          tally.count("discovery.observed");
          return observed(whileDrawn);
        }
      }

      const playerTabs = new Map<string, number>();
      for (const step of path) {
        const current = settings[step.setting];
        if (typeof current !== "number" || !Number.isFinite(current)) {
          // Without a tab to go back to, the pass has no way to leave the player where it found
          // them, so it does not start.
          return refused(
            "unknown-player-tab",
            `the game has not recorded settings.${step.setting}`,
          );
        }
        if (!playerTabs.has(step.setting))
          playerTabs.set(step.setting, current);
      }
      if (controls.resolve(first.control) === undefined) {
        return refused(
          "tab-control-missing",
          `no captured control for ${first.control}`,
        );
      }
      if (!mountSuppression.available) {
        // A pass that mounts what it draws is a full off-tab Vue render on the automation tick.
        // Report it and discover nothing rather than quietly paying for one.
        return refused(
          "mount-suppression-unavailable",
          "temporary component mounting cannot be suppressed",
        );
      }

      /**
       * The way back for a path this module cannot open a workspace for. Every setting is back to
       * the player's own before it runs, and `loadTab` builds the sub-panels from the settings it
       * finds, so one redraw of their main tab restores the whole view — at the cost of rebuilding
       * it, which is why it is the fallback and not the path.
       */
      const outermost = { control: first.control, setting: first.setting };
      function restorePlayerView(): string | undefined {
        const handle = controls.resolve(outermost.control);
        if (handle === undefined) {
          return `no captured control for ${outermost.control}`;
        }
        const restore = controls.invoke(handle, "swapTab", [
          playerTabs.get(outermost.setting),
        ]);
        return restore.ok ? undefined : (restore.detail ?? restore.reason);
      }

      // The player's own panel, hidden from the draw by name. `loadTab` finds its panels by id, so
      // one that does not answer to its id is one the draw can neither clear nor rebuild — and the
      // target panel becomes a disposable container whose whole output is dropped by one removal.
      const mountScope =
        mount === undefined || mount.length === 0
          ? {}
          : { shouldMount: (selector: string) => mount.includes(selector) };
      const discardScope =
        discard === undefined
          ? {}
          : {
              onComponentBound: (selector: string) => {
                if (selector !== discard.afterBinding) return;
                for (const container of discard.containers) {
                  workspace?.discard(container);
                }
              },
            };
      const playerPanel =
        MAIN_TAB_PANELS[playerTabs.get(MAIN_TAB_SETTING) ?? -1];
      const targetPanel = MAIN_TAB_PANELS[first.index];
      let workspace: PanelWorkspace | undefined;
      if (targetPanel !== undefined) {
        workspace = panels.open({ keep: playerPanel, scratch: targetPanel });
      }

      const before = new Set(controls.capturedElementIds());
      const playerAnimation = settings["animated"];
      let stepFailure: TabDiscoveryResult | undefined;
      let restoreFailure: string | undefined;
      let observerFailure: string | undefined;
      // The path label costs a join, so it is built only while the counters are live.
      const drawnPath = tally.enabled ? describeTabPath(path) : "";
      if (tally.enabled) {
        tally.count("discovery.draw");
        tally.count(`discovery.draw ${drawnPath}`);
      }
      measureDraw("discovery.draw", () => {
        try {
          settings["animated"] = false;
          // Only the target draw. Where the player's panel had to be redrawn instead of kept, that
          // rebuild happens in the restore below, outside this scope, with real Vue.
          mountSuppression.withoutMounting(
            () => {
              for (const step of path) {
                // Each step is drawn by the one before it, so its control is resolved at its turn: a
                // sub-tab component does not exist until its main tab has been built.
                const handle = controls.resolve(step.control);
                if (handle === undefined) {
                  stepFailure = failure(
                    "tab-control-missing",
                    `no captured control for ${step.control}`,
                  );
                  break;
                }
                // The game's tab components write this through their own `v-model`; called directly,
                // the caller owns it.
                settings[step.setting] = step.index;
                const swap = controls.invoke(handle, "swapTab", [step.index]);
                if (!swap.ok) {
                  const detail = swap.detail ?? swap.reason;
                  stepFailure = Object.freeze({
                    outcome:
                      swap.reason === "stale-control"
                        ? stale("stale-tab-control", detail)
                        : rejected("tab-draw-failed", detail),
                    discovered: NOTHING,
                  });
                  break;
                }
              }
              if (stepFailure === undefined && whileDrawn !== undefined) {
                // The only moment the panel’s rendered detail is both present and freshly computed.
                // An observer that throws is its own problem; it must not cost the player their tab.
                try {
                  whileDrawn();
                } catch (error) {
                  observerFailure = String(error);
                }
              }
            },
            { ...discardScope, ...mountScope },
          );
        } finally {
          for (const [setting, value] of playerTabs) settings[setting] = value;
          if (workspace === undefined) {
            restoreFailure = restorePlayerView();
          } else {
            workspace.release();
            if (!workspace.isIntact()) {
              restoreFailure = "the workspace could not put the panels back";
            }
          }
          settings["animated"] = playerAnimation;
        }
      });

      if (stepFailure !== undefined) {
        tally.count("discovery.draw.failed");
        return stepFailure;
      }
      const discovered = controls
        .capturedElementIds()
        .filter((id) => !before.has(id));
      if (tally.enabled) {
        // A draw that found nothing new is one this pass did not need: every control it could have
        // captured was already in the registry. That count against `discovery.draw` is the whole
        // measurement this instrumentation exists for.
        if (discovered.length === 0) tally.count("discovery.barren");
        else {
          tally.count("discovery.found", discovered.length);
          tally.count(`discovery.found ${drawnPath}`, discovered.length);
        }
      }
      return Object.freeze({
        // The draw worked and the way back did not: the discovered controls are real, and leaving
        // someone on a tab they did not choose is not a detail to swallow.
        outcome:
          observerFailure !== undefined
            ? rejected("tab-observer-failed", observerFailure)
            : restoreFailure === undefined
              ? SUCCEEDED
              : rejected("tab-restore-failed", restoreFailure),
        discovered: Object.freeze(discovered),
      });
    },
  });
}
