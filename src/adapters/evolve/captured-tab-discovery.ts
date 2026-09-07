/**
 * One rendering pass over a tab the player is not looking at, so the game binds that tab's
 * controls and the capture picks them up.
 *
 * The game's main-tab component is bound at startup under the selector `#mainColumn div.content`,
 * and its `swapTab(index)` calls `loadTab(index)` whenever Preload Tab Content is off. `loadTab`
 * draws that tab's panels — Civics builds jobs, the foundry, government, tax rates, the garrison
 * and foreign powers in one go — but several panels are gated a second time on their sub-tab, so a
 * path of steps is what actually names a panel. Measured against the 1.5.0 page: one pass over the
 * Civilization tab captured 40 city actions and nothing from space, because `space()` returns
 * unless `settings.spaceTabs` selects it; one pass over Civics captured all 34 job controls plus
 * the foundry, government, tax rates, garrison and foreign panels.
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
import type { GameRootStateSource } from "../../ports/game-root-state.ts";
import type {
  GameTabDiscovery,
  TabDiscoveryResult,
  TabDiscoveryStep,
} from "../../ports/game-tab-discovery.ts";
import { rejected, stale, SUCCEEDED } from "../command-outcomes.ts";
import { isRecord, readProperty } from "../validation.ts";

/**
 * The game binds its main-tab component to a compound selector, which the capture keeps whole
 * because the leading id alone does not name the element that was bound. Every discovery path
 * starts here.
 */
export const MAIN_TAB_CONTROL = "#mainColumn div.content";

/** The setting the main-tab component's own `v-model` writes. */
export const MAIN_TAB_SETTING = "civTabs";

/**
 * The game's sub-tab groups, straight from `index.js`: each main tab that has sub-tabs binds one
 * component holding them, and that component's `swapTab` writes the setting. These three are all
 * there are, and a gated panel is reached by a main-tab step followed by its sub-tab step.
 */
export const SUB_TAB_CONTROLS: Readonly<Record<string, string>> = Object.freeze(
  {
    spaceTabs: "mTabCivil",
    govTabs: "mTabCivic",
    marketTabs: "mTabResource",
  },
);

const NOTHING: readonly string[] = Object.freeze([]);

export interface CapturedTabDiscoveryDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
}

function failure(code: string, message: string): TabDiscoveryResult {
  return Object.freeze({
    outcome: rejected(code, message),
    discovered: NOTHING,
  });
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
  const { rootState, controls } = dependencies;

  return Object.freeze({
    discover(path: readonly Readonly<TabDiscoveryStep>[]): TabDiscoveryResult {
      const first = path[0];
      if (first === undefined) {
        return failure("empty-tab-path", "a discovery path names no panel");
      }
      if (!path.every(isValidStep)) {
        return failure(
          "invalid-tab-step",
          "a discovery step needs a setting, a control, and a non-negative index",
        );
      }
      const settings = readProperty(rootState.readRoot(), "settings");
      if (!isRecord(settings)) {
        return failure(
          "game-state-not-captured",
          "the game has not created its settings yet",
        );
      }
      // With Preload Tab Content on, every panel is already mounted and `swapTab` draws nothing.
      // There is nothing to discover and no reason to touch the player's view.
      if (settings["tabLoad"]) {
        return Object.freeze({ outcome: SUCCEEDED, discovered: NOTHING });
      }

      const playerTabs = new Map<string, number>();
      for (const step of path) {
        const current = settings[step.setting];
        if (typeof current !== "number" || !Number.isFinite(current)) {
          // Without a tab to go back to, the pass has no way to leave the player where it found
          // them, so it does not start.
          return failure(
            "unknown-player-tab",
            `the game has not recorded settings.${step.setting}`,
          );
        }
        if (!playerTabs.has(step.setting))
          playerTabs.set(step.setting, current);
      }
      if (controls.resolve(first.control) === undefined) {
        return failure(
          "tab-control-missing",
          `no captured control for ${first.control}`,
        );
      }

      /**
       * Every setting is back to the player's own before this runs, and `loadTab` builds the
       * sub-panels from the settings it finds, so one redraw of their main tab restores the whole
       * view.
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

      const before = new Set(controls.capturedElementIds());
      const playerAnimation = settings["animated"];
      let stepFailure: TabDiscoveryResult | undefined;
      let restoreFailure: string | undefined;
      try {
        settings["animated"] = false;
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
      } finally {
        for (const [setting, value] of playerTabs) settings[setting] = value;
        restoreFailure = restorePlayerView();
        settings["animated"] = playerAnimation;
      }

      if (stepFailure !== undefined) return stepFailure;
      const discovered = controls
        .capturedElementIds()
        .filter((id) => !before.has(id));
      return Object.freeze({
        // The draw worked and the way back did not: the discovered controls are real, and leaving
        // someone on a tab they did not choose is not a detail to swallow.
        outcome:
          restoreFailure === undefined
            ? SUCCEEDED
            : rejected("tab-restore-failed", restoreFailure),
        discovered: Object.freeze(discovered),
      });
    },
  });
}
