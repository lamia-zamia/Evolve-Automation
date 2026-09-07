/**
 * The technologies the game is currently offering, obtained by asking it to draw the research
 * panel and reading what it drew.
 *
 * There is no other route. `drawTech` decides the offered set with `checkTechPath`,
 * `checkOldTech`, `checkTechQualifications` and `checkTechRequirements`, all module-lexical, and
 * it returns early unless the Research tab is the selected one. So the catalog is a discovery
 * pass: draw main tab 3, read `#tech .action` while it is mounted, restore the player's view. The
 * elements carry the game's own `adjustCosts` output as `data-<Resource>` attributes and are in
 * the game's own offer order — era, then ascending Knowledge cost — which is the same source of
 * truth the compatibility runtime reads, only without needing the tab to stay open.
 *
 * A pass is not cheap (~120 ms on the measured page), so the result is cached and refreshed only
 * when the offered set can have changed. The trigger is `global.tech`: levels only ever rise and
 * keys are only ever added, so the entry count and level sum together increase on any grant and
 * both fall on a reset. Rarer causes — a trait or path change that alters
 * `checkTechQualifications` without granting anything — are not detected, and the catalog is then
 * one grant behind; that is a delay in offering a tech, never a wrong price.
 */

import type {
  GameTechCatalog,
  OfferedTech,
} from "../../../../ports/game-tech-catalog.ts";
import type { GameDrawnActionsReader } from "../../../../ports/game-drawn-actions.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import type { GameTabDiscovery } from "../../../../ports/game-tab-discovery.ts";
import {
  MAIN_TAB_CONTROL,
  MAIN_TAB_SETTING,
} from "../../captured-tab-discovery.ts";
import { isRecord, readProperty } from "../../../validation.ts";

/** The Research tab's index in the game's main tab list. */
const RESEARCH_TAB_INDEX = 3;

/** Offered research only. Already-granted technologies are drawn under `#oldTech`. */
const OFFERED_TECH_SELECTOR = "#tech .action";

const RESEARCH_TAB_PATH = Object.freeze([
  Object.freeze({
    setting: MAIN_TAB_SETTING,
    control: MAIN_TAB_CONTROL,
    index: RESEARCH_TAB_INDEX,
  }),
]);

export interface CapturedTechCatalogDependencies {
  readonly rootState: GameRootStateSource;
  readonly discovery: GameTabDiscovery;
  readonly drawnActions: GameDrawnActionsReader;
  /** Reports a pass that could not produce a catalog. The caller gets `undefined`, never stale. */
  readonly onUnavailable?: (reason: string) => void;
}

/**
 * A signature of `global.tech` that changes on every grant. Tech levels only rise and keys are
 * only added, so count and sum move together in one direction, and a reset drops both.
 */
function techSignature(root: unknown): string {
  const tech = readProperty(root, "tech");
  if (!isRecord(tech)) return "none";
  let count = 0;
  let total = 0;
  for (const key of Object.keys(tech)) {
    count += 1;
    const level = Number(tech[key]);
    if (Number.isFinite(level)) total += level;
  }
  return `${count}:${total}`;
}

export function createCapturedTechCatalog(
  dependencies: CapturedTechCatalogDependencies,
): GameTechCatalog {
  const { rootState, discovery, drawnActions } = dependencies;
  const reportUnavailable = dependencies.onUnavailable ?? (() => {});
  let cachedSignature: string | undefined;
  let cached: readonly Readonly<OfferedTech>[] | undefined;

  return Object.freeze({
    readOffered(): readonly Readonly<OfferedTech>[] | undefined {
      const root = rootState.readRoot();
      if (root === undefined) {
        reportUnavailable("the game root has not been captured yet");
        return undefined;
      }
      const signature = techSignature(root);
      if (cached !== undefined && signature === cachedSignature) return cached;

      let drawn: readonly Readonly<OfferedTech>[] | undefined;
      const result = discovery.discover(RESEARCH_TAB_PATH, () => {
        drawn = Object.freeze(
          drawnActions
            .read(OFFERED_TECH_SELECTOR)
            .map((action) =>
              Object.freeze({ elementId: action.id, cost: action.cost }),
            ),
        );
      });
      if (result.outcome.status !== "succeeded" || drawn === undefined) {
        // A catalog that could not be refreshed is not a catalog: acting on the previous offer set
        // would spend on a technology the game may already have granted.
        cached = undefined;
        cachedSignature = undefined;
        reportUnavailable(
          result.outcome.status === "succeeded"
            ? "the research panel was drawn but read nothing"
            : (result.outcome.failure?.message ?? result.outcome.status),
        );
        return undefined;
      }
      cached = drawn;
      cachedSignature = signature;
      return cached;
    },
  });
}
