/**
 * Research action identity comes from the retained native registry, and final offer membership and
 * order come from the native Vue bindings produced by `drawTech`/`setAction`. A fresh catalog read
 * forces a protected draw even while Research is selected, then joins that binding stream to the
 * rendered rows. Price comes from the native queue cost path and is checked against the same-draw
 * markup; the row's `cna` verdict remains native affordability authority.
 *
 * The already-researched half is drawn under `#oldTech`. When requested, its rendered ids classify
 * the trailing native bindings, preserving `checkOldTech` special cases without restating them.
 * Otherwise discovery removes `#oldTech` after `#resContent` binds; upstream `vBind` then finds no
 * target and emits no old-technology binding.
 */

import type {
  GameTechCatalog,
  OfferedTech,
  TechCatalogReadOptions,
  TechCatalogSnapshot,
} from "../../../../ports/game-tech-catalog.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type {
  DrawnAction,
  GameDrawnActionsReader,
} from "../../../../ports/game-drawn-actions.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import type { GameTabDiscovery } from "../../../../ports/game-tab-discovery.ts";
import type {
  CapturedGameMechanics,
  CapturedTechDefinition,
} from "../../../../ports/captured-game-mechanics.ts";
import type { VueBindingObserver } from "../../vue-capture.ts";
import type { ResearchTechPriceReader } from "./captured-tech-costs.ts";
import {
  MAIN_TAB_CONTROL,
  MAIN_TAB_INDEX,
  MAIN_TAB_SETTING,
} from "../../captured-tab-discovery.ts";

/** Rows with the same-draw price cross-check and native-affordability details. */
const OFFERED_TECH_SELECTOR = "#tech .action";

/** Native Research actions use this prefix; other bindings from the same draw are ignored. */
const RESEARCH_ACTION_ID_PREFIX = "tech-";

/**
 * The already-granted half of the same draw. The game renders each researched entry under its own
 * action id with an `.oldTech` child and no price markup, so the ids are the whole answer.
 */
const GRANTED_TECH_SELECTOR = "#oldTech .action";

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
  readonly bindings: VueBindingObserver;
  readonly controls: GameControlRegistry;
  /** Retained native identity behind every Research row the game renders. */
  readonly mechanics: Pick<
    CapturedGameMechanics,
    "captureTechDefinitionsDuring" | "readTechDefinitions"
  >;
  readonly nativePrices: ResearchTechPriceReader;
  /** Reports a pass that could not produce a catalog. The caller gets `undefined`, never stale. */
  readonly onUnavailable?: (reason: string) => void;
}

/** Transitional equality guard; native queue pricing remains the only price owner. */
function sameResearchPriceRecord(
  nativePrice: Readonly<Record<string, number>>,
  renderedPrice: Readonly<Record<string, number>>,
): boolean {
  const nativeKeys = Object.keys(nativePrice);
  const renderedKeys = Object.keys(renderedPrice);
  if (nativeKeys.length !== renderedKeys.length) return false;
  return nativeKeys.every((key) => {
    const amount = nativePrice[key];
    return (
      Object.prototype.hasOwnProperty.call(renderedPrice, key) &&
      typeof amount === "number" &&
      Number.isFinite(amount) &&
      amount === renderedPrice[key]
    );
  });
}

interface ResearchDrawDetails {
  readonly offeredRows: readonly Readonly<DrawnAction>[];
  readonly grantedRows?: readonly Readonly<DrawnAction>[];
  readonly generations: ReadonlyMap<string, number>;
}

