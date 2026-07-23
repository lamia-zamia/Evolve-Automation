import type { EjectToggleItem } from "../../domain/economy/resources/eject-toggles.ts";
import type { EjectToggleReader } from "../../ports/eject-toggles.ts";

interface JQueryNode {
  readonly length: number;
  append(content: unknown): JQueryNode;
  remove(): JQueryNode;
}

type JQuery = (selector: unknown) => JQueryNode;

export interface EjectToggleBrowserDependencies {
  readonly getJQuery: () => JQuery;
  readonly reader: EjectToggleReader;
  readonly addToggleCallbacks: (
    node: JQueryNode,
    settingKey: string,
  ) => JQueryNode;
}

export interface EjectToggleBrowserAdapter {
  createEjectToggles(): void;
  removeEjectToggles(): void;
}

function createToggleMarkup(item: EjectToggleItem): string {
  return `
                  <label tabindex="0" title="Enable ejecting of this resource. When to eject is set in the Prestige Settings tab." class="switch ea-eject-toggle" style="margin-left:auto; margin-right:0.2rem;">
                    <input class="script_${item.settingKey}" type="checkbox"${
                      item.enabled ? " checked" : ""
                    }>
                    <span class="check" style="height:5px;"></span>
                    <span class="state"></span>
                  </label>`;
}

export function createEjectToggleBrowserAdapter({
  getJQuery,
  reader,
  addToggleCallbacks,
}: EjectToggleBrowserDependencies): EjectToggleBrowserAdapter {
  function createEjectToggles(): void {
    removeEjectToggles();

    const $ = getJQuery();
    $("#eject").append(
      '<span id="script_eject_top_row" style="margin-left: auto; margin-right: 0.2rem; float: right;" class="has-text-danger">Auto Eject</span>',
    );
    for (const item of reader.readItems()) {
      const ejectElement = $("#eject" + item.resourceId);
      if (ejectElement.length === 0) continue;

      ejectElement.append(
        addToggleCallbacks($(createToggleMarkup(item)), item.settingKey),
      );
    }
  }

  function removeEjectToggles(): void {
    const $ = getJQuery();
    $("#resEjector .ea-eject-toggle").remove();
    $("#script_eject_top_row").remove();
  }

  return Object.freeze({ createEjectToggles, removeEjectToggles });
}
