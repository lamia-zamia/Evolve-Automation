import { liveFunction, liveObject } from "./dependencies.ts";

type Loose = any;

interface SupplyToggleUIDependencies {
  getDependency: (name: string) => Loose;
  getOverride: (name: string) => Loose;
}

export function createSupplyToggleUI({
  getDependency,
  getOverride,
}: SupplyToggleUIDependencies) {
  const $ = liveFunction(() => getDependency("$"));
  const SupplyManager = liveObject(() => getDependency("SupplyManager"));
  const addToggleCallbacks = liveFunction(() =>
    getDependency("addToggleCallbacks"),
  );
  const settingsRaw = liveObject(() => getDependency("settingsRaw"));

  function createSupplyTogglesImpl() {
    removeSupplyToggles();

    $("#spireSupply").append(
      '<span id="script_supply_top_row" style="margin-left: auto; margin-right: 0.2rem; float: right;" class="has-text-danger">Auto Supply</span>',
    );
    for (let resource of SupplyManager.priorityList) {
      let supplyElement = $("#supply" + resource.id);
      if (supplyElement.length) {
        let settingKey = "res_supply" + resource.id;
        supplyElement.append(
          addToggleCallbacks(
            $(`
                  <label tabindex="0" title="Enable supply of this resource."  class="switch ea-supply-toggle" style="margin-left:auto; margin-right:0.2rem;">
                    <input class="script_${settingKey}" type="checkbox"${
                      settingsRaw[settingKey] ? " checked" : ""
                    }>
                    <span class="check" style="height:5px;"></span>
                    <span class="state"></span>
                  </label>`),
            settingKey,
          ),
        );
      }
    }
  }

  function removeSupplyTogglesImpl() {
    $("#resCargo .ea-supply-toggle").remove();
    $("#script_supply_top_row").remove();
  }

  function createSupplyToggles(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("createSupplyToggles") ?? createSupplyTogglesImpl;
    return implementation.apply(this, args);
  }

  function removeSupplyToggles(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("removeSupplyToggles") ?? removeSupplyTogglesImpl;
    return implementation.apply(this, args);
  }

  return { createSupplyToggles, removeSupplyToggles };
}
