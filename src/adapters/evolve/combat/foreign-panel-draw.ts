/**
 * The Foreign panel's own draw path: when the game would create that panel at all, and exactly what
 * a discovery has to ask for to capture it.
 *
 * `#foreign` is the one control no amount of drawing reaches by accident. `defineGovernment()`
 * creates `#government` and binds a `b-tabs` component, but `#r_govern0` — the container
 * `government()`, the compact `#c_garrison`, `foreignGov()` and its `vBind({el:'#foreign'})` all
 * append into — is that component's *render*, not markup. A pass that suppresses every mount
 * therefore produces a detached `#foreign`, `vBind` resolves nothing, and the capture never sees the
 * Foreign methods: measured at 460 periods of production Auto Fight with `govTabs: 7` capturing
 * `government` and `garrison` and no `foreign` at all.
 *
 * So this is the one discovery that lets `#government` really mount, and only it. Its Buefy tab
 * template is what materialises the container the game's own synchronous code appends into; every
 * other component the Civic draw binds — the hundreds of job, action and offer components — stays
 * suppressed, and the Foreign component itself is not left mounted either. Recording its `vBind`
 * methods is all any consumer needs, and the temporary app goes down with the scope.
 *
 * Eligibility is the upstream answer, not a guess. `index.js` runs the whole Government block —
 * `defineGarrison()`, `buildGarrison($('#c_garrison'))` and `foreignGov()` — only for
 * `species !== 'protoplasm'` runs without `start_cataclysm`, and `foreignGov()` returns early
 * unless `spyActive()`. `capturedForeignPanelAvailable` is that `spyActive()` half plus the
 * `garrison.display` half of `vis()`, which is what makes a legitimately absent panel ineligible
 * rather than a discovery that keeps failing. A panel the game would not draw is not worth a draw,
 * and retrying it every cycle is the failure mode this exists to avoid.
 */

import type { GameControlRegistry } from "../../../ports/game-control-registry.ts";
import type {
  TabDiscoveryOptions,
  TabDiscoveryStep,
} from "../../../ports/game-tab-discovery.ts";
import {
  GOV_TABS_SETTING,
  GOV_TAB_INDEX,
  MAIN_TAB_CONTROL,
  MAIN_TAB_INDEX,
  MAIN_TAB_SETTING,
  SUB_TAB_CONTROLS,
} from "../captured-tab-discovery.ts";
import { isRecord, readProperty } from "../../validation.ts";
import {
  capturedForeignEstablished,
  capturedForeignPanelAvailable,
  CAPTURED_FOREIGN_GOVERNMENT_PANEL,
} from "./captured-foreign-state.ts";

/** The attempt record this draw retires, so a later cycle does not spend it again. */
export const FOREIGN_PANEL_DRAW_KEY = "foreign";

export interface ForeignPanelDraw {
  /** Main tab Civic, then the Civic sub-tab Government: `index.js` gates `defineGovernment()` on both. */
  readonly path: readonly Readonly<TabDiscoveryStep>[];
  readonly options: Readonly<TabDiscoveryOptions>;
}

/**
 * Upstream's own gate on the Government draw (`index.js`, the `govTabs === 0` case): a protoplasm
 * run or a run that started in cataclysm never reaches `foreignGov()` at all.
 */
function foreignPanelDrawnUpstream(root: unknown): boolean {
  const race = readProperty(root, "race");
  return (
    isRecord(race) &&
    readProperty(race, "species") !== "protoplasm" &&
    readProperty(race, "start_cataclysm") !== true
  );
}

/**
 * The draw, or `undefined` when the game would not create the Foreign panel now.
 *
 * `isPanelDrawn` is answered from the captured authority rather than from the tab settings. Left at
 * its default, the shared discovery treats "every step already names the player's current setting"
 * as proof the panel is in front of them and observes it in place — which for this panel is exactly
 * the case that must still draw, because a player sitting on Civic → Government has already proved
 * they rendered it, while a player whose `foreign` was never captured is exactly the state this
 * draw exists to leave.
 */
export function planForeignPanelDraw(
  root: unknown,
  controls: GameControlRegistry,
): ForeignPanelDraw | undefined {
  if (!foreignPanelDrawnUpstream(root)) return undefined;
  if (!capturedForeignPanelAvailable(root)) return undefined;
  if (controls.resolve(MAIN_TAB_CONTROL) === undefined) return undefined;
  const govTabs = SUB_TAB_CONTROLS[GOV_TABS_SETTING];
  if (govTabs === undefined) return undefined;
  return Object.freeze({
    path: Object.freeze([
      Object.freeze({
        setting: MAIN_TAB_SETTING,
        control: MAIN_TAB_CONTROL,
        index: MAIN_TAB_INDEX.civic,
      }),
      Object.freeze({
        setting: GOV_TABS_SETTING,
        control: govTabs,
        index: GOV_TAB_INDEX.civic,
      }),
    ]),
    options: Object.freeze({
      mount: Object.freeze([CAPTURED_FOREIGN_GOVERNMENT_PANEL]),
      isPanelDrawn: () => capturedForeignEstablished(controls),
    }),
  });
}
