/**
 * The technologies the game is currently offering — and, when asked, the ones it has already
 * granted — obtained by asking it to draw the research panel and reading what it drew.
 *
 * There is no other route. `drawTech` decides the offered set with `checkTechPath`,
 * `checkOldTech`, `checkTechQualifications` and `checkTechRequirements`, all module-lexical, and
 * it returns early unless the Research tab is the selected one. So the catalog is a discovery
 * pass: draw main tab 3, read `#tech .action` while it is there, restore the player's view. The
 * elements carry the game's own `adjustCosts` output as `data-<Resource>` attributes and are in
 * the game's own offer order — era, then ascending Knowledge cost — which is the same source of
 * truth the game offers, without needing the tab to stay open.
 *
 * The already-researched half is drawn under `#oldTech` and is the captured answer to whether a
 * technology is complete, so a caller that needs that asks for it and pays for it; every other
 * caller drops the container before the game fills it.
 *
 * Registry identity is captured once for the page lifetime; offer membership still goes through
 * discovery for every catalog read. The game-maintained Research panel is observed when selected,
 * and an off-tab request uses the protected draw that restores the player's view. The first request
 * forces that protected draw even when Research is already selected so the private registry is
 * observed. Unless granted rows were requested, the unused old-tech container is discarded before
 * the game fills it. A signature over `global.tech` cannot replace this: the offer also depends on
 * `checkTechPath`, arbitrary action `condition()` functions, research-queue prediction and adjusted
 * prices.
 */

import type {
  GameTechCatalog,
  OfferedTech,
  TechCatalogReadOptions,
  TechCatalogSnapshot,
} from "../../../../ports/game-tech-catalog.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameDrawnActionsReader } from "../../../../ports/game-drawn-actions.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import type { GameTabDiscovery } from "../../../../ports/game-tab-discovery.ts";
import type {
  CapturedGameMechanics,
  CapturedTechDefinition,
} from "../../../../ports/captured-game-mechanics.ts";
import {
  MAIN_TAB_CONTROL,
  MAIN_TAB_INDEX,
  MAIN_TAB_SETTING,
} from "../../captured-tab-discovery.ts";

/** Offered research only. Already-granted technologies are drawn under `#oldTech`. */
const OFFERED_TECH_SELECTOR = "#tech .action";

/**
 * The already-granted half of the same draw. The game renders each researched entry under its own
 * action id with an `.oldTech` child and no price markup, so the ids are the whole answer.
 */
const GRANTED_TECH_SELECTOR = "#oldTech .action";

/**
 * The container `drawTech` fills. The game appends it as raw markup before binding the component
 * around it, so its presence says the Research panel is there whether or not Vue mounted anything.
 */
const RESEARCH_PANEL_SELECTOR = "#tech";

/**
 * `drawTech` fills two lists and a pass normally reads one. The already-granted half is the larger
 * by far — 194 entries against 6 offers on a late save — and dropping its container before the
 * game reaches it turns every one of those appends into a discarded element. `#resContent` is the
 * component `loadTab` binds between creating the two containers and calling `drawTech`, which is
 * the only moment `#oldTech` exists and is still empty.
 *
 * A pass asked for the granted set keeps the container and pays for that half instead.
 */
const UNREAD_RESEARCH_CONTENT = Object.freeze({
  afterBinding: "#resContent",
  containers: Object.freeze(["oldTech"]),
});

const RESEARCH_TAB_PATH = Object.freeze([
  Object.freeze({
    setting: MAIN_TAB_SETTING,
    control: MAIN_TAB_CONTROL,
    index: MAIN_TAB_INDEX.research,
  }),
]);

export interface CapturedTechCatalogDependencies {
  readonly rootState: GameRootStateSource;
  readonly discovery: GameTabDiscovery;
  readonly drawnActions: GameDrawnActionsReader;
  readonly controls: GameControlRegistry;
  /** Retained native identity behind every Research row the game renders. */
  readonly mechanics: Pick<
    CapturedGameMechanics,
    "captureTechDefinitionsDuring" | "readTechDefinitions"
  >;
  /** Reports a pass that could not produce a catalog. The caller gets `undefined`, never stale. */
  readonly onUnavailable?: (reason: string) => void;
}

