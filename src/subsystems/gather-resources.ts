import type { SubsystemDependencies } from "./types.ts";

type Dependencies = SubsystemDependencies<
  | "getGame"
  | "getSettings"
  | "getResources"
  | "getBuildings"
  | "getResourcesPerClick"
  | "haveTech"
>;
export function createAutoGatherResources({ getGame, getSettings, getResources, getBuildings, getResourcesPerClick, haveTech }: Dependencies) {
  return function autoGatherResources() {
    const game = getGame();
    const settings = getSettings();
    const resources = getResources();
    const buildings = getBuildings();
    // Don't spam click once we've got a bit of population going
    if (
      !settings.buildingAlwaysClick &&
      resources.Population.currentQuantity > 15 &&
      (buildings.RockQuarry.count > 0 || game.global.race["sappy"])
    ) {
      return;
    }

    // Uses exposed action handlers, bypassing vue - they much faster, and that's important with a lot of calls
    let resPerClick = getResourcesPerClick();
    let amount = 0;
    if (buildings.Food.isClickable() && !game.global.race["fasting"]) {
      if (haveTech("conjuring", 1)) {
        amount = Math.floor(
          Math.min(
            (resources.Food.maxQuantity - resources.Food.currentQuantity) /
              (resPerClick * 10),
            resources.Mana.currentQuantity,
            settings.buildingClickPerTick,
          ),
        );
        resources.Mana.currentQuantity -= amount;
        resources.Food.currentQuantity += amount * resPerClick;
      } else {
        amount = Math.ceil(
          Math.min(
            (resources.Food.maxQuantity - resources.Food.currentQuantity) /
              resPerClick,
            settings.buildingClickPerTick,
          ),
        );
        resources.Food.currentQuantity = Math.min(
          resources.Food.currentQuantity + amount * resPerClick,
          resources.Food.maxQuantity,
        );
      }
      let food = game.actions.city.food;
      for (let i = 0; i < amount; i++) {
        food.action();
      }
    }
    if (buildings.Lumber.isClickable()) {
      if (haveTech("conjuring", 2)) {
        amount = Math.floor(
          Math.min(
            (resources.Lumber.maxQuantity - resources.Lumber.currentQuantity) /
              (resPerClick * 10),
            resources.Mana.currentQuantity,
            settings.buildingClickPerTick,
          ),
        );
        resources.Mana.currentQuantity -= amount;
        resources.Lumber.currentQuantity += amount * resPerClick;
      } else {
        amount = Math.ceil(
          Math.min(
            (resources.Lumber.maxQuantity - resources.Lumber.currentQuantity) /
              resPerClick,
            settings.buildingClickPerTick,
          ),
        );
        resources.Lumber.currentQuantity = Math.min(
          resources.Lumber.currentQuantity + amount * resPerClick,
          resources.Lumber.maxQuantity,
        );
      }
      let lumber = game.actions.city.lumber;
      for (let i = 0; i < amount; i++) {
        lumber.action();
      }
    }
    if (buildings.Stone.isClickable()) {
      if (haveTech("conjuring", 2)) {
        amount = Math.floor(
          Math.min(
            (resources.Stone.maxQuantity - resources.Stone.currentQuantity) /
              (resPerClick * 10),
            resources.Mana.currentQuantity,
            settings.buildingClickPerTick,
          ),
        );
        resources.Mana.currentQuantity -= amount;
        resources.Stone.currentQuantity += amount * resPerClick;
      } else {
        amount = Math.ceil(
          Math.min(
            (resources.Stone.maxQuantity - resources.Stone.currentQuantity) /
              resPerClick,
            settings.buildingClickPerTick,
          ),
        );
        resources.Stone.currentQuantity = Math.min(
          resources.Stone.currentQuantity + amount * resPerClick,
          resources.Stone.maxQuantity,
        );
      }
      let stone = game.actions.city.stone;
      for (let i = 0; i < amount; i++) {
        stone.action();
      }
    }
    if (buildings.Chrysotile.isClickable()) {
      if (haveTech("conjuring", 2)) {
        amount = Math.floor(
          Math.min(
            (resources.Chrysotile.maxQuantity -
              resources.Chrysotile.currentQuantity) /
              (resPerClick * 10),
            resources.Mana.currentQuantity,
            settings.buildingClickPerTick,
          ),
        );
        resources.Mana.currentQuantity -= amount;
        resources.Chrysotile.currentQuantity += amount * resPerClick;
      } else {
        amount = Math.ceil(
          Math.min(
            (resources.Chrysotile.maxQuantity -
              resources.Chrysotile.currentQuantity) /
              resPerClick,
            settings.buildingClickPerTick,
          ),
        );
        resources.Chrysotile.currentQuantity = Math.min(
          resources.Chrysotile.currentQuantity + amount * resPerClick,
          resources.Chrysotile.maxQuantity,
        );
      }
      let chrysotile = game.actions.city.chrysotile;
      for (let i = 0; i < amount; i++) {
        chrysotile.action();
      }
    }
    if (buildings.Slaughter.isClickable()) {
      amount = Math.min(
        Math.max(
          resources.Lumber.maxQuantity - resources.Lumber.currentQuantity,
          resources.Food.maxQuantity - resources.Food.currentQuantity,
          resources.Furs.maxQuantity - resources.Furs.currentQuantity,
        ) / resPerClick,
        settings.buildingClickPerTick,
      );
      let slaughter = game.actions.city.slaughter;
      for (let i = 0; i < amount; i++) {
        slaughter.action();
      }
      resources.Lumber.currentQuantity = Math.min(
        resources.Lumber.currentQuantity + amount * resPerClick,
        resources.Lumber.maxQuantity,
      );
      if (
        game.global.race["soul_eater"] &&
        haveTech("primitive") &&
        !game.global.race["fasting"]
      ) {
        resources.Food.currentQuantity = Math.min(
          resources.Food.currentQuantity + amount * resPerClick,
          resources.Food.maxQuantity,
        );
      }
      if (resources.Furs.isUnlocked()) {
        resources.Furs.currentQuantity = Math.min(
          resources.Furs.currentQuantity + amount * resPerClick,
          resources.Furs.maxQuantity,
        );
      }
    }
  }
}
