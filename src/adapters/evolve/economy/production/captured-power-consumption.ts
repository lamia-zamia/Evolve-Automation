/** Ledger attribution and action-owned observation identity for pinned DeadSpace src/main.js. */
import type { CapturedProductionBreakdown } from "../../../../ports/captured-game-mechanics.ts";

export interface PowerIdleConsumptionSource {
  readonly resourceId: string;
  readonly sourceKey: string | null;
  /** Pinned action call site for review; the unmodified page does not export loc(). */
  readonly observation: {
    readonly upstreamLocalizationKey: string;
    readonly fromEnd: number;
  } | null;
  readonly ledgerCredit: "safe" | "observation-only";
  readonly clamped: boolean;
  readonly gate: "stargate" | "fob" | null;
  readonly rounded: boolean;
}

const powerIdleSourceIdentity = (
  resourceId: string,
  sourceKey: string | null,
  key: string | null = null,
  fromEnd = 0,
  ledgerCredit: PowerIdleConsumptionSource["ledgerCredit"] = "safe",
  clamped = false,
  gate: PowerIdleConsumptionSource["gate"] = null,
  rounded = false,
): PowerIdleConsumptionSource =>
  Object.freeze({
    resourceId,
    sourceKey,
    observation:
      key === null
        ? null
        : Object.freeze({ upstreamLocalizationKey: key, fromEnd }),
    ledgerCredit,
    clamped,
    gate,
    rounded,
  });

/** Null observations have no native per-unit authority; their ledger rows remain observable. */
export const POWER_IDLE_CONSUMPTION_SOURCES: Readonly<
  Record<string, readonly PowerIdleConsumptionSource[]>
> = Object.freeze({
  "city-tourist_center": [powerIdleSourceIdentity("Food", "tech_tourism")],
  "interstellar-zoo": [
    powerIdleSourceIdentity(
      "Food",
      "@title",
      "interstellar_alpha_starport_effect3",
    ),
  ],
  "space-spaceport": [powerIdleSourceIdentity("Food", "@title", "spend")],
  "space-red_factory": [
    powerIdleSourceIdentity(
      "Helium_3",
      "@title",
      "space_red_factory_effect3",
      1,
      "safe",
      false,
      null,
      true,
    ),
  ],
  "space-space_barracks": [
    powerIdleSourceIdentity(
      "Oil",
      "tech_space_marines_bd",
      "space_red_space_barracks_effect2",
      0,
      "observation-only",
      false,
      null,
      true,
    ),
    powerIdleSourceIdentity("Food", "tech_space_marines_bd"),
  ],
  "space-outpost": [
    powerIdleSourceIdentity(
      "Oil",
      "space_gas_moon_outpost_bd",
      "space_gas_moon_outpost_effect3",
      1,
      "observation-only",
      false,
      null,
      true,
    ),
  ],
  "space-space_station": [
    powerIdleSourceIdentity("Food", "@title", "space_belt_station_effect4", 1),
  ],
  "interstellar-starport": [
    powerIdleSourceIdentity(
      "Food",
      "@title",
      "interstellar_alpha_starport_effect3",
    ),
  ],
  "interstellar-int_factory": [
    powerIdleSourceIdentity(
      "Deuterium",
      "@title",
      "interstellar_fusion_effect",
      1,
      "safe",
      false,
      null,
      true,
    ),
  ],
  "interstellar-cruiser": [
    powerIdleSourceIdentity(
      "Helium_3",
      "@title",
      "space_belt_station_effect3",
      0,
      "observation-only",
      false,
      null,
      true,
    ),
  ],
  "interstellar-neutron_miner": [
    powerIdleSourceIdentity(
      "Helium_3",
      "@title",
      "interstellar_alpha_starport_effect2",
      1,
      "observation-only",
      false,
      null,
      true,
    ),
  ],
  "galaxy-starbase": [
    powerIdleSourceIdentity(
      "Food",
      "@title",
      "interstellar_alpha_starport_effect3",
      0,
      "safe",
      false,
      "stargate",
    ),
  ],
  "galaxy-embassy": [
    powerIdleSourceIdentity(
      "Food",
      "@title",
      "interstellar_alpha_starport_effect3",
      1,
      "safe",
      false,
      "stargate",
    ),
  ],
  "galaxy-vitreloy_plant": [
    powerIdleSourceIdentity(
      "Money",
      "galaxy_vitreloy_plant_bd",
      "galaxy_vitreloy_plant_effect3",
      1,
      "safe",
      true,
    ),
    powerIdleSourceIdentity(
      "Bolognium",
      "galaxy_vitreloy_plant_bd",
      "galaxy_vitreloy_plant_effect2",
      3,
      "safe",
      true,
    ),
    powerIdleSourceIdentity(
      "Stanene",
      "galaxy_vitreloy_plant_bd",
      "galaxy_vitreloy_plant_effect2",
      2,
      "safe",
      true,
    ),
  ],
  "galaxy-foothold": [
    powerIdleSourceIdentity(
      "Elerium",
      "@title",
      "galaxy_foothold_effect2",
      1,
      "safe",
      true,
      "stargate",
    ),
  ],
  "space-fob": [
    powerIdleSourceIdentity(
      "Helium_3",
      "tech_fob",
      "requires_power_combo_effect",
      0,
      "observation-only",
      false,
      null,
      true,
    ),
  ],
  "space-lander": [
    powerIdleSourceIdentity(
      "Oil",
      "@title",
      "space_red_space_barracks_effect2",
      0,
      "observation-only",
      true,
      "fob",
      true,
    ),
  ],
  // The game's galaxy_fuel_consume rows aggregate all ships.
  "galaxy-bolognium_ship": [powerIdleSourceIdentity("Helium_3", null)],
  "galaxy-scout_ship": [powerIdleSourceIdentity("Helium_3", null)],
  "galaxy-corvette_ship": [powerIdleSourceIdentity("Helium_3", null)],
  "galaxy-frigate_ship": [powerIdleSourceIdentity("Helium_3", null)],
  "galaxy-cruiser_ship": [powerIdleSourceIdentity("Deuterium", null)],
  "galaxy-dreadnought": [powerIdleSourceIdentity("Deuterium", null)],
  "galaxy-freighter": [powerIdleSourceIdentity("Helium_3", null)],
  "galaxy-super_freighter": [powerIdleSourceIdentity("Helium_3", null)],
  "galaxy-armed_miner": [powerIdleSourceIdentity("Helium_3", null)],
  "galaxy-scavenger": [powerIdleSourceIdentity("Helium_3", null)],
  "galaxy-minelayer": [powerIdleSourceIdentity("Helium_3", null)],
  "galaxy-raider": [powerIdleSourceIdentity("Helium_3", null)],
});

export function readPowerNativeConsumption(
  breakdown: CapturedProductionBreakdown,
  resourceId: string,
  sourceLabel: string,
): number | undefined {
  const row = breakdown.consumption[resourceId]?.[sourceLabel];
  if (row === undefined) return 0;
  if (typeof row !== "number" || !Number.isFinite(row) || row > 0)
    return undefined;
  return row === 0 ? 0 : -row;
}
