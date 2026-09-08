/**
 * Bounded quarry, titan-mine and mining-ship ratio allocation through the captured industry panels.
 *
 * The three panels are the same shape in DeadSpace: one slider per split, moved by the panel's own
 * `add`/`sub` methods, one click's worth per call, clamped by the game at 0 and 100. The mining
 * ship names its split (`common`, `uncommon`, `rare`); the other two have a single unnamed one.
 *
 * The pure ratio policies are reused unchanged. Their `demanded` inputs come from the captured
 * demand sample, which currently sees the player's own queues and nothing else, so a split pins to
 * a queued resource and otherwise follows storage fullness and the configured weights. Each step is
 * confirmed against the live root before the next one, so a split the player or the game moves
 * underneath the plan stops the run instead of being overwritten blind.
 */

import {
  planExtractorRatios,
  planMineRatio,
  planQuarryRatio,
  type ExtractorProductionInput,
  type ExtractorRatioInput,
  type MineRatioInput,
  type ProductionRatioAdjustment,
  type QuarryRatioInput,
} from "../../../../domain/economy/resources/resource-ratios.ts";
import type { CommandExecutionOutcome } from "../../../../domain/commands.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { rejected, stale, SUCCEEDED } from "../../../command-outcomes.ts";
import { isRecord, readProperty } from "../../../validation.ts";
import type { CapturedDemandSample } from "./captured-resource-demand.ts";

export const QUARRY_CONTROL = "iQuarry";
export const TITAN_MINE_CONTROL = "iTMine";
export const MINING_SHIP_CONTROL = "iMiningShip";

/** The mining ship's third split only exists once the game unlocks it. */
const RARE_EXTRACTION_TECH_LEVEL = 5;
const MINING_SHIP_TECH_LEVEL = 4;

const EXTRACTOR_SPECS = Object.freeze([
  Object.freeze({ id: "common", first: "Iron", second: "Aluminium" }),
  Object.freeze({ id: "uncommon", first: "Iridium", second: "Neutronium" }),
  Object.freeze({ id: "rare", first: "Orichalcum", second: "Elerium" }),
]);

export interface CapturedProductionRatiosDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readSettings: () => unknown;
  /** The cycle's demand sample, shared with the other features that read it. */
  readonly readDemand: () => CapturedDemandSample;
}

