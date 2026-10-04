/** Captured power-warning shutdown over the game's rendered warning markers. */

import type { PowerWarnBuildingInput } from "../../../../domain/economy/production/power.ts";
import type { PowerWarningSource } from "../../../../ports/power.ts";
import type { CapturedGameMechanics } from "../../../../ports/captured-game-mechanics.ts";
import { readCapturedSemanticBuildingStates } from "../../progression/build/captured-building-availability.ts";
import { readNativePowerSupports } from "./captured-power-reader.ts";
import type { PowerSupportInput } from "../../../../domain/economy/production/power.ts";
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
  settings: Record<PropertyKey, unknown>,
  elementId: string,
  buildings: readonly Readonly<CapturedBuildingState>[],
  supports: ReadonlyMap<string, PowerSupportInput>,
): Readonly<PowerWarnBuildingInput> | undefined {
  const building = buildings.find(
    (entry) => entry.catalog.elementId === elementId,
  );
  if (building === undefined || !building.available || !building.hasState)
    return undefined;
  const stateOn = building.stateOn;
  const binding = building.catalog.binding;
  const belt = [
    "space-elerium_ship",
    "space-iridium_ship",
    "space-iron_ship",
  ].includes(binding);
  const lake = ["portal-bireme", "portal-transport"].includes(binding);
  const tau = ["tauceti-whaling_ship", "tauceti-mining_ship"].includes(binding);
  const warningKind = belt
    ? binding === "space-elerium_ship"
      ? "belt-elerium"
      : binding === "space-iridium_ship"
        ? "belt-iridium"
        : "belt-iron"
    : lake
      ? binding === "portal-bireme"
        ? "lake-bireme"
        : "lake-transport"
      : tau
        ? binding === "tauceti-whaling_ship"
          ? "tau-whaling"
          : "tau-mining"
        : "ordinary";
  const beltSupport = belt ? supports.get("belt") : undefined;
  const lakeSupport = lake ? supports.get("lake") : undefined;
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
    beltSupportNeeded: beltSupport?.current ?? 0,
    beltSupportMaximum: beltSupport?.maximum ?? 0,
    lakeSupportNeeded: lakeSupport?.current ?? 0,
    lakeSupportMaximum: lakeSupport?.maximum ?? 0,
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
      const nativeSupports = readNativePowerSupports(
        root,
        dependencies.mechanics,
        structures,
      );
      if (nativeSupports === undefined) return Object.freeze([]);
      const supports = new Map(nativeSupports.map((item) => [item.type, item]));
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
          const warning = readWarning(settings, id, buildings, supports);
          return warning === undefined ? [] : [warning];
        }),
      );
    },
  });
}
