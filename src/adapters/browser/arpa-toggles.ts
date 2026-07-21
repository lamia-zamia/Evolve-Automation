import type { ArpaToggleItem } from "../../domain/arpa-toggles.ts";
import type { ArpaToggleReader } from "../../ports/arpa-toggles.ts";

interface JQueryNode {
  readonly length: number;
  append(content: unknown): JQueryNode;
  remove(): JQueryNode;
}

type JQuery = (selector: unknown) => JQueryNode;

export interface ArpaToggleBrowserDependencies {
  readonly getJQuery: () => JQuery;
  readonly reader: ArpaToggleReader;
  readonly addToggleCallbacks: (
    node: JQueryNode,
    settingKey: string,
  ) => JQueryNode;
}

export interface ArpaToggleBrowserAdapter {
  createArpaToggles(): void;
  removeArpaToggles(): void;
}

function createToggleMarkup(item: ArpaToggleItem): string {
  return `
                  <label tabindex="0" class="switch ea-arpa-toggle" style="position:relative; max-width:75px; margin-top:-36px; left:59%; float:left;">
                    <input class="script_${item.settingKey}" type="checkbox"${
                      item.enabled ? " checked" : ""
                    }>
                    <span class="check" style="height:5px;"></span>
                  </label>`;
}

export function createArpaToggleBrowserAdapter({
  getJQuery,
  reader,
  addToggleCallbacks,
}: ArpaToggleBrowserDependencies): ArpaToggleBrowserAdapter {
  function createArpaToggles(): void {
    removeArpaToggles();

    const $ = getJQuery();
    for (const item of reader.readItems()) {
      const projectElement = $("#arpa" + item.projectId + " .head");
      if (projectElement.length === 0) continue;

      projectElement.append(
        addToggleCallbacks($(createToggleMarkup(item)), item.settingKey),
      );
    }
  }

  function removeArpaToggles(): void {
    getJQuery()("#arpaPhysics .ea-arpa-toggle").remove();
  }

  return Object.freeze({ createArpaToggles, removeArpaToggles });
}
