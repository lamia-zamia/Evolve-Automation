import { liveFunction, liveObject } from "./dependencies.ts";

type Loose = any;

interface EjectorSettingsDependencies {
  getDependency: (name: string) => Loose;
  getOverride: (name: string) => Loose;
}

export function createEjectorSettings({
  getDependency,
  getOverride,
}: EjectorSettingsDependencies) {
  const $ = liveFunction(() => getDependency("$"));
  const EjectManager = liveObject(() => getDependency("EjectManager"));
  const NaniteManager = liveObject(() => getDependency("NaniteManager"));
  const SupplyManager = liveObject(() => getDependency("SupplyManager"));
  const addSettingsNumber = liveFunction(() =>
    getDependency("addSettingsNumber"),
  );
  const addSettingsSelect = liveFunction(() =>
    getDependency("addSettingsSelect"),
  );
  const addSettingsToggle = liveFunction(() =>
    getDependency("addSettingsToggle"),
  );
  const addTableToggle = liveFunction(() => getDependency("addTableToggle"));
  const buildSettingsSection = liveFunction(() =>
    getDependency("buildSettingsSection"),
  );
  const buildTableLabel = liveFunction(() => getDependency("buildTableLabel"));
  const document = liveObject(() => getDependency("document"));
  const removeEjectToggles = liveFunction(() =>
    getDependency("removeEjectToggles"),
  );
  const removeSupplyToggles = liveFunction(() =>
    getDependency("removeSupplyToggles"),
  );
  const resetCheckbox = liveFunction(() => getDependency("resetCheckbox"));
  const resetEjectorSettings = liveFunction(() =>
    getDependency("resetEjectorSettings"),
  );
  const resources = liveObject(() => getDependency("resources"));
  const updateSettingsFromState = liveFunction(() =>
    getDependency("updateSettingsFromState"),
  );

  function buildEjectorSettingsImpl() {
    let sectionId = "ejector";
    let sectionName = "Ejector, Supply & Nanite";

    let resetFunction = function () {
      resetEjectorSettings(true);
      updateSettingsFromState();
      updateEjectorSettingsContent();

      resetCheckbox("autoEject", "autoSupply", "autoNanite");
      removeEjectToggles();
      removeSupplyToggles();
    };

    buildSettingsSection(
      sectionId,
      sectionName,
      resetFunction,
      updateEjectorSettingsContent,
    );
  }

  function updateEjectorSettingsContentImpl() {
    let currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;

    let currentNode = $("#script_ejectorContent");
    currentNode.empty().off("*");

    let spendOptions = [
      { val: "cap", label: "Capped", hint: "Use capped resources" },
      { val: "excess", label: "Excess", hint: "Use excess resources" },
      {
        val: "all",
        label: "All",
        hint: "Use all resources. This option can prevent script from progressing, and intended to use with additional conditions.",
      },
      {
        val: "mixed",
        label: "Capped > Excess",
        hint: "Use capped resources first, switching to excess resources when capped alone is not enough.",
      },
      {
        val: "full",
        label: "Capped > Excess > All",
        hint: "Use capped first, then excess, then everything else. Same as 'All' option can be potentialy dungerous.",
      },
    ];
    let spendDesc =
      "Configures threshold when script will be allowed to use resources. With any option script will try to use most expensive of allowed resources within selected group. Craftables, when enabled, always use excess amount as threshold, having no cap.";
    addSettingsSelect(
      currentNode,
      "ejectMode",
      "Eject mode",
      spendDesc,
      spendOptions,
    );
    addSettingsSelect(
      currentNode,
      "supplyMode",
      "Supply mode",
      spendDesc,
      spendOptions,
    );
    addSettingsSelect(
      currentNode,
      "naniteMode",
      "Nanite mode",
      spendDesc,
      spendOptions,
    );
    addSettingsToggle(
      currentNode,
      "prestigeWhiteholeStabiliseMass",
      "Stabilize blackhole",
      "Stabilizes the blackhole with exotic materials, disabled on whitehole runs",
    );
    addSettingsNumber(
      currentNode,
      "prestigeWhiteholeStabiliseCooldown",
      "Cooldown between stabilizes",
      "Waits this many seconds between stabilizes. Stabilizing too frequently may cause significant lag in late game due to frequent full page redraws. Set to 0 to disable cooldown.",
    );

    currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:20%">Resource</th>
              <th class="has-text-warning" style="width:20%">Atomic Mass</th>
              <th class="has-text-warning" style="width:10%">Eject</th>
              <th class="has-text-warning" style="width:10%">Nanite</th>
              <th class="has-text-warning" style="width:30%">Supply Value</th>
              <th class="has-text-warning" style="width:10%">Supply</th>
            </tr>
            <tbody id="script_ejectorTableBody"></tbody>
          </table>`);

    let tableBodyNode = $("#script_ejectorTableBody");
    let newTableBodyText = "";

    let tabResources = [];
    for (let id in resources) {
      let resource = resources[id];
      if (
        EjectManager.isConsumable(resource) ||
        SupplyManager.isConsumable(resource) ||
        NaniteManager.isConsumable(resource)
      ) {
        tabResources.push(resource);
        newTableBodyText += `<tr><td id="script_eject_${resource.id}" style="width:20%"></td><td style="width:20%"></td><td style="width:10%"></td><td style="width:10%"></td><td style="width:30%"></td><td style="width:10%"></td></tr>`;
      }
    }

    tableBodyNode.append($(newTableBodyText));

    for (let i = 0; i < tabResources.length; i++) {
      let resource = tabResources[i];
      let ejectElement = $("#script_eject_" + resource.id);

      let color =
        resource === resources.Elerium || resource === resources.Infernite
          ? "has-text-caution"
          : resource.isCraftable()
            ? "has-text-danger"
            : !resource.is.tradable
              ? "has-text-advanced"
              : "has-text-info";

      ejectElement.append(buildTableLabel(resource.name, "", color));
      ejectElement = ejectElement.next();

      if (resource.atomicMass > 0) {
        ejectElement.append(
          `<span class="mass"><span class="has-text-warning">${resource.atomicMass}</span> kt</span>`,
        );
      }
      ejectElement = ejectElement.next();

      if (EjectManager.isConsumable(resource)) {
        addTableToggle(ejectElement, "res_eject" + resource.id);
      }
      ejectElement = ejectElement.next();

      if (NaniteManager.isConsumable(resource)) {
        addTableToggle(ejectElement, "res_nanite" + resource.id);
      }

      if (SupplyManager.isConsumable(resource)) {
        ejectElement = ejectElement.next();
        ejectElement.append(
          `<span class="mass">Export <span class="has-text-caution">${SupplyManager.supplyOut(
            resource.id,
          )}</span>, Gain <span class="has-text-success">${SupplyManager.supplyIn(
            resource.id,
          )}</span></span>`,
        );

        ejectElement = ejectElement.next();
        addTableToggle(ejectElement, "res_supply" + resource.id);
      }
    }

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  function buildEjectorSettings(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("buildEjectorSettings") ?? buildEjectorSettingsImpl;
    return implementation.apply(this, args);
  }

  function updateEjectorSettingsContent(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("updateEjectorSettingsContent") ??
      updateEjectorSettingsContentImpl;
    return implementation.apply(this, args);
  }

  return { buildEjectorSettings, updateEjectorSettingsContent };
}
