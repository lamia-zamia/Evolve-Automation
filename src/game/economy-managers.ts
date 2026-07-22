/* eslint-disable @typescript-eslint/no-explicit-any */
interface KeyManagerContract {
  click: (count: number) => Iterable<unknown>;
}

interface EconomyManagersDependencies {
  getGame: () => any;
  getResources: () => Record<string, any>;
  getBuildings: () => Record<string, any>;
  getDocument: () => Document;
  getVueById: (id: string) => any;
  getKeyManager: () => KeyManagerContract;
  getWindowManager: () => any;
  getGameLog: () => any;
  haveTech: (tech: string, level?: number) => boolean;
  traitVal: (trait: string, index: number, sign?: string) => number;
}

export function createEconomyManagers({
  getGame,
  getResources,
  getBuildings,
  getDocument,
  getVueById,
  getKeyManager,
  getWindowManager,
  getGameLog,
  haveTech,
  traitVal,
}: EconomyManagersDependencies) {
  const GalaxyTradeManager = {
    _industryVueBinding: "galaxyTrade",
    _industryVue: undefined as any,

    initIndustry() {
      const buildings = getBuildings();
      if (
        buildings.GorddonFreighter.count +
          buildings.Alien1SuperFreighter.count <
        1
      ) {
        return false;
      }

      this._industryVue = getVueById(this._industryVueBinding);
      if (this._industryVue === undefined) {
        return false;
      }

      return true;
    },

    currentOperating() {
      return getGame().global.galaxy.trade.cur;
    },

    maxOperating() {
      return getGame().global.galaxy.trade.max;
    },

    currentProduction(production: string) {
      return getGame().global.galaxy.trade["f" + production];
    },

    zeroProduction(production: string) {
      this._industryVue.zero(production);
    },

    increaseProduction(production: string, count: number): any {
      if (count === 0) {
        return false;
      }
      if (count < 0) {
        return this.decreaseProduction(production, count * -1);
      }

      const KeyManager = getKeyManager();
      for (let m of KeyManager.click(count)) {
        this._industryVue.more(production);
      }
    },

    decreaseProduction(production: string, count: number): any {
      if (count === 0) {
        return false;
      }
      if (count < 0) {
        return this.increaseProduction(production, count * -1);
      }

      const KeyManager = getKeyManager();
      for (let m of KeyManager.click(count)) {
        this._industryVue.less(production);
      }
    },
  };

  const GovernmentManager = {
    Types: {
      anarchy: { id: "anarchy", isUnlocked: () => false, selectable: false },
      dictator: { id: "dictator", isUnlocked: () => false, selectable: false },
      autocracy: { id: "autocracy", isUnlocked: () => true },
      democracy: { id: "democracy", isUnlocked: () => true },
      oligarchy: { id: "oligarchy", isUnlocked: () => true },
      theocracy: { id: "theocracy", isUnlocked: () => haveTech("gov_theo") },
      republic: { id: "republic", isUnlocked: () => haveTech("govern", 2) },
      socialist: { id: "socialist", isUnlocked: () => haveTech("gov_soc") },
      corpocracy: { id: "corpocracy", isUnlocked: () => haveTech("gov_corp") },
      technocracy: {
        id: "technocracy",
        isUnlocked: () => haveTech("govern", 3),
      },
      federation: { id: "federation", isUnlocked: () => haveTech("gov_fed") },
      magocracy: { id: "magocracy", isUnlocked: () => haveTech("gov_mage") },
    },

    isUnlocked() {
      let node = getDocument().getElementById("govType");
      return node !== null && node.style.display !== "none";
    },

    isEnabled() {
      let node = getDocument().querySelector("#govType button");
      return (
        this.isUnlocked() &&
        node !== null &&
        node.getAttribute("disabled") !== "disabled"
      );
    },

    currentGovernment() {
      // Evolve creates civic.govern lazily on a fresh game. Treat that state
      // as not ready instead of dereferencing a field the game has not made.
      return getGame().global.civic.govern?.type;
    },

    setGovernment(government: string) {
      const game = getGame();
      const WindowManager = getWindowManager();
      const GameLog = getGameLog();
      if (!game?.global?.civic?.govern) {
        return;
      }
      // Don't try anything if chosen government already set, or modal window is already open
      if (this.currentGovernment() === government || WindowManager.isOpen()) {
        return;
      }

      let optionsNode = getDocument().querySelector("#govType button");
      let title = game.loc("civics_government_type");
      WindowManager.openModalWindowWithCallback(optionsNode, title, () => {
        GameLog.logSuccess(
          "special",
          `Revolution! Government changed to ${game.loc(
            "govern_" + government,
          )}.`,
          ["events", "major_events"],
        );
        getVueById("govModal")?.setGov(government);
      });
    },
  };

  const MarketManager = {
    priorityList: [] as any[],
    multiplier: 0,

    updateData() {
      const game = getGame();
      if (game.global.city.market) {
        this.multiplier = game.global.city.market.qty;
      }
    },

    isUnlocked() {
      return haveTech("currency", 2);
    },

    sortByPriority() {
      this.priorityList.sort((a, b) => a.marketPriority - b.marketPriority);
    },

    isBuySellUnlocked(resource: any) {
      return (
        getDocument().querySelector("#market-" + resource.id + " .order") !==
        null
      );
    },

    setMultiplier(multiplier: number) {
      this.multiplier = Math.min(
        Math.max(1, multiplier),
        this.getMaxMultiplier(),
      );

      getVueById("market-qty").qty = this.multiplier;
    },

    getMaxMultiplier() {
      return getVueById("market-qty")?.limit() ?? 1;
    },

    getUnitBuyPrice(resource: any) {
      const game = getGame();
      // marketItem > vBind > purchase from resources.js
      let price = game.global.resource[resource.id].value;

      price *= traitVal("arrogant", 0, "+");
      price *= traitVal("conniving", 0, "-");

      return price;
    },

    getUnitSellPrice(resource: any) {
      const game = getGame();
      // marketItem > vBind > sell from resources.js
      let divide = 4;

      divide *= traitVal("merchant", 0, "-");
      divide *= traitVal("asymmetrical", 0, "+");
      divide *= traitVal("conniving", 1, "-");

      return game.global.resource[resource.id].value / divide;
    },

    buy(resource: any) {
      const resources = getResources();
      let vue = getVueById(resource._marketVueBinding);
      if (vue === undefined) {
        return false;
      }

      let price = this.getUnitBuyPrice(resource) * this.multiplier;
      if (resources.Money.currentQuantity < price) {
        return false;
      }

      resources.Money.currentQuantity -=
        this.multiplier * this.getUnitBuyPrice(resource);
      resource.currentQuantity += this.multiplier;

      vue.purchase(resource.id);
    },

    sell(resource: any) {
      const resources = getResources();
      let vue = getVueById(resource._marketVueBinding);
      if (vue === undefined) {
        return false;
      }

      if (resource.currentQuantity < this.multiplier) {
        return false;
      }

      resources.Money.currentQuantity +=
        this.multiplier * this.getUnitSellPrice(resource);
      resource.currentQuantity -= this.multiplier;

      vue.sell(resource.id);
    },

    getImportRouteCap() {
      if (haveTech("currency", 6)) {
        return 1000000;
      } else if (haveTech("currency", 4)) {
        return 100;
      } else {
        return 25;
      }
    },

    getExportRouteCap() {
      if (!getGame().global.race["banana"]) {
        return this.getImportRouteCap();
      } else if (haveTech("currency", 6)) {
        return 1000000;
      } else if (haveTech("currency", 4)) {
        return 25;
      } else {
        return 10;
      }
    },

    getMaxTradeRoutes() {
      let max = getGame().global.city.market.mtrade;
      let unmanaged = 0;
      for (let resource of this.priorityList) {
        if (!resource.autoTradeBuyEnabled && !resource.autoTradeSellEnabled) {
          max -= Math.abs(resource.tradeRoutes);
          unmanaged += resource.tradeRoutes;
        }
      }
      return [max, unmanaged];
    },

    zeroTradeRoutes(resource: any) {
      getVueById(resource._marketVueBinding)?.zero(resource.id);
    },

    addTradeRoutes(resource: any, count: number) {
      if (!resource.isUnlocked()) {
        return false;
      }

      let vue = getVueById(resource._marketVueBinding);
      if (vue === undefined) {
        return false;
      }

      const KeyManager = getKeyManager();
      for (let m of KeyManager.click(count)) {
        vue.autoBuy(resource.id);
      }
    },

    removeTradeRoutes(resource: any, count: number) {
      if (!resource.isUnlocked()) {
        return false;
      }

      let vue = getVueById(resource._marketVueBinding);
      if (vue === undefined) {
        return false;
      }

      const KeyManager = getKeyManager();
      for (let m of KeyManager.click(count)) {
        vue.autoSell(resource.id);
      }
    },
  };

  const StorageManager = {
    priorityList: [] as any[],
    crateValue: 0,
    containerValue: 0,
    _storageVueBinding: "createHead",
    _storageVue: undefined as any,
    _crateDebounce: {} as any, // { resourceId: { dir, ticks, prev, locked } }
    _containerDebounce: {} as any, // same

    initStorage() {
      if (!this.isUnlocked) {
        return false;
      }

      this._storageVue = getVueById(this._storageVueBinding);
      if (this._storageVue === undefined) {
        return false;
      }

      return true;
    },

    isUnlocked() {
      return haveTech("container");
    },

    sortByPriority() {
      this.priorityList.sort((a, b) => a.storagePriority - b.storagePriority);
    },

    constructCrate(count: number) {
      if (count <= 0) {
        return;
      }
      const KeyManager = getKeyManager();
      for (let m of KeyManager.click(count)) {
        this._storageVue.crate();
      }
    },

    constructContainer(count: number) {
      if (count <= 0) {
        return;
      }
      const KeyManager = getKeyManager();
      for (let m of KeyManager.click(count)) {
        this._storageVue.container();
      }
    },

    assignCrate(resource: any, count: number) {
      let vue = getVueById(resource._stackVueBinding);
      if (vue === undefined) {
        return false;
      }

      const KeyManager = getKeyManager();
      for (let m of KeyManager.click(count)) {
        vue.addCrate(resource.id);
      }
    },

    unassignCrate(resource: any, count: number) {
      let vue = getVueById(resource._stackVueBinding);
      if (vue === undefined) {
        return false;
      }

      const KeyManager = getKeyManager();
      for (let m of KeyManager.click(count)) {
        vue.subCrate(resource.id);
      }
    },

    assignContainer(resource: any, count: number) {
      let vue = getVueById(resource._stackVueBinding);
      if (vue === undefined) {
        return false;
      }

      const KeyManager = getKeyManager();
      for (let m of KeyManager.click(count)) {
        vue.addCon(resource.id);
      }
    },

    unassignContainer(resource: any, count: number) {
      let vue = getVueById(resource._stackVueBinding);
      if (vue === undefined) {
        return false;
      }

      const KeyManager = getKeyManager();
      for (let m of KeyManager.click(count)) {
        vue.subCon(resource.id);
      }
    },
  };

  return {
    GalaxyTradeManager,
    GovernmentManager,
    MarketManager,
    StorageManager,
  };
}