export function createCapturedTechCatalog(
  dependencies: CapturedTechCatalogDependencies,
): GameTechCatalog {
  const { rootState, discovery, drawnActions, controls, mechanics } =
    dependencies;
  const reportUnavailable = dependencies.onUnavailable ?? (() => {});

  return Object.freeze({
    read(
      options?: Readonly<TechCatalogReadOptions>,
    ): Readonly<TechCatalogSnapshot> | undefined {
      if (rootState.readRoot() === undefined) {
        reportUnavailable("the game root has not been captured yet");
        return undefined;
      }
      const includeGranted = options?.includeGranted === true;

      let drawn: Readonly<TechCatalogSnapshot> | undefined;
      let result: ReturnType<typeof discovery.discover>;
      try {
        const definitionsAlreadyCaptured =
          mechanics.readTechDefinitions() !== undefined;
        result = mechanics.captureTechDefinitionsDuring(() =>
          discovery.discover(RESEARCH_TAB_PATH, {
            // The first capture must see drawTech even when the player already has Research open.
            // The discovery workspace keeps that panel intact while it redraws the scratch copy.
            forceDraw: !definitionsAlreadyCaptured,
            isPanelDrawn: () => drawnActions.exists(RESEARCH_PANEL_SELECTOR),
            ...(includeGranted ? {} : { discard: UNREAD_RESEARCH_CONTENT }),
            whileDrawn: () => {
              const offered: readonly Readonly<OfferedTech>[] = Object.freeze(
                drawnActions.read(OFFERED_TECH_SELECTOR).map((action) =>
                  Object.freeze({
                    elementId: action.id,
                    cost: action.cost,
                    nativeAffordable: action.nativeAffordable === true,
                    // Which binding of this control the offer belongs to. The game rebinds an action
                    // every time it draws it, and a superseded closure keeps working, so recording the
                    // generation here is what lets the executor refuse one from an older draw.
                    generation: controls.resolve(action.id)?.generation ?? 0,
                  }),
                ),
              );
              drawn = Object.freeze(
                includeGranted
                  ? {
                      offered,
                      granted: Object.freeze(
                        new Set(
                          drawnActions
                            .read(GRANTED_TECH_SELECTOR)
                            .map((action) => action.id),
                        ),
                      ) as ReadonlySet<string>,
                    }
                  : { offered },
              );
            },
          }),
        );
      } catch (error) {
        reportUnavailable(`research offer discovery failed: ${String(error)}`);
        return undefined;
      }
      if (result.outcome.status !== "succeeded" || drawn === undefined) {
        // A catalog that could not be read is not a catalog: acting on an earlier offer set would
        // spend on a technology the game may already have granted.
        if (
          result.outcome.status !== "succeeded" &&
          (result.outcome.failure.code === "game-state-not-captured" ||
            result.outcome.failure.code === "unknown-player-tab")
        ) {
          // A fresh game may sample demand before it has selected any tabs; the current catalog
          // stays absent when settings or settings.civTabs has not initialized, while the discovery
          // refusal remains available in its own diagnostics.
          return undefined;
        }
        reportUnavailable(
          result.outcome.status === "succeeded"
            ? "the research panel was drawn but read nothing"
            : (result.outcome.failure?.message ?? result.outcome.status),
        );
        return undefined;
      }

      const definitions = mechanics.readTechDefinitions();
      if (definitions === undefined) {
        reportUnavailable(
          "the native technology registry was not captured or is no longer valid",
        );
        return undefined;
      }
      const definitionsById = new Map<string, CapturedTechDefinition>();
      for (const definition of definitions) {
        if (definitionsById.has(definition.actionId)) {
          reportUnavailable(
            "the native technology registry has duplicate action ids",
          );
          return undefined;
        }
        definitionsById.set(definition.actionId, definition);
      }
      for (const offer of drawn.offered) {
        const definition = definitionsById.get(offer.elementId);
        if (
          definition === undefined ||
          definition.actionId !== offer.elementId
        ) {
          reportUnavailable(
            `rendered research offer ${offer.elementId} has no unique native definition`,
          );
          return undefined;
        }
      }
      if (drawn.granted !== undefined) {
        for (const actionId of drawn.granted) {
          const definition = definitionsById.get(actionId);
          if (definition === undefined || definition.actionId !== actionId) {
            reportUnavailable(
              `rendered granted research ${actionId} has no unique native definition`,
            );
            return undefined;
          }
        }
      }
      return drawn;
    },
    restate(
      snapshot: Readonly<TechCatalogSnapshot>,
    ): Readonly<TechCatalogSnapshot> {
      // One rule, one place: an offer's generation is whatever the registry holds for its element
      // right now. The draw above records it at the moment of the draw and this records it at the
      // moment of use, and both go through `controls.resolve`.
      const offered = Object.freeze(
        snapshot.offered.map((offer) =>
          Object.freeze({
            ...offer,
            generation: controls.resolve(offer.elementId)?.generation ?? 0,
          }),
        ),
      );
      return Object.freeze(
        snapshot.granted === undefined
          ? { offered }
          : { offered, granted: snapshot.granted },
      );
    },
  });
}
