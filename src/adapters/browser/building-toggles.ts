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

const BUILDING_PANEL_SELECTOR = "#city";
const BUILDING_TOGGLE_SELECTOR = `${BUILDING_PANEL_SELECTOR} .ea-building-toggle`;

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
  ensureBuildingToggles(): boolean;
  removeBuildingToggles(): boolean;
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
  let lastCreatedCount = 0;

  function setCount(count: number): void {
    lastCreatedCount = count;
    getCountWriter().setCount(count);
  }

  function createBuildingToggles(): void {
    removeBuildingToggles();
    if (!reader.readVisible()) return;

    const $ = getJQuery();
    let count = 0;
    for (const item of reader.readItems()) {
      const buildingElement = $("#" + (item.elementId ?? item.binding));
      if (buildingElement.length === 0) continue;

      buildingElement.append(
        addToggleCallbacks($(createToggleMarkup(item)), item.settingKey),
      );
      count++;
    }
    setCount(count);
  }

  function ensureBuildingToggles(): boolean {
    if (getJQuery()(BUILDING_PANEL_SELECTOR).length === 0) return false;
    if (!reader.readVisible()) {
      return false;
    }
    const currentCount = getJQuery()(BUILDING_TOGGLE_SELECTOR).length;
    if (currentCount === 0 || currentCount !== lastCreatedCount) {
      createBuildingToggles();
    }
    return true;
  }

  function removeBuildingToggles(): boolean {
    const $ = getJQuery();
    if ($(BUILDING_PANEL_SELECTOR).length === 0) return false;
    $(BUILDING_TOGGLE_SELECTOR).remove();
    setCount(0);
    return true;
  }

  return Object.freeze({
    createBuildingToggles,
    ensureBuildingToggles,
    removeBuildingToggles,
  });
}