export function createCapturedTechCatalog(
  dependencies: CapturedTechCatalogDependencies,
): GameTechCatalog {
  const {
    rootState,
    discovery,
    drawnActions,
    bindings,
    controls,
    mechanics,
    nativePrices,
  } = dependencies;
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

      let drawn: ResearchDrawDetails | undefined;
      let result: ReturnType<typeof discovery.discover> | undefined;
      const observedBindingIds: string[] = [];
      let collecting = true;
      let stopObserving = () => {};
      try {
        stopObserving = bindings((elementId) => {
          if (collecting) observedBindingIds.push(elementId);
        });
        result = mechanics.captureTechDefinitionsDuring(() =>
          discovery.discover(RESEARCH_TAB_PATH, {
            purpose: "research-catalog",
            // A current DOM cannot establish a fresh binding stream, even if Research is selected.
            // The panel workspace preserves that view while this scratch draw runs.
            forceDraw: true,
            ...(includeGranted ? {} : { discard: UNREAD_RESEARCH_CONTENT }),
            whileDrawn: () => {
              try {
                const offeredRows = drawnActions.read(OFFERED_TECH_SELECTOR);
                if (
                  drawnActions.count(OFFERED_TECH_SELECTOR) !==
                  offeredRows.length
                )
                  throw new Error(
                    "a rendered Research offer row has no readable id",
                  );
                const grantedRows = includeGranted
                  ? drawnActions.read(GRANTED_TECH_SELECTOR)
                  : undefined;
                if (
                  grantedRows !== undefined &&
                  drawnActions.count(GRANTED_TECH_SELECTOR) !==
                    grantedRows.length
                )
                  throw new Error(
                    "a rendered granted Research row has no readable id",
                  );
                const generations = new Map<string, number>();
                for (const elementId of observedBindingIds)
                  generations.set(
                    elementId,
                    controls.resolve(elementId)?.generation ?? 0,
                  );
                drawn = Object.freeze({
                  offeredRows,
                  ...(grantedRows === undefined ? {} : { grantedRows }),
                  generations,
                });
                return true;
              } finally {
                // Exclude any player-view restoration after the controlled target draw.
                collecting = false;
              }
            },
          }),
        );
      } catch (error) {
        reportUnavailable(`research offer discovery failed: ${String(error)}`);
        return undefined;
      } finally {
        collecting = false;
        stopObserving();
      }
      if (result === undefined) {
        reportUnavailable("the research panel discovery returned no result");
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
      const observedTechnologyIds = observedBindingIds.filter(
        (elementId) =>
          elementId.startsWith(RESEARCH_ACTION_ID_PREFIX) ||
          definitionsById.has(elementId),
      );
      const observedDefinitions: CapturedTechDefinition[] = [];
      const observedIds = new Set<string>();
      for (const actionId of observedTechnologyIds) {
        const definition = definitionsById.get(actionId);
        if (definition === undefined || definition.actionId !== actionId) {
          reportUnavailable(
            `native Research binding ${actionId} has no unique registry definition`,
          );
          return undefined;
        }
        if (observedIds.has(actionId)) {
          reportUnavailable(
            `native Research binding ${actionId} is duplicated`,
          );
          return undefined;
        }
        observedIds.add(actionId);
        observedDefinitions.push(definition);
      }

      const offeredRowsById = new Map<string, Readonly<DrawnAction>>();
      for (const row of drawn.offeredRows) {
        if (offeredRowsById.has(row.id)) {
          reportUnavailable(`rendered Research offer ${row.id} is duplicated`);
          return undefined;
        }
        offeredRowsById.set(row.id, row);
      }
      const grantedIds = new Set<string>();
      if (drawn.grantedRows !== undefined) {
        for (const row of drawn.grantedRows) {
          if (grantedIds.has(row.id)) {
            reportUnavailable(
              `rendered granted Research row ${row.id} is duplicated`,
            );
            return undefined;
          }
          grantedIds.add(row.id);
          const definition = definitionsById.get(row.id);
          if (definition === undefined || definition.actionId !== row.id) {
            reportUnavailable(
              `rendered granted research ${row.id} has no unique native definition`,
            );
            return undefined;
          }
        }
      }
      if ([...grantedIds].some((actionId) => offeredRowsById.has(actionId))) {
        reportUnavailable("a Research action is both offered and granted");
        return undefined;
      }

      let offeredCount = observedDefinitions.length;
      if (drawn.grantedRows !== undefined) {
        for (let index = 0; index < observedDefinitions.length; index++) {
          const actionId = observedDefinitions[index]?.actionId;
          if (actionId !== undefined && grantedIds.has(actionId)) {
            offeredCount = index;
            break;
          }
        }
        for (
          let index = offeredCount;
          index < observedDefinitions.length;
          index++
        ) {
          const actionId = observedDefinitions[index]?.actionId;
          if (actionId === undefined || !grantedIds.has(actionId)) {
            reportUnavailable(
              "native granted Research bindings do not follow all offered bindings",
            );
            return undefined;
          }
        }
        if (
          observedDefinitions.length - offeredCount !== grantedIds.size ||
          [...grantedIds].some((actionId) => !observedIds.has(actionId))
        ) {
          reportUnavailable(
            "rendered granted Research rows do not match the native binding stream",
          );
          return undefined;
        }
      }

      if (offeredCount !== drawn.offeredRows.length) {
        reportUnavailable(
          "native Research offers and rendered offer details have different membership",
        );
        return undefined;
      }
      const matchedOffers: OfferedTech[] = [];
      for (let index = 0; index < offeredCount; index++) {
        const definition = observedDefinitions[index];
        const row = drawn.offeredRows[index];
        if (
          definition === undefined ||
          row === undefined ||
          row.id !== definition.actionId ||
          !offeredRowsById.has(definition.actionId)
        ) {
          reportUnavailable(
            "native Research offer order disagrees with rendered detail rows",
          );
          return undefined;
        }
        let nativePrice: Readonly<Record<string, number>> | undefined;
        try {
          nativePrice = nativePrices.readTechCost(definition.actionId);
        } catch (error) {
          reportUnavailable(
            `native Research price read failed for ${definition.actionId}: ${String(error)}`,
          );
          return undefined;
        }
        if (nativePrice === undefined) {
          reportUnavailable(
            `native Research price is unavailable for ${definition.actionId}`,
          );
          return undefined;
        }
        if (!sameResearchPriceRecord(nativePrice, row.cost)) {
          reportUnavailable(
            `native and rendered Research prices disagree for ${definition.actionId}`,
          );
          return undefined;
        }
        matchedOffers.push(
          Object.freeze({
            elementId: definition.actionId,
            cost: Object.freeze({ ...nativePrice }),
            nativeAffordable: row.nativeAffordable === true,
            generation: drawn.generations.get(definition.actionId) ?? 0,
          }),
        );
      }
      const frozenOffered = Object.freeze(matchedOffers);
      return drawn.grantedRows === undefined
        ? Object.freeze({ offered: frozenOffered })
        : Object.freeze({
            offered: frozenOffered,
            granted: Object.freeze(grantedIds) as ReadonlySet<string>,
          });
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
