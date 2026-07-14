import { liveFunction, liveObject } from "./dependencies.ts";

type Loose = any;

interface EjectToggleUIDependencies {
  getDependency: (name: string) => Loose;
  getOverride: (name: string) => Loose;
}

export function createEjectToggleUI({
  getDependency,
  getOverride,
}: EjectToggleUIDependencies) {
  const $ = liveFunction(() => getDependency("$"));
  const EjectManager = liveObject(() => getDependency("EjectManager"));
  const addToggleCallbacks = liveFunction(() =>
    getDependency("addToggleCallbacks"),
  );
  const settingsRaw = liveObject(() => getDependency("settingsRaw"));

  function createEjectTogglesImpl() {
    removeEjectToggles();

    $("#eject").append(
      '<span id="script_eject_top_row" style="margin-left: auto; margin-right: 0.2rem; float: right;" class="has-text-danger">Auto Eject</span>',
    );
    for (let resource of EjectManager.priorityList) {
      let ejectElement = $("#eject" + resource.id);
      if (ejectElement.length) {
        let settingKey = "res_eject" + resource.id;
        ejectElement.append(
          addToggleCallbacks(
            $(`
                  <label tabindex="0" title="Enable ejecting of this resource. When to eject is set in the Prestige Settings tab." class="switch ea-eject-toggle" style="margin-left:auto; margin-right:0.2rem;">
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

  function removeEjectTogglesImpl() {
    $("#resEjector .ea-eject-toggle").remove();
    $("#script_eject_top_row").remove();
  }

  function createEjectToggles(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("createEjectToggles") ?? createEjectTogglesImpl;
    return implementation.apply(this, args);
  }

  function removeEjectToggles(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("removeEjectToggles") ?? removeEjectTogglesImpl;
    return implementation.apply(this, args);
  }

  return { createEjectToggles, removeEjectToggles };
}
