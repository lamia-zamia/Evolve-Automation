/* eslint-disable @typescript-eslint/no-explicit-any */
import type { GameClickMultipliersPort } from "../ports/game-click-multipliers.ts";
import type { GameFeatureVisibilityPort } from "../ports/game-feature-visibility.ts";
import type { GameIndustryControlsPort } from "../ports/game-industry-controls.ts";
import type { GameMarketControlsPort } from "../ports/game-market-controls.ts";
import type { GameModalPort } from "../ports/game-modal.ts";
import type { GameStorageControlsPort } from "../ports/game-storage-controls.ts";

/** The panel that shows the current government and offers to change it. */
const GOVERNMENT_PANEL = "#govType";

/** The control that opens the government selection modal. */
const GOVERNMENT_MODAL_TRIGGER = `${GOVERNMENT_PANEL} button`;

/** The buy and sell controls on one resource's market row. */
function marketOrderControls(resourceId: string): string {
  return `#market-${resourceId} .order`;
}

/** Names a resource's market row the way the market controls port expects. */
function marketRow(resource: any) {
  return { elementId: resource._marketVueBinding, id: resource.id };
}

interface EconomyManagersDependencies {
  getGame: () => any;
  getResources: () => Record<string, any>;
  getBuildings: () => Record<string, any>;
  getVueById: (id: string) => any;
  clickMultipliers: GameClickMultipliersPort;
  marketControls: GameMarketControlsPort;
  storageControls: GameStorageControlsPort;
  getFeatureVisibility: () => GameFeatureVisibilityPort;
  getGameModal: () => GameModalPort;
  getGameLog: () => any;
  haveTech: (tech: string, level?: number) => boolean;
  traitVal: (trait: string, index: number, sign?: string) => number;
  industryControls: GameIndustryControlsPort;
}

interface StorageModelResource {
  amount: number;
  max: number;
  crates: number;
  containers: number;
}

interface StorageGameModel {
  readonly global?: {
    readonly resource?: Record<string, StorageModelResource>;
  };
}

interface StorageAssignmentResource {
  readonly id: string;
}

function applyDirectStorageAssignment(
  game: StorageGameModel | null | undefined,
  resource: StorageAssignmentResource,
  count: number,
  unit: "crate" | "container",
  storageValue: number,
  direction: 1 | -1,
): boolean {
  if (!Number.isFinite(count) || count <= 0) {
    return false;
  }

  const resourceTable = game?.global?.resource;
  const target = resourceTable?.[resource.id];
  const available = resourceTable?.[unit === "crate" ? "Crates" : "Containers"];
  const storageKey = unit === "crate" ? "crates" : "containers";
  if (target === undefined || available === undefined) {
    return false;
  }

  const current = Number(direction > 0 ? available.amount : target[storageKey]);
  const availableMax = Number(available.max);
  const targetCount = Number(target[storageKey]);
  const targetMax = Number(target.max);
  if (
    !Number.isFinite(current) ||
    !Number.isFinite(availableMax) ||
    !Number.isFinite(targetCount) ||
    !Number.isFinite(targetMax) ||
    !Number.isFinite(storageValue) ||
    current <= 0
  ) {
    return false;
  }

  const amount = Math.min(count, current);
  if (direction > 0) {
    available.amount = current - amount;
    available.max = availableMax - amount;
    target[storageKey] = targetCount + amount;
    target.max = targetMax + storageValue * amount;
  } else {
    target[storageKey] = targetCount - amount;
    target.max = targetMax - storageValue * amount;
    available.amount = current + amount;
    available.max = availableMax + amount;
  }
  return amount === count;
}

