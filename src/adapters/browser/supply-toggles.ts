import type { SupplyToggleItem } from "../../domain/economy/resources/supply-toggles.ts";
import type { SupplyToggleReader } from "../../ports/supply-toggles.ts";

interface JQueryNode {
  readonly length: number;
  append(content: unknown): JQueryNode;
  remove(): JQueryNode;
}

type JQuery = (selector: unknown) => JQueryNode;

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
  ensureSupplyToggles(): void;
  removeSupplyToggles(): void;
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

  function ensureSupplyToggles(): void {
    if (getJQuery()("#resCargo").length === 0) {
      if (lastCreatedSupplyCount !== 0) removeSupplyToggles();
      return;
    }
    const currentCount = getJQuery()("#resCargo .ea-supply-toggle").length;
    if (currentCount === 0 || currentCount !== lastCreatedSupplyCount) {
      createSupplyToggles();
    }
  }

  function removeSupplyToggles(): void {
    const $ = getJQuery();
    $("#resCargo .ea-supply-toggle").remove();
    $("#script_supply_top_row").remove();
    lastCreatedSupplyCount = 0;
  }

  return Object.freeze({
    createSupplyToggles,
    ensureSupplyToggles,
    removeSupplyToggles,
  });
}
