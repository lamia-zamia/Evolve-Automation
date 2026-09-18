/**
 * Reads Market game-panel toggle targets from the captured root and the live DOM.
 *
 * DeadSpace draws one `#market-<id>` row per tradable resource under `#market`
 * (`src/resources.js` `drawMarket`). Food is skipped for races that cannot use
 * it, the way the compatibility reader did, from the same root race flags —
 * `artifical` is upstream's spelling. Button labels are the game's own
 * localized draw, which no capture carries; the browser adapter restores the
 * live labels it overwrote, so this reader reports empty labels that must
 * never reach the page unwritten.
 */

import type {
  MarketToggleItem,
  MarketToggleView,
} from "../../../../domain/economy/resources/resource-toggles.ts";
import type { ResourceToggleReader } from "../../../../ports/resource-toggles.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { readCapturedMarketSettingsEntries } from "./captured-market-settings-catalog.ts";
import { isRecord, readProperty } from "../../../validation.ts";

interface CapturedMarketToggleDocument {
  getElementById(id: string): unknown;
}

export interface CapturedMarketToggleDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly getDocument: () => CapturedMarketToggleDocument;
  readonly getSettingsRaw: () => unknown;
}

/** The market half of the split resource-toggle reader; the storage half stays captured-storage-toggles. */
export type CapturedMarketToggleReader = Pick<
  ResourceToggleReader,
  "readMarket"
>;

function readRaceFlag(root: unknown, flag: string): boolean {
  return readProperty(readProperty(root, "race"), flag) === true;
}

function isFoodExcluded(root: unknown, resourceId: string): boolean {
  return (
    resourceId === "Food" &&
    (readRaceFlag(root, "artifical") || readRaceFlag(root, "fasting"))
  );
}

export function createCapturedMarketToggleReader({
  rootState,
  controls,
  getDocument,
  getSettingsRaw,
}: CapturedMarketToggleDependencies): CapturedMarketToggleReader {
  return Object.freeze({
    readMarket(): MarketToggleView {
      const root = rootState.readRoot();
      const settings = getSettingsRaw();
      const record = isRecord(settings) ? settings : {};
      const entries = readCapturedMarketSettingsEntries(root, controls);
      const items: MarketToggleItem[] = [];
      for (const entry of entries) {
        if (isFoodExcluded(root, entry.resourceId)) continue;
        if (getDocument().getElementById(entry.elementId) == null) continue;
        const buyKey = `buy${entry.resourceId}`;
        const sellKey = `sell${entry.resourceId}`;
        const tradeBuyKey = `res_trade_buy_${entry.resourceId}`;
        const tradeSellKey = `res_trade_sell_${entry.resourceId}`;
        items.push(
          Object.freeze({
            resourceId: entry.resourceId,
            buyKey,
            sellKey,
            tradeBuyKey,
            tradeSellKey,
            buyEnabled: record[buyKey] === true,
            sellEnabled: record[sellKey] === true,
            tradeBuyEnabled: record[tradeBuyKey] === true,
            tradeSellEnabled: record[tradeSellKey] === true,
          }),
        );
      }
      return Object.freeze({
        noTrade: readRaceFlag(root, "no_trade"),
        labels: Object.freeze({
          buy: "",
          sell: "",
          routes: "",
          cancelRoutes: "",
        }),
        items: Object.freeze(items),
      });
    },
  });
}