export function createEconomyManagers({
  getGame,
  getResources,
  getBuildings,
  getVueById,
  clickMultipliers,
  marketControls,
  storageControls,
  getFeatureVisibility,
  getGameModal,
  getGameLog,
  haveTech,
  traitVal,
  industryControls,
}: EconomyManagersDependencies) {
  const GalaxyTradeManager = {
    _industryElementId: "galaxyTrade",

    initIndustry() {
      const buildings = getBuildings();
      if (
        buildings.GorddonFreighter.count +
          buildings.Alien1SuperFreighter.count <
        1
      ) {
        return false;
      }

      return industryControls.isRendered(this._industryElementId);
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

    increaseProduction(production: string, count: number): boolean {
      if (count === 0) {
        return false;
      }
      if (count < 0) {
        return this.decreaseProduction(production, count * -1);
      }

      return industryControls.increaseTrade({
        elementId: this._industryElementId,
        id: production,
        count,
      });
    },

    decreaseProduction(production: string, count: number): boolean {
      if (count === 0) {
        return false;
      }
      if (count < 0) {
        return this.increaseProduction(production, count * -1);
      }

      return industryControls.decreaseTrade({
        elementId: this._industryElementId,
        id: production,
        count,
      });
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
      return getFeatureVisibility().isVisible(GOVERNMENT_PANEL);
    },

    isEnabled() {
      return (
        this.isUnlocked() && getGameModal().canOpen(GOVERNMENT_MODAL_TRIGGER)
      );
    },

    currentGovernment() {
      // Evolve creates civic.govern lazily on a fresh game. Treat that state
      // as not ready instead of dereferencing a field the game has not made.
      return getGame().global.civic.govern?.type;
    },

    setGovernment(government: string) {
      const game = getGame();
      const gameModal = getGameModal();
      const GameLog = getGameLog();
      if (!game?.global?.civic?.govern) {
        return;
      }
      // Don't try anything if chosen government already set, or modal window is already open
      if (this.currentGovernment() === government || gameModal.isOpen()) {
        return;
      }

      gameModal.open({
        triggerSelector: GOVERNMENT_MODAL_TRIGGER,
        title: game.loc("civics_government_type"),
        action: () => {
          GameLog.logSuccess(
            "special",
            `Revolution! Government changed to ${game.loc(
              "govern_" + government,
            )}.`,
            ["events", "major_events"],
          );
          getVueById("govModal")?.setGov(government);
        },
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
      return getFeatureVisibility().isVisible(marketOrderControls(resource.id));
    },

    setMultiplier(multiplier: number) {
      this.multiplier = Math.min(
        Math.max(1, multiplier),
        this.getMaxMultiplier(),
      );

      marketControls.setMultiplier(this.multiplier);
    },

    getMaxMultiplier() {
      return marketControls.maxMultiplier();
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
      if (!marketControls.isRowRendered(resource._marketVueBinding)) {
        return false;
      }

      let price = this.getUnitBuyPrice(resource) * this.multiplier;
      if (resources.Money.currentQuantity < price) {
        return false;
      }

      resources.Money.currentQuantity -=
        this.multiplier * this.getUnitBuyPrice(resource);
      resource.currentQuantity += this.multiplier;

      marketControls.buy(marketRow(resource));
    },

    sell(resource: any) {
      const resources = getResources();
      if (!marketControls.isRowRendered(resource._marketVueBinding)) {
        return false;
      }

      if (resource.currentQuantity < this.multiplier) {
        return false;
      }

      resources.Money.currentQuantity +=
        this.multiplier * this.getUnitSellPrice(resource);
      resource.currentQuantity -= this.multiplier;

      marketControls.sell(marketRow(resource));
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
      marketControls.clearTradeRoutes(marketRow(resource));
    },

    addTradeRoutes(resource: any, count: number) {
      if (!resource.isUnlocked()) {
        return false;
      }

      marketControls.addTradeRoutes({ ...marketRow(resource), count });
    },

    removeTradeRoutes(resource: any, count: number) {
      if (!resource.isUnlocked()) {
        return false;
      }

      marketControls.removeTradeRoutes({ ...marketRow(resource), count });
    },
  };

  const StorageManager = {
    priorityList: [] as any[],
    crateValue: 0,
    containerValue: 0,
    _crateDebounce: {} as any, // { resourceId: { dir, ticks, prev, locked } }
    _containerDebounce: {} as any, // same

    initStorage() {
      if (!this.isUnlocked) {
        return false;
      }

      return storageControls.isConstructionRendered();
    },

    isUnlocked() {
      return haveTech("container");
    },

    sortByPriority() {
      this.priorityList.sort((a, b) => a.storagePriority - b.storagePriority);
    },

    constructCrate(count: number) {
      storageControls.constructCrates(count);
    },

    constructContainer(count: number) {
      storageControls.constructContainers(count);
    },

    /**
     * Moves storage units of one unit onto or off a resource. The game only
     * mounts a resource's stack row while its storage tab is on screen, so an
     * off-screen row falls back to the same narrow model change the row would
     * have made, and reports whether the whole count was applied.
     */
    _moveStack(
      resource: any,
      count: number,
      unit: "crate" | "container",
      direction: 1 | -1,
    ) {
      const request = {
        elementId: resource._stackVueBinding,
        id: resource.id,
        count,
      };
      const storageValue =
        unit === "crate" ? this.crateValue : this.containerValue;

      if (!storageControls.isStackRendered(request.elementId)) {
        return applyDirectStorageAssignment(
          getGame(),
          resource,
          count,
          unit,
          storageValue,
          direction,
        );
      }

      if (unit === "crate") {
        if (direction > 0) {
          storageControls.assignCrates(request);
        } else {
          storageControls.unassignCrates(request);
        }
      } else if (direction > 0) {
        storageControls.assignContainers(request);
      } else {
        storageControls.unassignContainers(request);
      }
    },

    assignCrate(resource: any, count: number) {
      return this._moveStack(resource, count, "crate", 1);
    },

    unassignCrate(resource: any, count: number) {
      return this._moveStack(resource, count, "crate", -1);
    },

    assignContainer(resource: any, count: number) {
      return this._moveStack(resource, count, "container", 1);
    },

    unassignContainer(resource: any, count: number) {
      return this._moveStack(resource, count, "container", -1);
    },
  };

  return {
    GalaxyTradeManager,
    GovernmentManager,
    MarketManager,
    StorageManager,
  };
}
