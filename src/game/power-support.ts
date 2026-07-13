type CountEntry = { count: number };
type ActiveEntry = { stateOnCount: number };
type AdjustableEntry = ActiveEntry & {
  tryAdjustState: (amount: number) => void;
};

type PowerSupportDependencies = {
  getGame: () => { global: { race: Record<string, unknown> } };
  getJobs: () => { Archaeologist: CountEntry };
  getCrafter: () => { Scarletite: CountEntry };
  getBuildings: () => {
    RuinsArcology: ActiveEntry;
    GateInferniteMine: ActiveEntry;
    SpireMechBay: AdjustableEntry;
    SpirePort: AdjustableEntry;
    SpireBaseCamp: AdjustableEntry;
  };
};

export function createPowerSupport({
  getGame,
  getJobs,
  getCrafter,
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

  return {
    getCitadelConsumption,
    isHellSupressUseful,
    adjustSpire,
    getBestSupplyRatio,
  };
}
