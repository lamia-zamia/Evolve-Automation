/**
 * Power policy that cannot be inferred from one immutable native grid sample. The live action
 * supplies power, support and fuel. Resource upkeep here is a pre-enable reservation: the
 * game's production ledger reports only currently running copies, so it cannot price switching
 * on a currently idle copy. The separate crew ranks express which jobs automation sacrifices.
 */

import type { PowerBuildingRule } from "../../../../domain/economy/production/power.ts";
import { readProperty } from "../../../validation.ts";

export type CapturedPowerRatePolicy =
  | { readonly kind: "fixed"; readonly value: number }
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
    crewValueRank: fields.crewValueRank ?? 1,
    rule: fields.rule ?? "ordinary",
    singleState: fields.singleState ?? false,
    ignorePositivePowerCap: fields.ignorePositivePowerCap ?? false,
    skipGroup: fields.skipGroup ?? "none",
  });
}

const stationFood = Object.freeze({ kind: "station-food" } as const);
const embassyFood = Object.freeze({ kind: "embassy-food" } as const);

const POWER_PREENABLE_RESOURCE_RESERVATIONS: Readonly<
  Record<string, readonly CapturedPowerConsumptionMetadata[]>
> = Object.freeze({
  "city-tourist_center": [consumption("Food", 50)],
  "interstellar-zoo": [consumption("Food", 12000)],
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

const POWER_RULE_BY_BINDING: Readonly<Record<string, CapturedPowerRuleKind>> =
  Object.freeze({
    "interstellar-citadel": "neutron-citadel",
    "space-space_station": "belt-space-station",
    "city-cement_plant": "job-dependent",
    "city-mine": "job-dependent",
    "city-coal_mine": "job-dependent",
    "portal-cooling_tower": "lake-cooling-tower",
    "portal-harbor": "lake-harbor",
    "space-iridium_ship": "busy-resource",
    "space-iron_ship": "busy-resource",
    "space-elerium_ship": "busy-resource",
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

/** Automation priorities, not a claim about native ship classes or crew requirements. */
const POWER_CREW_SHEDDING_RANK: Readonly<Record<string, number>> =
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
    ...(POWER_PREENABLE_RESOURCE_RESERVATIONS[binding] === undefined
      ? {}
      : { consumptions: POWER_PREENABLE_RESOURCE_RESERVATIONS[binding] }),
    ...(POWER_CREW_SHEDDING_RANK[binding] === undefined
      ? {}
      : { crewValueRank: POWER_CREW_SHEDDING_RANK[binding] }),
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

function truthy(root: unknown, path: readonly string[]): boolean {
  let value = root;
  for (const key of path) value = readProperty(value, key);
  return Boolean(value);
}

/** Evaluates the one retired addResourceConsumption declaration policy by its stable key. */
export function readCapturedPowerConsumptionRate(
  root: unknown,
  consumption: CapturedPowerConsumptionMetadata,
): number {
  const policy = consumption.policy;
  const race = ["race"] as const;
  const fasting = truthy(root, [...race, "fasting"]);
  switch (policy.kind) {
    case "fixed":
      return policy.value;
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
