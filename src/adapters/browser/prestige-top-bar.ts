import { selectPrestigeTopBarType } from "../../domain/progression/prestige/prestige-top-bar.ts";
import type {
  PrestigeSettingsBuilder,
  PrestigeTopBarOptionsPort,
  PrestigeTopBarReader,
} from "../../ports/prestige-top-bar.ts";

interface PrestigeElement {
  title: string;
  textContent: string | null;
  append(child: PrestigeElement): void;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  querySelector(selector: string): PrestigeElement | null;
  remove(): void;
}

interface PrestigeDocument {
  getElementById(id: string): PrestigeElement | null;
  querySelector(selector: string): PrestigeElement | null;
  createElement(tagName: string): PrestigeElement;
}

export interface PrestigeTopBarBrowserDependencies {
  readonly getDocument: () => PrestigeDocument;
  readonly reader: PrestigeTopBarReader;
  readonly options: PrestigeTopBarOptionsPort;
  readonly buildPrestigeSettings: PrestigeSettingsBuilder;
}

export interface PrestigeTopBarBrowserAdapter {
  updatePrestigeInTopBar(): void;
  removePrestigeFromTopBar(): void;
}

export function createPrestigeTopBarBrowserAdapter({
  getDocument,
  reader,
  options,
  buildPrestigeSettings,
}: PrestigeTopBarBrowserDependencies): PrestigeTopBarBrowserAdapter {
  function updatePrestigeInTopBar(): void {
    const document = getDocument();
    const parentId = "s-prestige-type";
    let parentNode = document.getElementById(parentId);

    if (!reader.readDisplayEnabled()) {
      removePrestigeFromTopBar();
      return;
    }

    if (parentNode === null) {
      const planetWrap = document.querySelector(".planetWrap");
      if (planetWrap === null) return;

      parentNode = document.createElement("span");
      parentNode.setAttribute("id", parentId);
      parentNode.setAttribute(
        "style",
        "border-left: 1px solid; margin-left: 0.75rem; padding-left: 0.75rem;",
      );
      planetWrap.append(parentNode);

      options.addOptionUI(
        "s-prestige-type-helper-btn",
        `#${parentId}`,
        "Prestige",
        buildPrestigeSettings,
      );
    }

    const selectedValue = reader.readSelectedValue();
    if (parentNode.getAttribute("data-prestige") === selectedValue) {
      return;
    }

    let infoNode = parentNode.querySelector(".info");
    if (infoNode === null) {
      infoNode = document.createElement("span");
      infoNode.setAttribute("class", "info");
      parentNode.append(infoNode);
    }

    const selection = selectPrestigeTopBarType(
      reader.readTypeOptions(),
      selectedValue,
    );
    infoNode.title = selection.hint;
    infoNode.textContent = selection.label;
    parentNode.setAttribute("data-prestige", selection.value);
  }

  function removePrestigeFromTopBar(): void {
    const prestigeNode = getDocument().getElementById("s-prestige-type");
    if (prestigeNode === null) return;
    prestigeNode.remove();
  }

  return Object.freeze({
    updatePrestigeInTopBar,
    removePrestigeFromTopBar,
  });
}
