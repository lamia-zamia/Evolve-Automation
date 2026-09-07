/**
 * The technologies the game is currently offering, obtained by asking it to draw the research
 * panel and reading what it drew.
 *
 * There is no other route. `drawTech` decides the offered set with `checkTechPath`,
 * `checkOldTech`, `checkTechQualifications` and `checkTechRequirements`, all module-lexical, and
 * it returns early unless the Research tab is the selected one. So the catalog is a discovery
 * pass: draw main tab 3, read `#tech .action` while it is there, restore the player's view. The
 * elements carry the game's own `adjustCosts` output as `data-<Resource>` attributes and are in
 * the game's own offer order — era, then ascending Knowledge cost — which is the same source of
 * truth the compatibility runtime reads, only without needing the tab to stay open.
 *
 * A pass is not cheap — 50 ms on an early save and 126 ms on a late one, measured on the 1.5.0
 * page — because the game rebuilds the player's own panel on the way back. So the result is cached
 * and refreshed when the offered set can have changed. Two things retire it:
 *
 * - `global.tech`: levels only ever rise and keys are only ever added, so the entry count and level
 *   sum move together on any grant and both fall on a reset;
 * - the offered controls themselves: if the game has rebound one since the pass, the panel was
 *   redrawn and the offer set it produced is not the one held here.
 *
 * That still does not cover everything `drawTech` consults — a trait or path change that alters
 * `checkTechQualifications` without granting anything, an arbitrary `condition()`, research-queue
 * prediction — so a cached catalog can be one grant behind. It is a heuristic kept for its cost and
 * not a final contract; the snapshot the caller acts on lives for one application cycle either way.
 */

import type {
  GameTechCatalog,
  OfferedTech,
} from "../../../../ports/game-tech-catalog.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
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

/**
 * The container `drawTech` fills. The game appends it as raw markup before binding the component
 * around it, so its presence says the Research panel is there whether or not Vue mounted anything.
 */
const RESEARCH_PANEL_SELECTOR = "#tech";

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
  readonly controls: GameControlRegistry;
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
  const { rootState, discovery, drawnActions, controls } = dependencies;
  const reportUnavailable = dependencies.onUnavailable ?? (() => {});
  let cachedSignature: string | undefined;
  let cached: readonly Readonly<OfferedTech>[] | undefined;

  /** Every held offer still belongs to the binding the game has now. */
  function stillBound(offers: readonly Readonly<OfferedTech>[]): boolean {
    return offers.every(
      (offer) =>
        (controls.resolve(offer.elementId)?.generation ?? 0) ===
        offer.generation,
    );
  }

  return Object.freeze({
    readOffered(): readonly Readonly<OfferedTech>[] | undefined {
      const root = rootState.readRoot();
      if (root === undefined) {
        reportUnavailable("the game root has not been captured yet");
        return undefined;
      }
      const signature = techSignature(root);
      if (
        cached !== undefined &&
        signature === cachedSignature &&
        stillBound(cached)
      ) {
        return cached;
      }

      let drawn: readonly Readonly<OfferedTech>[] | undefined;
      const result = discovery.discover(RESEARCH_TAB_PATH, {
        isPanelDrawn: () => drawnActions.exists(RESEARCH_PANEL_SELECTOR),
        whileDrawn: () => {
          drawn = Object.freeze(
            drawnActions.read(OFFERED_TECH_SELECTOR).map((action) =>
              Object.freeze({
                elementId: action.id,
                cost: action.cost,
                // Which binding of this control the offer belongs to. The game rebinds an action
                // every time it draws it, and a superseded closure keeps working, so recording the
                // generation here is what lets the executor refuse one from an older draw.
                generation: controls.resolve(action.id)?.generation ?? 0,
              }),
            ),
          );
        },
      });
      if (result.outcome.status !== "succeeded" || drawn === undefined) {
        // A catalog that could not be read is not a catalog: acting on an earlier offer set would
        // spend on a technology the game may already have granted.
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
