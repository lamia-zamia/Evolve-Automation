/**
 * Source identity and irreducible idle requirements from DeadSpace src/main.js at 6cc9ba8.
 * The production ledger is the authority for current totals. These base values are only
 * candidates for a future enable step; dynamic gates and drift checks live in the reader.
 */

import type { CapturedProductionBreakdown } from "../../../../ports/captured-game-mechanics.ts";
import { readProperty } from "../../../validation.ts";

export interface PowerIdleConsumptionFallback {
  readonly resourceId: string;
  readonly base: number | null;
  readonly sourceKey: string | null;
  readonly fuel: "space" | "interstellar" | null;
  readonly huge: boolean;
  /** Vitreloy and Foothold can consume fewer effective units than configured. */
  readonly linear: boolean;
  /** Whether the pinned write path mirrors the resource-rate operation. */
  readonly ledgerCredit: "safe" | "observation-only";
}

const idle = (
  resourceId: string,
  base: number | null,
  sourceKey: string | null,
  fuel: PowerIdleConsumptionFallback["fuel"] = null,
  huge = false,
  linear = true,
  ledgerCredit: PowerIdleConsumptionFallback["ledgerCredit"] = "safe",
): PowerIdleConsumptionFallback =>
  Object.freeze({
    resourceId,
    base,
    sourceKey,
    fuel,
    huge,
    linear,
    ledgerCredit,
  });

export const POWER_IDLE_CONSUMPTION_FALLBACK: Readonly<
  Record<string, readonly PowerIdleConsumptionFallback[]>
> = Object.freeze({
  "city-tourist_center": [idle("Food", 50, "tech_tourism", null, true)],
  "interstellar-zoo": [idle("Food", 12000, "tech_zoo", null, true)],
  "space-spaceport": [
    idle("Food", 25, "space_red_spaceport_title", null, true),
  ],
  "space-red_factory": [idle("Helium_3", 1, null, "space", true)],
  "space-space_barracks": [
    idle(
      "Oil",
      2,
      "tech_space_marines_bd",
      "space",
      true,
      true,
      "observation-only",
    ),
    idle("Food", 10, "tech_space_marines_bd", null, true),
  ],
  "space-outpost": [
    idle(
      "Oil",
      2,
      "space_gas_moon_outpost_bd",
      "space",
      true,
      true,
      "observation-only",
    ),
  ],
  "space-space_station": [
    idle("Food", 10, "space_belt_station_title", null, true),
  ],
  "interstellar-starport": [
    idle("Food", 100, "interstellar_alpha_starport_title", null, true),
  ],
  "interstellar-int_factory": [
    idle(
      "Deuterium",
      5,
      "interstellar_int_factory_title",
      "interstellar",
      true,
    ),
  ],
  "interstellar-cruiser": [
    idle(
      "Helium_3",
      6,
      "interstellar_cruiser_title",
      "interstellar",
      true,
      true,
      "observation-only",
    ),
  ],
  "interstellar-neutron_miner": [
    idle(
      "Helium_3",
      3,
      "interstellar_neutron_miner_title",
      "interstellar",
      true,
      true,
      "observation-only",
    ),
  ],
  "galaxy-starbase": [idle("Food", 250, "galaxy_starbase", null, true)],
  "galaxy-embassy": [idle("Food", 7500, "galaxy_embassy")],
  "galaxy-vitreloy_plant": [
    idle("Money", 50000, "galaxy_vitreloy_plant_bd", null, true, false),
    idle("Bolognium", 2.5, "galaxy_vitreloy_plant_bd", null, true, false),
    idle("Stanene", 100, "galaxy_vitreloy_plant_bd", null, true, false),
  ],
  "galaxy-foothold": [
    idle("Elerium", 2.5, "galaxy_foothold", null, true, false),
  ],
  "space-fob": [
    idle("Helium_3", 125, "tech_fob", "space", false, true, "observation-only"),
  ],
  "space-lander": [
    idle(
      "Oil",
      50,
      "space_lander_title",
      "space",
      true,
      true,
      "observation-only",
    ),
  ],
  // Ship fuel is reported only as one shared galaxy_fuel_consume row. It cannot be attributed
  // to an individual ship. Retain resource identity but never guess a per-ship marginal rate.
  "galaxy-bolognium_ship": [idle("Helium_3", null, null)],
  "galaxy-scout_ship": [idle("Helium_3", null, null)],
  "galaxy-corvette_ship": [idle("Helium_3", null, null)],
  "galaxy-frigate_ship": [idle("Helium_3", null, null)],
  "galaxy-cruiser_ship": [idle("Deuterium", null, null)],
  "galaxy-dreadnought": [idle("Deuterium", null, null)],
  "galaxy-freighter": [idle("Helium_3", null, null)],
  "galaxy-super_freighter": [idle("Helium_3", null, null)],
  "galaxy-armed_miner": [idle("Helium_3", null, null)],
  "galaxy-scavenger": [idle("Helium_3", null, null)],
  "galaxy-minelayer": [idle("Helium_3", null, null)],
  "galaxy-raider": [idle("Helium_3", null, null)],
});

/** A native source row is absent while off; absence says nothing about its idle requirement. */
export function readPowerNativeConsumption(
  breakdown: CapturedProductionBreakdown,
  resourceId: string,
  source: string,
): number | undefined {
  const row = breakdown.consumption[resourceId]?.[source];
  if (row === undefined) return 0;
  if (typeof row !== "number" || !Number.isFinite(row) || row > 0)
    return undefined;
  return row === 0 ? 0 : -row;
}

/** Only gates proven from the pinned production pass are represented here. */
export function readPowerIdleGate(
  root: unknown,
  binding: string,
  resourceId: string,
): number | null {
  const race = readProperty(root, "race");
  if (resourceId === "Food" && readProperty(race, "fasting")) return 0;
  if (binding === "space-space_station")
    return readProperty(race, "cataclysm") ? 0.1 : 1;
  if (binding === "space-spaceport") {
    const decayed = Boolean(readProperty(race, "orbit_decayed"));
    const isolation = Boolean(
      readProperty(readProperty(root, "tech"), "isolation"),
    );
    return Boolean(readProperty(race, "cataclysm")) || (decayed && !isolation)
      ? 2 / 25
      : 1;
  }
  if (binding === "space-space_barracks" && readProperty(race, "fasting"))
    return 0;
  if (binding === "space-space_barracks" && resourceId === "Food")
    return readProperty(race, "cataclysm") ? 0 : 1;
  if (binding === "galaxy-starbase" || binding === "galaxy-embassy") {
    const gate = readProperty(readProperty(root, "galaxy"), "s_gate");
    const on = readProperty(gate, "on");
    return typeof on === "number" && Number.isFinite(on) && on >= 0 ? on : null;
  }
  if (binding === "galaxy-foothold") {
    const gate = readProperty(readProperty(root, "galaxy"), "s_gate");
    return typeof readProperty(gate, "on") === "number"
      ? Number(readProperty(gate, "on")) > 0
        ? 1
        : 0
      : null;
  }
  if (binding === "space-lander") {
    const fob = readProperty(readProperty(root, "space"), "fob");
    return Number(readProperty(fob, "on")) > 0 ? 1 : 0;
  }
  return 1;
}
