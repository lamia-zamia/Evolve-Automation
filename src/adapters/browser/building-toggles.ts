import type { BuildingToggleItem } from "../../domain/progression/build/building-toggles.ts";
import type {
  BuildingToggleCountWriter,
  BuildingToggleReader,
} from "../../ports/building-toggles.ts";

interface JQueryNode {
  readonly length: number;
  append(content: unknown): JQueryNode;
  remove(): JQueryNode;
}

type JQuery = (selector: unknown) => JQueryNode;

export interface BuildingToggleBrowserDependencies {
  readonly getJQuery: () => JQuery;
  readonly reader: BuildingToggleReader;
  readonly getCountWriter: () => BuildingToggleCountWriter;
  readonly addToggleCallbacks: (
    node: JQueryNode,
    settingKey: string,
  ) => JQueryNode;
}

export interface BuildingToggleBrowserAdapter {
  createBuildingToggles(): void;
  removeBuildingToggles(): void;
}

function createToggleMarkup(item: BuildingToggleItem): string {
  return `
                  <label tabindex="0" class="switch ea-building-toggle" style="position:absolute; margin-top: 24px; left:10%;">
                    <input class="script_${item.settingKey}" type="checkbox"${
                      item.enabled ? " checked" : ""
                    }/>
                    <span class="check" style="height:5px; max-width:15px"></span>
                  </label>`;
}

export function createBuildingToggleBrowserAdapter({
  getJQuery,
  reader,
  getCountWriter,
  addToggleCallbacks,
}: BuildingToggleBrowserDependencies): BuildingToggleBrowserAdapter {
  function createBuildingToggles(): void {
    removeBuildingToggles();
    if (!reader.readVisible()) return;

    const $ = getJQuery();
    let count = 0;
    for (const item of reader.readItems()) {
      const buildingElement = $("#" + item.binding);
      if (buildingElement.length === 0) continue;

      buildingElement.append(
        addToggleCallbacks($(createToggleMarkup(item)), item.settingKey),
      );
      count++;
    }
    getCountWriter().setCount(count);
  }

  function removeBuildingToggles(): void {
    getJQuery()("#mTabCivil .ea-building-toggle").remove();
    getCountWriter().setCount(0);
  }

  return Object.freeze({ createBuildingToggles, removeBuildingToggles });
}
