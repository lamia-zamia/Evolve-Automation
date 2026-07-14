import { liveFunction, liveObject } from "./dependencies.ts";

type Loose = any;

interface BuildingToggleUIDependencies {
  getDependency: (name: string) => Loose;
  getOverride: (name: string) => Loose;
}

export function createBuildingToggleUI({
  getDependency,
  getOverride,
}: BuildingToggleUIDependencies) {
  const $ = liveFunction(() => getDependency("$"));
  const BuildingManager = liveObject(() => getDependency("BuildingManager"));
  const addToggleCallbacks = liveFunction(() =>
    getDependency("addToggleCallbacks"),
  );
  const settings = liveObject(() => getDependency("settings"));
  const settingsRaw = liveObject(() => getDependency("settingsRaw"));
  const state = liveObject(() => getDependency("state"));

  function createBuildingTogglesImpl() {
    removeBuildingToggles();

    // Building toggles redraw much more often than other toggles.
    // With settings off, disable them.
    if (!settings.showSettings) return;

    for (let i = 0; i < BuildingManager.priorityList.length; i++) {
      let building = BuildingManager.priorityList[i];
      let buildingElement = $("#" + building._vueBinding);
      if (buildingElement.length) {
        let settingKey = "bat" + building._vueBinding;
        buildingElement.append(
          addToggleCallbacks(
            $(`
                  <label tabindex="0" class="switch ea-building-toggle" style="position:absolute; margin-top: 24px; left:10%;">
                    <input class="script_${settingKey}" type="checkbox"${
                      settingsRaw[settingKey] ? " checked" : ""
                    }/>
                    <span class="check" style="height:5px; max-width:15px"></span>
                  </label>`),
            settingKey,
          ),
        );
        state.buildingToggles++;
      }
    }
  }

  function removeBuildingTogglesImpl() {
    $("#mTabCivil .ea-building-toggle").remove();
    state.buildingToggles = 0;
  }

  function createBuildingToggles(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("createBuildingToggles") ?? createBuildingTogglesImpl;
    return implementation.apply(this, args);
  }

  function removeBuildingToggles(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("removeBuildingToggles") ?? removeBuildingTogglesImpl;
    return implementation.apply(this, args);
  }

  return { createBuildingToggles, removeBuildingToggles };
}
