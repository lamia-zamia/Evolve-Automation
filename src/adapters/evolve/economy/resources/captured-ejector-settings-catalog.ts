/**
 * Projects the captured ejector resources into the Ejector settings catalog.
 *
 * DeadSpace draws one `#eject<id>` row per ejectable resource under `#resEjector`
 * and one `#supply<id>` row per shippable resource under `#resCargo`
 * (`src/resources.js` `loadEjector`/`loadSupply`), both vBind-bound — so the
 * consumable flags are the captured `eject<id>`/`supply<id>` control ids, the
 * same source the lifecycle defaults compute from. Labels come from the root
 * resource record. Upstream 1.5.0 has no `isCraftable`, so the legacy
 * craftable label color has no source here: Elerium and Infernite keep their
 * caution color, untradable resources the advanced one, the rest info. No
 * manager, entity bridge, or compatibility object is consulted.
 */

import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import { readEjector } from "../../captured-settings-defaults.ts";
import type { EjectorResourceDescriptor } from "../../../../domain/settings-defaults.ts";
import { isRecord, readProperty } from "../../../validation.ts";

export interface CapturedEjectorSettingsEntry {
  readonly resourceId: string;
  readonly ejectElementId: string;
  readonly supplyElementId: string;
  readonly label: string;
  readonly color: string;
  readonly atomicMass: number;
  readonly ejectConsumable: boolean;
  readonly naniteConsumable: boolean;
  readonly supplyConsumable: boolean;
  readonly supplyOut: string;
  readonly supplyIn: string;
}

function readCapturedEjectorResourceTitle(
  root: unknown,
  resourceId: string,
): string {
  const resource = readProperty(readProperty(root, "resource"), resourceId);
  if (!isRecord(resource)) return resourceId;
  const title = readProperty(resource, "title");
  if (typeof title === "string" && title.length > 0) return title;
  const name = readProperty(resource, "name");
  return typeof name === "string" && name.length > 0 ? name : resourceId;
}

function readCapturedEjectorColor(
  descriptor: EjectorResourceDescriptor,
): string {
  if (descriptor.id === "Elerium" || descriptor.id === "Infernite") {
    return "has-text-caution";
  }
  return descriptor.isTradable ? "has-text-info" : "has-text-advanced";
}

export function readCapturedEjectorSettingsEntries(
  root: unknown,
  controls: GameControlRegistry,
): readonly Readonly<CapturedEjectorSettingsEntry>[] {
  const { resources } = readEjector(root, controls);
  const entries: CapturedEjectorSettingsEntry[] = [];
  for (const descriptor of resources) {
    if (
      !descriptor.ejectConsumable &&
      !descriptor.naniteConsumable &&
      !descriptor.supplyConsumable
    ) {
      continue;
    }
    entries.push(
      Object.freeze({
        resourceId: descriptor.id,
        ejectElementId: `eject${descriptor.id}`,
        supplyElementId: `supply${descriptor.id}`,
        label: readCapturedEjectorResourceTitle(root, descriptor.id),
        color: readCapturedEjectorColor(descriptor),
        atomicMass: descriptor.atomicMass,
        ejectConsumable: descriptor.ejectConsumable,
        naniteConsumable: descriptor.naniteConsumable,
        supplyConsumable: descriptor.supplyConsumable,
        supplyOut: descriptor.supplyConsumable
          ? String(descriptor.supplyOut)
          : "",
        supplyIn: descriptor.supplyConsumable
          ? String(descriptor.supplyIn)
          : "",
      }),
    );
  }
  return Object.freeze(entries);
}
