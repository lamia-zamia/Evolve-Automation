/* eslint-disable @typescript-eslint/no-explicit-any */
import type { GameIndustryControlsPort } from "../ports/game-industry-controls.ts";

interface MagicManagersDependencies {
  getGame: () => any;
  getSettings: () => Record<string, any>;
  getResources: () => Record<string, any>;
  getBuildings: () => Record<string, { count: number }>;
  haveTech: (tech: string, level?: number) => boolean;
  isLumberRace: () => boolean;
  addProps: (
    target: any,
    idFn: (item: any) => string,
    specs: { s: string; p: string }[],
  ) => any;
  industryControls: GameIndustryControlsPort;
}

export function createMagicManagers({
  getGame,
  getSettings,
  getResources,
  getBuildings,
  haveTech,
  isLumberRace,
  addProps,
  industryControls,
}: MagicManagersDependencies) {
  const AlchemyManager = {
    _alchemyVuePrefix: "alchemy",
    priorityList: [] as any[],

    resEnabled: (id: string) => getSettings()["res_alchemy_" + id],
    resWeighting: (id: string) => getSettings()["res_alchemy_w_" + id],

    isUnlocked() {
      return haveTech("alchemy");
    },

    managedPriorityList() {
      const game = getGame();
      const resources = getResources();
      return this.priorityList.filter(
        (res) =>
          this.resEnabled(res.id) &&
          res.isUnlocked() &&
          this.transmuteTier(res) <= game.global.tech.alchemy &&
          (!game.global.race["artifical"] || res !== resources.Food),
      );
    },

    transmuteTier(res: any) {
      const game = getGame();
      const resources = getResources();
      return !Object.hasOwn(game.tradeRatio, res.id) ||
        res === resources.Crystal
        ? 0
        : Object.hasOwn(res.instance ?? {}, "trade")
          ? 1
          : 2;
    },

    currentCount(id: string) {
      const game = getGame();
      return game.global.race.alchemy[id];
    },

    transmuteMore(id: string, count: number) {
      const resources = getResources();
      if (
        !industryControls.increaseSpell({
          elementId: this._alchemyVuePrefix + id,
          id,
          count,
        })
      ) {
        return false;
      }

      resources.Mana.rateOfChange -= count * 1;
      resources.Crystal.rateOfChange -= count * 0.5;
      return true;
    },

    transmuteLess(id: string, count: number) {
      const resources = getResources();
      if (
        !industryControls.decreaseSpell({
          elementId: this._alchemyVuePrefix + id,
          id,
          count,
        })
      ) {
        return false;
      }

      resources.Mana.rateOfChange += count * 1;
      resources.Crystal.rateOfChange += count * 0.5;
      return true;
    },
  };

  const RitualManager = {
    _industryElementId: "iPylon",

    Productions: addProps(
      {
        Farmer: {
          id: "farmer",
          isUnlocked: () =>
            !getGame().global.race["orbit_decayed"] &&
            !getGame().global.race["cataclysm"] &&
            !getGame().global.race["carnivore"] &&
            !getGame().global.race["soul_eater"] &&
            !getGame().global.race["artifical"] &&
            !getGame().global.race["unfathomable"],
        },
        Miner: {
          id: "miner",
          isUnlocked: () => !getGame().global.race["cataclysm"],
        },
        Lumberjack: {
          id: "lumberjack",
          isUnlocked: () =>
            !getGame().global.race["orbit_decayed"] &&
            !getGame().global.race["cataclysm"] &&
            isLumberRace() &&
            !getGame().global.race["evil"],
        },
        Science: { id: "science", isUnlocked: () => true },
        Factory: { id: "factory", isUnlocked: () => true },
        Army: { id: "army", isUnlocked: () => true },
        Hunting: { id: "hunting", isUnlocked: () => true },
        Crafting: { id: "crafting", isUnlocked: () => haveTech("magic", 4) },
      },
      (s: any) => s.id,
      [{ s: "spell_w_", p: "weighting" }],
    ),

    initIndustry() {
      const game = getGame();
      const buildings = getBuildings();
      if (
        (buildings.Pylon.count < 1 &&
          buildings.RedPylon.count < 1 &&
          buildings.TauPylon.count < 1) ||
        !game.global.race["casting"]
      ) {
        return false;
      }

      return industryControls.isRendered(this._industryElementId);
    },

    currentSpells(spell: any) {
      const game = getGame();
      return game.global.race.casting[spell.id];
    },

    spellCost(spell: any) {
      return this.manaCost(this.currentSpells(spell));
    },

    costStep(level: number) {
      if (level === 0) {
        return 0.0025;
      }
      let cost = this.manaCost(level);
      return ((cost / level) * 1.0025 + 0.0025) * (level + 1) - cost;
    },

    // export function manaCost(spell,rate) from industry.js
    manaCost(level: number) {
      return level * (1.0025 ** level - 1);
    },

    increaseRitual(spell: any, count: number): any {
      if (count === 0 || !spell.isUnlocked()) {
        return false;
      }
      if (count < 0) {
        return this.decreaseRitual(spell, count * -1);
      }

      return industryControls.increaseSpell({
        elementId: this._industryElementId,
        id: spell.id,
        count,
      });
    },

    decreaseRitual(spell: any, count: number): any {
      if (count === 0 || !spell.isUnlocked()) {
        return false;
      }
      if (count < 0) {
        // Preserved from the original: this passes a single argument to a
        // two-parameter method (latent bug), not a structural change.
        // @ts-expect-error intentional verbatim preservation
        return this.increaseRitual(count * -1);
      }

      return industryControls.decreaseSpell({
        elementId: this._industryElementId,
        id: spell.id,
        count,
      });
    },
  };

  return { AlchemyManager, RitualManager };
}
