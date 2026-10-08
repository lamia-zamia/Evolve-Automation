import type { SupplyToggleItem } from "../../domain/economy/resources/supply-toggles.ts";
import type { SupplyToggleReader } from "../../ports/supply-toggles.ts";

interface JQueryNode {
  readonly length: number;
  append(content: unknown): JQueryNode;
  remove(): JQueryNode;
}

type JQuery = (selector: unknown) => JQueryNode;

const SUPPLY_PANEL_SELECTOR = "#resCargo";
const SUPPLY_TOGGLE_SELECTOR = `${SUPPLY_PANEL_SELECTOR} .ea-supply-toggle`;

export interface SupplyToggleBrowserDependencies {
  readonly getJQuery: () => JQuery;
  readonly reader: SupplyToggleReader;
  readonly addToggleCallbacks: (
    node: JQueryNode,
    settingKey: string,
  ) => JQueryNode;
}

export interface SupplyToggleBrowserAdapter {
  createSupplyToggles(): void;
  ensureSupplyToggles(): boolean;
  removeSupplyToggles(): boolean;
}

function createToggleMarkup(item: SupplyToggleItem): string {
  return `
                  <label tabindex="0" title="Enable supply of this resource."  class="switch ea-supply-toggle" style="margin-left:auto; margin-right:0.2rem;">
                    <input class="script_${item.settingKey}" type="checkbox"${
                      item.enabled ? " checked" : ""
                    }>
                    <span class="check" style="height:5px;"></span>
                    <span class="state"></span>
                  </label>`;
}

export function createSupplyToggleBrowserAdapter({
  getJQuery,
  reader,
  addToggleCallbacks,
}: SupplyToggleBrowserDependencies): SupplyToggleBrowserAdapter {
  let lastCreatedSupplyCount = 0;

  function createSupplyToggles(): void {
    removeSupplyToggles();

    const $ = getJQuery();
    $("#spireSupply").append(
      '<span id="script_supply_top_row" style="margin-left: auto; margin-right: 0.2rem; float: right;" class="has-text-danger">Auto Supply</span>',
    );
    let count = 0;
    for (const item of reader.readItems()) {
      const supplyElement = $("#supply" + item.resourceId);
      if (supplyElement.length === 0) continue;

      supplyElement.append(
        addToggleCallbacks($(createToggleMarkup(item)), item.settingKey),
      );
      count++;
    }
    lastCreatedSupplyCount = count;
  }

  function ensureSupplyToggles(): boolean {
    if (getJQuery()(SUPPLY_PANEL_SELECTOR).length === 0) {
      return false;
    }
    const currentCount = getJQuery()(SUPPLY_TOGGLE_SELECTOR).length;
    if (currentCount === 0 || currentCount !== lastCreatedSupplyCount) {
      createSupplyToggles();
    }
    return true;
  }

  function removeSupplyToggles(): boolean {
    const $ = getJQuery();
    if ($(SUPPLY_PANEL_SELECTOR).length === 0) return false;
    $(SUPPLY_TOGGLE_SELECTOR).remove();
    $("#script_supply_top_row").remove();
    lastCreatedSupplyCount = 0;
    return true;
  }

  return Object.freeze({
    createSupplyToggles,
    ensureSupplyToggles,
    removeSupplyToggles,
  });
}
