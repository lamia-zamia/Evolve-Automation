/**
 * Stable Power policy recovered from the retired Building/entity adapter. The game owns live
 * action values and resource state; this catalog owns the declarations that were added by the
 * automation itself, including `produces`, ship/rule classifications and crew-shed order.
 */

import type { PowerBuildingRule } from "../../../../domain/economy/production/power.ts";
import { readProperty } from "../../../validation.ts";

export type CapturedPowerRatePolicy =
  | { readonly kind: "fixed"; readonly value: number }
  | { readonly kind: "luna-support" }
  | { readonly kind: "womling-village" }
  | { readonly kind: "smart-womling"; readonly value: number }
  | { readonly kind: "cataclysm-food"; readonly normal: number }
  | { readonly kind: "station-food" }
  | { readonly kind: "embassy-food" };

export interface CapturedPowerConsumptionMetadata {
  readonly resourceId: string;
  readonly policy: CapturedPowerRatePolicy;
}

export type CapturedPowerRuleKind = Exclude<
  PowerBuildingRule["kind"],
  "ordinary"
>;

export interface CapturedPowerBuildingMetadata {
  readonly consumptions: readonly CapturedPowerConsumptionMetadata[];
  readonly supportResourceId?: string;
  readonly produces: readonly string[];
  readonly ship: boolean;
  readonly crewValueRank: number;
  readonly rule: CapturedPowerRuleKind | "ordinary";
  readonly singleState: boolean;
  readonly ignorePositivePowerCap: boolean;
  readonly skipGroup: "none" | "lake" | "spire";
}

const fixedPowerRate = (value: number): CapturedPowerRatePolicy =>
  Object.freeze({ kind: "fixed", value });

function consumption(
  resourceId: string,
  policy: CapturedPowerRatePolicy | number,
): CapturedPowerConsumptionMetadata {
  return Object.freeze({
    resourceId,
    policy: typeof policy === "number" ? fixedPowerRate(policy) : policy,
  });
}

function metadata(
  fields: Partial<CapturedPowerBuildingMetadata> = {},
): CapturedPowerBuildingMetadata {
  return Object.freeze({
    consumptions: Object.freeze(fields.consumptions ?? []),
    ...(fields.supportResourceId === undefined
      ? {}
      : { supportResourceId: fields.supportResourceId }),
    produces: Object.freeze(fields.produces ?? []),
    ship: fields.ship ?? false,
    crewValueRank: fields.crewValueRank ?? 1,
    rule: fields.rule ?? "ordinary",
    singleState: fields.singleState ?? false,
    ignorePositivePowerCap: fields.ignorePositivePowerCap ?? false,
    skipGroup: fields.skipGroup ?? "none",
  });
}

const lunaSupport = Object.freeze({ kind: "luna-support" } as const);
const womlingVillage = Object.freeze({ kind: "womling-village" } as const);
const stationFood = Object.freeze({ kind: "station-food" } as const);
const embassyFood = Object.freeze({ kind: "embassy-food" } as const);

const POWER_DECLARED_CONSUMPTIONS: Readonly<
  Record<string, readonly CapturedPowerConsumptionMetadata[]>
> = Object.freeze({
  "city-tourist_center": [consumption("Food", 50)],
  "space-nav_beacon": [consumption("Red_Support", lunaSupport)],
  "interstellar-zoo": [
    consumption("Alpha_Support", 1),
    consumption("Food", 12000),
  ],
  "space-decoder": [consumption("Titan_Support", 1)],
  "space-electrolysis": [consumption("Electrolysis_Support", -1)],
  "space-hydrogen_plant": [consumption("Electrolysis_Support", 1)],
  "tauceti-womling_village": [consumption("Womlings_Support", womlingVillage)],
  "tauceti-womling_farm": [
    consumption("Womlings_Support", { kind: "smart-womling", value: 2 }),
  ],
  "tauceti-womling_lab": [
    consumption("Womlings_Support", { kind: "smart-womling", value: 1 }),
  ],
  "tauceti-womling_mine": [
    consumption("Womlings_Support", { kind: "smart-womling", value: 6 }),
  ],
  "space-spaceport": [
    consumption("Food", { kind: "cataclysm-food", normal: 25 }),
  ],
  "space-red_factory": [consumption("Helium_3", 1)],
  "space-space_barracks": [
    consumption("Oil", 2),
    consumption("Food", { kind: "cataclysm-food", normal: 10 }),
  ],
  "space-outpost": [consumption("Oil", 2)],
  "space-space_station": [consumption("Food", stationFood)],
  "interstellar-starport": [consumption("Food", 100)],
  "interstellar-int_factory": [consumption("Deuterium", 5)],
  "interstellar-cruiser": [consumption("Helium_3", 6)],
  "interstellar-neutron_miner": [consumption("Helium_3", 3)],
  "galaxy-starbase": [consumption("Food", 250)],
  "galaxy-bolognium_ship": [consumption("Helium_3", 5)],
  "galaxy-scout_ship": [consumption("Helium_3", 6)],
  "galaxy-corvette_ship": [consumption("Helium_3", 10)],
  "galaxy-frigate_ship": [consumption("Helium_3", 25)],
  "galaxy-cruiser_ship": [consumption("Deuterium", 25)],
  "galaxy-dreadnought": [consumption("Deuterium", 80)],
  "galaxy-embassy": [consumption("Food", embassyFood)],
  "galaxy-freighter": [consumption("Helium_3", 12)],
  "galaxy-vitreloy_plant": [
    consumption("Bolognium", 2.5),
    consumption("Stanene", 100),
    consumption("Money", 50000),
  ],
  "galaxy-super_freighter": [consumption("Helium_3", 25)],
  "galaxy-foothold": [consumption("Elerium", 2.5)],
  "galaxy-armed_miner": [consumption("Helium_3", 10)],
  "galaxy-scavenger": [consumption("Helium_3", 12)],
  "galaxy-minelayer": [consumption("Helium_3", 8)],
  "galaxy-raider": [consumption("Helium_3", 18)],
  "space-fob": [consumption("Helium_3", 125)],
  "space-lander": [consumption("Oil", 50)],
});

