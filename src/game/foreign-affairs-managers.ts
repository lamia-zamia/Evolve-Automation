import type { GameEspionageControlsPort } from "../ports/game-espionage-controls.ts";
import type { GameFeatureVisibilityPort } from "../ports/game-feature-visibility.ts";
import type { GameForeignControlsPort } from "../ports/game-foreign-controls.ts";
import type { GameGarrisonControlsPort } from "../ports/game-garrison-controls.ts";
import type { GameModalPort } from "../ports/game-modal.ts";

/** One foreign power's diplomatic state. */
type Gov = {
  spy: number;
  mil: number;
  hstl: number;
  unrest: number;
  anx: boolean;
  buy: boolean;
  occ: boolean;
  act: string;
};

/** How a foreign power ranks against us, which selects the policy setting. */
type ForeignRank = "Rival" | "Inferior" | "Superior";

/** A foreign power this cycle acts on, with the policy chosen for it. */
type ActiveForeign = {
  id: number;
  gov: Gov;
  policy: string;
};
type SpyTypeSet = {
  Influence: { id: "influence" };
  Sabotage: { id: "sabotage" };
  Incite: { id: "incite" };
  Annex: { id: "annex" };
  Purchase: { id: "purchase" };
};

type GameSurface = {
  global: {
    // Race flags and trait levels. Evolve stores them as numbers, and an
    // absent one reads as undefined, which every use below treats as zero.
    race: Record<string, number>;
    tech: Record<string, number>;
    city: { biome: string };
    civic: {
      foreign: Record<string, Gov>;
      // The game creates the garrison with the first soldier.
      garrison?: {
        workers: number;
        wounded: number;
        raid: number;
        max: number;
        m_use: number;
        crew: number;
        mercs?: boolean;
      };
    };
    space: { fob?: { troops: number } };
    portal: {
      fortress?: {
        garrison: number;
        patrols: number;
        patrol_size: number;
        assigned: number;
      };
      minions?: { spawns: number };
      throne?: { enemy?: unknown[] };
    };
  };
  loc(key: string): string;
  armyRating(soldiers: number, type: string, wounded?: number): number;
};

type StateSurface = { astroSign: string };

type SettingsSurface = {
  autoBuild: boolean;
  autoFight: boolean;
  foreignUnification: boolean;
  foreignPacifist: boolean;
  foreignForceSabotage: boolean;
  foreignOccupyLast: boolean;
  foreignPowerRequired: number;
  hellAssaultReserve: boolean;
} & Record<`foreignPolicy${ForeignRank}`, string>;

type Resource = { currentQuantity: number; maxQuantity: number };
type ResourcesSurface = Record<string, Resource> & {
  Money: Resource;
  Morale: Resource;
};

type BuildingsSurface = Record<
  string,
  {
    count: number;
    stateOnCount: number;
    autoStateEnabled: boolean;
    cost: Record<string, number>;
    isAutoBuildable(): boolean;
  }
>;

type PolySurface = { govPrice(govIndex: number): number };

type GameLogSurface = {
  logSuccess(loggingType: string, text: string, tags: string[]): void;
};

type HaveTech = (id: string, level?: number) => unknown;
type GuardActive = (guard: string) => unknown;
type TraitVal = (
  trait: string,
  level?: number,
  mode?: string | number,
) => number;

type SpyManagerShape = {
  isForeignUnlocked: boolean;
  purchaseMoney: number;
  purchaseForeigngs: number[];
  foreignActive: ActiveForeign[];
  foreignTarget: ActiveForeign | null;
  Types: SpyTypeSet;
  spyCost(govIndex: number, spy?: number): number;
  updateForeigns(): void;
  performEspionage(
    govIndex: number,
    espionageId: string,
    influenceAllowed: boolean,
  ): void;
  isEspionageUseful(govIndex: number, espionageId: string): boolean;
};

