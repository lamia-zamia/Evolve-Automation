import { liveFunction, liveObject } from "./dependencies.ts";

type Loose = any;

interface StorageSettingsDependencies {
  getDependency: (name: string) => Loose;
  getOverride: (name: string) => Loose;
}

export function createStorageSettings({
  getDependency,
  getOverride,
}: StorageSettingsDependencies) {
  const $ = liveFunction(() => getDependency("$"));
  const StorageManager = liveObject(() => getDependency("StorageManager"));
  const addSettingsToggle = liveFunction(() =>
    getDependency("addSettingsToggle"),
  );
  const addTableInput = liveFunction(() => getDependency("addTableInput"));
  const addTableToggle = liveFunction(() => getDependency("addTableToggle"));
  const buildSettingsSection = liveFunction(() =>
    getDependency("buildSettingsSection"),
  );
  const buildTableLabel = liveFunction(() => getDependency("buildTableLabel"));
  const document = liveObject(() => getDependency("document"));
  const removeStorageToggles = liveFunction(() =>
    getDependency("removeStorageToggles"),
  );
  const resetCheckbox = liveFunction(() => getDependency("resetCheckbox"));
  const resetStorageSettings = liveFunction(() =>
    getDependency("resetStorageSettings"),
  );
  const settingsRaw = liveObject(() => getDependency("settingsRaw"));
  const sorterHelper = liveFunction(() => getDependency("sorterHelper"));
  const updateSettingsFromState = liveFunction(() =>
    getDependency("updateSettingsFromState"),
  );

  function buildStorageSettingsImpl() {
    let sectionId = "storage";
    let sectionName = "Storage";

    let resetFunction = function () {
      resetStorageSettings(true);
      updateSettingsFromState();
      updateStorageSettingsContent();

      resetCheckbox("autoStorage");
      removeStorageToggles();
    };

    buildSettingsSection(
      sectionId,
      sectionName,
      resetFunction,
      updateStorageSettingsContent,
    );
  }

  function updateStorageSettingsContentImpl() {
    let currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;

    let currentNode = $("#script_storageContent");
    currentNode.empty().off("*");

    addSettingsToggle(
      currentNode,
      "storageLimitPreMad",
      "Limit Pre-MAD Storage",
      "Saves resources and shortens run time by limiting storage pre-MAD",
    );
    addSettingsToggle(
      currentNode,
      "storageSafeReassign",
      "Reassign only empty storages",
      "Wait until storage is empty before reassigning containers to another resource, to prevent overflowing and wasting resources",
    );
    addSettingsToggle(
      currentNode,
      "storageAssignExtra",
      "Assign buffer storage",
      "Assigns 3% extra strorage above required amounts, ensuring that required quantity will be actually reached, even if other part of script trying to sell\\eject\\switch production, etc. When manual trades enabled applies additional adjust derieved from selling threshold.",
    );
    addSettingsToggle(
      currentNode,
      "storageAssignPart",
      "Assign partial storage",
      "When enabled script will be allowed to assign some crates and containers even if resulting storage space won't be enough to build new building. It allows to pre-build stock of resources for further use, but can be potentially dungerous.\nIf script not allowed to reassign non-empty storage it can lock storage in position when stored resources can't be used.\nIf script is allowed to reassign non-empty storage it might waste time producing materials which might need to be disposed.",
    );

    currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:35%">Resource</th>
              <th class="has-text-warning" style="width:15%">Enabled</th>
              <th class="has-text-warning" style="width:15%">Store Overflow</th>
              <th class="has-text-warning" style="width:15%">Min Storage</th>
              <th class="has-text-warning" style="width:15%">Max Storage</th>
              <th style="width:5%"></th>
            </tr>
            <tbody id="script_storageTableBody"></tbody>
          </table>`);

    let tableBodyNode = $("#script_storageTableBody");
    let newTableBodyText = "";

    for (let i = 0; i < StorageManager.priorityList.length; i++) {
      const resource = StorageManager.priorityList[i];
      newTableBodyText += `<tr value="${resource.id}" class="script-draggable"><td id="script_storage_${resource.id}" style="width:35%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:5%"><span class="script-lastcolumn"></span></td></tr>`;
    }
    tableBodyNode.append($(newTableBodyText));

    // Build all other storages settings rows
    for (let i = 0; i < StorageManager.priorityList.length; i++) {
      const resource = StorageManager.priorityList[i];
      let storageElement = $("#script_storage_" + resource.id);

      storageElement.append(buildTableLabel(resource.name));

      storageElement = storageElement.next();
      addTableToggle(storageElement, "res_storage" + resource.id);

      storageElement = storageElement.next();
      addTableToggle(storageElement, "res_storage_o_" + resource.id);

      storageElement = storageElement.next();
      addTableInput(storageElement, "res_min_store" + resource.id);

      storageElement = storageElement.next();
      addTableInput(storageElement, "res_max_store" + resource.id);
    }

    tableBodyNode.sortable({
      items: "tr:not(.unsortable)",
      helper: sorterHelper,
      update: function () {
        let storageIds = tableBodyNode.sortable("toArray", {
          attribute: "value",
        });
        for (let i = 0; i < storageIds.length; i++) {
          settingsRaw["res_storage_p_" + storageIds[i]] = i;
        }

        StorageManager.sortByPriority();
        updateSettingsFromState();
      },
    });

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  function buildStorageSettings(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("buildStorageSettings") ?? buildStorageSettingsImpl;
    return implementation.apply(this, args);
  }

  function updateStorageSettingsContent(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("updateStorageSettingsContent") ??
      updateStorageSettingsContentImpl;
    return implementation.apply(this, args);
  }

  return { buildStorageSettings, updateStorageSettingsContent };
}
