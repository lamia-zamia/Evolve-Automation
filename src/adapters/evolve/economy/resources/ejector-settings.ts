import {
  requireFunction,
  requireNumber,
  requireRecord,
} from "../../../validation.ts";
import {
  createEjectorSettingsReadModel,
  type EjectorSettingsReadModel,
  type EjectorSettingsRow,
} from "../../../../domain/economy/resources/ejector-settings.ts";
import type { EjectorSettingsReader } from "../../../../ports/ejector-settings.ts";

export interface EjectorSettingsEvolveDependencies {
  readonly getResources: () => unknown;
  readonly getEjectManager: () => unknown;
  readonly getNaniteManager: () => unknown;
  readonly getSupplyManager: () => unknown;
  readonly getSettingsRaw: () => unknown;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${path} must be a string`);
  }
  return value;
}

function readConsumable(
  manager: Record<PropertyKey, unknown>,
  resource: Record<PropertyKey, unknown>,
  path: string,
): boolean {
  const isConsumable = requireFunction(
    manager["isConsumable"],
    `${path}.isConsumable`,
  );
  return Boolean(Reflect.apply(isConsumable, manager, [resource]));
}

function readResourceRows(
  resourcesValue: unknown,
  ejectManagerValue: unknown,
  naniteManagerValue: unknown,
  supplyManagerValue: unknown,
  settingsRawValue: unknown,
): readonly EjectorSettingsRow[] {
  const resources = requireRecord(resourcesValue, "resources");
  const ejectManager = requireRecord(ejectManagerValue, "EjectManager");
  const naniteManager = requireRecord(naniteManagerValue, "NaniteManager");
  const supplyManager = requireRecord(supplyManagerValue, "SupplyManager");
  const settingsRaw = requireRecord(settingsRawValue, "settingsRaw");
  const rows: EjectorSettingsRow[] = [];

  for (const [key, rawResource] of Object.entries(resources)) {
    const resource = requireRecord(rawResource, `resources.${key}`);
    const id = requireString(resource["id"], `resources.${key}.id`);
    const name = requireString(resource["name"], `resources.${key}.name`);
    const state = requireRecord(resource["is"], `resources.${key}.is`);
    const atomicMass = requireNumber(
      resource["atomicMass"],
      `resources.${key}.atomicMass`,
    );
    const isCraftable = requireFunction(
      resource["isCraftable"],
      `resources.${key}.isCraftable`,
    );
    const ejectConsumable = readConsumable(
      ejectManager,
      resource,
      "EjectManager",
    );
    const naniteConsumable = readConsumable(
      naniteManager,
      resource,
      "NaniteManager",
    );
    const supplyConsumable = readConsumable(
      supplyManager,
      resource,
      "SupplyManager",
    );

    if (!ejectConsumable && !naniteConsumable && !supplyConsumable) continue;

    const craftable = Boolean(Reflect.apply(isCraftable, resource, []));
    const color =
      id === "Elerium" || id === "Infernite"
        ? "has-text-caution"
        : craftable
          ? "has-text-danger"
          : !state["tradable"]
            ? "has-text-advanced"
            : "has-text-info";
    const supplyOut = supplyConsumable
      ? String(
          Reflect.apply(
            requireFunction(
              supplyManager["supplyOut"],
              "SupplyManager.supplyOut",
            ),
            supplyManager,
            [id],
          ),
        )
      : "";
    const supplyIn = supplyConsumable
      ? String(
          Reflect.apply(
            requireFunction(
              supplyManager["supplyIn"],
              "SupplyManager.supplyIn",
            ),
            supplyManager,
            [id],
          ),
        )
      : "";

    rows.push({
      id,
      label: name,
      color,
      atomicMass,
      ejectEnabled: Boolean(settingsRaw[`res_eject${id}`]),
      naniteEnabled: Boolean(settingsRaw[`res_nanite${id}`]),
      supplyEnabled: Boolean(settingsRaw[`res_supply${id}`]),
      ejectSettingName: `res_eject${id}`,
      naniteSettingName: `res_nanite${id}`,
      supplySettingName: `res_supply${id}`,
      supplyOut,
      supplyIn,
      showEject: ejectConsumable,
      showNanite: naniteConsumable,
      showSupply: supplyConsumable,
    });
  }
  return Object.freeze(rows.map((row) => Object.freeze(row)));
}

/** Reads the volatile Evolve resource catalog needed by the Ejector panel. */
export function createEjectorSettingsEvolveAdapter({
  getResources,
  getEjectManager,
  getNaniteManager,
  getSupplyManager,
  getSettingsRaw,
}: EjectorSettingsEvolveDependencies): EjectorSettingsReader {
  return Object.freeze({
    read(): EjectorSettingsReadModel {
      return createEjectorSettingsReadModel(
        readResourceRows(
          getResources(),
          getEjectManager(),
          getNaniteManager(),
          getSupplyManager(),
          getSettingsRaw(),
        ),
      );
    },
  });
}
