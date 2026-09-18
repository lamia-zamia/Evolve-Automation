import type { ArpaToggleItem } from "../../domain/progression/research/arpa-toggles.ts";
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
  ensureArpaToggles(): void;
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

  function ensureArpaToggles(): void {
    const $ = getJQuery();
    if ($("#arpaPhysics").length === 0) {
      if (lastCreatedArpaCount !== 0) removeArpaToggles();
      return;
    }
    const currentCount = $("#arpaPhysics .ea-arpa-toggle").length;
    if (currentCount === 0 || currentCount !== lastCreatedArpaCount) {
      createArpaToggles();
    }
  }

  function removeArpaToggles(): void {
    getJQuery()("#arpaPhysics .ea-arpa-toggle").remove();
    lastCreatedArpaCount = 0;
  }

  return Object.freeze({
    createArpaToggles,
    ensureArpaToggles,
    removeArpaToggles,
  });
}
