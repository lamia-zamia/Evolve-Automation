/**
 * Stable script metadata for captured Building settings.
 *
 * The game exposes a building row's localized title and live state through the captured control,
 * but the smart-management flag and the two linked smart groups belong to the script. Keeping
 * those facts here preserves the old settings surface without making BuildingManager authoritative
 * on the captured path.
 */

import { splitActionId } from "../../../validation.ts";

export const CAPTURED_BUILD_REGIONS: ReadonlySet<string> = new Set([
  "city",
  "space",
  "interstellar",
  "galaxy",
  "portal",
  "eden",
  "surface",
  "tauceti",
  "underground",
]);

/** DeadSpace 1.5.0's two city gather controls have an incorrect live element prefix. */
export const CITY_ELEMENT_BINDING_ALIASES: Readonly<Record<string, string>> =
  Object.freeze({
    "undefined-food": "city-food",
    "undefined-stone": "city-stone",
  });

const SMART_BUILDING_BINDINGS: ReadonlySet<string> = new Set([
  "city-mill",
  "city-cement_plant",
  "city-mine",
  "city-coal_mine",
  "city-tourist_center",
  "space-iridium_mine",
  "space-helium_mine",
  "space-gas_mining",
  "space-oil_extractor",
  "space-space_station",
  "space-elerium_ship",
  "space-iridium_ship",
  "space-iron_ship",
  "space-water_freighter",
  "space-lander",
  "space-orichalcum_mine",
  "space-uranium_mine",
  "space-neutronium_mine",
  "space-elerium_mine",
  "tauceti-mining_pit",
  "tauceti-overseer",
  "tauceti-womling_farm",
  "tauceti-womling_mine",
  "tauceti-womling_fun",
  "tauceti-womling_lab",
  "tauceti-whaling_station",
  "interstellar-zoo",
  "interstellar-harvester",
  "interstellar-ascension_trigger",
  "galaxy-bolognium_ship",
  "galaxy-scout_ship",
  "galaxy-corvette_ship",
  "galaxy-vitreloy_plant",
  "galaxy-armed_miner",
  "galaxy-minelayer",
  "galaxy-excavator",
  "galaxy-raider",
  "portal-attractor",
  "portal-guard_post",
  "portal-harbor",
  "portal-cooling_tower",
  "portal-bireme",
  "portal-transport",
  "portal-purifier",
  "portal-port",
  "portal-base_camp",
  "portal-mechbay",
  "portal-waygate",
  "eden-asphodel_harvester",
]);

const KNOWLEDGE_BUILDING_BINDINGS: ReadonlySet<string> = new Set([
  "city-university",
  "city-library",
  "city-wardenclyffe",
  "city-biolab",
  "space-satellite",
  "space-observatory",
  "space-red_university",
  "space-exotic_lab",
  "space-world_controller",
  "tauceti-alien_outpost",
  "tauceti-infectious_disease_lab",
  "tauceti-womling_lab",
  "interstellar-laboratory",
  "interstellar-far_reach",
  "galaxy-telemetry_beacon",
  "galaxy-symposium",
  "galaxy-scavenger",
  "portal-twisted_lab",
]);

/** The stable catalog keys used by the reset defaults' special cases. */
const SPECIAL_BINDINGS: Readonly<Record<string, string>> = Object.freeze({
  RedVrCenter: "space-vr_center",
  NeutronCitadel: "interstellar-citadel",
  PortalWarDroid: "portal-war_droid",
  BadlandsPredatorDrone: "portal-war_drone",
  PortalRepairDroid: "portal-repair_droid",
  SpireWaygate: "portal-waygate",
  TauRedContact: "tauceti-contact",
  TauRedIntroduce: "tauceti-introduce",
  TauRedSubjugate: "tauceti-subjugate",
  TauGasName1: "tauceti-gas_contest-a1",
  TauGasName2: "tauceti-gas_contest-a2",
  TauGasName3: "tauceti-gas_contest-a3",
  TauGasName4: "tauceti-gas_contest-a4",
  TauGasName5: "tauceti-gas_contest-a5",
  TauGasName6: "tauceti-gas_contest-a6",
  TauGasName7: "tauceti-gas_contest-a7",
  TauGasName8: "tauceti-gas_contest-a8",
  TauGas2Name1: "tauceti-gas_contest-b1",
  TauGas2Name2: "tauceti-gas_contest-b2",
  TauGas2Name3: "tauceti-gas_contest-b3",
  TauGas2Name4: "tauceti-gas_contest-b4",
  TauGas2Name5: "tauceti-gas_contest-b5",
  TauGas2Name6: "tauceti-gas_contest-b6",
  TauGas2Name7: "tauceti-gas_contest-b7",
  TauGas2Name8: "tauceti-gas_contest-b8",
  AlphaExoticZoo: "interstellar-zoo",
  ForgeHorseshoe: "city-horseshoe",
  RedForgeHorseshoe: "space-horseshoe",
  TauForgeHorseshoe: "tauceti-horseshoe",
  BeltEleriumShip: "space-elerium_ship",
  BeltIridiumShip: "space-iridium_ship",
});

const LINKED_SMART_GROUPS: readonly (readonly string[])[] = Object.freeze([
  Object.freeze(["portal-transport", "portal-bireme"]),
  Object.freeze(["portal-port", "portal-base_camp"]),
]);

export interface CapturedBuildingMetadata {
  readonly smart: boolean;
  readonly knowledge: boolean;
  readonly smartLinkedIds?: readonly string[];
}

export function bindingForBuildingElement(elementId: string): string {
  return CITY_ELEMENT_BINDING_ALIASES[elementId] ?? elementId;
}

export function metadataForBuilding(binding: string): CapturedBuildingMetadata {
  const linked = LINKED_SMART_GROUPS.find((group) => group.includes(binding));
  return Object.freeze({
    smart: SMART_BUILDING_BINDINGS.has(binding),
    knowledge: KNOWLEDGE_BUILDING_BINDINGS.has(binding),
    ...(linked === undefined ? {} : { smartLinkedIds: linked }),
  });
}

function titleCaseBuildingBindingKey(id: string): string {
  return id
    .split(/[_-]/u)
    .filter((part) => part.length > 0)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join("");
}

/**
 * Maps only catalog keys present in the current captured set. An absent action must not gain a
 * default setting merely because its old static name is known.
 */
export function readBuildingBindingByKey(
  bindings: readonly string[],
): Record<string, string> {
  const present = new Set(bindings);
  const result: Record<string, string> = {};
  for (const [key, binding] of Object.entries(SPECIAL_BINDINGS)) {
    if (present.has(binding)) result[key] = binding;
  }
  for (const binding of bindings) {
    const parts = splitActionId(binding);
    if (parts === undefined) continue;
    const key = titleCaseBuildingBindingKey(parts.id);
    if (key.length > 0 && result[key] === undefined) result[key] = binding;
  }
  return result;
}
