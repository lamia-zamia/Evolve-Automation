/** Captured power-warning shutdown over the game's rendered warning markers. */

import type { PowerWarnBuildingInput } from "../../../../domain/economy/production/power.ts";
import type { PowerWarningSource } from "../../../../ports/power.ts";
import type { CapturedGameMechanics } from "../../../../ports/captured-game-mechanics.ts";
import { readCapturedSemanticBuildingStates } from "../../progression/build/captured-building-availability.ts";
import { readCapturedPowerSupportResourceState } from "./captured-power-reader.ts";
import type { CapturedGameStructureDefinition } from "../../../../ports/captured-game-mechanics.ts";
import type { CapturedBuildingState } from "../../progression/build/captured-building-state.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { isRecord, readProperty } from "../../../validation.ts";

interface WarningElement {
  readonly parentElement?: { readonly id?: unknown } | null;
}

interface WarningDocument {
  querySelectorAll(selector: string): ArrayLike<WarningElement>;
}

export interface CapturedPowerWarningDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly getDocument: () => unknown;
  readonly readSettings: () => unknown;
  readonly mechanics: CapturedGameMechanics;
}

function warningDocument(value: unknown): WarningDocument | undefined {
  if (!isRecord(value) || typeof value["querySelectorAll"] !== "function") {
    return undefined;
  }
  return value as unknown as WarningDocument;
}

function readWarning(
  root: unknown,
  settings: Record<PropertyKey, unknown>,
  elementId: string,
  buildings: readonly Readonly<CapturedBuildingState>[],
  structures: readonly CapturedGameStructureDefinition[],
): Readonly<PowerWarnBuildingInput> | undefined {
  const building = buildings.find(
    (entry) => entry.catalog.elementId === elementId,
  );
  if (building === undefined || !building.available || !building.hasState)
    return undefined;
  const stateOn = building.stateOn;
  const belt = ["elerium_ship", "iridium_ship", "iron_ship"].includes(
    building.catalog.id,
  );
  const lake = ["bireme", "transport"].includes(building.catalog.id);
  const tau = ["whaling_ship", "mining_ship"].includes(building.catalog.id);
  const warningKind = belt
    ? building.catalog.id === "elerium_ship"
      ? "belt-elerium"
      : building.catalog.id === "iridium_ship"
        ? "belt-iridium"
        : "belt-iron"
    : lake
      ? building.catalog.id === "bireme"
        ? "lake-bireme"
        : "lake-transport"
      : tau
        ? building.catalog.id === "whaling_ship"
          ? "tau-whaling"
          : "tau-mining"
        : "ordinary";
  const beltSupport = belt
    ? readCapturedPowerSupportResourceState(
        root,
        "Belt_Support",
        settings,
        structures,
        buildings,
      )
    : undefined;
  const lakeSupport = lake
    ? readCapturedPowerSupportResourceState(
        root,
        "Lake_Support",
        settings,
        structures,
        buildings,
      )
    : undefined;
  if (
    (belt && beltSupport === undefined) ||
    (lake && lakeSupport === undefined)
  )
    return undefined;
  const autoStateValue = settings[`bld_s_${building.catalog.binding}`];
  return Object.freeze({
    domId: elementId,
    buildingId: building.catalog.id,
    binding: building.catalog.binding,
    stateOn,
    autoStateEnabled: autoStateValue === undefined || autoStateValue === true,
    ship: belt || tau,
    warningKind,
    beltSupportNeeded: beltSupport?.currentQuantity ?? 0,
    beltSupportMaximum: beltSupport?.maxQuantity ?? 0,
    lakeSupportNeeded: lakeSupport?.currentQuantity ?? 0,
    lakeSupportMaximum: lakeSupport?.maxQuantity ?? 0,
  });
}

export function createCapturedPowerWarnings(
  dependencies: CapturedPowerWarningDependencies,
): PowerWarningSource & {
  readWarnings(
    domIds: readonly string[],
  ): readonly Readonly<PowerWarnBuildingInput>[];
} {
  return Object.freeze({
    readDebugEnabled(): boolean {
      return readProperty(dependencies.readSettings(), "debug") === true;
    },
    readWarnedBuildingDomIds(): readonly string[] {
      const document = warningDocument(dependencies.getDocument());
      if (document === undefined) return Object.freeze([]);
      return Object.freeze(
        Array.from(document.querySelectorAll("span.on.warn")).flatMap(
          (element) => {
            const id = element?.parentElement?.id;
            return typeof id === "string" && id.length > 0 ? [id] : [];
          },
        ),
      );
    },
    readWarnings(
      domIds: readonly string[],
    ): readonly Readonly<PowerWarnBuildingInput>[] {
      const root = dependencies.rootState.readRoot();
      const structures = dependencies.mechanics.readStructures();
      if (structures === undefined) return Object.freeze([]);
      const buildings = readCapturedSemanticBuildingStates(
        root,
        dependencies.controls,
        dependencies.mechanics,
      );
      if (buildings === undefined) return Object.freeze([]);
      const settingsValue = dependencies.readSettings();
      const settings = isRecord(settingsValue) ? settingsValue : {};
      return Object.freeze(
        domIds.flatMap((id) => {
          const warning = readWarning(
            root,
            settings,
            id,
            buildings,
            structures,
          );
          return warning === undefined ? [] : [warning];
        }),
      );
    },
  });
}