const POWER_SUPPORT_RESOURCE_BY_BINDING: Readonly<Record<string, string>> =
  Object.freeze({
    "galaxy-foothold": "Alien_Support",
    "galaxy-armed_miner": "Alien_Support",
    "galaxy-ore_processor": "Alien_Support",
    "galaxy-scavenger": "Alien_Support",
    "interstellar-starport": "Alpha_Support",
    "interstellar-habitat": "Alpha_Support",
    "interstellar-mining_droid": "Alpha_Support",
    "interstellar-processing": "Alpha_Support",
    "interstellar-fusion": "Alpha_Support",
    "interstellar-laboratory": "Alpha_Support",
    "interstellar-exchange": "Alpha_Support",
    "interstellar-g_factory": "Alpha_Support",
    "interstellar-xfer_station": "Alpha_Support",
    "eden-encampment": "Asphodel_Support",
    "eden-soul_engine": "Asphodel_Support",
    "eden-research_station": "Asphodel_Support",
    "eden-asphodel_harvester": "Asphodel_Support",
    "eden-ectoplasm_processor": "Asphodel_Support",
    "eden-bunker": "Asphodel_Support",
    "eden-bliss_den": "Asphodel_Support",
    "eden-rectory": "Asphodel_Support",
    "eden-corruptor": "Asphodel_Support",
    "space-space_station": "Belt_Support",
    "space-elerium_ship": "Belt_Support",
    "space-iridium_ship": "Belt_Support",
    "space-iron_ship": "Belt_Support",
    "space-titan_spaceport": "Enceladus_Support",
    "space-water_freighter": "Enceladus_Support",
    "space-zero_g_lab": "Enceladus_Support",
    "space-operating_base": "Enceladus_Support",
    "space-drone_control": "Eris_Support",
    "space-shock_trooper": "Eris_Support",
    "space-tank": "Eris_Support",
    "galaxy-starbase": "Gateway_Support",
    "galaxy-ship_dock": "Gateway_Support",
    "galaxy-bolognium_ship": "Gateway_Support",
    "galaxy-scout_ship": "Gateway_Support",
    "galaxy-corvette_ship": "Gateway_Support",
    "galaxy-frigate_ship": "Gateway_Support",
    "galaxy-cruiser_ship": "Gateway_Support",
    "galaxy-dreadnought": "Gateway_Support",
    "galaxy-gateway_station": "Gateway_Support",
    "galaxy-telemetry_beacon": "Gateway_Support",
    "portal-harbor": "Lake_Support",
    "portal-bireme": "Lake_Support",
    "portal-transport": "Lake_Support",
    "space-nav_beacon": "Moon_Support",
    "space-moon_base": "Moon_Support",
    "space-iridium_mine": "Moon_Support",
    "space-helium_mine": "Moon_Support",
    "space-observatory": "Moon_Support",
    "interstellar-nexus": "Nebula_Support",
    "interstellar-harvester": "Nebula_Support",
    "interstellar-elerium_prospector": "Nebula_Support",
    "space-spaceport": "Red_Support",
    "space-red_tower": "Red_Support",
    "space-living_quarters": "Red_Support",
    "space-vr_center": "Red_Support",
    "space-red_mine": "Red_Support",
    "space-fabrication": "Red_Support",
    "space-biodome": "Red_Support",
    "space-exotic_lab": "Red_Support",
    "portal-purifier": "Spire_Support",
    "portal-port": "Spire_Support",
    "portal-base_camp": "Spire_Support",
    "portal-mechbay": "Spire_Support",
    "space-swarm_control": "Sun_Support",
    "space-swarm_satellite": "Sun_Support",
    "tauceti-patrol_ship": "Tau_Belt_Support",
    "tauceti-mining_ship": "Tau_Belt_Support",
    "tauceti-whaling_ship": "Tau_Belt_Support",
    "tauceti-orbital_platform": "Tau_Red_Support",
    "tauceti-overseer": "Tau_Red_Support",
    "tauceti-womling_village": "Tau_Red_Support",
    "tauceti-womling_farm": "Tau_Red_Support",
    "tauceti-womling_mine": "Tau_Red_Support",
    "tauceti-womling_fun": "Tau_Red_Support",
    "tauceti-womling_lab": "Tau_Red_Support",
    "tauceti-orbital_station": "Tau_Support",
    "tauceti-tau_farm": "Tau_Support",
    "tauceti-colony": "Tau_Support",
    "tauceti-tau_factory": "Tau_Support",
    "tauceti-infectious_disease_lab": "Tau_Support",
    "tauceti-mining_pit": "Tau_Support",
    "space-electrolysis": "Titan_Support",
    "space-titan_quarters": "Titan_Support",
    "space-titan_mine": "Titan_Support",
    "space-g_factory": "Titan_Support",
  });

