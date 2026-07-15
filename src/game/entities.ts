type Loose = any;
type LooseRecord = Record<PropertyKey, Loose>;
type LooseFunction = (...args: Loose[]) => Loose;

interface EntityClassesContext {
  $: LooseFunction;
  arpaIds: LooseRecord;
  buildingIds: LooseRecord;
  buildings: LooseRecord;
  checkAffordableCustom: LooseFunction;
  checkTypes: LooseRecord;
  conflictingTraits: Loose[];
  document: LooseRecord;
  fanatAchievements: Loose[];
  Fibonacci: LooseFunction;
  game: LooseRecord;
  GameLog: LooseRecord;
  getAchievementStar: LooseFunction;
  getCitadelConsumption: LooseFunction;
  getStarLevel: LooseFunction;
  getVueById: LooseFunction;
  haveTask: LooseFunction;
  haveTech: LooseFunction;
  jobs: LooseRecord;
  KeyManager: LooseRecord;
  logIgnore: Loose[];
  logPrestige: LooseFunction;
  MutableTraitManager: LooseRecord;
  mutationCostMultipliers: LooseRecord;
  mutationCostMultipliersGenus: LooseRecord;
  normalizeProperties: LooseFunction;
  poly: LooseRecord;
  races: LooseRecord;
  resources: LooseRecord;
  retBools: Loose[];
  settings: LooseRecord;
  settingsRaw: LooseRecord;
  specialRaceTraits: LooseRecord;
  state: LooseRecord;
  techIds: LooseRecord;
  ticksPerSecond: LooseFunction;
  traitVal: LooseFunction;
  TriggerManager: LooseRecord;
  WarManager: LooseRecord;
  win: LooseRecord;
  WindowManager: LooseRecord;
}

interface EntityClassesDependencies {
  dependencies: {
    [Key in keyof EntityClassesContext]: () => EntityClassesContext[Key];
  };
}

