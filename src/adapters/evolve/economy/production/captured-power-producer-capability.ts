/**
 * Identity-only fallback for producers whose source row vanishes while off.
 * DeadSpace's production ledger reports current output, not static capability.
 * Keep rates and all production formulas with the native ledger.
 */
const POWER_PRODUCER_CAPABILITY_FALLBACK: Readonly<
  Record<string, readonly string[]>
> = Object.freeze({
  "space-gas_mining": ["Helium_3"],
  "space-oil_extractor": ["Oil"],
  "city-coal_mine": ["Coal"],
  "interstellar-harvester": ["Helium_3", "Deuterium"],
  "space-elerium_mine": ["Elerium"],
  "space-water_freighter": ["Water"],
  "space-iridium_ship": ["Iridium"],
  "space-iron_ship": ["Iron"],
  "space-elerium_ship": ["Elerium"],
  "space-iridium_mine": ["Iridium"],
  "space-helium_mine": ["Helium_3"],
  "space-uranium_mine": ["Uranium"],
  "space-neutronium_mine": ["Neutronium"],
  "space-orichalcum_mine": ["Orichalcum"],
  "galaxy-vitreloy_plant": ["Vitreloy"],
  "galaxy-excavator": ["Orichalcum"],
  "eden-asphodel_harvester": ["Asphodel_Powder"],
});

export function capturedPowerProducerCapability(
  binding: string,
): readonly string[] {
  return Object.freeze([
    ...(POWER_PRODUCER_CAPABILITY_FALLBACK[binding] ?? []),
  ]);
}
