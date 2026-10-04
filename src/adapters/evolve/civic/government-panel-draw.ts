/** The Government tab's native draw path, shared by Tax, Government, and Foreign discovery. */

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
import { TAX_CONTROL } from "./captured-tax.ts";
import {
  CANDIDATES_CONTROL,
  GOVERNMENT_CONTROL,
} from "./captured-government.ts";

export const GOVERNMENT_PANEL_CONTAINER = "#government";

export type GovernmentPanelPurpose = "tax" | "type" | "candidates";

export interface GovernmentPanelDraw {
  readonly path: readonly Readonly<TabDiscoveryStep>[];
  readonly options: Readonly<TabDiscoveryOptions>;
}

/** Each consumer proves only the native method it will call. */
export function governmentPanelControlEstablished(
  controls: GameControlRegistry,
  purpose: GovernmentPanelPurpose,
): boolean {
  switch (purpose) {
    case "tax": {
      const methods = controls.resolve(TAX_CONTROL)?.methods;
      return methods?.includes("add") === true && methods.includes("sub");
    }
    case "type":
      return (
        controls.resolve(GOVERNMENT_CONTROL)?.methods.includes("trigModal") ===
        true
      );
    case "candidates":
      return (
        controls.resolve(CANDIDATES_CONTROL)?.methods.includes("appoint") ===
        true
      );
  }
}

/** `index.js:swapTab(0)` reaches `civics.js:defineGovernment` through these two tab gates. */
export function governmentPanelDraw(
  controls: GameControlRegistry,
  isPanelDrawn: () => boolean,
): GovernmentPanelDraw | undefined {
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
      mount: Object.freeze([GOVERNMENT_PANEL_CONTAINER]),
      isPanelDrawn,
    }),
  });
}

/** Draw only while a current Tax or Government decision can need its sub-panel. */
export function planGovernmentPanelDraw(
  root: unknown,
  controls: GameControlRegistry,
  purpose: GovernmentPanelPurpose,
): GovernmentPanelDraw | undefined {
  const tech = readProperty(root, "tech");
  if (purpose === "tax") {
    if (
      readProperty(
        readProperty(readProperty(root, "civic"), "taxes"),
        "display",
      ) !== true
    )
      return undefined;
  } else if (purpose === "type") {
    if (!readProperty(tech, "govern")) return undefined;
  } else {
    // `governor.js:defineGovernor` draws candidates after both unlocks when the governor
    // record is absent or still has candidates. A present record with no candidates draws
    // the office instead, including immediately after an appointment.
    if (!readProperty(readProperty(root, "genes"), "governor"))
      return undefined;
    if (!readProperty(tech, "governor")) return undefined;
    const governor = readProperty(readProperty(root, "race"), "governor");
    if (isRecord(governor)) {
      const candidates = readProperty(governor, "candidates");
      if (!Array.isArray(candidates) || candidates.length === 0)
        return undefined;
    }
  }
  return governmentPanelDraw(controls, () =>
    governmentPanelControlEstablished(controls, purpose),
  );
}