export function createEntityClasses({
  dependencies,
}: EntityClassesDependencies) {
  const liveObject = (key: keyof EntityClassesContext) =>
    new Proxy(
      {},
      {
        get(_target, property) {
          const current = dependencies[key]() as LooseRecord;
          const value = current?.[property];
          return typeof value === "function" ? value.bind(current) : value;
        },
        set(_target, property, value) {
          return Reflect.set(
            dependencies[key]() as LooseRecord,
            property,
            value,
          );
        },
        deleteProperty(_target, property) {
          return Reflect.deleteProperty(
            dependencies[key]() as LooseRecord,
            property,
          );
        },
        has(_target, property) {
          return Reflect.has(dependencies[key]() as LooseRecord, property);
        },
        ownKeys() {
          return Reflect.ownKeys(dependencies[key]() as LooseRecord);
        },
        getOwnPropertyDescriptor(_target, property) {
          const current = dependencies[key]() as LooseRecord;
          const descriptor = Object.getOwnPropertyDescriptor(current, property);
          return {
            configurable: true,
            enumerable: descriptor?.enumerable ?? true,
            writable: true,
            value: Reflect.get(current, property),
          };
        },
      },
    ) as LooseRecord;
  const liveFunction = (key: keyof EntityClassesContext) =>
    ((...args: Loose[]) =>
      (dependencies[key]() as LooseFunction)(...args)) as LooseFunction;

  const $ = liveFunction("$");
  const arpaIds = liveObject("arpaIds");
  const buildingIds = liveObject("buildingIds");
  const buildings = liveObject("buildings");
  const checkAffordableCustom = liveFunction("checkAffordableCustom");
  const checkTypes = liveObject("checkTypes");
  const conflictingTraits = liveObject("conflictingTraits") as Loose[];
  const document = liveObject("document");
  const fanatAchievements = liveObject("fanatAchievements") as Loose[];
  const Fibonacci = liveFunction("Fibonacci");
  const game = liveObject("game");
  const GameLog = liveObject("GameLog");
  const getAchievementStar = liveFunction("getAchievementStar");
  const getCitadelConsumption = liveFunction("getCitadelConsumption");
  const getStarLevel = liveFunction("getStarLevel");
  const getVueById = liveFunction("getVueById");
  const haveTask = liveFunction("haveTask");
  const haveTech = liveFunction("haveTech");
  const jobs = liveObject("jobs");
  const KeyManager = liveObject("KeyManager");
  const logIgnore = liveObject("logIgnore") as Loose[];
  const logPrestige = liveFunction("logPrestige");
  const MutableTraitManager = liveObject("MutableTraitManager");
  const mutationCostMultipliers = liveObject("mutationCostMultipliers");
  const mutationCostMultipliersGenus = liveObject(
    "mutationCostMultipliersGenus",
  );
  const normalizeProperties = liveFunction("normalizeProperties");
  const poly = liveObject("poly");
  const races = liveObject("races");
  const resources = liveObject("resources");
  const retBools = liveObject("retBools") as Loose[];
  const settings = liveObject("settings");
  const settingsRaw = liveObject("settingsRaw");
  const specialRaceTraits = liveObject("specialRaceTraits");
  const state = liveObject("state");
  const techIds = liveObject("techIds");
  const ticksPerSecond = liveFunction("ticksPerSecond");
  const traitVal = liveFunction("traitVal");
  const TriggerManager = liveObject("TriggerManager");
  const WarManager = liveObject("WarManager");
  const win = liveObject("win");
  const WindowManager = liveObject("WindowManager");

  class Job {
    [key: string]: Loose;

    constructor(id, name, flags) {
      this._originalId = id;
      this._originalName = name;
      this._workerBinding = "civ-" + this._originalId;

      this.is = normalizeProperties(flags) ?? {};
    }

    get autoJobEnabled() {
      return settings["job_" + this._originalId];
    }
    get isSmartEnabled() {
      return settings["job_s_" + this._originalId];
    }
    get priority() {
      return settingsRaw["job_p_" + this._originalId];
    }
    getBreakpoint(n) {
      return settings[`job_b${n + 1}_${this._originalId}`];
    }

    get definition() {
      return game.global.civic[this._originalId];
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

    breakpointEmployees(breakpoint, ignoreMax) {
      let breakpointActual = this.getBreakpoint(breakpoint);

      // -1 equals unlimited up to the maximum available jobs for this job
      if (breakpointActual === -1) {
        breakpointActual = Number.MAX_SAFE_INTEGER;
      } else if (settings.jobScalePop && this._originalId !== "hell_surveyor") {
        breakpointActual *= traitVal("high_pop", 0, 1);
      }

      // return the actual workers required for this breakpoint (either our breakpoint or our max, whichever is lower)
      return ignoreMax
        ? breakpointActual
        : Math.min(breakpointActual, this.max);
    }

    addWorkers(count) {
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

      for (let m of KeyManager.click(count)) {
        vue.add();
      }
    }

    removeWorkers(count) {
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

      for (let m of KeyManager.click(count)) {
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
      return game.global.race.servants?.jobs[this._originalId] ?? 0;
    }

    get max() {
      return Number.MAX_SAFE_INTEGER;
    }

    addServants(count) {
      if (count < 0) {
        this.removeServants(-1 * count);
      }

      let vue = getVueById(this._servantBinding);
      if (vue === undefined) {
        return false;
      }

      for (let m of KeyManager.click(count)) {
        vue.add();
      }
    }

    removeServants(count) {
      if (count < 0) {
        this.addServants(-1 * count);
      }

      let vue = getVueById(this._servantBinding);
      if (vue === undefined) {
        return false;
      }

      for (let m of KeyManager.click(count)) {
        vue.sub();
      }
    }

    isDefault() {
      return game.global.civic.d_job === this.id;
    }

    setAsDefault() {
      getVueById(this._workerBinding)?.setDefault(this.id);
    }
  }

  class CraftingJob extends Job {
    constructor(id, name, resource) {
      super(id, name, { serve: true });

      this._crafterBinding = "foundry";
      this._servantBinding = "skilledServants";
      this.resource = resource;
    }

    get definition() {
      return game.global.civic["craftsman"];
    }

    get id() {
      return this.resource.id;
    }

    isUnlocked() {
      return game.global.resource[this._originalId].display;
    }

    get servants() {
      return game.global.race.servants?.sjobs[this._originalId] ?? 0;
    }

    get workers() {
      return game.global.city.foundry?.[this._originalId] ?? 0;
    }

    get max() {
      return game.global.civic.craftsman.max;
    }

    addWorkers(count) {
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

      for (let m of KeyManager.click(count)) {
        vue.add(this._originalId);
      }
    }

    removeWorkers(count) {
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

      for (let m of KeyManager.click(count)) {
        vue.sub(this._originalId);
      }
    }

    addServants(count) {
      if (count < 0) {
        this.removeServants(-1 * count);
      }

      let vue = getVueById(this._servantBinding);
      if (vue === undefined) {
        return false;
      }

      for (let m of KeyManager.click(count)) {
        vue.add(this._originalId);
      }
    }

    removeServants(count) {
      if (count < 0) {
        this.addServants(-1 * count);
      }

      let vue = getVueById(this._servantBinding);
      if (vue === undefined) {
        return false;
      }

      for (let m of KeyManager.click(count)) {
        vue.sub(this._originalId);
      }
    }
  }

  class Resource {
    [key: string]: Loose;

    constructor(name, id, flags?: Loose) {
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
      this.storageRequired = 1;
      this.requestedQuantity = 0;
      this.cost = {};

      this._vueBinding = "res" + id;
      this._stackVueBinding = "stack-" + id;
      this._marketVueBinding = "market-" + id;

      this.is = normalizeProperties(flags) ?? {};
    }

    get autoCraftEnabled() {
      return settings["craft" + this.id];
    }
    get craftWeighting() {
      return settings["foundry_w_" + this.id];
    }
    get craftPreserve() {
      return settings["foundry_p_" + this.id];
    }
    get autoStorageEnabled() {
      return settings["res_storage" + this.id];
    }
    get storagePriority() {
      return settingsRaw["res_storage_p_" + this.id];
    }
    get storeOverflow() {
      return settings["res_storage_o_" + this.id];
    }
    get minStorage() {
      return settings["res_min_store" + this.id];
    }
    get maxStorage() {
      return settings["res_max_store" + this.id];
    }
    get marketPriority() {
      return settingsRaw["res_buy_p_" + this.id];
    }
    get autoBuyEnabled() {
      return settings["buy" + this.id];
    }
    get autoBuyRatio() {
      return settings["res_buy_r_" + this.id];
    }
    get autoSellEnabled() {
      return settings["sell" + this.id];
    }
    get autoSellRatio() {
      return settings["res_sell_r_" + this.id];
    }
    get autoTradeBuyEnabled() {
      return settings["res_trade_buy_" + this.id];
    }
    get autoTradeSellEnabled() {
      return settings["res_trade_sell_" + this.id];
    }
    get autoTradeWeighting() {
      return settings["res_trade_w_" + this.id];
    }
    get autoTradePriority() {
      return settings["res_trade_p_" + this.id];
    }
    get galaxyMarketWeighting() {
      return settings["res_galaxy_w_" + this.id];
    }
    get galaxyMarketPriority() {
      return settings["res_galaxy_p_" + this.id];
    }

    get title() {
      return this.instance?.name || this.name;
    }

    get instance() {
      return game.global.resource[this.id];
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
      if (settings.autoMarket && this.is.tradable) {
        this.tradeRoutes = this.instance.trade;
        this.tradeBuyPrice = game.tradeBuyPrice(this._id);
        this.tradeSellPrice = game.tradeSellPrice(this._id);
        let tradeDiff = game.breakdown.p.consume[this._id]?.Trade || 0;
        if (tradeDiff > 0) {
          this.rateMods["buy"] = tradeDiff * -1;
        } else if (tradeDiff < 0) {
          this.rateMods["sell"] = tradeDiff * -1;
          this.rateOfChange += this.rateMods["sell"];
        }
      }

      // Restore decayed rate
      if (
        game.global.race["decay"] &&
        this.tradeRouteQuantity > 0 &&
        this.currentQuantity >= 50
      ) {
        this.rateMods["decay"] =
          (this.currentQuantity - 50) * (0.001 * this.tradeRouteQuantity);
        this.rateOfChange += this.rateMods["decay"];
      }
    }

    calculateRateOfChange(apply) {
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
          this === resources.Food &&
          (game.global.race["artifical"] || game.global.race["fasting"])
        ) &&
        ((game.global.race["banana"] && this === resources.Food) ||
          (game.global.tech["trade"] && !game.global.race["terrifying"]))
      );
    }

    isManagedStorage() {
      return this.hasStorage() && this.autoStorageEnabled;
    }

    get atomicMass() {
      return game.atomic_mass[this.id] ?? 0;
    }

    isUseful() {
      /* This check always cause issues, i'll just disable it for now
            // Spending accumulated resources
            if (settings.autoStorage && settings.storageSafeReassign && !this.storeOverflow && this.currentQuantity > this.minStorage && this.currentQuantity > this.storageRequired &&
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

    getProduction(source, locArg) {
      let produced = 0;
      let labelFound = false;
      for (let [label, value] of Object.entries(
        game.breakdown.p[this._id] ?? {},
      ) as [string, string][]) {
        if (value.indexOf("%") === -1) {
          if (labelFound) {
            break;
          } else if (label === poly.loc(source, locArg)) {
            labelFound = true;
            produced += parseFloat(value) || 0;
          }
        } else if (labelFound && this.isValidProductionLabel(label)) {
          produced *= 1 + (parseFloat(value) || 0) / 100;
        }
      }
      return produced * state.globalProductionModifier;
    }

    isValidProductionLabel(label) {
      // Bug as of 1.3.11a: Space Syndicate is already applied to the displayed base value
      // The calculations are correct though
      // This can cause constant Iron flicker in Truepath because the script thinks
      // a worker is producing more than the constant smelter consumption.
      if (this._id === "Iron" && label === `ᄂ${poly.loc("space_syndicate")}`)
        return false;

      // Everything else is valid (at least for now)
      return true;
    }

    getBusyWorkers(workersSource, workersCount, locArg) {
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
      return game.craftCost.hasOwnProperty(this.id);
    }

    hasStorage() {
      return this.instance?.stackable ?? false;
    }

    get tradeRouteQuantity() {
      return game.tradeRatio[this.id] || -1;
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

    tryCraftX(count) {
      let vue = getVueById(this._vueBinding);
      if (vue === undefined) {
        return false;
      }

      KeyManager.set(false, false, false);
      vue.craft(this.id, count);
    }

    requestQuantity(req) {
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
      this.rateOfChange = state.soulGemPerHour / 3600;
    }
  }

  class Troops extends Resource {
    updateData() {
      if (!this.isUnlocked()) {
        return;
      }

      this.currentQuantity = WarManager.currentCityGarrison;
      this.maxQuantity = WarManager.maxCityGarrison;
      this.rateOfChange = 0;
    }

    isUnlocked() {
      return WarManager._garrisonVue !== undefined;
    }
  }

  class Supply extends Resource {
    updateData() {
      if (!this.isUnlocked()) {
        return;
      }

      this.currentQuantity = game.global.portal.purifier.supply;
      this.maxQuantity = game.global.portal.purifier.sup_max;
      this.rateOfChange = game.global.portal.purifier.diff;
    }

    isUnlocked() {
      return game.global.portal.hasOwnProperty("purifier");
    }
  }

  class Power extends Resource {
    updateData() {
      if (!this.isUnlocked()) {
        return;
      }

      this.currentQuantity = game.global.city.power;
      if (haveTask("replicate")) {
        this.currentQuantity += game.global.race.replicator.pow;
      }
      this.rateOfChange = this.currentQuantity;

      this.maxQuantity = 0;
      if (game.global.race.powered) {
        this.maxQuantity +=
          (resources.Population.maxQuantity -
            resources.Population.currentQuantity) *
          traitVal("powered", 0);
      }
      for (let building of Object.values(buildings)) {
        if (building.stateOffCount > 0) {
          let missingAmount = building.stateOffCount;
          if (
            building.autoMax < building.count &&
            settings.masterScriptToggle &&
            settings.autoPower &&
            building.autoStateEnabled &&
            settings.buildingsLimitPowered
          ) {
            missingAmount -= building.count - building.autoMax;
          }

          if (building === buildings.NeutronCitadel) {
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
      return game.global.city.powered;
    }
  }

  class Support extends Resource {
    // This isn't really a resource but we're going to make a dummy one so that we can treat it like a resource
    constructor(name, id, region, inRegionId) {
      super(name, id);

      this._region = region;
      this._inRegionId = inRegionId;
    }

    updateData() {
      if (!this.isUnlocked()) {
        return;
      }

      this.maxQuantity = game.global[this._region][this.supportId].s_max;
      this.currentQuantity = game.global[this._region][this.supportId].support;
      this.rateOfChange = this.maxQuantity - this.currentQuantity;
    }

    get supportId() {
      return game.actions[this._region][this._inRegionId].info.support;
    }

    get storageRatio() {
      return this.maxQuantity > 0
        ? (this.maxQuantity - this.currentQuantity) / this.maxQuantity
        : 1;
    }

    isUnlocked() {
      return game.global[this._region][this.supportId] !== undefined;
    }
  }

  class BeltSupport extends Support {
    // Unlike other supports this one takes in account available workers
    updateData() {
      if (!this.isUnlocked()) {
        return;
      }

      let maxStations =
        settings.autoPower && buildings.BeltSpaceStation.autoStateEnabled
          ? buildings.BeltSpaceStation.count
          : buildings.BeltSpaceStation.stateOnCount;
      let maxWorkers =
        settings.autoJobs &&
        jobs.SpaceMiner.autoJobEnabled &&
        jobs.SpaceMiner.isSmartEnabled
          ? state.maxSpaceMiners
          : jobs.SpaceMiner.count;
      this.maxQuantity = Math.min(
        maxStations * 3 * traitVal("high_pop", 0, 1),
        maxWorkers,
      );
      this.currentQuantity = game.global[this._region][this.supportId].support;
      this.rateOfChange = this.maxQuantity - this.currentQuantity;
    }
  }

  class ElectrolysisSupport extends Support {
    updateData() {
      if (!this.isUnlocked()) {
        return;
      }

      this.maxQuantity = buildings.TitanElectrolysis.stateOnCount;
      this.currentQuantity = buildings.TitanHydrogen.stateOnCount;
      this.rateOfChange = this.maxQuantity - this.currentQuantity;
    }

    isUnlocked() {
      return game.global.race["truepath"] ? true : false;
    }
  }

  class WomlingsSupport extends Support {
    updateData() {
      if (!this.isUnlocked()) {
        return;
      }

      this.maxQuantity =
        buildings.TauRedWomlingVillage.stateOnCount *
        (haveTech("womling_pop", 2) ? 6 : 5);
      this.currentQuantity =
        buildings.TauRedWomlingFarm.stateOnCount * 2 +
        buildings.TauRedWomlingLab.stateOnCount +
        buildings.TauRedWomlingMine.stateOnCount * 6;
      this.rateOfChange = this.maxQuantity - this.currentQuantity; // - game.global.tauceti.overseer.injured
    }

    isUnlocked() {
      return haveTech("tau_red", 5) ? true : false;
    }
  }

  class PrestigeResource extends Resource {
    updateData() {
      this.currentQuantity = game.global.prestige[this.id].count;
      this.maxQuantity = Number.MAX_SAFE_INTEGER;
    }

    isUnlocked() {
      return true;
    }
  }

  class Population extends Resource {
    get id() {
      // The population node is special and its id will change to the race name
      return game.global.race.species;
    }
  }

  class Morale extends Resource {
    updateData() {
      this.currentQuantity = game.global.city.morale.current;
      this.maxQuantity = game.global.city.morale.cap;
      this.rateOfChange = game.global.city.morale.potential;
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
      for (let i = 0; i < game.global.city.surfaceDwellers.length; i++) {
        this.currentQuantity += game.global.city.captive_housing[`race${i}`];
        this.rateOfChange += game.global.city.captive_housing[`jailrace${i}`];
      }
      this.currentQuantity += this.rateOfChange;
      this.maxQuantity = game.global.city.captive_housing.raceCap;
    }

    isUnlocked() {
      return game.global.city.captive_housing ? true : false;
    }
  }

  class ResourceProductionCost {
    [key: string]: Loose;

    constructor(resource, quantity, minRateOfChange) {
      this.resource = resource;
      this.quantity = quantity;
      this.minRateOfChange = minRateOfChange;
    }
  }

  class Action {
    [key: string]: Loose;

    constructor(name, tab, id, location, flags?: Loose) {
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
      return settings["bat" + this._vueBinding];
    }
    get autoStateEnabled() {
      return settings["bld_s_" + this._vueBinding];
    }
    get autoStateSmart() {
      return settings["bld_s2_" + this._vueBinding];
    }
    get priority() {
      return settingsRaw["bld_p_" + this._vueBinding];
    }
    get _weighting() {
      return settings["bld_w_" + this._vueBinding];
    }
    get _autoMax() {
      return settings["bld_m_" + this._vueBinding];
    }

    get definition() {
      if (this._location !== "") {
        return game.actions[this._tab][this._location][this._id];
      } else {
        return game.actions[this._tab][this._id];
      }
    }

    get instance() {
      return game.global[this._tab][this._id];
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
        (this._tab === "city" && !game.global.settings.showCity) ||
        (this._tab === "space" &&
          !game.global.settings.showSpace &&
          !game.global.settings.showOuter) ||
        (this._tab === "interstellar" && !game.global.settings.showDeep) ||
        (this._tab === "portal" && !game.global.settings.showPortal) ||
        (this._tab === "galaxy" && !game.global.settings.showGalactic) ||
        (this._tab === "tauceti" && !game.global.settings.showTau) ||
        (this._tab === "eden" && !game.global.settings.showEden)
      ) {
        return false;
      }
      return this.vue !== undefined;
    }

    isSwitchable() {
      return (
        this.definition.hasOwnProperty("powered") ||
        this.definition.hasOwnProperty("switchable")
      );
    }

    isMission() {
      return this.definition.hasOwnProperty("grant");
    }

    isComplete() {
      return haveTech(this.definition.grant[0], this.definition.grant[1]);
    }

    isSmartManaged() {
      return (
        settings.autoPower &&
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
        !this.definition.hasOwnProperty("powered") ||
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

      let adjustedCosts = poly.adjustCosts(this.definition);
      for (let resourceName in adjustedCosts) {
        if (resources[resourceName]) {
          let resourceAmount = Number(adjustedCosts[resourceName]());
          if (resourceAmount > 0) {
            this.cost[resourceName] = resourceAmount;
          }
        }
      }
    }

    isAffordable(max = false) {
      return game.checkAffordable(this.definition, max);
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
        this.is.multiSegmented && settings.buildingsUseMultiClick;
      let amountToBuild = 1;
      if (doMultiClick) {
        amountToBuild = this.gameMax - this.count;
        for (let res in this.cost) {
          amountToBuild = Math.min(
            amountToBuild,
            Math.floor(resources[res].currentQuantity / this.cost[res]),
          );
        }
        if (amountToBuild < 1) {
          // Game allow to spend more resources than available, going negative. If we're here - building is clickable, and we can afford at least one thing for sure.
          amountToBuild = 1;
        }
      }

      for (let res in this.cost) {
        resources[res].currentQuantity -= this.cost[res] * amountToBuild;
      }

      // Don't log evolution actions and gathering actions
      if (
        game.global.race.species !== "protoplasm" &&
        !logIgnore.includes(this.id)
      ) {
        if (
          this.gameMax < Number.MAX_SAFE_INTEGER &&
          this.count + amountToBuild < this.gameMax
        ) {
          GameLog.logSuccess(
            "multi_construction",
            poly.loc("build_success", [
              `${this.title} (${this.count + amountToBuild})`,
            ]),
            ["queue", "building_queue"],
          );
        } else {
          GameLog.logSuccess(
            "construction",
            poly.loc("build_success", [this.title]),
            ["queue", "building_queue"],
          );
        }
      }

      KeyManager.set(doMultiClick, doMultiClick, doMultiClick);

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
        settings.performanceHackAvoidDrawTech &&
        this.definition.refresh &&
        this.count > 0 &&
        !this.definition.grant &&
        !this.definition.post &&
        !this.definition.queue_complete &&
        !this.is.prestige &&
        !game.global.race.inflation &&
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
        state.goal = "GameOverMan";
      }

      return true;
    }

    addSupport(resource) {
      this.consumption.push(
        normalizeProperties({
          resource: resource,
          rate: () => this.definition.support() * -1,
        }),
      );
    }

    addResourceConsumption(resource, rate) {
      // TODO: Load fuel from definition, same as for support
      this.consumption.push(
        normalizeProperties({ resource: resource, rate: rate }),
      );
    }

    getFuelRate(idx) {
      if (!this.consumption[idx]) {
        return 0;
      }

      let resource = this.consumption[idx].resource;
      let rate = this.consumption[idx].rate;
      if (
        this._tab === "space" &&
        (resource === resources.Oil || resource === resources.Helium_3)
      ) {
        rate = game.fuel_adjust(rate, true);
      } else if (
        (this._tab === "interstellar" ||
          this._tab === "galaxy" ||
          this._tab === "tauceti") &&
        (resource === resources.Deuterium || resource === resources.Helium_3) &&
        this !== buildings.AlphaFusion
      ) {
        rate = game.int_fuel_adjust(rate);
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
          resource === resources.Food &&
          settings.autoJobs &&
          (jobs.Farmer.autoJobEnabled || jobs.Hunter.autoJobEnabled)
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
        game.global.race["fasting"] &&
        this === buildings.AlphaMiningDroid &&
        this.count < 1
      ) {
        return null;
      }

      for (let j = 0; j < this.consumption.length; j++) {
        let resource = this.consumption[j].resource;

        // We're going to build Spire things with no support, to enable them later
        if (resource === resources.Spire_Support && this.autoStateSmart) {
          continue;
        }
        // Tau Belt support can be overused
        if (resource === resources.Tau_Belt_Support) {
          continue;
        }
        // Womlings facilities can run understaffed
        if (
          resource === resources.Womlings_Support &&
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
        this === buildings.GatewayStarbase ||
        this === buildings.AlphaHabitat ||
        (this === buildings.SpaceNavBeacon && game.global.race["orbit_decayed"])
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
          resource === resources.Belt_Support
            ? 2 * traitVal("high_pop", 0, 1)
            : resource === resources.Gateway_Support
              ? 5
              : resource === resources.Womlings_Support
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

      if (this === buildings.Banquet) {
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

    tryAdjustState(adjustCount) {
      if (adjustCount === 0 || !this.hasState()) {
        return false;
      }

      let vue = this.vue;

      if (adjustCount > 0) {
        for (let m of KeyManager.click(adjustCount)) {
          vue.power_on();
        }
        return true;
      }
      if (adjustCount < 0) {
        for (let m of KeyManager.click(adjustCount * -1)) {
          vue.power_off();
        }
        return true;
      }
    }
  }

  class CityAction extends Action {
    get instance() {
      return game.global.city[this._id];
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
        game.global.tech.pillars !== 1 ||
        game.global.race.universe === "micro"
      ) {
        return false;
      }
      return game.checkAffordable(this.definition, max);
    }
  }

  class ResourceAction extends Action {
    constructor(name, tab, id, location, res, flags) {
      super(name, tab, id, location, flags);

      this.resource = resources[res];
    }

    get count() {
      return this.resource.currentQuantity;
    }
  }

  class EvolutionAction extends Action {
    constructor(id) {
      super("", "evolution", id, "");
    }

    isUnlocked() {
      let node = document.getElementById(this._vueBinding);
      return node !== null && !node.classList.contains("is-hidden");
    }
  }

  class SpaceDock extends Action {
    isOptionsCached() {
      if (this.count < 1 || game.global.tech["genesis"] < 4) {
        // It doesn't have options yet so I guess all "none" of them are cached!
        // Also return true if we don't have the required tech level yet
        return true;
      }

      // If our tech is unlocked but we haven't cached the vue the the options aren't cached
      if (
        !buildings.GasSpaceDockProbe.isOptionsCached() ||
        (game.global.tech["genesis"] >= 5 &&
          !buildings.GasSpaceDockShipSegment.isOptionsCached()) ||
        (game.global.tech["genesis"] === 6 &&
          !buildings.GasSpaceDockPrepForLaunch.isOptionsCached()) ||
        (game.global.tech["genesis"] >= 7 &&
          !buildings.GasSpaceDockLaunch.isOptionsCached()) ||
        (game.global.tech["geck"] >= 1 &&
          !buildings.GasSpaceDockGECK.isOptionsCached())
      ) {
        return false;
      }

      return true;
    }

    cacheOptions() {
      if (this.count < 1 || WindowManager.isOpen()) {
        return false;
      }

      let optionsNode = document.querySelector("#space-star_dock .special");
      WindowManager.openModalWindowWithCallback(optionsNode, this.title, () => {
        buildings.GasSpaceDockProbe.cacheOptions();
        buildings.GasSpaceDockGECK.cacheOptions();
        buildings.GasSpaceDockShipSegment.cacheOptions();
        buildings.GasSpaceDockPrepForLaunch.cacheOptions();
        buildings.GasSpaceDockLaunch.cacheOptions();
      });
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
      if (!game.global.settings.showSpace) {
        return false;
      }
      // We have to override this as there won't be an element unless the modal window is open
      return this._vue !== undefined;
    }
  }

  class Project extends Action {
    constructor(name, id) {
      super(name, "arpa", id, "");
      this._vueBinding = "arpa" + this.id;
      this.currentStep = 1;
    }

    get autoBuildEnabled() {
      return settings["arpa_" + this._id];
    }
    get priority() {
      return settingsRaw["arpa_p_" + this._id];
    }
    get _autoMax() {
      return settings["arpa_m_" + this._id];
    }
    get _weighting() {
      return settings["arpa_w_" + this._id];
    }

    updateResourceRequirements() {
      if (!this.isUnlocked()) {
        return;
      }

      this.cost = {};
      let maxStep = Math.min(
        100 - this.progress,
        state.triggerTargets.includes(this) ? 100 : settings.arpaStep,
      );

      let adjustedCosts = poly.arpaAdjustCosts(this.definition.cost);
      for (let resourceName in adjustedCosts) {
        if (resources[resourceName]) {
          let resourceAmount = Number(adjustedCosts[resourceName]());
          if (resourceAmount > 0) {
            this.cost[resourceName] = resourceAmount / 100;
            maxStep = Math.min(
              maxStep,
              resources[resourceName].maxQuantity / this.cost[resourceName],
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
        resources[res].currentQuantity -= this.cost[res];
      }

      if (this.progress + this.currentStep < 100) {
        GameLog.logSuccess(
          "arpa",
          poly.loc("build_success", [
            `${this.title} (${this.progress + this.currentStep}%)`,
          ]),
          ["queue", "building_queue"],
        );
      } else {
        GameLog.logSuccess(
          "construction",
          poly.loc("build_success", [this.title]),
          ["queue", "building_queue"],
        );
        if (this.id === "syphon" && this.count == 79) {
          logPrestige();
        }
      }

      KeyManager.set(false, false, false);
      // This is a really bad lag hack. ARPAs make a very expensive drawTech() call on every build.
      // After 10 ARPAs, this will never actually accomplish anything; AFAIK nothing needs more than 10 ARPAs.
      // Luckily, drawTech() doesn't draw anything if preload tab content is off and we're not on research.
      // So if we can, we briefly hack that off while buying an ARPA that won't change anything.
      if (
        settings.performanceHackAvoidDrawTech &&
        this.count >= 10 &&
        !(this.id === "syphon" && this.count >= 79)
      ) {
        let mainVue = win.$("#mainColumn > div:first-child")[0]?.__vue__;
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

    constructor(id) {
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
        document.querySelector(
          "#" + this._vueBinding + " > .button:not(.precog)",
        ) !== null && getVueById(this._vueBinding) !== undefined
      );
    }

    get definition() {
      return game.actions.tech[this._id];
    }

    get title() {
      let def = this.definition;
      let title = typeof def.title === "function" ? def.title() : def.title;
      if (this._id in Technology.techDiscriminators) {
        title += ` (${Technology.techDiscriminators[this._id]})`;
      }
      return title;
    }

    get name() {
      return this.title;
    }

    isAffordable(max = false) {
      return game.checkAffordable(this.definition, max);
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
        resources[res].currentQuantity -= this.cost[res];
      }

      getVueById(this._vueBinding).action();

      let def = this.definition;
      let title = typeof def.title === "function" ? def.title() : def.title;
      GameLog.logSuccess("research", poly.loc("research_success", [title]), [
        "queue",
        "research_queue",
      ]);
      return true;
    }

    isResearched() {
      return document.querySelector("#tech-" + this.id + " .oldTech") !== null;
    }

    updateResourceRequirements() {
      if (!this.isUnlocked()) {
        return;
      }

      this.cost = {};
      if (!this.definition.cost) {
        return;
      }

      let adjustedCosts = poly.adjustCosts(this.definition);
      for (let resourceName in adjustedCosts) {
        if (resources[resourceName]) {
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

    constructor(id) {
      this.id = id;
      this.evolutionTree = {};
    }

    get name() {
      return game.races[this.id].name ?? `Custom (${this.id} slot)`;
    }

    get desc() {
      let nameRef = game.races[this.id].desc;
      return typeof nameRef === "function"
        ? nameRef()
        : typeof nameRef === "string"
          ? nameRef
          : "Custom"; // Nonexistent custom
    }

    get genus() {
      return game.races[this.id].type;
    }

    getWeighting(verbose) {
      // Locked races always have zero weighting
      let habitability = this.getHabitability();
      if (habitability < (settings.evolutionAutoUnbound ? 0.8 : 1)) {
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
      let starLevel = getStarLevel(settings);
      const checkAchievement = (baseWeight, id) => {
        let improve = starLevel - getAchievementStar(id);
        if (improve > 0) {
          weighting += baseWeight * improve;
          goals.push(`achieve_${id}_name`);
          if (
            game.global.race.universe !== "micro" &&
            game.global.race.universe !== "standard"
          ) {
            weighting +=
              baseWeight *
              Math.max(0, starLevel - getAchievementStar(id, "standard"));
          }
        }
      };

      // Check pillar
      if (
        ((settings.prestigeType === "ascension" &&
          settings.prestigeAscensionPillar) ||
          ["demonic", "apotheosis"].includes(settings.prestigeType)) &&
        game.global.race.universe !== "micro"
      ) {
        let speciesPillarLevel = game.global.pillars[this.id] ?? 0;
        let canPillar =
          !speciesPillarLevel && resources.Harmony.currentQuantity >= 1;
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
              ...Object.values(races)
                .filter(
                  (r) => r.genus === this.genus && !noPillarRace.includes(r.id),
                )
                .map((r) => game.global.pillars[r.id] ?? 0),
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
      if (settings.prestigeType === "apocalypse") {
        let imitateUnlocked = game.global.stats?.synth?.[this.id] ?? false;
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
      if (greatnessReset.includes(settings.prestigeType)) {
        if (
          !noGreatnessGenus.includes(this.genus) &&
          !noGreatnessRace.includes(this.id)
        ) {
          checkAchievement(100, "genus_" + this.genus);
        }
      } else if (
        !noExtinctionRace.includes(this.id) &&
        (!noMADRace.includes(this.id) || settings.prestigeType !== "mad")
      ) {
        checkAchievement(100, "extinct_" + this.id);
      }

      // Blood War
      if (
        this.genus === "demonic" &&
        settings.prestigeType !== "mad" &&
        settings.prestigeType !== "bioseed"
      ) {
        checkAchievement(50, "blood_war");
      }

      // Sharks with Lasers
      if (this.id === "sharkin" && settings.prestigeType !== "mad") {
        checkAchievement(50, "laser_shark");
      }

      // Macro Universe and Arquillian Galaxy
      if (
        game.global.race.universe === "micro" &&
        settings.prestigeType === "bioseed"
      ) {
        let smallRace =
          this.genus === "small" || game.races[this.id].traits.compact;
        checkAchievement(50, smallRace ? "macro" : "marble");
      }

      // You Shall Pass
      if (
        this.id === "balorg" &&
        game.global.race.universe === "magic" &&
        settings.prestigeType === "vacuum"
      ) {
        checkAchievement(50, "pass");
      }

      // Madagascar Tree, Godwin's law, Infested Terrans - Achievement race
      for (let set of fanatAchievements) {
        if (this.id === set.race && game.global.race.gods === set.god) {
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

      // Increases weight of stringest races of genus
      if (
        (midTierReset.includes(settings.prestigeType) &&
          bestForMid.includes(this.id)) ||
        (highTierReset.includes(settings.prestigeType) &&
          bestForHigh.includes(this.id))
      ) {
        weighting += 1;
      }

      // Same race for Second Evolution
      if (this.id === game.global.race.gods) {
        checkAchievement(10, "second_evolution");
      }

      // Madagascar Tree, Godwin's law, Infested Terrans - God race
      // This races shouldn't benefit from suited planet, to avoid prep -> prep loops
      for (let set of fanatAchievements) {
        if (this.id === set.god) {
          checkAchievement(5, set.achieve);
        }
      }

      // Feats, lowest weight - go for them only if there's nothing better
      if (game.global.race.universe !== "micro") {
        const checkFeat = (id) => {
          let improve = starLevel - (game.global.stats.feat[id] ?? 0);
          if (improve > 0) {
            weighting += 1 * improve;
            goals.push(`feat_${id}_name`);
          }
        };

        // Take no advice, Ill Advised
        if (
          game.global.city.biome === "hellscape" &&
          this.genus !== "demonic"
        ) {
          switch (settings.prestigeType) {
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
          switch (settings.prestigeType) {
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
          settings.prestigeType === "whitehole" &&
          game.global.race.universe === "evil" &&
          this.genus === "angelic"
        ) {
          checkFeat("nephilim");
        }

        // Twisted
        if (settings.prestigeType === "demonic" && this.genus === "angelic") {
          checkFeat("twisted");
        }

        // Digital Ascension
        if (
          settings.prestigeType === "ascension" &&
          settings.challenge_emfield &&
          this.genus === "artifical" &&
          this.id !== "custom"
        ) {
          checkFeat("digital_ascension");
        }

        // Slime Lord
        if (settings.prestigeType === "demonic" && this.id === "sludge") {
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
          return game.global.race.universe === "evil" &&
            game.global.stats.achieve["godslayer"]?.e
            ? 1
            : 0;
        case "junker":
          return game.global.genes.challenge ? 1 : 0;
        case "sludge":
          return (game.global.stats.achieve["ascended"] ||
            game.global.stats.achieve["corrupted"]) &&
            game.global.stats.achieve["extinct_junker"]
            ? 1
            : 0;
        case "ultra_sludge":
          return game.global.stats.achieve["godslayer"] &&
            game.global.stats.achieve["extinct_sludge"]
            ? 1
            : 0;
        case "hybrid":
          return game.global.stats.achieve["what_is_best"]?.e >= 5 ? 1 : 0;
      }

      let unboundMod =
        game.global.blood.unbound >= 4
          ? 0.95
          : game.global.blood.unbound >= 2
            ? 0.9
            : game.global.blood.unbound >= 1
              ? 0.8
              : 0;
      let shadowMod = game.global.blood.unbound >= 3 ? unboundMod : 0;

      switch (this.genus) {
        case "aquatic":
          return ["swamp", "oceanic"].includes(game.global.city.biome)
            ? 1
            : unboundMod;
        case "fey":
          return ["forest", "swamp", "taiga"].includes(game.global.city.biome)
            ? 1
            : unboundMod;
        case "sand":
          return ["ashland", "desert"].includes(game.global.city.biome)
            ? 1
            : unboundMod;
        case "heat":
          return ["ashland", "volcanic"].includes(game.global.city.biome)
            ? 1
            : unboundMod;
        case "polar":
          return ["tundra", "taiga"].includes(game.global.city.biome)
            ? 1
            : unboundMod;
        case "demonic":
          return game.global.city.biome === "hellscape" ? 1 : shadowMod;
        case "angelic":
          return game.global.city.biome === "eden" ? 1 : shadowMod;
        case "synthetic":
          return game.global.stats.achieve["obsolete"]?.l >= 5 ? 1 : 0;
        case "eldritch":
          return game.global.stats.achieve["nightmare"]?.mg ? 1 : 0;
        case "hybrid":
          return game.global.stats.achieve["godslayer"] ? 1 : 0;
        case undefined: // Nonexistent custom
          return 0;
        default:
          return 1;
      }
    }

    getCondition() {
      switch (this.id) {
        case "hellspawn":
          return poly.loc("wiki_challenges_reqs_reset", [
            `${poly.loc("wiki_universe_evil")} ${poly.loc(
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
            this.genus ? game.loc("genelab_genus_" + this.genus) : "not set"
          }).`;
        case "hybrid":
          return game.loc("wiki_achieve_what_is_best");
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
          return game.loc("wiki_achieve_obsolete");
        case "eldritch":
          return game.loc("wiki_achieve_nightmare");
        case "hybrid":
          return game.loc("wiki_achieve_godslayer");
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
      seq,
      priority,
      requirementType,
      requirementId,
      requirementCount,
      actionType,
      actionId,
      actionCount,
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
        return techIds[this.actionId].definition.cost;
      }
      if (this.actionType === "build") {
        return buildingIds[this.actionId].definition.cost;
      }
      if (this.actionType === "arpa") {
        return arpaIds[this.actionId].definition.cost;
      }
      return {};
    }

    isActionPossible() {
      // check against MAX as we want to know if it is possible...
      let obj = null;
      if (this.actionType === "research") {
        obj = techIds[this.actionId];
      }
      if (this.actionType === "build") {
        obj = buildingIds[this.actionId];
      }
      if (this.actionType === "arpa") {
        obj = arpaIds[this.actionId];
      }
      return obj && obj.isUnlocked() && obj.isAffordable(true);
    }

    updateComplete() {
      if (this.complete) {
        return false;
      }

      if (
        this.actionType === "research" &&
        techIds[this.actionId].isResearched()
      ) {
        this.complete = true;
        return true;
      }
      if (
        this.actionType === "build" &&
        buildingIds[this.actionId].count >= this.actionCount
      ) {
        this.complete = true;
        return true;
      }
      if (
        this.actionType === "arpa" &&
        arpaIds[this.actionId].count >= this.actionCount
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
          TriggerManager.priorityList[this.priority - 1]?.complete
        );
      } else if (checkTypes[this.requirementType]) {
        try {
          if (retBools.includes(this.requirementType)) {
            return (
              checkTypes[this.requirementType].fn(this.requirementId) ==
              this.requirementCount
            );
          } else {
            return (
              checkTypes[this.requirementType].fn(this.requirementId) >=
              this.requirementCount
            );
          }
        } catch (error) {
          // Triggers don't have names, hopefully this is enough for the user to find it
          let displayName = `${this.requirementType} ${this.requirementId} x${this.requirementCount} => ${this.actionType}: ${this.actionId} x${this.actionCount}`;
          let msg = `Trigger ${this.seq} [${displayName}] requirement is invalid! Fix or remove it. (${error})`;
          if (
            !WindowManager.isOpen() &&
            !(Object.values(game.global.lastMsg.all) as Loose[]).find(
              (log) => log.m === msg,
            )
          ) {
            // Don't spam with errors
            GameLog.logDanger("special", msg, ["events", "major_events"]);
          }
        }
      }
      return false;
    }

    updateRequirementType(requirementType) {
      if (requirementType === this.requirementType) {
        return;
      }

      if (requirementType === "chain") {
        this.requirementType = requirementType;
        this.requirementId = "";
        this.requirementCount = 0;
        return; // Special case
      }

      if (!checkTypes[requirementType]) {
        return; // Invalid type
      }

      let oldArg = checkTypes[this.requirementType]?.arg ?? null;
      let oldOpts = checkTypes[this.requirementType]?.options ?? null;
      let newArg = checkTypes[requirementType].arg;
      let newOpts = checkTypes[requirementType].options;

      this.requirementType = requirementType;
      this.requirementCount = 1;
      this.complete = false;

      if (oldArg !== newArg || oldOpts !== newOpts) {
        this.requirementId = checkTypes[this.requirementType].def;
      }
    }

    updateActionType(actionType) {
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

    constructor(traitName) {
      this.traitName = traitName;
    }

    get enabled() {
      return settings["mTrait_" + this.traitName];
    }
    get priority() {
      return settingsRaw["mTrait_p_" + this.traitName];
    }
    get weighting() {
      return settings["mTrait_w_" + this.traitName];
    }

    isUnlocked() {
      return game.global.settings.mtorder.includes(this.traitName);
    }

    geneCount() {
      return game.global.race.minor[this.traitName] ?? 0;
    }

    phageCount() {
      return game.global.genes.minor[this.traitName] ?? 0;
    }

    totalCount() {
      return game.global.race[this.traitName] ?? 0;
    }

    geneCost() {
      return this.traitName === "mastery"
        ? Fibonacci(this.geneCount()) * 5
        : Fibonacci(this.geneCount());
    }
  }

  class MutableTrait {
    [key: string]: Loose;

    constructor(traitName) {
      this.traitName = traitName;
      this.baseCost = Math.abs(game.traits[traitName].val);
      this.isPositive = game.traits[traitName].val >= 0;
    }

    get gainEnabled() {
      return settings["mutableTrait_gain_" + this.traitName];
    }
    get purgeEnabled() {
      return settings["mutableTrait_purge_" + this.traitName];
    }
    get resetEnabled() {
      return settings["mutableTrait_reset_" + this.traitName];
    }
    get priority() {
      return settingsRaw["mutableTrait_p_" + this.traitName];
    }

    get name() {
      return game.loc("trait_" + this.traitName + "_name");
    }

    canGain() {
      if (
        game.global.race.species === "hellspawn" &&
        game.global.race["warlord"]
      ) {
        return false;
      }

      return (
        this.gainEnabled &&
        !this.purgeEnabled &&
        this.canMutate("gain") &&
        game.global.race[this.traitName] === undefined &&
        !conflictingTraits.some(
          (set) =>
            (set[0] === this.traitName &&
              game.global.race[set[1]] !== undefined) ||
            (set[1] === this.traitName &&
              game.global.race[set[0]] !== undefined),
        )
      );
    }

    canPurge() {
      return (
        this.purgeEnabled &&
        !this.gainEnabled &&
        this.canMutate("purge") &&
        game.global.race[this.traitName] !== undefined &&
        !(
          (game.global.race.species === "sludge" ||
            game.global.race.species === "ultra_sludge") &&
          this.traitName === "ooze"
        ) &&
        !game.global.race.ss_traits?.includes(this.traitName) &&
        !game.global.race.iTraits?.hasOwnProperty(this.traitName)
      );
    }

    canMutate(action) {
      let currentPlasmids =
        resources[
          game.global.race.universe === "antimatter" ? "AntiPlasmid" : "Plasmid"
        ].currentQuantity;
      return (
        currentPlasmids - this.mutationCost(action) >=
          MutableTraitManager.minimumPlasmidsToPreserve &&
        !(
          (game.global.race.species === "sludge" ||
            game.global.race.species === "ultra_sludge") &&
          game.global.race["modified"]
        )
      );
    }

    mutationCost(action) {
      let mult =
        mutationCostMultipliers[game.global.race.species]?.[action] ?? 1;
      let multGenus =
        mutationCostMultipliersGenus[
          game.races[game.global.race.species].type
        ]?.[action] ?? 1;
      return this.baseCost * 5 * mult * multGenus;
    }
  }

  class MajorTrait extends MutableTrait {
    constructor(traitName) {
      super(traitName);
      this.type = "major";
      let ownerRace: { id?: Loose; genus?: Loose } =
        (Object.entries(game.races) as [string, Loose][])
          .filter(
            ([id, race]) =>
              id !== "custom" &&
              id !== "hybrid" &&
              race.traits[traitName] !== undefined,
          )
          .map(([id, race]) => ({ id: id, genus: race.type }))[0] ?? {};
      this.source = ownerRace.id ?? specialRaceTraits[traitName] ?? "";
      this.racesThatCanGain = (Object.entries(game.races) as [string, Loose][])
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
        game.global.genes["mutation"] >= 3 &&
        this.racesThatCanGain.includes(game.global.race.species)
      );
    }

    canPurge() {
      return super.canPurge() && game.global.genes["mutation"] >= 1;
    }
  }

  class GenusTrait extends MutableTrait {
    constructor(traitName) {
      super(traitName);
      this.type = "genus";
      let genus = Object.entries(poly.genus_traits)
        .filter(([id, traits]) => traits[traitName] !== undefined)
        .map(([id, traits]) => id);
      this.source = genus[0] ?? specialRaceTraits[traitName] ?? "";
      this.genus = this.source;
    }

    isGainable() {
      return false;
    }

    canGain() {
      return false;
    }

    canPurge() {
      return super.canPurge() && game.global.genes["mutation"] >= 2;
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