const SUPPORT_TYPE_BY_RESOURCE: Readonly<Record<string, string>> =
  Object.freeze({
    Alien_Support: "alien2",
    Alpha_Support: "alpha",
    Asphodel_Support: "asphodel",
    Belt_Support: "belt",
    Enceladus_Support: "enceladus",
    Eris_Support: "eris",
    Gateway_Support: "gateway",
    Lake_Support: "lake",
    Moon_Support: "moon",
    Nebula_Support: "nebula",
    Red_Support: "red",
    Spire_Support: "spire",
    Sun_Support: "sun",
    Tau_Belt_Support: "tau_roid",
    Tau_Red_Support: "tau_red",
    Tau_Support: "tau_home",
    Titan_Support: "titan",
    Electrolysis_Support: "titan",
    Womlings_Support: "tau_red",
  });

const POWER_PRODUCES_BY_BINDING: Readonly<Record<string, readonly string[]>> =
  Object.freeze({
    "space-gas_mining": Object.freeze(["Helium_3"]),
    "space-oil_extractor": Object.freeze(["Oil"]),
    "city-coal_mine": Object.freeze(["Coal"]),
    "interstellar-harvester": Object.freeze(["Helium_3", "Deuterium"]),
    "space-elerium_mine": Object.freeze(["Elerium"]),
    "space-water_freighter": Object.freeze(["Water"]),
  });

const POWER_RULE_BY_BINDING: Readonly<Record<string, CapturedPowerRuleKind>> =
  Object.freeze({
    "interstellar-citadel": "neutron-citadel",
    "space-space_station": "belt-space-station",
    "city-cement_plant": "job-dependent",
    "city-mine": "job-dependent",
    "city-coal_mine": "job-dependent",
    "portal-cooling_tower": "lake-cooling-tower",
    "portal-harbor": "lake-harbor",
    "space-gas_mining": "busy-resource",
    "space-oil_extractor": "busy-resource",
    "space-orichalcum_mine": "busy-resource",
    "space-uranium_mine": "busy-resource",
    "space-neutronium_mine": "busy-resource",
    "space-elerium_mine": "busy-resource",
    "space-iridium_ship": "busy-resource",
    "space-iron_ship": "busy-resource",
    "space-elerium_ship": "busy-resource",
    "space-iridium_mine": "busy-resource",
    "space-helium_mine": "busy-resource",
    "galaxy-vitreloy_plant": "busy-resource",
    "galaxy-excavator": "busy-resource",
    "space-water_freighter": "busy-resource",
    "eden-asphodel_harvester": "busy-resource",
    "space-lander": "triton-lander",
    "interstellar-ascension_trigger": "ascension-trigger",
    "space-red_terraformer": "terraformer",
    "portal-attractor": "badlands-attractor",
    "city-tourist_center": "tourist-center",
    "city-mill": "mill",
    "galaxy-minelayer": "chthonian-mine-layer",
    "portal-guard_post": "ruins-guard-post",
    "portal-waygate": "spire-waygate",
    "galaxy-scout_ship": "early-galaxy-ship",
    "galaxy-corvette_ship": "early-galaxy-ship",
    "galaxy-armed_miner": "armed-miner",
    "galaxy-bolognium_ship": "bolognium-ship",
    "galaxy-raider": "chthonian-raider",
    "interstellar-harvester": "dual-resource",
    "tauceti-womling_farm": "womling-farm",
    "tauceti-overseer": "womling-overseer",
    "tauceti-womling_fun": "womling-fun",
    "tauceti-whaling_station": "tau-whaling-station",
    "tauceti-mining_pit": "tau-mining-pit",
    "interstellar-zoo": "exotic-zoo",
  });

