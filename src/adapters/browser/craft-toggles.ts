import type { CraftToggleItem } from "../../domain/craft-toggles.ts";
import type { CraftToggleReader } from "../../ports/craft-toggles.ts";

interface JQueryNode {
  readonly length: number;
  append(content: unknown): JQueryNode;
  parent(): JQueryNode;
  css(property: string, value: string): JQueryNode;
  insertAfter(node: JQueryNode): JQueryNode;
  remove(): JQueryNode;
}

type JQuery = (selector: unknown) => JQueryNode;

export interface CraftToggleBrowserDependencies {
  readonly getJQuery: () => JQuery;
  readonly reader: CraftToggleReader;
  readonly addToggleCallbacks: (
    node: JQueryNode,
    settingKey: string,
  ) => JQueryNode;
}

export interface CraftToggleBrowserAdapter {
  createCraftToggles(): void;
  removeCraftToggles(): void;
}

function createToggleMarkup(item: CraftToggleItem): string {
  return `
                  <label tabindex="0" class="switch ea-craft-toggle">
                    <input class="script_${item.settingKey}" type="checkbox"${
                      item.enabled ? " checked" : ""
                    }/>
                    <span class="check" style="height:5px;"></span>
                  </label>`;
}

export function createCraftToggleBrowserAdapter({
  getJQuery,
  reader,
  addToggleCallbacks,
}: CraftToggleBrowserDependencies): CraftToggleBrowserAdapter {
  function createCraftToggles(): void {
    removeCraftToggles();

    const $ = getJQuery();
    for (const item of reader.readItems()) {
      const craftableElement = $("#res" + item.craftableId + " h3");
      if (craftableElement.length === 0) continue;

      craftableElement.parent().css("position", "relative");
      const toggle = addToggleCallbacks(
        $(createToggleMarkup(item)),
        item.settingKey,
      );
      toggle.insertAfter(craftableElement);
    }
  }

  function removeCraftToggles(): void {
    getJQuery()("#resources .ea-craft-toggle").remove();
  }

  return Object.freeze({ createCraftToggles, removeCraftToggles });
}
