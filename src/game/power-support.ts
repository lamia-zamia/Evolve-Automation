type CountEntry = { count: number };
type ActiveEntry = { stateOnCount: number };
type AdjustableEntry = ActiveEntry & {
  tryAdjustState: (amount: number) => void;
};
type SmartEntry = { isSmartManaged: () => boolean };
type PrebuiltEntry = CountEntry & { autoMax: number };

/** Whether each spire building is still short of its prebuild target. */
export type SpirePrebuildShortfall = {
  ports: boolean;
  baseCamps: boolean;
};

type PowerSupportDependencies = {
  getGame: () => { global: { race: Record<string, unknown> } };
  getJobs: () => { Archaeologist: CountEntry };
  getCrafter: () => { Scarletite: CountEntry };
  getResources: () => { Spire_Support: { maxQuantity: number } };
  getBuildings: () => {
    RuinsArcology: ActiveEntry;
    GateInferniteMine: ActiveEntry;
    NeutronCitadel: CountEntry;
    SpireMechBay: AdjustableEntry & SmartEntry;
    SpirePurifier: SmartEntry;
    SpirePort: AdjustableEntry & PrebuiltEntry;
    SpireBaseCamp: AdjustableEntry & PrebuiltEntry;
  };
};

export function createPowerSupport({
  getGame,
  getJobs,
  getCrafter,
  getResources,
  getBuildings,
}: PowerSupportDependencies) {
  function getCitadelConsumption(amount: number) {
    return (
      (30 + (amount - 1) * 2.5) *
      amount *
      (getGame().global.race["emfield"] ? 1.5 : 1)
    );
  }

  function isHellSupressUseful() {
    const buildings = getBuildings();
    return (
      getJobs().Archaeologist.count > 0 ||
      getCrafter().Scarletite.count > 0 ||
      buildings.RuinsArcology.stateOnCount > 0 ||
      buildings.GateInferniteMine.stateOnCount > 0
    );
  }

  function adjustSpire(mech: number, port: number, camp: number) {
    const buildings = getBuildings();
    buildings.SpireMechBay.tryAdjustState(
      mech - buildings.SpireMechBay.stateOnCount,
    );
    buildings.SpirePort.tryAdjustState(port - buildings.SpirePort.stateOnCount);
    buildings.SpireBaseCamp.tryAdjustState(
      camp - buildings.SpireBaseCamp.stateOnCount,
    );
  }

  function getBestSupplyRatio(
    support: number,
    maxPorts: number,
    maxCamps: number,
  ): [number, number, number] {
    let bestPort = 0;
    let bestCamp = 0;

    const optPort = Math.ceil(support / 2 + 1);
    const optCamp = Math.floor(support / 2 - 1);
    if (support <= 3 || optPort > maxPorts) {
      bestPort = Math.min(maxPorts, support);
      bestCamp = Math.min(maxCamps, support - bestPort);
    } else if (optCamp > maxCamps) {
      bestCamp = Math.min(maxCamps, support);
      bestPort = Math.min(maxPorts, support - bestCamp);
    } else if (optPort <= maxPorts && optCamp <= maxCamps) {
      bestPort = optPort;
      bestCamp = optCamp;
    }
    const supplies = Math.round(bestPort * (1 + bestCamp * 0.4) * 10000 + 100);
    return [supplies, bestPort, bestCamp];
  }

  // Power one more Neutron Citadel would draw. Consumption grows superlinearly
  // with the built count, so the draw of the next one is the difference between
  // the totals either side of it.
  function nextCitadelPowerDraw(): number {
    const count = getBuildings().NeutronCitadel.count;
    return getCitadelConsumption(count + 1) - getCitadelConsumption(count);
  }

  // Ports and base camps are worth prebuilding to their optimal supply ratio so
  // they are ready when smart logic enables them. When neither the mech bay nor
  // the purifier is smart managed that never happens, so nothing is prebuilt.
  function spirePrebuildShortfall(): SpirePrebuildShortfall {
    const buildings = getBuildings();
    if (
      !buildings.SpireMechBay.isSmartManaged() &&
      !buildings.SpirePurifier.isSmartManaged()
    ) {
      return { ports: false, baseCamps: false };
    }
    const [, bestPorts, bestCamps] = getBestSupplyRatio(
      getResources().Spire_Support.maxQuantity,
      buildings.SpirePort.autoMax,
      buildings.SpireBaseCamp.autoMax,
    );
    return {
      ports: buildings.SpirePort.count < bestPorts,
      baseCamps: buildings.SpireBaseCamp.count < bestCamps,
    };
  }

  return {
    getCitadelConsumption,
    isHellSupressUseful,
    adjustSpire,
    getBestSupplyRatio,
    nextCitadelPowerDraw,
    spirePrebuildShortfall,
  };
}
