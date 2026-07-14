import { liveFunction, liveObject } from "./dependencies.ts";

type Loose = any;

interface ArpaToggleUIDependencies {
  getDependency: (name: string) => Loose;
  getOverride: (name: string) => Loose;
}

export function createArpaToggleUI({
  getDependency,
  getOverride,
}: ArpaToggleUIDependencies) {
  const $ = liveFunction(() => getDependency("$"));
  const ProjectManager = liveObject(() => getDependency("ProjectManager"));
  const addToggleCallbacks = liveFunction(() =>
    getDependency("addToggleCallbacks"),
  );
  const settingsRaw = liveObject(() => getDependency("settingsRaw"));

  function createArpaTogglesImpl() {
    removeArpaToggles();

    for (let i = 0; i < ProjectManager.priorityList.length; i++) {
      let project = ProjectManager.priorityList[i];
      let projectElement = $("#arpa" + project.id + " .head");
      if (projectElement.length) {
        let settingKey = "arpa_" + project.id;
        projectElement.append(
          addToggleCallbacks(
            $(`
                  <label tabindex="0" class="switch ea-arpa-toggle" style="position:relative; max-width:75px; margin-top:-36px; left:59%; float:left;">
                    <input class="script_${settingKey}" type="checkbox"${
                      settingsRaw[settingKey] ? " checked" : ""
                    }>
                    <span class="check" style="height:5px;"></span>
                  </label>`),
            settingKey,
          ),
        );
      }
    }
  }

  function removeArpaTogglesImpl() {
    $("#arpaPhysics .ea-arpa-toggle").remove();
  }

  function createArpaToggles(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("createArpaToggles") ?? createArpaTogglesImpl;
    return implementation.apply(this, args);
  }

  function removeArpaToggles(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("removeArpaToggles") ?? removeArpaTogglesImpl;
    return implementation.apply(this, args);
  }

  return { createArpaToggles, removeArpaToggles };
}