export interface CapturedProductionRatiosAutomation {
  quarry(): CommandExecutionOutcome;
  titanMine(): CommandExecutionOutcome;
  miningShip(): CommandExecutionOutcome;
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function settingNumber(
  settings: unknown,
  key: string,
  fallback: number,
): number | undefined {
  if (!isRecord(settings)) return fallback;
  const value = settings[key];
  return value === undefined ? fallback : finite(value);
}

/** The script's `storageRatio`: an uncapped or unreported maximum is not a fullness signal. */
function storageRatio(root: unknown, resourceId: string): number | undefined {
  const resource = readProperty(readProperty(root, "resource"), resourceId);
  const amount = finite(readProperty(resource, "amount"));
  const maximum = finite(readProperty(resource, "max"));
  if (amount === undefined || maximum === undefined) return undefined;
  return maximum > 0 ? amount / maximum : 0;
}

function structureCount(
  root: unknown,
  region: string,
  id: string,
): number | undefined {
  return finite(
    readProperty(readProperty(readProperty(root, region), id), "count"),
  );
}

function techLevel(root: unknown, id: string): number {
  return finite(readProperty(readProperty(root, "tech"), id)) ?? 0;
}

const EMPTY_QUARRY: QuarryRatioInput = Object.freeze({
  initialised: false,
  currentRatio: 0,
  chrysotileDemanded: false,
  chrysotileStorageRatio: 0,
  stoneDemanded: false,
  stoneStorageRatio: 0,
  hasMetalRefinery: false,
  aluminiumDemanded: false,
  aluminiumStorageRatio: 0,
  chrysotileWeight: 0,
});

const EMPTY_MINE: MineRatioInput = Object.freeze({
  initialised: false,
  currentRatio: 0,
  adamantiteDemanded: false,
  adamantiteStorageRatio: 0,
  aluminiumDemanded: false,
  aluminiumStorageRatio: 0,
  adamantiteWeight: 0,
});

const EMPTY_EXTRACTOR: ExtractorRatioInput = Object.freeze({
  initialised: false,
  productions: Object.freeze([]),
});

function readQuarryInput(
  dependencies: CapturedProductionRatiosDependencies,
  root: unknown,
): QuarryRatioInput {
  const race = readProperty(root, "race");
  const quarry = readProperty(readProperty(root, "city"), "rock_quarry");
  const currentRatio = finite(readProperty(quarry, "asbestos"));
  const count = structureCount(root, "city", "rock_quarry");
  const chrysotileStorageRatio = storageRatio(root, "Chrysotile");
  const stoneStorageRatio = storageRatio(root, "Stone");
  const aluminiumStorageRatio = storageRatio(root, "Aluminium");
  const chrysotileWeight = settingNumber(
    dependencies.readSettings(),
    "productionChrysotileWeight",
    2,
  );
  if (
    !readProperty(race, "smoldering") ||
    dependencies.controls.resolve(QUARRY_CONTROL) === undefined ||
    currentRatio === undefined ||
    count === undefined ||
    count < 1 ||
    chrysotileStorageRatio === undefined ||
    stoneStorageRatio === undefined ||
    aluminiumStorageRatio === undefined ||
    chrysotileWeight === undefined
  ) {
    return EMPTY_QUARRY;
  }
  const demand = dependencies.readDemand();
  return Object.freeze({
    initialised: true,
    currentRatio,
    chrysotileDemanded: demand.isDemanded("Chrysotile"),
    chrysotileStorageRatio,
    stoneDemanded: demand.isDemanded("Stone"),
    stoneStorageRatio,
    hasMetalRefinery: (structureCount(root, "city", "metal_refinery") ?? 0) > 0,
    aluminiumDemanded: demand.isDemanded("Aluminium"),
    aluminiumStorageRatio,
    chrysotileWeight,
  });
}

function readMineInput(
  dependencies: CapturedProductionRatiosDependencies,
  root: unknown,
): MineRatioInput {
  const mine = readProperty(readProperty(root, "space"), "titan_mine");
  const currentRatio = finite(readProperty(mine, "ratio"));
  const count = structureCount(root, "space", "titan_mine");
  const adamantiteStorageRatio = storageRatio(root, "Adamantite");
  const aluminiumStorageRatio = storageRatio(root, "Aluminium");
  const adamantiteWeight = settingNumber(
    dependencies.readSettings(),
    "productionAdamantiteWeight",
    1,
  );
  if (
    dependencies.controls.resolve(TITAN_MINE_CONTROL) === undefined ||
    currentRatio === undefined ||
    count === undefined ||
    count < 1 ||
    adamantiteStorageRatio === undefined ||
    aluminiumStorageRatio === undefined ||
    adamantiteWeight === undefined
  ) {
    return EMPTY_MINE;
  }
  const demand = dependencies.readDemand();
  return Object.freeze({
    initialised: true,
    currentRatio,
    adamantiteDemanded: demand.isDemanded("Adamantite"),
    adamantiteStorageRatio,
    aluminiumDemanded: demand.isDemanded("Aluminium"),
    aluminiumStorageRatio,
    adamantiteWeight,
  });
}

function readExtractorInput(
  dependencies: CapturedProductionRatiosDependencies,
  root: unknown,
): ExtractorRatioInput {
  const ship = readProperty(readProperty(root, "tauceti"), "mining_ship");
  const count = finite(readProperty(ship, "count"));
  const roidTech = techLevel(root, "tau_roid");
  if (
    !isRecord(ship) ||
    dependencies.controls.resolve(MINING_SHIP_CONTROL) === undefined ||
    roidTech < MINING_SHIP_TECH_LEVEL ||
    count === undefined ||
    count < 1
  ) {
    return EMPTY_EXTRACTOR;
  }
  const settings = dependencies.readSettings();
  const demand = dependencies.readDemand();
  const productions: ExtractorProductionInput[] = [];
  for (const spec of EXTRACTOR_SPECS) {
    if (spec.id === "rare" && roidTech < RARE_EXTRACTION_TECH_LEVEL) continue;
    const currentRatio = finite(readProperty(ship, spec.id));
    const res1StorageRatio = storageRatio(root, spec.first);
    const res2StorageRatio = storageRatio(root, spec.second);
    const weight = settingNumber(settings, `productionExtWeight_${spec.id}`, 1);
    if (
      currentRatio === undefined ||
      res1StorageRatio === undefined ||
      res2StorageRatio === undefined ||
      weight === undefined
    ) {
      return EMPTY_EXTRACTOR;
    }
    productions.push(
      Object.freeze({
        id: spec.id,
        res1Demanded: demand.isDemanded(spec.first),
        res1StorageRatio,
        res2Demanded: demand.isDemanded(spec.second),
        res2StorageRatio,
        weight,
        currentRatio,
      }),
    );
  }
  return productions.length === 0
    ? EMPTY_EXTRACTOR
    : Object.freeze({
        initialised: true,
        productions: Object.freeze(productions),
      });
}

interface RatioTarget {
  readonly control: string;
  readonly name: string;
  /** The live split, re-read from the root between steps. */
  readCurrent(root: unknown): number | undefined;
  /** The split's own id, for the panels that weigh several from one element. */
  readonly id?: string;
}

function applyAdjustment(
  dependencies: CapturedProductionRatiosDependencies,
  root: unknown,
  target: RatioTarget,
  adjustment: Readonly<ProductionRatioAdjustment>,
): CommandExecutionOutcome {
  if (!Number.isSafeInteger(adjustment.delta)) {
    return rejected(
      "invalid-production-ratio-adjustment",
      "production ratio adjustment must be a safe integer",
    );
  }
  if (adjustment.delta === 0) return SUCCEEDED;
  const handle = dependencies.controls.resolve(target.control);
  if (handle === undefined) {
    return stale(
      "production-ratio-control-missing",
      `captured ${target.name} control is unavailable`,
    );
  }
  const method = adjustment.delta > 0 ? "add" : "sub";
  const args = target.id === undefined ? [] : [target.id];
  const steps = Math.abs(adjustment.delta);
  for (let index = 0; index < steps; index++) {
    if (dependencies.rootState.readRoot() !== root) {
      return stale(
        "production-ratio-root-changed",
        "captured game root changed",
      );
    }
    const expected =
      adjustment.expectedCurrentRatio + (adjustment.delta > 0 ? index : -index);
    if (target.readCurrent(root) !== expected) {
      return stale("stale-production-ratio", "production ratio changed", {
        manager: target.name,
        expected,
        actual: target.readCurrent(root) ?? null,
      });
    }
    const result = dependencies.controls.invoke(handle, method, args);
    if (!result.ok) {
      return rejected(
        "production-ratio-control-failed",
        result.detail ?? result.reason,
      );
    }
  }
  return SUCCEEDED;
}

export function createCapturedProductionRatios(
  dependencies: CapturedProductionRatiosDependencies,
): CapturedProductionRatiosAutomation {
  return Object.freeze({
    quarry(): CommandExecutionOutcome {
      const root = dependencies.rootState.readRoot();
      const adjustment = planQuarryRatio(readQuarryInput(dependencies, root));
      if (adjustment === null) return SUCCEEDED;
      return applyAdjustment(
        dependencies,
        root,
        {
          control: QUARRY_CONTROL,
          name: "quarry",
          readCurrent: (current) =>
            finite(
              readProperty(
                readProperty(readProperty(current, "city"), "rock_quarry"),
                "asbestos",
              ),
            ),
        },
        adjustment,
      );
    },

    titanMine(): CommandExecutionOutcome {
      const root = dependencies.rootState.readRoot();
      const adjustment = planMineRatio(readMineInput(dependencies, root));
      if (adjustment === null) return SUCCEEDED;
      return applyAdjustment(
        dependencies,
        root,
        {
          control: TITAN_MINE_CONTROL,
          name: "titan mine",
          readCurrent: (current) =>
            finite(
              readProperty(
                readProperty(readProperty(current, "space"), "titan_mine"),
                "ratio",
              ),
            ),
        },
        adjustment,
      );
    },

    miningShip(): CommandExecutionOutcome {
      const root = dependencies.rootState.readRoot();
      const adjustments = planExtractorRatios(
        readExtractorInput(dependencies, root),
      );
      for (const adjustment of adjustments) {
        const outcome = applyAdjustment(
          dependencies,
          root,
          {
            control: MINING_SHIP_CONTROL,
            name: `mining ship ${adjustment.id}`,
            id: adjustment.id,
            readCurrent: (current) =>
              finite(
                readProperty(
                  readProperty(readProperty(current, "tauceti"), "mining_ship"),
                  adjustment.id,
                ),
              ),
          },
          adjustment,
        );
        if (outcome.status !== "succeeded") return outcome;
      }
      return SUCCEEDED;
    },
  });
}
