import type { ArpaToggleItem } from "../../domain/progression/research/arpa-toggles.ts";
import type { ArpaToggleReader } from "../../ports/arpa-toggles.ts";

interface JQueryNode {
  readonly length: number;
  append(content: unknown): JQueryNode;
  remove(): JQueryNode;
}

type JQuery = (selector: unknown) => JQueryNode;

const ARPA_PANEL_SELECTOR = "#arpaPhysics";
const ARPA_TOGGLE_SELECTOR = `${ARPA_PANEL_SELECTOR} .ea-arpa-toggle`;

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
  ensureArpaToggles(): boolean;
  removeArpaToggles(): boolean;
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
  let lastCreatedArpaCount = 0;

  function createArpaToggles(): void {
    removeArpaToggles();

    const $ = getJQuery();
    let count = 0;
    for (const item of reader.readItems()) {
      const projectElement = $("#arpa" + item.projectId + " .head");
      if (projectElement.length === 0) continue;

      projectElement.append(
        addToggleCallbacks($(createToggleMarkup(item)), item.settingKey),
      );
      count++;
    }
    lastCreatedArpaCount = count;
  }

  function ensureArpaToggles(): boolean {
    const $ = getJQuery();
    if ($(ARPA_PANEL_SELECTOR).length === 0) {
      return false;
    }
    const currentCount = $(ARPA_TOGGLE_SELECTOR).length;
    if (currentCount === 0 || currentCount !== lastCreatedArpaCount) {
      createArpaToggles();
    }
    return true;
  }

  function removeArpaToggles(): boolean {
    const $ = getJQuery();
    if ($(ARPA_PANEL_SELECTOR).length === 0) return false;
    $(ARPA_TOGGLE_SELECTOR).remove();
    lastCreatedArpaCount = 0;
    return true;
  }

  return Object.freeze({
    createArpaToggles,
    ensureArpaToggles,
    removeArpaToggles,
  });
}
