// TRANSITIONAL: Evolve entity constructors and methods still mirror the game's dynamic
// JavaScript classes. Keep the untyped surface contained here until the game adapter slice
// replaces these compatibility classes with validated snapshots and commands.
type Loose = any;
type LooseRecord = Record<PropertyKey, Loose>;
type LooseFunction = (...args: Loose[]) => Loose;

interface EntityClassesDependencies {
  readJQuery: () => LooseFunction;
  readArpaIds: () => LooseRecord;
  readBuildingIds: () => LooseRecord;
  readBuildings: () => LooseRecord;
  readCheckAffordableCustom: () => LooseFunction;
  readCheckTypes: () => LooseRecord;
  readConflictingTraits: () => Loose[];
  readDocument: () => LooseRecord;
  readFanatAchievements: () => Loose[];
  readFibonacci: () => LooseFunction;
  readGame: () => LooseRecord;
  readGameLog: () => LooseRecord;
  readAchievementStar: () => LooseFunction;
  readCitadelConsumption: () => LooseFunction;
  readStarLevel: () => LooseFunction;
  readVueById: () => LooseFunction;
  readHaveTask: () => LooseFunction;
  readHaveTech: () => LooseFunction;
  readJobs: () => LooseRecord;
  readKeyManager: () => LooseRecord;
  readLogIgnore: () => Loose[];
  readLogPrestige: () => LooseFunction;
  readMainVue: () => Loose;
  readMutableTraitManager: () => LooseRecord;
  readMutationCostMultipliers: () => LooseRecord;
  readMutationCostMultipliersGenus: () => LooseRecord;
  readNormalizeProperties: () => LooseFunction;
  readPoly: () => LooseRecord;
  readRaces: () => LooseRecord;
  readResources: () => LooseRecord;
  readRetBools: () => Loose[];
  readSettings: () => LooseRecord;
  readSettingsRaw: () => LooseRecord;
  readSpecialRaceTraits: () => LooseRecord;
  readState: () => LooseRecord;
  readTechIds: () => LooseRecord;
  readTicksPerSecond: () => LooseFunction;
  readTraitVal: () => LooseFunction;
  readTriggerManager: () => LooseRecord;
  readWarManager: () => LooseRecord;
  readWindowManager: () => LooseRecord;
}