type WarManagerShape = {
  isGarrisonVisible: boolean;
  isHellVisible: boolean;
  workers: number;
  wounded: number;
  raid: number;
  max: number;
  m_use: number;
  crew: number;
  hellSoldiers: number;
  hellPatrols: number;
  hellPatrolSize: number;
  hellAssigned: number;
  hellReservedSoldiers: number;
  minions: number;
  enemies: number;
  updateGarrison(): void;
  updateHell(): void;
  readonly currentSoldiers: number;
  readonly maxSoldiers: number;
  readonly deadSoldiers: number;
  readonly currentCityGarrison: number;
  readonly maxCityGarrison: number;
  readonly availableGarrison: number;
  readonly hellGarrison: number;
  readonly mercenaryCost: number;
  launchCampaign(govIndex: number): boolean;
  release(govIndex: number): boolean;
  isMercenaryUnlocked(): boolean;
  hireMercenary(): boolean;
  getHellReservedSoldiers(): number;
  setTactic(newTactic: number): boolean;
  getCampaignTitle(tactic: number): string | null;
  addBattalion(count: number): void;
  removeBattalion(count: number): void;
  getGovArmy(tactic: number, govIndex: number): number;
  getAdvantage(army: number, tactic: number, govIndex: number): number;
  getRatingForAdvantage(adv: number, tactic: number, govIndex: number): number;
  getSoldiersForAdvantage(
    advantage: number,
    tactic: number,
    govIndex: number,
  ): number;
  getSoldiersForAttackRating(targetRating: number): number;
  addHellGarrison(count: number): void;
  removeHellGarrison(count: number): void;
  addHellPatrol(count: number): void;
  removeHellPatrol(count: number): void;
  addHellPatrolSize(count: number): void;
  removeHellPatrolSize(count: number): void;
  attackEnemyFortress(enemyIndex: number): boolean;
};

/** The panel that offers a foreign power's espionage options. */
function espionageOptions(govIndex: number): string {
  return `#gov${govIndex} div span:nth-child(3)`;
}

/** The control that opens a foreign power's espionage modal. */
function espionageModalTrigger(govIndex: number): string {
  return `${espionageOptions(govIndex)} button`;
}

type ForeignAffairsManagerDependencies = {
  getGame: () => GameSurface;
  getSettings: () => SettingsSurface;
  getState: () => StateSurface;
  getResources: () => ResourcesSurface;
  getBuildings: () => BuildingsSurface;
  getPoly: () => PolySurface;
  getForeignControls: () => GameForeignControlsPort;
  espionageControls: GameEspionageControlsPort;
  getGarrisonControls: () => GameGarrisonControlsPort;
  getFeatureVisibility: () => GameFeatureVisibilityPort;
  getGameModal: () => GameModalPort;
  getGameLog: () => GameLogSurface;
  getHaveTech: () => HaveTech;
  getGuardActive: () => GuardActive;
  getForeignAchievementGoal: () => "world-domination" | "syndicate" | null;
  getTraitVal: () => TraitVal;
  getGovPower: (govIndex: number) => number;
  getGovName: (govIndex: number) => string;
  getOccCosts: () => number;
  logError: (...args: unknown[]) => void;
};

