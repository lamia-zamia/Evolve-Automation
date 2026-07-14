import { liveFunction, liveObject } from "./dependencies.ts";

type Loose = any;

interface CraftToggleUIDependencies {
  getDependency: (name: string) => Loose;
  getOverride: (name: string) => Loose;
}

export function createCraftToggleUI({
  getDependency,
  getOverride,
}: CraftToggleUIDependencies) {
  const $ = liveFunction(() => getDependency("$"));
  const addToggleCallbacks = liveFunction(() =>
    getDependency("addToggleCallbacks"),
  );
  const craftablesList = liveObject(() => getDependency("craftablesList"));
  const settingsRaw = liveObject(() => getDependency("settingsRaw"));

  function createCraftTogglesImpl() {
    removeCraftToggles();

    for (let i = 0; i < craftablesList.length; i++) {
      let craftable = craftablesList[i];
      let craftableElement = $("#res" + craftable.id + " h3");
      if (craftableElement.length) {
        let settingKey = "craft" + craftable.id;
        craftableElement.parent().css("position", "relative");
        addToggleCallbacks(
          $(`
                  <label tabindex="0" class="switch ea-craft-toggle">
                    <input class="script_${settingKey}" type="checkbox"${
                      settingsRaw[settingKey] ? " checked" : ""
                    }/>
                    <span class="check" style="height:5px;"></span>
                  </label>`),
          settingKey,
        ).insertAfter(craftableElement);
      }
    }
  }

  function removeCraftTogglesImpl() {
    $("#resources .ea-craft-toggle").remove();
  }

  function createCraftToggles(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("createCraftToggles") ?? createCraftTogglesImpl;
    return implementation.apply(this, args);
  }

  function removeCraftToggles(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("removeCraftToggles") ?? removeCraftTogglesImpl;
    return implementation.apply(this, args);
  }

  return { createCraftToggles, removeCraftToggles };
}
