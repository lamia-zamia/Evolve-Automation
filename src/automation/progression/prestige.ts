import type { AutomationDependencies } from "../dependencies.ts";

type Dependencies = AutomationDependencies<
  | "getState"
  | "getSettings"
  | "getGame"
  | "getResources"
  | "getBuildings"
  | "getWarManager"
  | "getHaveTech"
  | "getVueById"
  | "logPrestige"
  | "getIsBioseederPrestigeAvailable"
  | "isCataclysmPrestigeAvailable"
  | "loadQueuedSettings"
  | "getTechIds"
  | "isWhiteholePrestigeAvailable"
  | "isApocalypsePrestigeAvailable"
  | "isWitchAscensionPrestigeAvailable"
  | "isAscensionPrestigeAvailable"
  | "KeyManager"
  | "isDemonicPrestigeAvailable"
>;
export function createAutoPrestige({
  getState,
  getSettings,
  getGame,
  getResources,
  getBuildings,
  getWarManager,
  getHaveTech,
  getVueById,
  logPrestige,
  getIsBioseederPrestigeAvailable,
  isCataclysmPrestigeAvailable,
  loadQueuedSettings,
  getTechIds,
  isWhiteholePrestigeAvailable,
  isApocalypsePrestigeAvailable,
  isWitchAscensionPrestigeAvailable,
  isAscensionPrestigeAvailable,
  KeyManager,
  isDemonicPrestigeAvailable,
}: Dependencies) {
  return function autoPrestige() {
    const state = getState();
    const settings = getSettings();
    const game = getGame();
    const resources = getResources();
    const buildings = getBuildings();
    const WarManager = getWarManager();
    const haveTech = getHaveTech();
    const isBioseederPrestigeAvailable = getIsBioseederPrestigeAvailable();
    const techIds = getTechIds();
    const tryReset = (check, act) => {
      if (check) {
        if (state.goal !== "Reset") {
          state.goal = "Reset";
          return; // Delay reset for one tick, to let script buy mercs and such
        }
        act();
      }
    };

    switch (settings.prestigeType) {
      case "none":
        return;
      case "mad":
        let madVue = getVueById("mad");
        return tryReset(madVue?.display && haveTech("mad"), () => {
          if (madVue.armed) {
            madVue.arm();
          }

          if (
            !settings.prestigeMADWait ||
            (WarManager.currentSoldiers >= WarManager.maxSoldiers &&
              resources.Population.currentQuantity >=
                resources.Population.maxQuantity &&
              WarManager.currentSoldiers +
                resources.Population.currentQuantity >=
                settings.prestigeMADPopulation)
          ) {
            state.goal = "GameOverMan";
            logPrestige();
            madVue.launch();
          }
        });
      case "bioseed":
        return tryReset(isBioseederPrestigeAvailable(), () => {
          // Ship completed and probe requirements met
          if (buildings.GasSpaceDockLaunch.isUnlocked()) {
            buildings.GasSpaceDockLaunch.click();
          } else if (buildings.GasSpaceDockPrepForLaunch.isUnlocked()) {
            buildings.GasSpaceDockPrepForLaunch.click();
          } else {
            // Open the modal to update the options
            buildings.GasSpaceDock.cacheOptions();
          }
        });
      case "cataclysm":
        return tryReset(isCataclysmPrestigeAvailable(), () => {
          if (settings.autoEvolution) {
            loadQueuedSettings(); // Cataclysm doesnt't have evolution stage, so we need to load settings here, before reset
          }
          if (techIds["tech-dial_it_to_11"].isClickable()) {
            logPrestige();
            techIds["tech-dial_it_to_11"].click();
          }
        });
      case "whitehole":
        return tryReset(isWhiteholePrestigeAvailable(), () => {
          // Solar mass requirements met and research available
          if (
            techIds["tech-exotic_infusion"].isUnlocked() &&
            techIds["tech-exotic_infusion"].isAffordable()
          ) {
            logPrestige();
          }
          [
            "tech-infusion_confirm",
            "tech-infusion_check",
            "tech-exotic_infusion",
          ].forEach((id) => techIds[id].click());
        });
      case "apocalypse":
        return tryReset(isApocalypsePrestigeAvailable(), () => {
          logPrestige();
          ["tech-protocol66", "tech-protocol66a"].forEach((id) =>
            techIds[id].click(),
          );
        });
      case "ascension":
        if (game.global.race["witch_hunter"]) {
          return tryReset(isWitchAscensionPrestigeAvailable(), () => {
            KeyManager.set(false, false, false);
            logPrestige();
            buildings.PitAbsorptionChamber.vue.action(); // Hack to bypass "count < max" check
            state.goal = "GameOverMan";
          });
        } else {
          return tryReset(isAscensionPrestigeAvailable(), () => {
            KeyManager.set(false, false, false);
            buildings.SiriusAscend.click();
          });
        }
      case "demonic":
        if (game.global.race["witch_hunter"]) {
          return tryReset(isWitchAscensionPrestigeAvailable(true), () => {
            KeyManager.set(false, false, false);
            logPrestige();
            buildings.PitAbsorptionChamber.vue.action(); // Hack to bypass "count < max" check
            state.goal = "GameOverMan";
          });
        } else {
          return tryReset(isDemonicPrestigeAvailable(), () => {
            logPrestige();
            if (game.global.race["fasting"]) {
              techIds["tech-final_ingredient"].click();
            } else {
              techIds["tech-demonic_infusion"].click();
            }
          });
        }
      case "terraform":
        return tryReset(buildings.RedTerraform.isUnlocked(), () => {
          KeyManager.set(false, false, false);
          buildings.RedTerraform.click();
        });
      case "matrix":
        return tryReset(buildings.TauStarBluePill.isUnlocked(), () => {
          KeyManager.set(false, false, false);
          buildings.TauStarBluePill.click();
        });
      case "apotheosis":
        return tryReset(buildings.PalaceApotheosis.isUnlocked(), () => {
          KeyManager.set(false, false, false);
          buildings.PalaceApotheosis.click();
        });
      case "vacuum":
      case "retire":
      case "eden":
        // Nothing required, handled externaly
        return;
    }
  };
}
