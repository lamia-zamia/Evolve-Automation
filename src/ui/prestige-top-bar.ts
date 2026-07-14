import { liveFunction, liveObject } from "./dependencies.ts";

type Loose = any;

interface PrestigeTopBarDependencies {
  getDependency: (name: string) => Loose;
  getOverride: (name: string) => Loose;
}

export function createPrestigeTopBar({
  getDependency,
  getOverride,
}: PrestigeTopBarDependencies) {
  const addOptionUI = liveFunction(() => getDependency("addOptionUI"));
  const buildPrestigeSettings = liveFunction(() =>
    getDependency("buildPrestigeSettings"),
  );
  const document = liveObject(() => getDependency("document"));
  const prestigeTypes = liveObject(() => getDependency("prestigeTypes"));
  const settings = liveObject(() => getDependency("settings"));

  function updatePrestigeInTopBarImpl() {
    const parentId = "s-prestige-type";
    let parentNode = document.getElementById(parentId);

    if (settings.displayPrestigeTypeInTopBar) {
      if (parentNode === null) {
        // Check for planetWrap parent node
        const planetWrap = document.querySelector(".planetWrap");
        if (planetWrap === null) return; // Return and try again later if it doesn't exist yet

        // Create new parent node
        parentNode = document.createElement("span");
        parentNode.setAttribute("id", parentId);
        parentNode.setAttribute(
          "style",
          "border-left: 1px solid; margin-left: 0.75rem; padding-left: 0.75rem;",
        );

        // Add to planetWrap
        planetWrap.append(parentNode);

        // Add helper button to open prestige options modal
        addOptionUI(
          "s-prestige-type-helper-btn",
          `#${parentId}`,
          "Prestige",
          buildPrestigeSettings,
        );
      }
    } else {
      removePrestigeFromTopBar();
      return; // Disable and return if displayPrestigeTypeInTopBar isn't enabled
    }

    // Update if prestigeType changed
    if (parentNode.getAttribute("data-prestige") !== settings.prestigeType) {
      let infoNode = parentNode.querySelector(".info");
      if (infoNode === null) {
        // Create info node if needed
        infoNode = document.createElement("span");
        infoNode.setAttribute("class", "info");

        parentNode.append(infoNode);
      }

      let prestige = prestigeTypes.find(
        (entry) => entry.val === settings.prestigeType,
      );
      if (prestige === undefined) {
        // Somehow failed to find prestige details, mock up an object from settings
        prestige = { label: settings.prestigeType, hint: "" };
      }

      // Update node with new prestige info
      infoNode.title = prestige.hint;
      infoNode.textContent = prestige.label;
      parentNode.setAttribute("data-prestige", settings.prestigeType);
    }
  }

  function removePrestigeFromTopBarImpl() {
    let prestigeNode = document.getElementById("s-prestige-type");
    if (prestigeNode == null) {
      return;
    } // Element has not yet been added, nothing to do

    prestigeNode.remove();
  }

  function updatePrestigeInTopBar(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("updatePrestigeInTopBar") ?? updatePrestigeInTopBarImpl;
    return implementation.apply(this, args);
  }

  function removePrestigeFromTopBar(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("removePrestigeFromTopBar") ?? removePrestigeFromTopBarImpl;
    return implementation.apply(this, args);
  }

  return { updatePrestigeInTopBar, removePrestigeFromTopBar };
}
