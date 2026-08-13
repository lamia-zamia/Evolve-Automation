export function createRuntimeLookupTables() {
  return {
    techIds: {},
    buildingIds: {},
    arpaIds: {},
    jobIds: {},
    evolutions: {},
    imitations: {},
    races: {},
    craftablesList: [],
    foundryList: [],
  };
}

export function createInitialRuntimeState() {
  return {
    forcedUpdate: false,
    gameTicked: false,
    scriptTick: 1,
    multiplierTick: 0,
    buildingToggles: 0,
    evolutionAttempts: 0,
    tabHash: 0,

    lastWasteful: null,
    lastHighPop: null,
    lastFlier: null,
    lastPopulationCount: 0,
    lastFarmerCount: 0,
    astroSign: null,

    evoCheckNeeded: true,
    warnDebug: true,
    warnPreload: true,

    // Keep queue targets separate so the game can manage queue clicks while
    // automation only manages their resource requirements.
    queuedTargets: [],
    queuedTargetsAll: [],
    triggerTargets: [],
    unlockedTechs: [],
    unlockedBuildings: [],
    conflictTargets: [],

    maxSpaceMiners: Number.MAX_SAFE_INTEGER,
    globalProductionModifier: 1,
    moneyIncomes: [],
    moneyMedian: 0,
    soulGemIncomes: [{ sec: 0, gems: 0 }],
    soulGemPerHour: 0,
    soulGemLast: Number.MAX_SAFE_INTEGER,

    knowledgeRequiredByTechs: 0,
    knowledgeRequiredByBuildTargets: 0,
    cheapestTechKnowledge: 0,

    goal: "Standard",

    missionBuildingList: [],
    tooltips: {},
    filterRegExp: null,
    evolutionTarget: null,

    whiteholeLastStabilise: 0,
    whiteholeLastExoticMass: 0,
  };
}
