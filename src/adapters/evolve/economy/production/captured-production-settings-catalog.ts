/**
 * Projects the captured production catalogs into the Production settings rows.
 *
 * Every list mirrors the identities the corresponding automation already owns:
 * smelter fuels (`SMELTER_FUEL_IDS`), the nine craftables
 * (`CRAFTER_RESOURCE_KEYS`, with Scarletite/Quantium managed while the root
 * carries them), factory outputs (`FACTORY_OUTPUT_IDS`), droid outputs
 * (`MINING_DROID_OUTPUT_IDS`), and the replicator candidates (root resources
 * passing `isReplicableResourceId`). Labels come from the root resource record;
 * smelter fuel labels stay the raw fuel ids the way the legacy table drew them.
 * No manager, entity bridge, or compatibility object is consulted.
 */

import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { CRAFTER_RESOURCE_KEYS } from "../../../../domain/economy/production/crafter-resources.ts";
import { SMELTER_FUEL_IDS } from "./captured-smelter.ts";
import { FACTORY_OUTPUT_IDS } from "./captured-factory.ts";
import { MINING_DROID_OUTPUT_IDS } from "./captured-mining-droid.ts";
import { isReplicableResourceId } from "./captured-replicator.ts";
import { isRecord, readProperty } from "../../../validation.ts";

export interface CapturedProductionRow {
  readonly id: string;
  readonly label: string;
}

export interface CapturedFoundryRow extends CapturedProductionRow {
  readonly managed: boolean;
}

function readCapturedProductionTitle(root: unknown, id: string): string {
  const resource = readProperty(readProperty(root, "resource"), id);
  if (!isRecord(resource)) return id;
  const title = readProperty(resource, "title");
  if (typeof title === "string" && title.length > 0) return title;
  const name = readProperty(resource, "name");
  return typeof name === "string" && name.length > 0 ? name : id;
}

function readRootResourceIds(root: unknown): readonly string[] {
  const resources = readProperty(root, "resource");
  return isRecord(resources) ? Object.freeze(Object.keys(resources)) : [];
}

function finiteFuelPriority(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function readCapturedSmelterFuelRows(
  getSettingsRaw: () => unknown,
): readonly Readonly<CapturedProductionRow>[] {
  const settingsValue = getSettingsRaw();
  const raw = isRecord(settingsValue) ? settingsValue : {};
  return Object.freeze(
    [...SMELTER_FUEL_IDS]
      .map((id, index) => ({
        id,
        index,
        priority: finiteFuelPriority(raw[`smelter_fuel_p_${id}`], index),
      }))
      .sort(
        (left, right) =>
          left.priority - right.priority || left.index - right.index,
      )
      .map(({ id }) => Object.freeze({ id, label: id })),
  );
}

export function readCapturedFoundryRows(
  rootState: GameRootStateSource,
): readonly Readonly<CapturedFoundryRow>[] {
  const root = rootState.readRoot();
  const resources = readProperty(root, "resource");
  const managedIds = new Set(
    ["Scarletite", "Quantium"].filter(
      (id) => isRecord(resources) && resources[id] !== undefined,
    ),
  );
  return Object.freeze(
    [...CRAFTER_RESOURCE_KEYS].map((id) =>
      Object.freeze({
        id,
        label: readCapturedProductionTitle(root, id),
        managed: managedIds.has(id),
      }),
    ),
  );
}

function readLabeledRows(
  root: unknown,
  ids: readonly string[],
): readonly Readonly<CapturedProductionRow>[] {
  return Object.freeze(
    ids.map((id) =>
      Object.freeze({ id, label: readCapturedProductionTitle(root, id) }),
    ),
  );
}

export function readCapturedFactoryRows(
  rootState: GameRootStateSource,
): readonly Readonly<CapturedProductionRow>[] {
  return readLabeledRows(rootState.readRoot(), FACTORY_OUTPUT_IDS);
}

export function readCapturedMiningDroidRows(
  rootState: GameRootStateSource,
): readonly Readonly<CapturedProductionRow>[] {
  return readLabeledRows(rootState.readRoot(), MINING_DROID_OUTPUT_IDS);
}

export function readCapturedReplicatorRows(
  rootState: GameRootStateSource,
): readonly Readonly<CapturedProductionRow>[] {
  const root = rootState.readRoot();
  return readLabeledRows(
    root,
    readRootResourceIds(root).filter((id) => isReplicableResourceId(id)),
  );
}