export function createEntityClasses({
  readJQuery,
  readArpaIds,
  readBuildingIds,
  readBuildings,
  readCheckAffordableCustom,
  readCheckTypes,
  readConflictingTraits,
  readDocument,
  readFanatAchievements,
  readFibonacci,
  readGame,
  readGameLog,
  readAchievementStar,
  readCitadelConsumption,
  readStarLevel,
  readVueById,
  readHaveTask,
  readHaveTech,
  readJobs,
  readKeyManager,
  readLogIgnore,
  readLogPrestige,
  readMainVue,
  readMutableTraitManager,
  readMutationCostMultipliers,
  readMutationCostMultipliersGenus,
  readNormalizeProperties,
  readPoly,
  readRaces,
  readResources,
  readRetBools,
  readSettings,
  readSettingsRaw,
  readSpecialRaceTraits,
  readState,
  readTechIds,
  readTicksPerSecond,
  readTraitVal,
  readTriggerManager,
  readWarManager,
  readWindowManager,
}: EntityClassesDependencies) {
  const $: LooseFunction = (...args) => readJQuery()(...args);
  const checkAffordableCustom: LooseFunction = (...args) =>
    readCheckAffordableCustom()(...args);
  const Fibonacci: LooseFunction = (...args) => readFibonacci()(...args);
  const getAchievementStar: LooseFunction = (...args) =>
    readAchievementStar()(...args);
  const getCitadelConsumption: LooseFunction = (...args) =>
    readCitadelConsumption()(...args);
  const getStarLevel: LooseFunction = (...args) => readStarLevel()(...args);
  const getVueById: LooseFunction = (...args) => readVueById()(...args);
  const haveTask: LooseFunction = (...args) => readHaveTask()(...args);
  const haveTech: LooseFunction = (...args) => readHaveTech()(...args);
  const logPrestige: LooseFunction = (...args) => readLogPrestige()(...args);
  const normalizeProperties: LooseFunction = (...args) =>
    readNormalizeProperties()(...args);
  const ticksPerSecond: LooseFunction = (...args) =>
    readTicksPerSecond()(...args);
  const traitVal: LooseFunction = (...args) => readTraitVal()(...args);

  class Job {
    [key: string]: Loose;

    constructor(id: Loose, name: Loose, flags: Loose) {
      this._originalId = id;
      this._originalName = name;
      this._workerBinding = "civ-" + this._originalId;

      this.is = normalizeProperties(flags) ?? {};
    }

    get autoJobEnabled() {
      return readSettings()["job_" + this._originalId];
    }
    get isSmartEnabled() {
      return readSettings()["job_s_" + this._originalId];
    }
    get priority() {
      return readSettingsRaw()["job_p_" + this._originalId];
    }
    getBreakpoint(n: Loose) {
      return readSettings()[`job_b${n + 1}_${this._originalId}`];
    }

    get definition() {
      return readGame().global.civic[this._originalId];
    }

    get id() {
      return this.definition.job;
    }

    get name() {
      return this.definition.name;
    }

    isUnlocked() {
      return this.definition.display;
    }

    isManaged() {
      if (!this.isUnlocked()) {
        return false;
      }

      return this.autoJobEnabled;
    }

    get workers() {
      return this.definition.workers;
    }

    get servants() {
      return 0;
    }

    get count() {
      return this.workers + this.servants * traitVal("high_pop", 0, 1);
    }

    get max() {
      return this.definition.max;
    }

    breakpointEmployees(breakpoint: Loose, ignoreMax: Loose) {
      let breakpointActual = this.getBreakpoint(breakpoint);

      // -1 equals unlimited up to the maximum available jobs for this job
      if (breakpointActual === -1) {
        breakpointActual = Number.MAX_SAFE_INTEGER;
      } else if (
        readSettings().jobScalePop &&
        this._originalId !== "hell_surveyor"
      ) {
        breakpointActual *= traitVal("high_pop", 0, 1);
      }

      // return the actual workers required for this breakpoint (either our breakpoint or our max, whichever is lower)
      return ignoreMax
        ? breakpointActual
        : Math.min(breakpointActual, this.max);
    }

    addWorkers(count: Loose) {
      if (this.isDefault()) {
        return false;
      }
      if (count < 0) {
        this.removeWorkers(-1 * count);
      }

      let vue = getVueById(this._workerBinding);
      if (vue === undefined) {
        return false;
      }

      for (let m of readKeyManager().click(count)) {
        vue.add();
      }
    }

    removeWorkers(count: Loose) {
      if (this.isDefault()) {
        return false;
      }
      if (count < 0) {
        this.addWorkers(-1 * count);
      }

      let vue = getVueById(this._workerBinding);
      if (vue === undefined) {
        return false;
      }

      for (let m of readKeyManager().click(count)) {
        vue.sub();
      }
    }

    isDefault() {
      return false;
    }
  }

  class BasicJob extends Job {
    constructor(...args: [Loose, Loose, Loose]) {
      super(...args);

      this._servantBinding = "servant-" + this._originalId;
    }

    get servants() {
      return readGame().global.race.servants?.jobs[this._originalId] ?? 0;
    }

    get max() {
      return Number.MAX_SAFE_INTEGER;
    }

    addServants(count: Loose) {
      if (count < 0) {
        this.removeServants(-1 * count);
      }

      let vue = getVueById(this._servantBinding);
      if (vue === undefined) {
        return false;
      }

      for (let m of readKeyManager().click(count)) {
        vue.add();
      }
    }

    removeServants(count: Loose) {
      if (count < 0) {
        this.addServants(-1 * count);
      }

      let vue = getVueById(this._servantBinding);
      if (vue === undefined) {
        return false;
      }

      for (let m of readKeyManager().click(count)) {
        vue.sub();
      }
    }

    isDefault() {
      return readGame().global.civic.d_job === this.id;
    }

    setAsDefault() {
      getVueById(this._workerBinding)?.setDefault(this.id);
    }
  }

  class CraftingJob extends Job {
    constructor(id: Loose, name: Loose, resource: Loose) {
      super(id, name, { serve: true });

      this._crafterBinding = "foundry";
      this._servantBinding = "skilledServants";
      this.resource = resource;
    }

    get definition() {
      return readGame().global.civic["craftsman"];
    }

    get id() {
      return this.resource.id;
    }

    isUnlocked() {
      return readGame().global.resource[this._originalId].display;
    }

    get servants() {
      return readGame().global.race.servants?.sjobs[this._originalId] ?? 0;
    }

    get workers() {
      return readGame().global.city.foundry?.[this._originalId] ?? 0;
    }

    get max() {
      return readGame().global.civic.craftsman.max;
    }

    addWorkers(count: Loose) {
      if (!this.isUnlocked()) {
        return false;
      }
      if (count < 0) {
        this.removeWorkers(-1 * count);
      }

      let vue = getVueById(this._crafterBinding);
      if (vue === undefined) {
        return false;
      }

      for (let m of readKeyManager().click(count)) {
        vue.add(this._originalId);
      }
    }

    removeWorkers(count: Loose) {
      if (!this.isUnlocked()) {
        return false;
      }
      if (count < 0) {
        this.addWorkers(-1 * count);
      }

      let vue = getVueById(this._crafterBinding);
      if (vue === undefined) {
        return false;
      }

      for (let m of readKeyManager().click(count)) {
        vue.sub(this._originalId);
      }
    }

    addServants(count: Loose) {
      if (count < 0) {
        this.removeServants(-1 * count);
      }

      let vue = getVueById(this._servantBinding);
      if (vue === undefined) {
        return false;
      }

      for (let m of readKeyManager().click(count)) {
        vue.add(this._originalId);
      }
    }

    removeServants(count: Loose) {
      if (count < 0) {
        this.addServants(-1 * count);
      }

      let vue = getVueById(this._servantBinding);
      if (vue === undefined) {
        return false;
      }

      for (let m of readKeyManager().click(count)) {
        vue.sub(this._originalId);
      }
    }
  }

  class Resource {
    [key: string]: Loose;

    constructor(name: Loose, id: Loose, flags?: Loose) {
      this.name = name;
      this._id = id;

      this.currentQuantity = 0;
      this.maxQuantity = 0;
      this.rateOfChange = 0;
      this.rateMods = {};
      this.tradeBuyPrice = 0;
      this.tradeSellPrice = 0;
      this.tradeRoutes = 0;
      this.incomeAdusted = false;

      this.maxCost = 0;
      this.techMissionMaxCost = 0;
      this.storageRequired = 1;
      this.requestedQuantity = 0;
      this.cost = {};

      this._vueBinding = "res" + id;
      this._stackVueBinding = "stack-" + id;
      this._marketVueBinding = "market-" + id;

      this.is = normalizeProperties(flags) ?? {};
    }

    get autoCraftEnabled() {
      return readSettings()["craft" + this.id];
    }
    get craftWeighting() {
      return readSettings()["foundry_w_" + this.id];
    }
    get craftPreserve() {
      return readSettings()["foundry_p_" + this.id];
    }
    get autoStorageEnabled() {
      return readSettings()["res_storage" + this.id];
    }
    get storagePriority() {
      return readSettingsRaw()["res_storage_p_" + this.id];
    }
    get storeOverflow() {
      return readSettings()["res_storage_o_" + this.id];
    }
    get minStorage() {
      return readSettings()["res_min_store" + this.id];
    }
    get maxStorage() {
      return readSettings()["res_max_store" + this.id];
    }
    get marketPriority() {
      return readSettingsRaw()["res_buy_p_" + this.id];
    }
    get autoBuyEnabled() {
      return readSettings()["buy" + this.id];
    }
    get autoBuyRatio() {
      return readSettings()["res_buy_r_" + this.id];
    }
    get autoSellEnabled() {
      return readSettings()["sell" + this.id];
    }
    get autoSellRatio() {
      return readSettings()["res_sell_r_" + this.id];
    }
    get autoTradeBuyEnabled() {
      return readSettings()["res_trade_buy_" + this.id];
    }
    get autoTradeSellEnabled() {
      return readSettings()["res_trade_sell_" + this.id];
    }
    get autoTradeWeighting() {
      return readSettings()["res_trade_w_" + this.id];
    }
    get autoTradePriority() {
      return readSettings()["res_trade_p_" + this.id];
    }
    get galaxyMarketWeighting() {
      return readSettings()["res_galaxy_w_" + this.id];
    }
    get galaxyMarketPriority() {
      return readSettings()["res_galaxy_p_" + this.id];
    }

    get title() {
      return this.instance?.name || this.name;
    }

    get instance() {
      return readGame().global.resource[this.id];
    }

    get id() {
      return this._id;
    }

    get currentCrates() {
      return this.instance.crates;
    }

    get currentContainers() {
      return this.instance.containers;
    }

    updateData() {
      if (!this.isUnlocked()) {
        return;
      }

      let instance = this.instance;
      this.currentQuantity = instance.amount;
      this.maxQuantity =
        instance.max >= 0 ? instance.max : Number.MAX_SAFE_INTEGER;
      this.rateOfChange = instance.diff;
      this.rateMods = {};
      this.incomeAdusted = false;
    }

    finalizeData() {
      if (!this.isUnlocked() || this.constructor !== Resource) {
        // Only needed for base resources
        return;
      }

      // When routes are managed - we're excluding trade diff from operational rate of change.
      if (readSettings().autoMarket && this.is.tradable) {
        this.tradeRoutes = this.instance.trade;
        this.tradeBuyPrice = readGame().tradeBuyPrice(this._id);
        this.tradeSellPrice = readGame().tradeSellPrice(this._id);
        let tradeDiff = readGame().breakdown.p.consume[this._id]?.Trade || 0;
        if (tradeDiff > 0) {
          this.rateMods["buy"] = tradeDiff * -1;
        } else if (tradeDiff < 0) {
          this.rateMods["sell"] = tradeDiff * -1;
          this.rateOfChange += this.rateMods["sell"];
        }
      }

      // Restore decayed rate
      if (
        readGame().global.race["decay"] &&
        this.tradeRouteQuantity > 0 &&
        this.currentQuantity >= 50
      ) {
        this.rateMods["decay"] =
          (this.currentQuantity - 50) * (0.001 * this.tradeRouteQuantity);
        this.rateOfChange += this.rateMods["decay"];
      }
    }

    calculateRateOfChange(apply: Loose) {
      let value = this.rateOfChange;
      for (let mod in this.rateMods) {
        if (apply[mod] ?? apply.all) {
          value -= this.rateMods[mod];
        }
      }
      return value;
    }

    isDemanded() {
      return this.requestedQuantity > this.currentQuantity;
    }

    get income() {
      return this.calculateRateOfChange({ buy: false, all: true });
    }

    get spareQuantity() {
      return this.currentQuantity - this.requestedQuantity;
    }

    get spareMaxQuantity() {
      return this.maxQuantity - this.requestedQuantity;
    }

    isUnlocked() {
      return this.instance?.display ?? false;
    }

    isRoutesUnlocked() {
      return (
        this.isUnlocked() &&
        !(
          this === readResources().Food &&
          (readGame().global.race["artifical"] ||
            readGame().global.race["fasting"])
        ) &&
        ((readGame().global.race["banana"] && this === readResources().Food) ||
          (readGame().global.tech["trade"] &&
            !readGame().global.race["terrifying"]))
      );
    }

    isManagedStorage() {
      return this.hasStorage() && this.autoStorageEnabled;
    }

    get atomicMass() {
      return readGame().atomic_mass[this.id] ?? 0;
    }

    isUseful() {
      /* This check always cause issues, i'll just disable it for now
            // Spending accumulated resources
            if (readSettings().autoStorage && readSettings().storageSafeReassign && !this.storeOverflow && this.currentQuantity > this.minStorage && this.currentQuantity > this.storageRequired &&
              ((this.currentCrates > 0 && this.maxQuantity - StorageManager.crateValue > this.storageRequired) ||
               (this.currentContainers > 0 && this.maxQuantity - StorageManager.containerValue > this.storageRequired))) {
                return false;
            }
            */
      return (
        this.storageRatio < 0.99 ||
        this.isDemanded() ||
        this.rateMods["eject"] > 0 ||
        this.rateMods["supply"] > 0 ||
        (this.storeOverflow && this.currentQuantity < this.maxStorage)
      );
    }

    getProduction(source: Loose, locArg: Loose) {
      let produced = 0;
      let labelFound = false;
      for (let [label, value] of Object.entries(
        readGame().breakdown.p[this._id] ?? {},
      ) as [string, string][]) {
        if (value.indexOf("%") === -1) {
          if (labelFound) {
            break;
          } else if (label === readPoly().loc(source, locArg)) {
            labelFound = true;
            produced += parseFloat(value) || 0;
          }
        } else if (labelFound && this.isValidProductionLabel(label)) {
          produced *= 1 + (parseFloat(value) || 0) / 100;
        }
      }
      return produced * readState().globalProductionModifier;
    }

    isValidProductionLabel(label: Loose) {
      // Bug as of 1.3.11a: Space Syndicate is already applied to the displayed base value
      // The calculations are correct though
      // This can cause constant Iron flicker in Truepath because the script thinks
      // a worker is producing more than the constant smelter consumption.
      if (
        this._id === "Iron" &&
        label === `ᄂ${readPoly().loc("space_syndicate")}`
      )
        return false;

      // Everything else is valid (at least for now)
      return true;
    }

    getBusyWorkers(workersSource: Loose, workersCount: Loose, locArg: Loose) {
      if (this.incomeAdusted) {
        // Don't reduce workers of same resource more than once per tick to avoid flickering
        return workersCount;
      }

      let newWorkers = 0;
      if (workersCount > 0) {
        let totalIncome = this.getProduction(workersSource, locArg);
        let resPerWorker = totalIncome / workersCount;
        let usedIncome = totalIncome - this.income;
        if (usedIncome > 0) {
          newWorkers = Math.ceil(usedIncome / resPerWorker);
        }
      } else if (this.income < 0) {
        newWorkers = 1;
      }

      return newWorkers;
    }

    isCraftable() {
      return Object.hasOwn(readGame().craftCost, this.id);
    }

    hasStorage() {
      return this.instance?.stackable ?? false;
    }

    get tradeRouteQuantity() {
      return readGame().tradeRatio[this.id] || -1;
    }

    get storageRatio() {
      return this.maxQuantity > 0 ? this.currentQuantity / this.maxQuantity : 1;
    }

    isCapped() {
      return this.maxQuantity > 0
        ? this.currentQuantity + this.rateOfChange / ticksPerSecond() >=
            this.maxQuantity
        : true;
    }

    get usefulRatio() {
      return this.maxQuantity > 0 && this.storageRequired > 0
        ? this.currentQuantity /
            Math.min(this.maxQuantity, this.storageRequired)
        : 1;
    }

    get timeToFull() {
      if (this.storageRatio > 0.98) {
        return Number.MIN_SAFE_INTEGER; // Already full.
      }
      let totalRateOfCharge = this.income;
      if (totalRateOfCharge <= 0) {
        return Number.MAX_SAFE_INTEGER; // Won't ever fill with current rate.
      }
      return (this.maxQuantity - this.currentQuantity) / totalRateOfCharge;
    }

    get timeToRequired() {
      if (this.storageRatio > 0.98) {
        return Number.MIN_SAFE_INTEGER; // Already full.
      }
      if (this.storageRequired <= 1) {
        return 0;
      }
      let totalRateOfCharge = this.income;
      if (totalRateOfCharge <= 0) {
        return Number.MAX_SAFE_INTEGER; // Won't ever fill with current rate.
      }
      return (
        (Math.min(this.maxQuantity, this.storageRequired) -
          this.currentQuantity) /
        totalRateOfCharge
      );
    }

    tryCraftX(count: Loose) {
      let vue = getVueById(this._vueBinding);
      if (vue === undefined) {
        return false;
      }

      readKeyManager().set(false, false, false);
      vue.craft(this.id, count);
    }

    requestQuantity(req: Loose) {
      if (this.requestedQuantity < req) {
        // We can't request more than our storage.
        // TODO: Resources with consumption can usually never be max due to game processing order
        // and should have their request quantity limit a little lower than max.
        req = Math.min(req, this.maxQuantity);
        this.requestedQuantity = req;
      }
    }
  }

  class SoulGem extends Resource {
    updateData() {
      super.updateData();
      this.rateOfChange = readState().soulGemPerHour / 3600;
    }
  }

  class Troops extends Resource {
    updateData() {
      if (!this.isUnlocked()) {
        return;
      }

      this.currentQuantity = readWarManager().currentCityGarrison;
      this.maxQuantity = readWarManager().maxCityGarrison;
      this.rateOfChange = 0;
    }

    isUnlocked() {
      return readWarManager()._garrisonVue !== undefined;
    }
  }

  class Supply extends Resource {
    updateData() {
      if (!this.isUnlocked()) {
        return;
      }

      this.currentQuantity = readGame().global.portal.purifier.supply;
      this.maxQuantity = readGame().global.portal.purifier.sup_max;
      this.rateOfChange = readGame().global.portal.purifier.diff;
    }

    isUnlocked() {
      return Object.hasOwn(readGame().global.portal, "purifier");
    }
  }

  class Power extends Resource {
    updateData() {
      if (!this.isUnlocked()) {
        return;
      }

      this.currentQuantity = readGame().global.city.power;
      if (haveTask("replicate")) {
        this.currentQuantity += readGame().global.race.replicator.pow;
      }
      this.rateOfChange = this.currentQuantity;

      this.maxQuantity = 0;
      if (readGame().global.race.powered) {
        this.maxQuantity +=
          (readResources().Population.maxQuantity -
            readResources().Population.currentQuantity) *
          traitVal("powered", 0);
      }
      for (let building of Object.values(readBuildings())) {
        if (building.stateOffCount > 0) {
          let missingAmount = building.stateOffCount;
          if (
            building.autoMax < building.count &&
            readSettings().masterScriptToggle &&
            readSettings().autoPower &&
            building.autoStateEnabled &&
            readSettings().buildingsLimitPowered
          ) {
            missingAmount -= building.count - building.autoMax;
          }

          if (building === readBuildings().NeutronCitadel) {
            this.maxQuantity +=
              getCitadelConsumption(building.stateOnCount + missingAmount) -
              getCitadelConsumption(building.stateOnCount);
          } else {
            this.maxQuantity += missingAmount * building.powered;
          }
        }
      }
    }

    get usefulRatio() {
      // Could be useful for satisfied check in override
      return this.currentQuantity >= this.maxQuantity ? 1 : 0;
    }

    isUnlocked() {
      return readGame().global.city.powered;
    }
  }

  class Support extends Resource {
    // This isn't really a resource but we're going to make a dummy one so that we can treat it like a resource
    constructor(name: Loose, id: Loose, region: Loose, inRegionId: Loose) {
      super(name, id);

      this._region = region;
      this._inRegionId = inRegionId;
    }

    updateData() {
      if (!this.isUnlocked()) {
        return;
      }

      this.maxQuantity = readGame().global[this._region][this.supportId].s_max;
      this.currentQuantity =
        readGame().global[this._region][this.supportId].support;
      this.rateOfChange = this.maxQuantity - this.currentQuantity;
    }

    get supportId() {
      return readGame().actions[this._region][this._inRegionId].info.support;
    }

    get storageRatio() {
      return this.maxQuantity > 0
        ? (this.maxQuantity - this.currentQuantity) / this.maxQuantity
        : 1;
    }

    isUnlocked() {
      return readGame().global[this._region][this.supportId] !== undefined;
    }
  }

  class BeltSupport extends Support {
    // Unlike other supports this one takes in account available workers
    updateData() {
      if (!this.isUnlocked()) {
        return;
      }

      let maxStations =
        readSettings().autoPower &&
        readBuildings().BeltSpaceStation.autoStateEnabled
          ? readBuildings().BeltSpaceStation.count
          : readBuildings().BeltSpaceStation.stateOnCount;
      let maxWorkers =
        readSettings().autoJobs &&
        readJobs().SpaceMiner.autoJobEnabled &&
        readJobs().SpaceMiner.isSmartEnabled
          ? readState().maxSpaceMiners
          : readJobs().SpaceMiner.count;
      this.maxQuantity = Math.min(
        maxStations * 3 * traitVal("high_pop", 0, 1),
        maxWorkers,
      );
      this.currentQuantity =
        readGame().global[this._region][this.supportId].support;
      this.rateOfChange = this.maxQuantity - this.currentQuantity;
    }
  }

  class ElectrolysisSupport extends Support {
    updateData() {
      if (!this.isUnlocked()) {
        return;
      }

      this.maxQuantity = readBuildings().TitanElectrolysis.stateOnCount;
      this.currentQuantity = readBuildings().TitanHydrogen.stateOnCount;
      this.rateOfChange = this.maxQuantity - this.currentQuantity;
    }

    isUnlocked() {
      return readGame().global.race["truepath"] ? true : false;
    }
  }

  class WomlingsSupport extends Support {
    updateData() {
      if (!this.isUnlocked()) {
        return;
      }

      this.maxQuantity =
        readBuildings().TauRedWomlingVillage.stateOnCount *
        (haveTech("womling_pop", 2) ? 6 : 5);
      this.currentQuantity =
        readBuildings().TauRedWomlingFarm.stateOnCount * 2 +
        readBuildings().TauRedWomlingLab.stateOnCount +
        readBuildings().TauRedWomlingMine.stateOnCount * 6;
      this.rateOfChange = this.maxQuantity - this.currentQuantity; // - readGame().global.tauceti.overseer.injured
    }

    isUnlocked() {
      return haveTech("tau_red", 5) ? true : false;
    }
  }

  class PrestigeResource extends Resource {
    updateData() {
      this.currentQuantity = readGame().global.prestige[this.id].count;
      this.maxQuantity = Number.MAX_SAFE_INTEGER;
    }

    isUnlocked() {
      return true;
    }
  }

  class Population extends Resource {
    get id() {
      // The population node is special and its id will change to the race name
      return readGame().global.race.species;
    }
  }

  class Morale extends Resource {
    updateData() {
      this.currentQuantity = readGame().global.city.morale.current;
      this.maxQuantity = readGame().global.city.morale.cap;
      this.rateOfChange = readGame().global.city.morale.potential;
      this.incomeAdusted = false;
    }

    isUnlocked() {
      return true;
    }
  }

  class Thrall extends Resource {
    updateData() {
      if (!this.isUnlocked()) {
        return;
      }

      this.currentQuantity = 0;
      this.rateOfChange = 0;
      for (let i = 0; i < readGame().global.city.surfaceDwellers.length; i++) {
        this.currentQuantity +=
          readGame().global.city.captive_housing[`race${i}`];
        this.rateOfChange +=
          readGame().global.city.captive_housing[`jailrace${i}`];
      }
      this.currentQuantity += this.rateOfChange;
      this.maxQuantity = readGame().global.city.captive_housing.raceCap;
    }

    isUnlocked() {
      return readGame().global.city.captive_housing ? true : false;
    }
  }

  class ResourceProductionCost {
    [key: string]: Loose;

    constructor(resource: Loose, quantity: Loose, minRateOfChange: Loose) {
      this.resource = resource;
      this.quantity = quantity;
      this.minRateOfChange = minRateOfChange;
    }
  }

  class Action {
    [key: string]: Loose;

    constructor(
      name: Loose,
      tab: Loose,
      id: Loose,
      location: Loose,
      flags?: Loose,
    ) {
      this.name = name;
      this._tab = tab;
      this._id = id;
      this._location = location;
      this.gameMax = Number.MAX_SAFE_INTEGER;
      this._vueBinding = this._tab + "-" + this.id;
      this.weighting = 0;
      this.extraDescription = "";
      this.consumption = [];
      this.cost = {};
      this.overridePowered = undefined;

      this.is = normalizeProperties(flags) ?? {};
    }

    get autoBuildEnabled() {
      return readSettings()["bat" + this._vueBinding];
    }
    get autoStateEnabled() {
      return readSettings()["bld_s_" + this._vueBinding];
    }
    get autoStateSmart() {
      return readSettings()["bld_s2_" + this._vueBinding];
    }
    get priority() {
      return readSettingsRaw()["bld_p_" + this._vueBinding];
    }
    get _weighting() {
      return readSettings()["bld_w_" + this._vueBinding];
    }
    get _autoMax() {
      return readSettings()["bld_m_" + this._vueBinding];
    }

    get definition() {
      if (this._location !== "") {
        return readGame().actions[this._tab][this._location][this._id];
      } else {
        return readGame().actions[this._tab][this._id];
      }
    }

    get instance() {
      return readGame().global[this._tab][this._id];
    }

    get id() {
      return this._id;
    }

    get title() {
      let def = this.definition;
      return def
        ? typeof def.title === "function"
          ? def.title()
          : def.title
        : this.name;
    }

    get desc() {
      let def = this.definition;
      return def
        ? typeof def.desc === "function"
          ? def.desc()
          : def.desc
        : this.name;
    }

    get vue() {
      return getVueById(this._vueBinding);
    }

    /* That's a right(ish) way to do, but compared to hardcoded numbers it's a performance tax for... nothing really, as i'll still need to manually declare a lot of things for each new building, and it's already declared for all existing ones. I'll put it on hold for now.
        get gameMax() {
            // queue_complete need an initialized instance to read a current count
            return this.instance && this.definition.queue_complete ? this.instance.count + this.definition.queue_complete() : Number.MAX_SAFE_INTEGER;
        }*/

    get autoMax() {
      // There is a game max. eg. world collider can only be built 1859 times
      return this._autoMax >= 0 && this._autoMax <= this.gameMax
        ? this._autoMax
        : this.gameMax;
    }

    isUnlocked() {
      if (
        (this._tab === "city" && !readGame().global.settings.showCity) ||
        (this._tab === "space" &&
          !readGame().global.settings.showSpace &&
          !readGame().global.settings.showOuter) ||
        (this._tab === "interstellar" &&
          !readGame().global.settings.showDeep) ||
        (this._tab === "portal" && !readGame().global.settings.showPortal) ||
        (this._tab === "galaxy" && !readGame().global.settings.showGalactic) ||
        (this._tab === "tauceti" && !readGame().global.settings.showTau) ||
        (this._tab === "eden" && !readGame().global.settings.showEden)
      ) {
        return false;
      }
      return this.vue !== undefined;
    }

    isSwitchable() {
      return (
        Object.hasOwn(this.definition, "powered") ||
        Object.hasOwn(this.definition, "switchable")
      );
    }

    isMission() {
      return Object.hasOwn(this.definition, "grant");
    }

    isComplete() {
      return haveTech(this.definition.grant[0], this.definition.grant[1]);
    }

    isSmartManaged() {
      return (
        readSettings().autoPower &&
        this.isUnlocked() &&
        this.autoStateEnabled &&
        this.autoStateSmart
      );
    }

    isAutoBuildable() {
      return (
        this.isUnlocked() &&
        this.autoBuildEnabled &&
        this._weighting > 0 &&
        this.count < this.autoMax
      );
    }

    // export function checkPowerRequirements(c_action) from actions.js
    checkPowerRequirements() {
      for (let [tech, value] of Object.entries(
        this.definition.power_reqs ?? {},
      )) {
        if (!haveTech(tech, value)) {
          return false;
        }
      }
      return true;
    }

    get powered() {
      if (this.overridePowered !== undefined) {
        return this.overridePowered;
      }

      if (
        !Object.hasOwn(this.definition, "powered") ||
        !this.checkPowerRequirements()
      ) {
        return 0;
      }

      return this.definition.powered();
    }

    updateResourceRequirements() {
      if (!this.isUnlocked()) {
        return;
      }

      this.cost = {};
      if (!this.definition.cost) {
        return;
      }

      let adjustedCosts = readPoly().adjustCosts(this.definition);
      for (let resourceName in adjustedCosts) {
        if (readResources()[resourceName]) {
          let resourceAmount = Number(adjustedCosts[resourceName]());
          if (resourceAmount > 0) {
            this.cost[resourceName] = resourceAmount;
          }
        }
      }
    }

    isAffordable(max = false) {
      return readGame().checkAffordable(this.definition, max);
    }

    // Whether the action is clickable is determined by whether it is unlocked, affordable and not a "permanently clickable" action
    isClickable() {
      return (
        this.isUnlocked() && this.isAffordable() && this.count < this.gameMax
      );
    }

    // This is a "safe" click. It will only click if the container is currently clickable.
    // ie. it won't bypass the interface and click the node if it isn't clickable in the UI.
    click() {
      if (!this.isClickable()) {
        return false;
      }

      let doMultiClick =
        this.is.multiSegmented && readSettings().buildingsUseMultiClick;
      let amountToBuild = 1;
      if (doMultiClick) {
        amountToBuild = this.gameMax - this.count;
        for (let res in this.cost) {
          amountToBuild = Math.min(
            amountToBuild,
            Math.floor(readResources()[res].currentQuantity / this.cost[res]),
          );
        }
        if (amountToBuild < 1) {
          // Game allow to spend more resources than available, going negative. If we're here - building is clickable, and we can afford at least one thing for sure.
          amountToBuild = 1;
        }
      }

      for (let res in this.cost) {
        readResources()[res].currentQuantity -= this.cost[res] * amountToBuild;
      }

      // Don't log evolution actions and gathering actions
      if (
        readGame().global.race.species !== "protoplasm" &&
        !readLogIgnore().includes(this.id)
      ) {
        if (
          this.gameMax < Number.MAX_SAFE_INTEGER &&
          this.count + amountToBuild < this.gameMax
        ) {
          readGameLog().logSuccess(
            "multi_construction",
            readPoly().loc("build_success", [
              `${this.title} (${this.count + amountToBuild})`,
            ]),
            ["queue", "building_queue"],
          );
        } else {
          readGameLog().logSuccess(
            "construction",
            readPoly().loc("build_success", [this.title]),
            ["queue", "building_queue"],
          );
        }
      }

      readKeyManager().set(doMultiClick, doMultiClick, doMultiClick);

      if (this.is.prestige) {
        logPrestige();
      }

      let popper = $("#popper");

      // Try skipping game's laggy postBuild hook by invoking the action() directly, instead of going through the
      // vue action() => game runAction() => game shed.action() => game postBuild() hook.
      // This will greatly reduce the amount of page redraws.
      // refresh is really only needed for first building as there are no buildings where building a second unlocks more stuff.
      // Keep this narrowly guarded: postBuild also handles grants, post hooks, queues, poppers, and Inflation.
      if (
        readSettings().performanceHackAvoidDrawTech &&
        this.definition.refresh &&
        this.count > 0 &&
        !this.definition.grant &&
        !this.definition.post &&
        !this.definition.queue_complete &&
        !this.is.prestige &&
        !readGame().global.race.inflation &&
        (popper.length === 0 || !popper.is(":visible"))
      ) {
        this.definition.action();
        return true;
      }

      // Hide active popper from action, so it won't rewrite it
      if (
        popper.length > 0 &&
        popper.data("id").indexOf(this._vueBinding) === -1
      ) {
        popper.attr("id", "TotallyNotAPopper");

        // Game bugs in .action() can cause an error to be thrown. We can't really handle it in any good way,
        // but we need to revert the id or a tooltip might get stuck at the bottom of the page.
        try {
          this.vue.action();
        } finally {
          popper.attr("id", "popper");
        }
      } else {
        this.vue.action();
      }

      if (this.is.prestige) {
        readState().goal = "GameOverMan";
      }

      return true;
    }

    addSupport(resource: Loose) {
      this.consumption.push(
        normalizeProperties({
          resource: resource,
          rate: () => this.definition.support() * -1,
        }),
      );
    }

    addResourceConsumption(resource: Loose, rate: Loose) {
      // TODO: Load fuel from definition, same as for support
      this.consumption.push(
        normalizeProperties({ resource: resource, rate: rate }),
      );
    }

    getFuelRate(idx: Loose) {
      if (!this.consumption[idx]) {
        return 0;
      }

      let resource = this.consumption[idx].resource;
      let rate = this.consumption[idx].rate;
      if (
        this._tab === "space" &&
        (resource === readResources().Oil ||
          resource === readResources().Helium_3)
      ) {
        rate = readGame().fuel_adjust(rate, true);
      } else if (
        (this._tab === "interstellar" ||
          this._tab === "galaxy" ||
          this._tab === "tauceti") &&
        (resource === readResources().Deuterium ||
          resource === readResources().Helium_3) &&
        this !== readBuildings().AlphaFusion
      ) {
        rate = readGame().int_fuel_adjust(rate);
      }
      return rate;
    }

    getMissingConsumption() {
      for (let j = 0; j < this.consumption.length; j++) {
        let resource = this.consumption[j].resource;
        if (resource instanceof Support) {
          continue;
        }

        // Food fluctuate a lot, ignore it, assuming we always can get more
        if (
          resource === readResources().Food &&
          readSettings().autoJobs &&
          (readJobs().Farmer.autoJobEnabled || readJobs().Hunter.autoJobEnabled)
        ) {
          continue;
        }

        // Now let's actually check it, bought resources excluded from rateOfChange, to prevent losing resources after switching routes
        let consumptionRate = this.getFuelRate(j);
        if (
          resource.storageRatio < 0.95 &&
          consumptionRate > 0 &&
          resource.calculateRateOfChange({ buy: true }) < consumptionRate
        ) {
          return resource;
        }
      }
      return null;
    }

    getMissingSupport() {
      // In fasting we need to build mining droid first to unlock habitats
      if (
        readGame().global.race["fasting"] &&
        this === readBuildings().AlphaMiningDroid &&
        this.count < 1
      ) {
        return null;
      }

      for (let j = 0; j < this.consumption.length; j++) {
        let resource = this.consumption[j].resource;

        // We're going to build Spire things with no support, to enable them later
        if (resource === readResources().Spire_Support && this.autoStateSmart) {
          continue;
        }
        // Tau Belt support can be overused
        if (resource === readResources().Tau_Belt_Support) {
          continue;
        }
        // Womlings facilities can run understaffed
        if (
          resource === readResources().Womlings_Support &&
          resource.rateOfChange > 0
        ) {
          continue;
        }

        let rate = this.consumption[j].rate;
        if (!(resource instanceof Support) || rate <= 0) {
          continue;
        }

        // We don't have spare support for this
        if (resource.rateOfChange < rate) {
          return resource;
        }
      }
      return null;
    }

    getUselessSupport() {
      // Starbase and Habitats are exceptions, they're always useful
      if (
        this === readBuildings().GatewayStarbase ||
        this === readBuildings().AlphaHabitat ||
        (this === readBuildings().SpaceNavBeacon &&
          readGame().global.race["orbit_decayed"])
      ) {
        return null;
      }

      let uselessSupports = [];
      for (let j = 0; j < this.consumption.length; j++) {
        let resource = this.consumption[j].resource;
        let rate = this.consumption[j].rate;
        if (!(resource instanceof Support) || rate >= 0) {
          continue;
        }
        let minSupport =
          resource === readResources().Belt_Support
            ? 2 * traitVal("high_pop", 0, 1)
            : resource === readResources().Gateway_Support
              ? 5
              : resource === readResources().Womlings_Support
                ? 6
                : 1;

        if (resource.rateOfChange >= minSupport) {
          uselessSupports.push(resource);
        } else {
          // If we have something useful - stop here, we care only about buildings with all supports useless
          return null;
        }
      }
      return uselessSupports[0] ?? null;
    }

    get count() {
      if (this.isMission()) {
        return this.isComplete() ? 1 : 0;
      }

      if (!this.isUnlocked()) {
        return 0;
      }

      if (this === readBuildings().Banquet) {
        // Banquet hall uses "level" as build count if >= 1
        return this.instance?.count ? this.instance.level : 0;
      }

      return this.instance?.count ?? 0;
    }

    hasState() {
      if (!this.isUnlocked()) {
        return false;
      }

      return (
        (this.definition.powered &&
          haveTech("high_tech", 2) &&
          this.checkPowerRequirements()) ||
        this.definition.switchable?.() ||
        false
      );
    }

    get stateOnCount() {
      if (!this.hasState() || this.count < 1) {
        return 0;
      }

      return this.instance.on;
    }

    get stateOffCount() {
      if (!this.hasState() || this.count < 1) {
        return 0;
      }

      return this.instance.count - this.instance.on;
    }

    tryAdjustState(adjustCount: Loose) {
      if (adjustCount === 0 || !this.hasState()) {
        return false;
      }

      let vue = this.vue;

      if (adjustCount > 0) {
        for (let m of readKeyManager().click(adjustCount)) {
          vue.power_on();
        }
        return true;
      }
      if (adjustCount < 0) {
        for (let m of readKeyManager().click(adjustCount * -1)) {
          vue.power_off();
        }
        return true;
      }
    }
  }

  class CityAction extends Action {
    get instance() {
      return readGame().global.city[this._id];
    }
  }

  class Pillar extends Action {
    get count() {
      return this.isUnlocked() ? this.definition.count() : 0;
    }

    get stateOnCount() {
      return this.isUnlocked() ? this.definition.on() : 0;
    }

    isAffordable(max = false) {
      if (
        readGame().global.tech.pillars !== 1 ||
        readGame().global.race.universe === "micro"
      ) {
        return false;
      }
      return readGame().checkAffordable(this.definition, max);
    }
  }

  class ResourceAction extends Action {
    constructor(
      name: Loose,
      tab: Loose,
      id: Loose,
      location: Loose,
      res: Loose,
      flags: Loose,
    ) {
      super(name, tab, id, location, flags);

      // Typed policies identify the produced resource by its catalog key; the
      // wrapper itself is captured at construction and cannot be compared to a
      // later `setResources` replacement.
      this.resourceKey = res;
      this.resource = readResources()[res];
    }

    get count() {
      return this.resource.currentQuantity;
    }
  }

  class EvolutionAction extends Action {
    constructor(id: Loose) {
      super("", "evolution", id, "");
    }

    isUnlocked() {
      let node = readDocument().getElementById(this._vueBinding);
      return node !== null && !node.classList.contains("is-hidden");
    }
  }

  class SpaceDock extends Action {
    isOptionsCached() {
      if (this.count < 1 || readGame().global.tech["genesis"] < 4) {
        // It doesn't have options yet so I guess all "none" of them are cached!
        // Also return true if we don't have the required tech level yet
        return true;
      }

      // If our tech is unlocked but we haven't cached the vue the the options aren't cached
      if (
        !readBuildings().GasSpaceDockProbe.isOptionsCached() ||
        (readGame().global.tech["genesis"] >= 5 &&
          !readBuildings().GasSpaceDockShipSegment.isOptionsCached()) ||
        (readGame().global.tech["genesis"] === 6 &&
          !readBuildings().GasSpaceDockPrepForLaunch.isOptionsCached()) ||
        (readGame().global.tech["genesis"] >= 7 &&
          !readBuildings().GasSpaceDockLaunch.isOptionsCached()) ||
        (readGame().global.tech["geck"] >= 1 &&
          !readBuildings().GasSpaceDockGECK.isOptionsCached())
      ) {
        return false;
      }

      return true;
    }

    cacheOptions() {
      if (this.count < 1 || readWindowManager().isOpen()) {
        return false;
      }

      let optionsNode = readDocument().querySelector(
        "#space-star_dock .special",
      );
      readWindowManager().openModalWindowWithCallback(
        optionsNode,
        this.title,
        () => {
          readBuildings().GasSpaceDockProbe.cacheOptions();
          readBuildings().GasSpaceDockGECK.cacheOptions();
          readBuildings().GasSpaceDockShipSegment.cacheOptions();
          readBuildings().GasSpaceDockPrepForLaunch.cacheOptions();
          readBuildings().GasSpaceDockLaunch.cacheOptions();
        },
      );
      return true;
    }
  }

  class ModalAction extends Action {
    constructor(...args: [Loose, Loose, Loose, Loose, Loose?]) {
      super(...args);

      this._vue = undefined;
    }

    get vue() {
      return this._vue;
    }

    isOptionsCached() {
      return this._vue !== undefined;
    }

    cacheOptions() {
      this._vue = getVueById(this._vueBinding);
    }

    isUnlocked() {
      // All ModalActions belongs to starDock tab
      if (!readGame().global.settings.showSpace) {
        return false;
      }
      // We have to override this as there won't be an element unless the modal window is open
      return this._vue !== undefined;
    }
  }

  class Project extends Action {
    constructor(name: Loose, id: Loose) {
      super(name, "arpa", id, "");
      this._vueBinding = "arpa" + this.id;
      this.currentStep = 1;
    }

    get autoBuildEnabled() {
      return readSettings()["arpa_" + this._id];
    }
    get priority() {
      return readSettingsRaw()["arpa_p_" + this._id];
    }
    get _autoMax() {
      return readSettings()["arpa_m_" + this._id];
    }
    get _weighting() {
      return readSettings()["arpa_w_" + this._id];
    }

    updateResourceRequirements() {
      if (!this.isUnlocked()) {
        return;
      }

      this.cost = {};
      let maxStep = Math.min(
        100 - this.progress,
        readState().triggerTargets.includes(this)
          ? 100
          : readSettings().arpaStep,
      );

      let adjustedCosts = readPoly().arpaAdjustCosts(this.definition.cost);
      for (let resourceName in adjustedCosts) {
        if (readResources()[resourceName]) {
          let resourceAmount = Number(adjustedCosts[resourceName]());
          if (resourceAmount > 0) {
            this.cost[resourceName] = resourceAmount / 100;
            maxStep = Math.min(
              maxStep,
              readResources()[resourceName].maxQuantity /
                this.cost[resourceName],
            );
          }
        }
      }

      this.currentStep = Math.max(Math.floor(maxStep), 1);
      if (this.currentStep > 1) {
        for (let res in this.cost) {
          this.cost[res] *= this.currentStep;
        }
      }
    }

    // Override Action's version, because these have a 'grant' but aren't missions.
    isMission() {
      return this.gameMax === 1;
    }

    get count() {
      return this.instance?.rank ?? 0;
    }

    get progress() {
      return this.instance?.complete ?? 0;
    }

    isAffordable(max = false) {
      // Game's .checkAffordable doesn't work correctly on projects
      return checkAffordableCustom(this.cost, max);
    }

    isClickable() {
      return this.isUnlocked() && this.isAffordable(false);
    }

    click() {
      if (!this.isClickable()) {
        return false;
      }

      for (let res in this.cost) {
        readResources()[res].currentQuantity -= this.cost[res];
      }

      if (this.progress + this.currentStep < 100) {
        readGameLog().logSuccess(
          "arpa",
          readPoly().loc("build_success", [
            `${this.title} (${this.progress + this.currentStep}%)`,
          ]),
          ["queue", "building_queue"],
        );
      } else {
        readGameLog().logSuccess(
          "construction",
          readPoly().loc("build_success", [this.title]),
          ["queue", "building_queue"],
        );
        if (this.id === "syphon" && this.count == 79) {
          logPrestige();
        }
      }

      readKeyManager().set(false, false, false);
      // This is a really bad lag hack. ARPAs make a very expensive drawTech() call on every build.
      // After 10 ARPAs, this will never actually accomplish anything; AFAIK nothing needs more than 10 ARPAs.
      // Luckily, drawTech() doesn't draw anything if preload tab content is off and we're not on research.
      // So if we can, we briefly hack that off while buying an ARPA that won't change anything.
      if (
        readSettings().performanceHackAvoidDrawTech &&
        this.count >= 10 &&
        !(this.id === "syphon" && this.count >= 79)
      ) {
        let mainVue = readMainVue();
        if (mainVue) {
          let oldTabLoad = mainVue.s.tabLoad;
          try {
            mainVue.s.tabLoad = false;
            getVueById(this._vueBinding).build(this.id, this.currentStep);
          } finally {
            mainVue.s.tabLoad = oldTabLoad;
          }
        } else {
          getVueById(this._vueBinding).build(this.id, this.currentStep);
        }

        return true;
      }
      getVueById(this._vueBinding).build(this.id, this.currentStep);
      return true;
    }
  }

  class Technology {
    [key: string]: Loose;

    // These techs have the same name as some others - use a descriptor for disambiguation
    static techDiscriminators = {
      wind_plant: "Power",
      demonic_craftsman: "Evil",
      evil_planning: "Evil",
      adamantite_processing_flier: "Flier",
      alt_anthropology: "Post-Transcendence",
      alt_fanaticism: "Post-Transcendence",
      study_alt: "Post-Preeminence",
      deify_alt: "Post-Preeminence",
      dyson_sphere: "Plans",
      unification: "Plans",
      exotic_infusion: "1st Warning",
      infusion_check: "2nd Warning",
      protocol66: "Warning",
      bac_tanks_tp: "True Path",
      ai_core_tp: "True Path",
      terraforming_tp: "True Path",
      higgs_boson_tp: "True Path",
      stanene_tp: "True Path",
      graphene_tp: "True Path",
      virtual_reality_tp: "True Path",
      adamantite_vault_tp: "True Path",
      iridium_smelting: "True Path",
      bolognium_crates_tp: "True Path",
      adamantite_containers_tp: "True Path",
      orichalcum_panels_tp: "True Path",
      dreadnought_ship: "True Path",
      fusion_generator: "True Path",
      replicator: "Lone Survivor",
    };

    constructor(id: Loose) {
      this._id = id;

      this._vueBinding = "tech-" + id;

      this.cost = {};
    }

    get id() {
      return this._id;
    }

    isUnlocked() {
      // vue of researched techs still can be found in #oldTech
      return (
        readDocument().querySelector(
          "#" + this._vueBinding + " > .button:not(.precog)",
        ) !== null && getVueById(this._vueBinding) !== undefined
      );
    }

    get definition() {
      return readGame().actions.tech[this._id];
    }

    get title() {
      let def = this.definition;
      let title = typeof def.title === "function" ? def.title() : def.title;
      if (this._id in Technology.techDiscriminators) {
        title += ` (${(Technology.techDiscriminators as LooseRecord)[String(this._id)]})`;
      }
      return title;
    }

    get name() {
      return this.title;
    }

    isAffordable(max = false) {
      return readGame().checkAffordable(this.definition, max);
    }

    // Whether the action is clickable is determined by whether it is unlocked, affordable and not a "permanently clickable" action
    isClickable() {
      return this.isUnlocked() && this.isAffordable();
    }

    // This is a "safe" click. It will only click if the container is currently clickable.
    // ie. it won't bypass the interface and click the node if it isn't clickable in the UI.
    click() {
      if (!this.isClickable()) {
        return false;
      }

      for (let res in this.cost) {
        readResources()[res].currentQuantity -= this.cost[res];
      }

      // Research automation depends on the preloaded off-tab Vue bindings.
      // Keep the game's preload flag enabled here: its post-research drawTech
      // call removes the completed target and exposes the next one even when
      // the research tab is not active.
      getVueById(this._vueBinding).action();

      let def = this.definition;
      let title = typeof def.title === "function" ? def.title() : def.title;
      readGameLog().logSuccess(
        "research",
        readPoly().loc("research_success", [title]),
        ["queue", "research_queue"],
      );
      return true;
    }

    isResearched() {
      return (
        readDocument().querySelector("#tech-" + this.id + " .oldTech") !== null
      );
    }

    updateResourceRequirements() {
      if (!this.isUnlocked()) {
        return;
      }

      this.cost = {};
      if (!this.definition.cost) {
        return;
      }

      let adjustedCosts = readPoly().adjustCosts(this.definition);
      for (let resourceName in adjustedCosts) {
        if (readResources()[resourceName]) {
          let resourceAmount = Number(adjustedCosts[resourceName]());
          if (resourceAmount > 0) {
            this.cost[resourceName] = resourceAmount;
          }
        }
      }
    }
  }

  class Race {
    [key: string]: Loose;

    constructor(id: Loose) {
      this.id = id;
      this.evolutionTree = {};
    }

    get name() {
      return readGame().races[this.id].name ?? `Custom (${this.id} slot)`;
    }

    get desc() {
      let nameRef = readGame().races[this.id].desc;
      return typeof nameRef === "function"
        ? nameRef()
        : typeof nameRef === "string"
          ? nameRef
          : "Custom"; // Nonexistent custom
    }

    get genus() {
      return readGame().races[this.id].type;
    }

    getWeighting(verbose: Loose) {
      // Locked races always have zero weighting
      let habitability = this.getHabitability();
      if (habitability < (readSettings().evolutionAutoUnbound ? 0.8 : 1)) {
        return -1;
      }

      // Races not allowed to execute MAD, invalid targets for MAD auto achievements even if there is nothing else to do
      const noMADRace = ["sludge", "ultra_sludge", "hellspawn"];
      // Races that can't meaningfully contribute to genus pillar for Enlightenment, due to not-saved user chosen genus or otherwise
      // (they do, however, have a per-race pillar!)
      const noPillarRace = [
        "custom",
        "junker",
        "sludge",
        "ultra_sludge",
        "hybrid",
        "hellspawn",
      ];
      // Genera that don't have a greatness achievement, and so should never get a weighting boost from missing greatness achievement
      const noGreatnessGenus = ["hybrid"];
      // Races that can't execute any greatness reset, and so should never be used for greatness automation
      const noGreatnessRace = ["hellspawn"];
      // Races that don't have an extinction achievement, invalid target for any extinction autoachievement
      const noExtinctionRace = ["hellspawn"];
      // Challenges races get a huge penalty applied as they shouldn't be done automatically, unless there is nothing else to do
      const challengeRace = ["junker", "sludge", "ultra_sludge", "hellspawn"];

      // List of resets that grant greatness
      const greatnessReset = [
        "bioseed",
        "ascension",
        "terraform",
        "matrix",
        "retire",
        "eden",
        "apotheosis",
      ];

      // Subjectively chosen race lists that are known to perform well, slightly preferring them when multiple valid options are available for the same achievement
      // "Mid" resets, "high" will likely also grant an Enlightenment tick
      const midTierReset = [
        "bioseed",
        "cataclysm",
        "whitehole",
        "vacuum",
        "terraform",
      ];
      const highTierReset = ["ascension", "demonic", "apotheosis"];
      const bestForMid = [
        "human",
        "cath",
        "capybara",
        "gnome",
        "cyclops",
        "gecko",
        "dracnid",
        "entish",
        "shroomi",
        "antid",
        "sharkin",
        "dryad",
        "salamander",
        "yeti",
        "kamel",
        "imp",
        "unicorn",
        "synth",
        "shoggoth",
      ];
      const bestForHigh = [
        "human",
        "cath",
        "capybara",
        "gnome",
        "cyclops",
        "gecko",
        "dracnid",
        "entish",
        "shroomi",
        "scorpid",
        "sharkin",
        "dryad",
        "salamander",
        "wendigo",
        "kamel",
        "balorg",
        "unicorn",
        "nano",
        "ghast",
      ];

      // Imitates to prioritize if farming TP3
      const goodImitates = [
        "wyvern",
        "dwarf",
        "dracnid",
        "octigoran",
        "unicorn",
        "salamander",
        "cyclops",
        "kamel",
        "arraak",
        "troll",
        "custom",
      ];
      // Races who cannot enter TP or cannot unlock imitate even if they can, due to either challenge conflicts or special case in rewards
      const noImitates = ["junker", "nano", "synth", "hellspawn"];

      let goals = [];
      let weighting = 0;
      let starLevel = getStarLevel(readSettings());
      const checkAchievement = (baseWeight: Loose, id: Loose) => {
        let improve = starLevel - getAchievementStar(id);
        if (improve > 0) {
          weighting += baseWeight * improve;
          goals.push(`achieve_${id}_name`);
          if (
            readGame().global.race.universe !== "micro" &&
            readGame().global.race.universe !== "standard"
          ) {
            weighting +=
              baseWeight *
              Math.max(0, starLevel - getAchievementStar(id, "standard"));
          }
        }
      };

      // Check pillar
      if (
        ((readSettings().prestigeType === "ascension" &&
          readSettings().prestigeAscensionPillar) ||
          ["demonic", "apotheosis"].includes(readSettings().prestigeType)) &&
        readGame().global.race.universe !== "micro"
      ) {
        let speciesPillarLevel = readGame().global.pillars[this.id] ?? 0;
        let canPillar =
          !speciesPillarLevel && readResources().Harmony.currentQuantity >= 1;
        let canUpgrade = speciesPillarLevel && speciesPillarLevel < starLevel;
        if (canPillar || canUpgrade) {
          weighting += 1000 * Math.max(0, starLevel - speciesPillarLevel);
          // Strongly prioritize pillaring new non-challenge species to upgrading old ones or Equilibrium
          if (!speciesPillarLevel && !challengeRace.includes(this.id))
            weighting += 100000;

          goals.push("feat_equilibrium_name");
          // Check genus pillar for Enlightenment
          if (!noPillarRace.includes(this.id)) {
            let genusPillar = Math.max(
              ...Object.values(readRaces())
                .filter(
                  (r) => r.genus === this.genus && !noPillarRace.includes(r.id),
                )
                .map((r) => readGame().global.pillars[r.id] ?? 0),
            );
            let improve = starLevel - genusPillar;
            if (improve > 0) {
              weighting += 10000 * improve;
              goals.push("achieve_enlightenment_name");
            }
          }
        }
      }

      // Check imitate unlock
      if (readSettings().prestigeType === "apocalypse") {
        let imitateUnlocked =
          readGame().global.stats?.synth?.[this.id] ?? false;
        if (!noImitates.includes(this.id) && !imitateUnlocked) {
          weighting += 10000;
          goals.push("feat_planned_obsolescence_name");
          if (goodImitates.includes(this.id)) {
            weighting +=
              (goodImitates.length - 1 - goodImitates.indexOf(this.id)) * 5000;
          }
        }
      }

      // Check greatness\extinction achievement
      if (greatnessReset.includes(readSettings().prestigeType)) {
        if (
          !noGreatnessGenus.includes(this.genus) &&
          !noGreatnessRace.includes(this.id)
        ) {
          checkAchievement(100, "genus_" + this.genus);
        }
      } else if (
        !noExtinctionRace.includes(this.id) &&
        (!noMADRace.includes(this.id) || readSettings().prestigeType !== "mad")
      ) {
        checkAchievement(100, "extinct_" + this.id);
      }

      // Blood War
      if (
        this.genus === "demonic" &&
        readSettings().prestigeType !== "mad" &&
        readSettings().prestigeType !== "bioseed"
      ) {
        checkAchievement(50, "blood_war");
      }

      // Sharks with Lasers
      if (this.id === "sharkin" && readSettings().prestigeType !== "mad") {
        checkAchievement(50, "laser_shark");
      }

      // Macro Universe and Arquillian Galaxy
      if (
        readGame().global.race.universe === "micro" &&
        readSettings().prestigeType === "bioseed"
      ) {
        let smallRace =
          this.genus === "small" || readGame().races[this.id].traits.compact;
        checkAchievement(50, smallRace ? "macro" : "marble");
      }

      // You Shall Pass
      if (
        this.id === "balorg" &&
        readGame().global.race.universe === "magic" &&
        readSettings().prestigeType === "vacuum"
      ) {
        checkAchievement(50, "pass");
      }

      // Madagascar Tree, Godwin's law, Infested Terrans - Achievement race
      for (let set of readFanatAchievements()) {
        if (this.id === set.race && readGame().global.race.gods === set.god) {
          checkAchievement(150, set.achieve);
        }
      }

      // Increase weight for suited conditional races with achievements
      if (
        weighting > 0 &&
        habitability === 1 &&
        this.getCondition() !== "" &&
        !challengeRace.includes(this.id)
      ) {
        weighting += 500;
      }

      // Increases weight of stringest readRaces() of genus
      if (
        (midTierReset.includes(readSettings().prestigeType) &&
          bestForMid.includes(this.id)) ||
        (highTierReset.includes(readSettings().prestigeType) &&
          bestForHigh.includes(this.id))
      ) {
        weighting += 1;
      }

      // Same race for Second Evolution
      if (this.id === readGame().global.race.gods) {
        checkAchievement(10, "second_evolution");
      }

      // Madagascar Tree, Godwin's law, Infested Terrans - God race
      // This races shouldn't benefit from suited planet, to avoid prep -> prep loops
      for (let set of readFanatAchievements()) {
        if (this.id === set.god) {
          checkAchievement(5, set.achieve);
        }
      }

      // Feats, lowest weight - go for them only if there's nothing better
      if (readGame().global.race.universe !== "micro") {
        const checkFeat = (id: Loose) => {
          let improve = starLevel - (readGame().global.stats.feat[id] ?? 0);
          if (improve > 0) {
            weighting += 1 * improve;
            goals.push(`feat_${id}_name`);
          }
        };

        // Take no advice, Ill Advised
        if (
          readGame().global.city.biome === "hellscape" &&
          this.genus !== "demonic"
        ) {
          switch (readSettings().prestigeType) {
            case "mad":
            case "cataclysm":
              checkFeat("take_no_advice");
              break;
            case "bioseed":
              checkFeat("ill_advised");
              break;
          }
        }

        // Organ Harvester, The Misery, Garbage Pie
        if (this.id === "junker") {
          switch (readSettings().prestigeType) {
            case "bioseed":
              checkFeat("organ_harvester");
              break;
            case "ascension":
            case "demonic":
              checkFeat("garbage_pie");
            // Fall through: these prestige types also qualify for The Misery.
            case "terraform":
            case "whitehole":
            case "vacuum":
            case "apocalypse":
              checkFeat("the_misery");
              break;
          }
        }

        // Nephilim
        if (
          readSettings().prestigeType === "whitehole" &&
          readGame().global.race.universe === "evil" &&
          this.genus === "angelic"
        ) {
          checkFeat("nephilim");
        }

        // Twisted
        if (
          readSettings().prestigeType === "demonic" &&
          this.genus === "angelic"
        ) {
          checkFeat("twisted");
        }

        // Digital Ascension
        if (
          readSettings().prestigeType === "ascension" &&
          readSettings().challenge_emfield &&
          this.genus === "artifical" &&
          this.id !== "custom"
        ) {
          checkFeat("digital_ascension");
        }

        // Slime Lord
        if (readSettings().prestigeType === "demonic" && this.id === "sludge") {
          checkFeat("slime_lord");
        }
      }

      // Ignore challenge races on low star, and decrease weight on any other star
      if (challengeRace.includes(this.id)) {
        weighting *= starLevel < 5 ? 0 : 0.01;
      }

      // Scale down weight of unsuited races
      weighting *= habitability;

      return verbose ? goals : weighting;
    }

    getHabitability() {
      switch (this.id) {
        case "hellspawn":
          return readGame().global.race.universe === "evil" &&
            readGame().global.stats.achieve["godslayer"]?.e
            ? 1
            : 0;
        case "junker":
          return readGame().global.genes.challenge ? 1 : 0;
        case "sludge":
          return (readGame().global.stats.achieve["ascended"] ||
            readGame().global.stats.achieve["corrupted"]) &&
            readGame().global.stats.achieve["extinct_junker"]
            ? 1
            : 0;
        case "ultra_sludge":
          return readGame().global.stats.achieve["godslayer"] &&
            readGame().global.stats.achieve["extinct_sludge"]
            ? 1
            : 0;
        case "hybrid":
          return readGame().global.stats.achieve["what_is_best"]?.e >= 5
            ? 1
            : 0;
      }

      let unboundMod =
        readGame().global.blood.unbound >= 4
          ? 0.95
          : readGame().global.blood.unbound >= 2
            ? 0.9
            : readGame().global.blood.unbound >= 1
              ? 0.8
              : 0;
      let shadowMod = readGame().global.blood.unbound >= 3 ? unboundMod : 0;

      const genusHabitability = (genus: Loose): number => {
        switch (genus) {
          case "aquatic":
            return ["swamp", "oceanic"].includes(readGame().global.city.biome)
              ? 1
              : unboundMod;
          case "fey":
            return ["forest", "swamp", "taiga"].includes(
              readGame().global.city.biome,
            )
              ? 1
              : unboundMod;
          case "sand":
            return ["ashland", "desert"].includes(readGame().global.city.biome)
              ? 1
              : unboundMod;
          case "heat":
            return ["ashland", "volcanic"].includes(
              readGame().global.city.biome,
            )
              ? 1
              : unboundMod;
          case "polar":
            return ["tundra", "taiga"].includes(readGame().global.city.biome)
              ? 1
              : unboundMod;
          case "demonic":
            return readGame().global.city.biome === "hellscape" ? 1 : shadowMod;
          case "angelic":
            return readGame().global.city.biome === "eden" ? 1 : shadowMod;
          case "synthetic":
            return readGame().global.stats.achieve["obsolete"]?.l >= 5 ? 1 : 0;
          case "eldritch":
            return readGame().global.stats.achieve["nightmare"]?.mg ? 1 : 0;
          case undefined: // Nonexistent custom
            return 0;
          default:
            return 1;
        }
      };

      // Named hybrid races (e.g. nephilim, beholder) require godslayer AND a
      // planet/blood state that actually renders one of their two genus
      // actions. This previously returned godslayer ? 1 : 0, ignoring biome,
      // so the automation committed to hybrids it could never evolve — e.g.
      // Nephilim's demonic/angelic genus actions only render on hellscape/eden
      // or with unbound blood >= 3 — and stalled at "Attempting evolution"
      // forever. Score by the best reachable constituent genus so an
      // unevolvable hybrid stays unreachable.
      if (this.genus === "hybrid") {
        if (!readGame().global.stats.achieve["godslayer"]) {
          return 0;
        }
        const hybrid = readGame().races[this.id].hybrid;
        return Array.isArray(hybrid) && hybrid.length > 0
          ? Math.max(...hybrid.map((genus: Loose) => genusHabitability(genus)))
          : 1;
      }

      return genusHabitability(this.genus);
    }

    getCondition() {
      switch (this.id) {
        case "hellspawn":
          return readPoly().loc("wiki_challenges_reqs_reset", [
            `${readPoly().loc("wiki_universe_evil")} ${readPoly().loc(
              "wiki_resets_apotheosis",
            )}`,
          ]);
        case "junker":
          return "Genetic Dead End unlocked.";
        case "sludge":
          return "Failed Experiment unlocked.";
        case "ultra_sludge":
          return "Ultra Failed Experiment unlocked.";
        case "custom":
          return `Complete an Ascension reset and be on a suitable planet for your chosen genus (${
            this.genus
              ? readGame().loc("genelab_genus_" + this.genus)
              : "not set"
          }).`;
        case "hybrid":
          return readGame().loc("wiki_achieve_what_is_best");
      }

      switch (this.genus) {
        case "aquatic":
          return "Oceanic or Swamp planet.";
        case "fey":
          return "Forest, Swamp or Taiga planet.";
        case "sand":
          return "Ashland or Desert planet.";
        case "heat":
          return "Ashland or Volcanic planet.";
        case "polar":
          return "Tundra or Taiga planet.";
        case "demonic":
          return "Hellscape planet.";
        case "angelic":
          return "Eden planet.";
        case "synthetic":
          return readGame().loc("wiki_achieve_obsolete");
        case "eldritch":
          return readGame().loc("wiki_achieve_nightmare");
        case "hybrid":
          return readGame().loc("wiki_achieve_godslayer");
        case undefined:
          return "Unknown.";
        default: // No special conditions
          return "";
      }
    }
  }

  class Trigger {
    [key: string]: Loose;

    constructor(
      seq: Loose,
      priority: Loose,
      requirementType: Loose,
      requirementId: Loose,
      requirementCount: Loose,
      actionType: Loose,
      actionId: Loose,
      actionCount: Loose,
    ) {
      this.seq = seq;
      this.priority = priority;

      this.requirementType = requirementType;
      this.requirementId = requirementId;
      this.requirementCount = requirementCount;

      this.actionType = actionType;
      this.actionId = actionId;
      this.actionCount = actionCount;

      this.complete = false;
    }

    cost() {
      if (this.actionType === "research") {
        return readTechIds()[this.actionId].definition.cost;
      }
      if (this.actionType === "build") {
        return readBuildingIds()[this.actionId].definition.cost;
      }
      if (this.actionType === "arpa") {
        return readArpaIds()[this.actionId].definition.cost;
      }
      return {};
    }

    isActionPossible() {
      // check against MAX as we want to know if it is possible...
      let obj = null;
      if (this.actionType === "research") {
        obj = readTechIds()[this.actionId];
      }
      if (this.actionType === "build") {
        obj = readBuildingIds()[this.actionId];
      }
      if (this.actionType === "arpa") {
        obj = readArpaIds()[this.actionId];
      }
      return obj && obj.isUnlocked() && obj.isAffordable(true);
    }

    updateComplete() {
      if (this.complete) {
        return false;
      }

      if (
        this.actionType === "research" &&
        readTechIds()[this.actionId].isResearched()
      ) {
        this.complete = true;
        return true;
      }
      if (
        this.actionType === "build" &&
        readBuildingIds()[this.actionId].count >= this.actionCount
      ) {
        this.complete = true;
        return true;
      }
      if (
        this.actionType === "arpa" &&
        readArpaIds()[this.actionId].count >= this.actionCount
      ) {
        this.complete = true;
        return true;
      }
      return false;
    }

    areRequirementsMet() {
      if (this.requirementType === "chain") {
        return (
          this.priority < 1 ||
          readTriggerManager().priorityList[this.priority - 1]?.complete
        );
      } else if (readCheckTypes()[this.requirementType]) {
        try {
          if (readRetBools().includes(this.requirementType)) {
            return (
              readCheckTypes()[this.requirementType].fn(this.requirementId) ==
              this.requirementCount
            );
          } else {
            return (
              readCheckTypes()[this.requirementType].fn(this.requirementId) >=
              this.requirementCount
            );
          }
        } catch (error) {
          // Triggers don't have names, hopefully this is enough for the user to find it
          let displayName = `${this.requirementType} ${this.requirementId} x${this.requirementCount} => ${this.actionType}: ${this.actionId} x${this.actionCount}`;
          let msg = `Trigger ${this.seq} [${displayName}] requirement is invalid! Fix or remove it. (${error})`;
          if (
            !readWindowManager().isOpen() &&
            !(Object.values(readGame().global.lastMsg.all) as Loose[]).find(
              (log) => log.m === msg,
            )
          ) {
            // Don't spam with errors
            readGameLog().logDanger("special", msg, ["events", "major_events"]);
          }
        }
      }
      return false;
    }

    updateRequirementType(requirementType: Loose) {
      if (requirementType === this.requirementType) {
        return;
      }

      if (requirementType === "chain") {
        this.requirementType = requirementType;
        this.requirementId = "";
        this.requirementCount = 0;
        return; // Special case
      }

      if (!readCheckTypes()[requirementType]) {
        return; // Invalid type
      }

      let oldArg = readCheckTypes()[this.requirementType]?.arg ?? null;
      let oldOpts = readCheckTypes()[this.requirementType]?.options ?? null;
      let newArg = readCheckTypes()[requirementType].arg;
      let newOpts = readCheckTypes()[requirementType].options;

      this.requirementType = requirementType;
      this.requirementCount = 1;
      this.complete = false;

      if (oldArg !== newArg || oldOpts !== newOpts) {
        this.requirementId = readCheckTypes()[this.requirementType].def;
      }
    }

    updateActionType(actionType: Loose) {
      if (actionType === this.actionType) {
        return;
      }

      this.actionType = actionType;
      this.complete = false;

      if (this.actionType === "research") {
        this.actionId = "tech-club";
        this.actionCount = 0;
        return;
      }
      if (this.actionType === "build") {
        this.actionId = "city-basic_housing";
        this.actionCount = 1;
        return;
      }
      if (this.actionType === "arpa") {
        this.actionId = "arpalhc";
        this.actionCount = 1;
        return;
      }
    }
  }

  class MinorTrait {
    [key: string]: Loose;

    constructor(traitName: Loose) {
      this.traitName = traitName;
    }

    get enabled() {
      return readSettings()["mTrait_" + this.traitName];
    }
    get priority() {
      return readSettingsRaw()["mTrait_p_" + this.traitName];
    }
    get weighting() {
      return readSettings()["mTrait_w_" + this.traitName];
    }

    isUnlocked() {
      return readGame().global.settings.mtorder.includes(this.traitName);
    }

    geneCount() {
      return readGame().global.race.minor[this.traitName] ?? 0;
    }

    phageCount() {
      return readGame().global.genes.minor[this.traitName] ?? 0;
    }

    totalCount() {
      return readGame().global.race[this.traitName] ?? 0;
    }

    geneCost() {
      return this.traitName === "mastery"
        ? Fibonacci(this.geneCount()) * 5
        : Fibonacci(this.geneCount());
    }
  }

  class MutableTrait {
    [key: string]: Loose;

    constructor(traitName: Loose) {
      this.traitName = traitName;
      this.baseCost = Math.abs(readGame().traits[traitName].val);
      this.isPositive = readGame().traits[traitName].val >= 0;
    }

    get gainEnabled() {
      return readSettings()["mutableTrait_gain_" + this.traitName];
    }
    get purgeEnabled() {
      return readSettings()["mutableTrait_purge_" + this.traitName];
    }
    get resetEnabled() {
      return readSettings()["mutableTrait_reset_" + this.traitName];
    }
    get priority() {
      return readSettingsRaw()["mutableTrait_p_" + this.traitName];
    }

    get name() {
      return readGame().loc("trait_" + this.traitName + "_name");
    }

    canGain() {
      if (
        readGame().global.race.species === "hellspawn" &&
        readGame().global.race["warlord"]
      ) {
        return false;
      }

      return (
        this.gainEnabled &&
        !this.purgeEnabled &&
        this.canMutate("gain") &&
        readGame().global.race[this.traitName] === undefined &&
        !readConflictingTraits().some(
          (set) =>
            (set[0] === this.traitName &&
              readGame().global.race[set[1]] !== undefined) ||
            (set[1] === this.traitName &&
              readGame().global.race[set[0]] !== undefined),
        )
      );
    }

    canPurge() {
      return (
        this.purgeEnabled &&
        !this.gainEnabled &&
        this.canMutate("purge") &&
        readGame().global.race[this.traitName] !== undefined &&
        !(
          (readGame().global.race.species === "sludge" ||
            readGame().global.race.species === "ultra_sludge") &&
          this.traitName === "ooze"
        ) &&
        !readGame().global.race.ss_traits?.includes(this.traitName) &&
        !Object.hasOwn(readGame().global.race.iTraits ?? {}, this.traitName)
      );
    }

    canMutate(action: Loose) {
      let currentPlasmids =
        readResources()[
          readGame().global.race.universe === "antimatter"
            ? "AntiPlasmid"
            : "Plasmid"
        ].currentQuantity;
      return (
        currentPlasmids - this.mutationCost(action) >=
          readMutableTraitManager().minimumPlasmidsToPreserve &&
        !(
          (readGame().global.race.species === "sludge" ||
            readGame().global.race.species === "ultra_sludge") &&
          readGame().global.race["modified"]
        )
      );
    }

    mutationCost(action: Loose) {
      let mult =
        readMutationCostMultipliers()[readGame().global.race.species]?.[
          action
        ] ?? 1;
      let multGenus =
        readMutationCostMultipliersGenus()[
          readGame().races[readGame().global.race.species].type
        ]?.[action] ?? 1;
      return this.baseCost * 5 * mult * multGenus;
    }
  }

  class MajorTrait extends MutableTrait {
    constructor(traitName: Loose) {
      super(traitName);
      this.type = "major";
      let ownerRace: { id?: Loose; genus?: Loose } =
        (Object.entries(readGame().races) as [string, Loose][])
          .filter(
            ([id, race]) =>
              id !== "custom" &&
              id !== "hybrid" &&
              race.traits[traitName] !== undefined,
          )
          .map(([id, race]) => ({ id: id, genus: race.type }))[0] ?? {};
      this.source = ownerRace.id ?? readSpecialRaceTraits()[traitName] ?? "";
      this.racesThatCanGain = (
        Object.entries(readGame().races) as [string, Loose][]
      )
        .filter(
          ([id, race]) =>
            id == ownerRace.id ||
            (race?.type == "hybrid"
              ? race?.hybrid?.includes(ownerRace.genus)
              : race?.type === ownerRace.genus),
        )
        .map(([id, race]) => id)
        .flat();

      this.genus = this.source === "reindeer" ? "herbivore" : ownerRace.genus;
    }

    isGainable() {
      return this.traitName !== "frail" && this.traitName !== "ooze";
    }

    canGain() {
      return (
        super.canGain() &&
        readGame().global.genes["mutation"] >= 3 &&
        this.racesThatCanGain.includes(readGame().global.race.species)
      );
    }

    canPurge() {
      return super.canPurge() && readGame().global.genes["mutation"] >= 1;
    }
  }

  class GenusTrait extends MutableTrait {
    constructor(traitName: Loose) {
      super(traitName);
      this.type = "genus";
      let genus = (Object.entries(readPoly().genus_traits) as [string, Loose][])
        .filter(([, traits]) => traits[traitName] !== undefined)
        .map(([id, traits]) => id);
      this.source = genus[0] ?? readSpecialRaceTraits()[traitName] ?? "";
      this.genus = this.source;
    }

    isGainable() {
      return false;
    }

    canGain() {
      return false;
    }

    canPurge() {
      return super.canPurge() && readGame().global.genes["mutation"] >= 2;
    }
  }

  return {
    Job,
    BasicJob,
    CraftingJob,
    Resource,
    SoulGem,
    Troops,
    Supply,
    Power,
    Support,
    BeltSupport,
    ElectrolysisSupport,
    WomlingsSupport,
    PrestigeResource,
    Population,
    Morale,
    Thrall,
    ResourceProductionCost,
    Action,
    CityAction,
    Pillar,
    ResourceAction,
    EvolutionAction,
    SpaceDock,
    ModalAction,
    Project,
    Technology,
    Race,
    Trigger,
    MinorTrait,
    MutableTrait,
    MajorTrait,
    GenusTrait,
  };
}
