/** Captured read/write adapter for the Market settings surface. */

import {
  createMarketSettingsReadModel,
  type MarketSettingsReadModel,
} from "../../../../domain/economy/market/market-settings.ts";
import type { MarketResetContext } from "../../../../domain/settings-defaults.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { readMarketResetContext } from "../../captured-settings-defaults.ts";
import { isRecord } from "../../../validation.ts";
import {
  readCapturedMarketGalaxyEntries,
  readCapturedMarketSettingsEntries,
  type CapturedMarketSettingsEntry,
} from "./captured-market-settings-catalog.ts";

export interface CapturedMarketSettingsDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly getSettingsRaw: () => unknown;
}

export interface CapturedMarketSettingsAdapter {
  readMarketSettingsReadModel(): MarketSettingsReadModel;
  resetPriorities(): void;
  reorderResources(resourceIds: readonly string[]): void;
}

function readCapturedMarketSettingsRecord(
  raw: unknown,
): Record<string, unknown> {
  return isRecord(raw) ? raw : {};
}

function finiteMarketPriority(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function sortCapturedMarketEntries(
  entries: readonly Readonly<CapturedMarketSettingsEntry>[],
  raw: Record<string, unknown>,
): readonly Readonly<CapturedMarketSettingsEntry>[] {
  return Object.freeze(
    entries
      .map((entry, index) => ({
        entry,
        index,
        priority: finiteMarketPriority(
          raw[`res_buy_p_${entry.resourceId}`],
          index,
        ),
      }))
      .sort(
        (left, right) =>
          left.priority - right.priority || left.index - right.index,
      )
      .map(({ entry }) => entry),
  );
}

function readMarketContext(
  rootState: GameRootStateSource,
  controls: GameControlRegistry,
): MarketResetContext {
  return readMarketResetContext(rootState.readRoot(), controls);
}

export function createCapturedMarketSettingsAdapter({
  rootState,
  controls,
  getSettingsRaw,
}: CapturedMarketSettingsDependencies): CapturedMarketSettingsAdapter {
  const readMarketEntriesForSettings =
    (): readonly Readonly<CapturedMarketSettingsEntry>[] =>
      readCapturedMarketSettingsEntries(rootState.readRoot(), controls);

  const readModel = (): MarketSettingsReadModel => {
    const raw = readCapturedMarketSettingsRecord(getSettingsRaw());
    const root = rootState.readRoot();
    const entries = sortCapturedMarketEntries(
      readMarketEntriesForSettings(),
      raw,
    );
    return createMarketSettingsReadModel({
      rows: entries.map((entry) => ({
        id: entry.resourceId,
        label: entry.label,
        buySettingName: `buy${entry.resourceId}`,
        buyRatioSettingName: `res_buy_r_${entry.resourceId}`,
        sellSettingName: `sell${entry.resourceId}`,
        sellRatioSettingName: `res_sell_r_${entry.resourceId}`,
        tradeBuySettingName: `res_trade_buy_${entry.resourceId}`,
        tradeSellSettingName: `res_trade_sell_${entry.resourceId}`,
        tradeWeightingSettingName: `res_trade_w_${entry.resourceId}`,
        tradePrioritySettingName: `res_trade_p_${entry.resourceId}`,
      })),
      galaxyRows: readCapturedMarketGalaxyEntries(root).map((entry) => ({
        buyId: entry.buyId,
        buyLabel: entry.buyLabel,
        sellLabel: entry.sellLabel,
        weightingSettingName: `res_galaxy_w_${entry.buyId}`,
        prioritySettingName: `res_galaxy_p_${entry.buyId}`,
      })),
    });
  };

  return Object.freeze({
    readMarketSettingsReadModel: readModel,
    resetPriorities() {
      const raw = readCapturedMarketSettingsRecord(getSettingsRaw());
      const { tradableResourceIds } = readMarketContext(rootState, controls);
      tradableResourceIds.forEach((resourceId, index) => {
        raw[`res_buy_p_${resourceId}`] = index;
      });
    },
    reorderResources(resourceIds: readonly string[]) {
      const known = new Set(
        readMarketEntriesForSettings().map((entry) => entry.resourceId),
      );
      const raw = readCapturedMarketSettingsRecord(getSettingsRaw());
      resourceIds.forEach((resourceId: string, index: number) => {
        if (known.has(resourceId)) raw[`res_buy_p_${resourceId}`] = index;
      });
    },
  });
}
