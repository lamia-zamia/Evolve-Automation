interface CraftingResource {
  cost: Record<string, number>;
}

interface CraftingCostDependencies {
  getGame: () => {
    global: {
      race: { wasteful: unknown; high_pop: unknown; flier: unknown };
    };
    craftCost: Record<string, { r: string; a: number }[]>;
  };
  getState: () => {
    lastWasteful: unknown;
    lastHighPop: unknown;
    lastFlier: unknown;
  };
  getResources: () => Record<string, CraftingResource | undefined>;
  setCraftablesList: (resources: CraftingResource[]) => void;
  setFoundryList: (resources: CraftingResource[]) => void;
}

export function createCraftingCosts({
  getGame,
  getState,
  getResources,
  setCraftablesList,
  setFoundryList,
}: CraftingCostDependencies) {
  function updateCraftCost() {
    const game = getGame();
    const state = getState();
    if (
      state.lastWasteful === game.global.race.wasteful &&
      state.lastHighPop === game.global.race.high_pop &&
      state.lastFlier === game.global.race.flier
    ) {
      return;
    }

    const resources = getResources();
    const craftablesList: CraftingResource[] = [];
    const foundryList: CraftingResource[] = [];
    for (const [name, costs] of Object.entries(game.craftCost)) {
      const resource = resources[name];
      if (resource) {
        resource.cost = {};
        for (const cost of costs) {
          resource.cost[cost.r] = cost.a;
        }
        craftablesList.push(resource);
        if (name !== "Scarletite" && name !== "Quantium") {
          foundryList.push(resource);
        }
      }
    }
    setCraftablesList(craftablesList);
    setFoundryList(foundryList);
    state.lastWasteful = game.global.race.wasteful;
    state.lastHighPop = game.global.race.high_pop;
    state.lastFlier = game.global.race.flier;
  }

  return { updateCraftCost };
}