const SHIP_BINDINGS: ReadonlySet<string> = new Set([
  "galaxy-bolognium_ship",
  "galaxy-scout_ship",
  "galaxy-corvette_ship",
  "galaxy-frigate_ship",
  "galaxy-cruiser_ship",
  "galaxy-dreadnought",
  "galaxy-freighter",
  "galaxy-super_freighter",
  "galaxy-armed_miner",
  "galaxy-scavenger",
  "galaxy-minelayer",
  "galaxy-raider",
]);

const CREW_VALUE_RANK_BY_BINDING: Readonly<Record<string, number>> =
  Object.freeze({
    "galaxy-freighter": 0,
    "galaxy-super_freighter": 0,
    "galaxy-bolognium_ship": 1,
    "galaxy-armed_miner": 1,
    "galaxy-raider": 1,
    "galaxy-minelayer": 1,
    "galaxy-scavenger": 1,
    "portal-bireme": 2,
    "portal-transport": 2,
    "galaxy-scout_ship": 3,
    "galaxy-corvette_ship": 3,
    "galaxy-frigate_ship": 3,
    "galaxy-cruiser_ship": 3,
    "galaxy-dreadnought": 3,
  });

export function capturedPowerMetadataForBinding(
  binding: string,
): CapturedPowerBuildingMetadata {
  const base = metadata({
    ...(POWER_DECLARED_CONSUMPTIONS[binding] === undefined
      ? {}
      : { consumptions: POWER_DECLARED_CONSUMPTIONS[binding] }),
    ...(POWER_SUPPORT_RESOURCE_BY_BINDING[binding] === undefined
      ? {}
      : { supportResourceId: POWER_SUPPORT_RESOURCE_BY_BINDING[binding] }),
    ...(POWER_PRODUCES_BY_BINDING[binding] === undefined
      ? {}
      : { produces: POWER_PRODUCES_BY_BINDING[binding] }),
    ship: SHIP_BINDINGS.has(binding),
    ...(CREW_VALUE_RANK_BY_BINDING[binding] === undefined
      ? {}
      : { crewValueRank: CREW_VALUE_RANK_BY_BINDING[binding] }),
    ...(POWER_RULE_BY_BINDING[binding] === undefined
      ? {}
      : { rule: POWER_RULE_BY_BINDING[binding] }),
    singleState: binding === "city-banquet",
    ignorePositivePowerCap: binding === "portal-hell_forge",
    skipGroup: ["portal-port", "portal-base_camp", "portal-mechbay"].includes(
      binding,
    )
      ? "spire"
      : ["portal-transport", "portal-bireme"].includes(binding)
        ? "lake"
        : "none",
  });
  return base;
}

export function capturedPowerSupportType(
  resourceId: string,
): string | undefined {
  return SUPPORT_TYPE_BY_RESOURCE[resourceId];
}

function truthy(root: unknown, path: readonly string[]): boolean {
  let value = root;
  for (const key of path) value = readProperty(value, key);
  return Boolean(value);
}

function numberAt(root: unknown, path: readonly string[]): number {
  let value = root;
  for (const key of path) value = readProperty(value, key);
  try {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  } catch {
    return 0;
  }
}

/** Evaluates the one retired addResourceConsumption declaration policy by its stable key. */
export function readCapturedPowerConsumptionRate(
  root: unknown,
  binding: string,
  settings: Readonly<Record<string, unknown>>,
  consumption: CapturedPowerConsumptionMetadata,
): number {
  const policy = consumption.policy;
  const race = ["race"] as const;
  const fasting = truthy(root, [...race, "fasting"]);
  switch (policy.kind) {
    case "fixed":
      return policy.value;
    case "luna-support":
      return numberAt(root, ["tech", "luna"]) >= 3 ? -1 : 0;
    case "womling-village":
      return numberAt(root, ["tech", "womling_pop"]) >= 2 ? -6 : -5;
    case "smart-womling":
      return settings[`bld_s2_${binding}`] === true ? policy.value : 0;
    case "cataclysm-food":
      return truthy(root, [...race, "cataclysm"]) ||
        truthy(root, [...race, "orbit_decayed"])
        ? policy.normal === 25
          ? 2
          : 0
        : policy.normal;
    case "station-food":
      return truthy(root, [...race, "cataclysm"]) ||
        truthy(root, [...race, "orbit_decayed"])
        ? 1
        : 10;
    case "embassy-food":
      return fasting ? 0 : 7500;
  }
}

export function capturedPowerSmartEnabled(
  binding: string,
  settings: Readonly<Record<string, unknown>>,
): boolean {
  return settings[`bld_s2_${binding}`] === true;
}
