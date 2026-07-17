export type GalaxyPiracyResourceId =
  | "Adamantite"
  | "Bolognium"
  | "Iridium"
  | "Knowledge"
  | "Orichalcum"
  | "Vitreloy";

export interface GalaxyPiracyProducers {
  readonly bologniumShip: boolean;
  readonly gorddonSymposium: boolean;
  readonly alien1VitreloyPlant: boolean;
  readonly alien2ArmedMiner: boolean;
  readonly alien2Scavenger: boolean;
  readonly chthonianExcavator: boolean;
}

export type GalaxyPiracyResourceDemand = Readonly<
  Record<GalaxyPiracyResourceId, boolean>
>;

export interface GalaxyPiracyDemandInput {
  readonly producers: Readonly<GalaxyPiracyProducers>;
  readonly usefulResources: GalaxyPiracyResourceDemand;
  readonly gorddonTradeTargetsUsefulResource: boolean;
}

export interface GalaxyPiracyProtection {
  readonly gxy_stargate: boolean;
  readonly gxy_gateway: boolean;
  readonly gxy_gorddon: boolean;
  readonly gxy_alien1: boolean;
  readonly gxy_alien2: boolean;
  readonly gxy_chthonian: boolean;
}

function anyUseful(
  demand: GalaxyPiracyResourceDemand,
  resourceIds: readonly GalaxyPiracyResourceId[],
): boolean {
  return resourceIds.some((resourceId) => demand[resourceId]);
}

/**
 * Selects regions where piracy reduction improves an output the current cycle needs.
 * Stargate piracy multiplies every other region, so it is useful whenever any downstream
 * region is useful.
 */
export function decideGalaxyPiracyProtection(
  input: Readonly<GalaxyPiracyDemandInput>,
): GalaxyPiracyProtection {
  const { producers, usefulResources } = input;
  const gxy_gateway = producers.bologniumShip && usefulResources.Bolognium;
  const gxy_gorddon =
    input.gorddonTradeTargetsUsefulResource ||
    (producers.gorddonSymposium && usefulResources.Knowledge);
  const gxy_alien1 = producers.alien1VitreloyPlant && usefulResources.Vitreloy;
  const gxy_alien2 =
    (producers.alien2ArmedMiner &&
      anyUseful(usefulResources, ["Adamantite", "Bolognium", "Iridium"])) ||
    (producers.alien2Scavenger && usefulResources.Knowledge);
  // Raider by-products do not justify crewing the Gateway fleet. In particular, combat ships
  // consume Deuterium and can otherwise create the very demand used to keep themselves active.
  const gxy_chthonian =
    producers.chthonianExcavator && usefulResources.Orichalcum;
  const gxy_stargate =
    gxy_gateway || gxy_gorddon || gxy_alien1 || gxy_alien2 || gxy_chthonian;

  return {
    gxy_stargate,
    gxy_gateway,
    gxy_gorddon,
    gxy_alien1,
    gxy_alien2,
    gxy_chthonian,
  };
}