export function createForeignAffairsManagers({
  getGame,
  getSettings,
  getState,
  getResources,
  getBuildings,
  getPoly,
  getForeignControls,
  espionageControls,
  getGarrisonControls,
  getFeatureVisibility,
  getGameModal,
  getGameLog,
  getHaveTech,
  getGuardActive,
  getForeignAchievementGoal,
  getTraitVal,
  getGovPower,
  getGovName,
  getOccCosts,
  logError,
}: ForeignAffairsManagerDependencies) {
  const haveTech: HaveTech = (...args) => getHaveTech()(...args);
  const guardActive: GuardActive = (...args) => getGuardActive()(...args);
  const traitVal: TraitVal = (...args) => getTraitVal()(...args);
  const garrisonControls = getGarrisonControls();

  const SpyManager: SpyManagerShape = {
    isForeignUnlocked: false,

    purchaseMoney: 0,
    purchaseForeigngs: [],
    foreignActive: [],
    foreignTarget: null,

    Types: {
      Influence: { id: "influence" },
      Sabotage: { id: "sabotage" },
      Incite: { id: "incite" },
      Annex: { id: "annex" },
      Purchase: { id: "purchase" },
    },

    spyCost(govIndex, spy) {
      const game = getGame();
      const state = getState();
      let gov = game.global.civic.foreign[`gov${govIndex}`]!;
      const spyLevel = spy ?? gov.spy + 1;

      let base = Math.max(
        50,
        Math.round(gov.mil / 2 + gov.hstl / 2 - gov.unrest) + 10,
      );
      if (game.global.race["infiltrator"]) {
        base /= 3;
      }
      if (state.astroSign === "scorpio") {
        base *= 0.88;
      }
      return Math.round(base ** spyLevel) + 500;
    },

    updateForeigns() {
      const game = getGame();
      const settings = getSettings();
      const resources = getResources();
      const poly = getPoly();
      this.purchaseMoney = 0;
      this.purchaseForeigngs = [];
      const foreignControls = getForeignControls();
      this.isForeignUnlocked = foreignControls.isUnlocked();
      if (this.isForeignUnlocked) {
        const achievementGoal = getForeignAchievementGoal();
        const achievementPolicy =
          achievementGoal === "world-domination"
            ? "Occupy"
            : achievementGoal === "syndicate"
              ? "Purchase"
              : null;
        const unificationRequested =
          settings.foreignUnification || achievementGoal !== null;
        let currentTarget: ActiveForeign | null = null;
        let controlledForeigns = 0;

        let unlockedForeigns = [];
        if (!haveTech("world_control")) {
          unlockedForeigns.push(0, 1, 2);
        }
        if (haveTech("rival")) {
          unlockedForeigns.push(3);
        }

        // Init foreigns
        const activeForeigns: ActiveForeign[] = [];
        for (let id of unlockedForeigns) {
          let rank: ForeignRank =
            id === 3
              ? "Rival"
              : getGovPower(id) <= settings.foreignPowerRequired
                ? "Inferior"
                : "Superior";

          const foreign: ActiveForeign = {
            id,
            gov: game.global.civic.foreign[`gov${id}`]!,
            policy:
              id < 3 && achievementPolicy !== null
                ? achievementPolicy
                : settings[`foreignPolicy${rank}`],
          };
          activeForeigns.push(foreign);

          if (
            (foreign.gov.anx && foreign.policy === "Annex") ||
            (foreign.gov.buy && foreign.policy === "Purchase") ||
            (foreign.gov.occ && foreign.policy === "Occupy")
          ) {
            controlledForeigns++;
          }

          if (
            !settings.foreignPacifist &&
            !guardActive("guardPacifist") &&
            !foreign.gov.anx &&
            !foreign.gov.buy &&
            rank === "Inferior"
          ) {
            currentTarget = foreign;
          }
        }

        // Adjust for fight
        if (
          activeForeigns.length > 0 &&
          !settings.foreignPacifist &&
          !guardActive("guardPacifist")
        ) {
          // Try to attacks last uncontrolled inferior, or first occupied, or just first, in this order.
          currentTarget =
            currentTarget ??
            activeForeigns.find((f) => f.gov.occ) ??
            activeForeigns[0]!;

          let readyToUnify =
            unificationRequested &&
            controlledForeigns >= 2 &&
            game.global.tech["unify"] === 1;

          // Don't annex or purchase our farm target, unless we're ready to unify
          if (
            !readyToUnify &&
            ["Annex", "Purchase"].includes(currentTarget.policy) &&
            SpyManager.isEspionageUseful(
              currentTarget.id,
              SpyManager.Types[currentTarget.policy as keyof SpyTypeSet].id,
            )
          ) {
            currentTarget.policy = "Ignore";
          }

          // Force sabotage, if needed, and we know it's useful
          if (
            !readyToUnify &&
            settings.foreignForceSabotage &&
            currentTarget.id !== 3 &&
            SpyManager.isEspionageUseful(
              currentTarget.id,
              SpyManager.Types.Sabotage.id,
            )
          ) {
            currentTarget.policy = "Sabotage";
          }

          // Set last foreign to sabotage only, then switch to the selected
          // achievement policy once we're ready to unify.
          if (
            unificationRequested &&
            settings.foreignOccupyLast &&
            !haveTech("world_control")
          ) {
            let lastTarget = ["Occupy", "Sabotage"].includes(
              settings.foreignPolicySuperior,
            )
              ? 2
              : currentTarget.id;
            activeForeigns[lastTarget]!.policy = readyToUnify
              ? (achievementPolicy ?? "Occupy")
              : "Sabotage";
          }

          // Do not attack if policy set to influence, or we're ready to unify
          if (
            currentTarget.policy === "Influence" ||
            (readyToUnify && currentTarget.policy !== "Occupy") ||
            (currentTarget.policy === "Betrayal" && currentTarget.gov.mil > 75)
          ) {
            currentTarget = null;
          }
        }

        // Request money for unify, make sure we have autoFight and autoResearch
        if (
          game.global.tech["unify"] === 1 &&
          (unificationRequested || guardActive("guardPacifist")) &&
          settings.autoFight
        ) {
          for (let foreign of activeForeigns) {
            if (
              foreign.policy === "Purchase" &&
              !foreign.gov.buy &&
              foreign.gov.act !== "purchase"
            ) {
              let moneyNeeded = Math.max(
                poly.govPrice(foreign.id),
                foreign.gov.spy < 3 ? this.spyCost(foreign.id, 3) : 0,
              );
              if (moneyNeeded <= resources.Money.maxQuantity) {
                this.purchaseForeigngs.push(foreign.id);
                this.purchaseMoney = Math.max(moneyNeeded, this.purchaseMoney);
              }
            }
          }
        }

        this.foreignTarget = currentTarget;
        this.foreignActive = activeForeigns;
      }
    },

    performEspionage(govIndex, espionageId, influenceAllowed) {
      const gameModal = getGameModal();
      const resources = getResources();
      const poly = getPoly();
      const game = getGame();
      const GameLog = getGameLog();
      if (gameModal.isOpen()) {
        return;
      } // Don't try anything if a window is already open

      if (!getFeatureVisibility().isVisible(espionageOptions(govIndex))) {
        return;
      }

      if (!gameModal.canOpen(espionageModalTrigger(govIndex))) {
        return;
      }

      let espionageToPerform = null;
      if (
        espionageId === this.Types.Annex.id ||
        espionageId === this.Types.Purchase.id
      ) {
        // Occupation routine
        if (this.isEspionageUseful(govIndex, espionageId)) {
          // If we can annex\purchase right now - do it
          espionageToPerform = espionageId;
        } else if (
          this.isEspionageUseful(govIndex, this.Types.Influence.id) &&
          influenceAllowed
        ) {
          // Influence goes second, as it always have clear indication when HSTL already at zero
          espionageToPerform = this.Types.Influence.id;
        } else if (this.isEspionageUseful(govIndex, this.Types.Incite.id)) {
          // And now incite
          espionageToPerform = this.Types.Incite.id;
        }
      } else if (this.isEspionageUseful(govIndex, espionageId)) {
        // User specified spy operation. If it is not already at miximum effect then proceed with it.
        espionageToPerform = espionageId;
      }

      if (espionageToPerform !== null) {
        if (espionageToPerform === this.Types.Purchase.id) {
          resources.Money.currentQuantity -= poly.govPrice(govIndex);
        }
        gameModal.open({
          triggerSelector: espionageModalTrigger(govIndex),
          title: game.loc("civics_espionage_actions"),
          action: () => {
            GameLog.logSuccess(
              "spying",
              `Performing "${game.loc(
                "civics_spy_" + espionageToPerform,
              )}" covert operation against ${getGovName(govIndex)}.`,
              ["spy"],
            );
            espionageControls.performEspionage(espionageToPerform, govIndex);
          },
        });
      }
    },

    isEspionageUseful(govIndex, espionageId) {
      const game = getGame();
      const resources = getResources();
      const poly = getPoly();
      let gov = game.global.civic.foreign["gov" + govIndex]!;

      // Return true when requested task is useful, or when we don't have enough spies prove it's not
      switch (espionageId) {
        case this.Types.Influence.id:
          return gov.hstl > (gov.spy > 0 ? 0 : 10);
        case this.Types.Sabotage.id:
          return gov.spy < 1 || gov.mil > (gov.spy > 1 ? 50 : 74);
        case this.Types.Incite.id:
          return gov.spy < 3 || gov.unrest < (gov.spy > 3 ? 100 : 76);
        case this.Types.Annex.id:
          return (
            gov.hstl <= 50 &&
            gov.unrest >= 50 &&
            resources.Morale.currentQuantity >= 200 + gov.hstl - gov.unrest
          );
        case this.Types.Purchase.id:
          return (
            gov.spy >= 3 &&
            resources.Money.currentQuantity >= poly.govPrice(govIndex)
          );
      }
      return false;
    },
  };

  const WarManager: WarManagerShape = {
    isGarrisonVisible: false,
    isHellVisible: false,

    workers: 0,
    wounded: 0,
    raid: 0,
    max: 0,
    m_use: 0,
    crew: 0,
    hellSoldiers: 0,
    hellPatrols: 0,
    hellPatrolSize: 0,
    hellAssigned: 0,
    hellReservedSoldiers: 0,

    // Warlord properties
    minions: 0,
    enemies: 0,

    updateGarrison() {
      const game = getGame();
      let garrison = game.global.civic.garrison;
      if (garrison) {
        this.workers = garrison.workers;
        this.wounded = garrison.wounded;
        this.raid = garrison.raid;
        this.max = garrison.max;
        this.m_use = garrison.m_use;
        this.crew = garrison.crew;
        this.isGarrisonVisible = garrisonControls.isRendered("garrison");
      } else {
        this.isGarrisonVisible = false;
      }
    },

    updateHell() {
      const game = getGame();
      let fortress = game.global.portal.fortress;
      if (fortress) {
        this.hellSoldiers = fortress.garrison;
        this.hellPatrols = fortress.patrols;
        this.hellPatrolSize = fortress.patrol_size;
        this.hellAssigned = fortress.assigned;
        this.hellReservedSoldiers = this.getHellReservedSoldiers();
        this.isHellVisible = garrisonControls.isRendered("fort");
        // Only a warlord run has minions and a throne, and only that run reads
        // these two, so a missing bag mirrors as zero rather than undefined.
        this.minions = game.global.portal.minions?.spawns ?? 0;
        this.enemies = game.global.portal.throne?.enemy?.length ?? 0;
      } else {
        this.isHellVisible = false;
      }
    },

    get currentSoldiers() {
      return this.workers - this.crew;
    },

    get maxSoldiers() {
      return this.max - this.crew;
    },

    get deadSoldiers() {
      return this.max - this.workers;
    },

    get currentCityGarrison() {
      const game = getGame();
      return (
        this.currentSoldiers -
        this.hellSoldiers -
        (game.global.space.fob?.troops ?? 0)
      );
    },

    get maxCityGarrison() {
      return this.maxSoldiers - this.hellSoldiers;
    },

    get availableGarrison() {
      const game = getGame();
      return game.global.race["rage"]
        ? this.currentCityGarrison
        : this.currentCityGarrison - this.wounded;
    },

    get hellGarrison() {
      return (
        this.hellSoldiers -
        this.hellPatrolSize * this.hellPatrols -
        this.hellReservedSoldiers
      );
    },

    launchCampaign(govIndex) {
      return garrisonControls.launchCampaign({
        elementId: "garrison",
        govIndex,
      });
    },

    release(govIndex) {
      const game = getGame();
      if (game.global.civic.foreign["gov" + govIndex]!.occ) {
        let occSoldiers = getOccCosts();
        this.workers += occSoldiers;
        this.max += occSoldiers;
      }
      return garrisonControls.launchCampaign({
        elementId: "garrison",
        govIndex,
      });
    },

    isMercenaryUnlocked() {
      const game = getGame();
      return game.global.civic.garrison?.mercs ?? false;
    },

    // function mercCost from civics.js
    get mercenaryCost() {
      const game = getGame();
      let cost = Math.round(1.24 ** this.workers * 75) - 50;
      if (cost > 25000) {
        cost = 25000;
      }
      if (this.m_use > 0) {
        cost *= 1.1 ** this.m_use;
      }
      cost *= traitVal("brute", 0, "-");
      if (game.global.race["inflation"]) {
        cost *= 1 + game.global.race.inflation / 500;
      }
      cost *= traitVal("high_pop", 1, "=");
      return Math.round(cost);
    },

    hireMercenary() {
      const resources = getResources();
      let cost = this.mercenaryCost;
      if (this.workers >= this.max || resources.Money.currentQuantity < cost) {
        return false;
      }

      if (!garrisonControls.hire("garrison")) {
        return false;
      }

      resources.Money.currentQuantity -= cost;
      this.workers++;
      this.m_use++;

      return true;
    },

    getHellReservedSoldiers() {
      const game = getGame();
      const settings = getSettings();
      const buildings = getBuildings();
      const resources = getResources();
      let soldiers = 0;

      const soldierRating = game.armyRating(1, "hellArmy");

      // Assign soldiers to assault forge once other requirements are met
      if (
        settings.autoBuild &&
        buildings.PitAssaultForge!.isAutoBuildable() &&
        soldierRating > 0
      ) {
        if (
          settings.hellAssaultReserve ||
          !Object.entries(
            buildings.PitAssaultForge!.cost as Record<string, number>,
          ).find(([id, amount]) => resources[id]!.currentQuantity < amount)
        ) {
          soldiers = Math.round(650 / soldierRating);
        }
      }

      // Reserve soldiers operating forge - check if it exists and could be powered, not if it's already powered
      if (
        buildings.PitSoulForge!.count > 0 &&
        (buildings.PitSoulForge!.autoStateEnabled ||
          buildings.PitSoulForge!.stateOnCount > 0) &&
        soldierRating > 0
      ) {
        // Calculate number of soldiers needed for Soul Forge
        let base = game.global.race["warlord"] ? 400 : 650;
        let soulForgeSoldiers = Math.round(base / soldierRating);

        // Adjust for gun emplacements
        if (buildings.PitGunEmplacement!.count > 0) {
          soulForgeSoldiers -= Math.floor(
            buildings.PitGunEmplacement!.stateOnCount * 1.5,
          );
          soulForgeSoldiers = Math.max(1, soulForgeSoldiers);
        }

        soldiers += soulForgeSoldiers;
      }

      // Guardposts need at least one soldier free so lets just always keep one handy
      if (buildings.RuinsGuardPost!.count > 0) {
        soldiers +=
          (buildings.RuinsGuardPost!.stateOnCount + 1) *
          traitVal("high_pop", 0, 1);
      }
      return soldiers;
    },

    setTactic(newTactic) {
      return garrisonControls.setTactic({
        elementId: "garrison",
        tactic: newTactic,
      });
    },

    getCampaignTitle(tactic) {
      return garrisonControls.campaignTitle({
        elementId: "garrison",
        tactic,
      });
    },

    addBattalion(count) {
      if (
        !garrisonControls.addBattalions({
          elementId: "garrison",
          count,
        })
      ) {
        return;
      }

      this.raid = Math.min(this.raid + count, this.currentCityGarrison);
    },

    removeBattalion(count) {
      if (
        !garrisonControls.removeBattalions({
          elementId: "garrison",
          count,
        })
      ) {
        return;
      }

      this.raid = Math.max(this.raid - count, 0);
    },

    getGovArmy(tactic, govIndex) {
      const game = getGame();
      // function battleAssessment(gov)
      let enemy = [5, 27.5, 62.5, 125, 300][tactic]!;
      if (game.global.race["banana"]) {
        enemy *= 2;
      }
      if (game.global.city.biome === "swamp") {
        enemy *= 1.4;
      }
      return (enemy * getGovPower(govIndex)) / 100;
    },

    getAdvantage(army, tactic, govIndex) {
      return (1 - this.getGovArmy(tactic, govIndex) / army) * 100;
    },

    getRatingForAdvantage(adv, tactic, govIndex) {
      return this.getGovArmy(tactic, govIndex) / (1 - adv / 100);
    },

    getSoldiersForAdvantage(advantage, tactic, govIndex) {
      return this.getSoldiersForAttackRating(
        this.getRatingForAdvantage(advantage, tactic, govIndex),
      );
    },

    // Calculates the required soldiers to reach the given attack rating, assuming everyone is healthy.
    getSoldiersForAttackRating(targetRating) {
      const game = getGame();
      if (!targetRating || targetRating <= 0) {
        return 0;
      }
      // Getting the rating for 10 soldiers and dividing it by number of soldiers, to get more accurate value after rounding
      let singleSoldierAttackRating = game.armyRating(10, "army", 0) / 10;
      let maxSoldiers = Math.ceil(targetRating / singleSoldierAttackRating);
      if (!game.global.race["hivemind"]) {
        return maxSoldiers;
      }

      // Ok, we've done no hivemind. Hivemind is trickier because each soldier gives attack rating and a bonus to all other soldiers.
      // I'm sure there is an exact mathematical calculation for this but...
      // Just loop through and remove 1 at a time until we're under the max rating.

      let hiveSize = traitVal("hivemind", 0);
      if (maxSoldiers < hiveSize) {
        maxSoldiers = Math.min(hiveSize, maxSoldiers / (1 - hiveSize * 0.05));
      }

      while (
        maxSoldiers > 1 &&
        game.armyRating(maxSoldiers - 1, "army", 0) > targetRating
      ) {
        maxSoldiers--;
      }

      return maxSoldiers;
    },

    addHellGarrison(count) {
      if (!garrisonControls.addHellSoldiers({ elementId: "fort", count })) {
        return;
      }

      this.hellSoldiers = Math.min(this.hellSoldiers + count, this.workers);
      this.hellAssigned = this.hellSoldiers;
    },

    removeHellGarrison(count) {
      if (!garrisonControls.removeHellSoldiers({ elementId: "fort", count })) {
        return;
      }

      let min =
        this.hellPatrols * this.hellPatrolSize + this.hellReservedSoldiers;
      this.hellSoldiers = Math.max(this.hellSoldiers - count, min);
      this.hellAssigned = this.hellSoldiers;
    },

    addHellPatrol(count) {
      if (!garrisonControls.addHellPatrols({ elementId: "fort", count })) {
        return;
      }

      if (this.hellPatrols * this.hellPatrolSize < this.hellSoldiers) {
        this.hellPatrols += count;
        if (this.hellSoldiers < this.hellPatrols * this.hellPatrolSize) {
          this.hellPatrols = Math.floor(
            this.hellSoldiers / this.hellPatrolSize,
          );
        }
      }
    },

    removeHellPatrol(count) {
      if (!garrisonControls.removeHellPatrols({ elementId: "fort", count })) {
        return;
      }

      this.hellPatrols = Math.max(this.hellPatrols - count, 0);
    },

    addHellPatrolSize(count) {
      if (!garrisonControls.addHellPatrolSize({ elementId: "fort", count })) {
        return;
      }

      if (this.hellPatrolSize < this.hellSoldiers) {
        this.hellPatrolSize += count;
        if (this.hellSoldiers < this.hellPatrols * this.hellPatrolSize) {
          this.hellPatrols = Math.floor(
            this.hellSoldiers / this.hellPatrolSize,
          );
        }
      }
    },

    removeHellPatrolSize(count) {
      if (
        !garrisonControls.removeHellPatrolSize({ elementId: "fort", count })
      ) {
        return;
      }

      this.hellPatrolSize = Math.max(this.hellPatrolSize - count, 1);
    },

    attackEnemyFortress(enemyIndex) {
      const game = getGame();
      // Validate the enemy index. No throne means no enemy to attack.
      if (
        enemyIndex < 0 ||
        enemyIndex >= (game.global.portal.throne?.enemy?.length ?? 0)
      ) {
        return false;
      }

      // Call the attack method on the fortress panel
      try {
        return garrisonControls.attackFortress({
          elementId: "fort",
          enemyIndex,
        });
      } catch (error) {
        logError("Failed to attack enemy fortress:", error);
        return false;
      }
    },
  };

  return { SpyManager, WarManager };
}
