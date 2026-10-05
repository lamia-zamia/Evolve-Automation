/**
 * Power policy that cannot be inferred from one immutable native grid sample. The live action
 * supplies power, support and fuel. Resource upkeep here is a pre-enable reservation: the
 * game's production ledger reports only currently running copies, so it cannot price switching
 * on a currently idle copy. The separate crew ranks express which jobs automation sacrifices.
 */

import type { PowerBuildingRule } from "../../../../domain/economy/production/power.ts";

export type CapturedPowerRuleKind = Exclude<
  PowerBuildingRule["kind"],
  "ordinary"
>;

export interface CapturedPowerBuildingMetadata {
  readonly crewValueRank: number;
  readonly rule: CapturedPowerRuleKind | "ordinary";
  readonly singleState: boolean;
  readonly ignorePositivePowerCap: boolean;
  readonly skipGroup: "none" | "lake" | "spire";
}

function metadata(
  fields: Partial<CapturedPowerBuildingMetadata> = {},
): CapturedPowerBuildingMetadata {
  return Object.freeze({
    crewValueRank: fields.crewValueRank ?? 1,
    rule: fields.rule ?? "ordinary",
    singleState: fields.singleState ?? false,
    ignorePositivePowerCap: fields.ignorePositivePowerCap ?? false,
    skipGroup: fields.skipGroup ?? "none",
  });
}

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

export function capturedPowerSmartEnabled(
  binding: string,
  settings: Readonly<Record<string, unknown>>,
): boolean {
  return settings[`bld_s2_${binding}`] === true;
}
