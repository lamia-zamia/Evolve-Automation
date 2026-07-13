type CraftableStorage = {
  maxQuantity: number;
  currentQuantity: number;
  cost: Record<string, number>;
};

type StorageResources = Record<
  string,
  { currentQuantity: number; [key: string]: unknown }
> & {
  Crates: CraftableStorage;
  Containers: CraftableStorage;
  Steel: {
    currentQuantity: number;
    maxQuantity: number;
    storageRequired: number;
    storageRatio: number;
  };
  Plywood: { currentQuantity: number };
};

type StorageExpansionDependencies = {
  getSettings: () => { storageLimitPreMad: boolean };
  getResources: () => StorageResources;
  getBuildings: () => {
    Library: { count: number; cost: Record<string, number> };
  };
  getStorageManager: () => {
    crateValue: number;
    containerValue: number;
    constructCrate: (amount: number) => void;
    constructContainer: (amount: number) => void;
  };
  getIsEarlyGame: () => () => unknown;
  getIsLumberRace: () => () => unknown;
};

export function createStorageExpansion({
  getSettings,
  getResources,
  getBuildings,
  getStorageManager,
  getIsEarlyGame,
  getIsLumberRace,
}: StorageExpansionDependencies) {
  function expandStorage(storageToBuild: number) {
    const resources = getResources();
    const storageManager = getStorageManager();
    let missingStorage = storageToBuild;
    let numberOfCratesWeCanBuild =
      resources.Crates.maxQuantity - resources.Crates.currentQuantity;
    let numberOfContainersWeCanBuild =
      resources.Containers.maxQuantity - resources.Containers.currentQuantity;

    for (const resourceId in resources.Crates.cost) {
      numberOfCratesWeCanBuild = Math.min(
        numberOfCratesWeCanBuild,
        resources[resourceId].currentQuantity /
          resources.Crates.cost[resourceId],
      );
    }
    for (const resourceId in resources.Containers.cost) {
      numberOfContainersWeCanBuild = Math.min(
        numberOfContainersWeCanBuild,
        resources[resourceId].currentQuantity /
          resources.Containers.cost[resourceId],
      );
    }

    if (getSettings().storageLimitPreMad && getIsEarlyGame()()) {
      // Only build pre-mad containers when steel is excessing
      if (resources.Steel.storageRatio < 0.8) {
        numberOfContainersWeCanBuild = 0;
      }
      // Only build pre-mad crates when already have Plywood for next level of library
      const library = getBuildings().Library;
      if (
        getIsLumberRace()() &&
        library.count < 20 &&
        library.cost["Plywood"] > resources.Plywood.currentQuantity &&
        resources.Steel.maxQuantity >= resources.Steel.storageRequired
      ) {
        numberOfCratesWeCanBuild = 0;
      }
    }

    // Build crates
    const cratesToBuild = Math.min(
      Math.floor(numberOfCratesWeCanBuild),
      Math.ceil(missingStorage / storageManager.crateValue),
    );
    storageManager.constructCrate(cratesToBuild);

    resources.Crates.currentQuantity += cratesToBuild;
    for (const resourceId in resources.Crates.cost) {
      resources[resourceId].currentQuantity -=
        resources.Crates.cost[resourceId] * cratesToBuild;
    }
    missingStorage -= cratesToBuild * storageManager.crateValue;

    // And containers, if still needed
    if (missingStorage > 0) {
      const containersToBuild = Math.min(
        Math.floor(numberOfContainersWeCanBuild),
        Math.ceil(missingStorage / storageManager.containerValue),
      );
      storageManager.constructContainer(containersToBuild);

      resources.Containers.currentQuantity += containersToBuild;
      for (const resourceId in resources.Containers.cost) {
        resources[resourceId].currentQuantity -=
          resources.Containers.cost[resourceId] * containersToBuild;
      }
      missingStorage -= containersToBuild * storageManager.containerValue;
    }
    return missingStorage < storageToBuild;
  }

  return { expandStorage };
}
