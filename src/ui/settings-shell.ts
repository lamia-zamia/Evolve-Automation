type AnyRecord = Record<string, any>;
type AnyFunction = (...args: any[]) => any;

interface SettingsShellContext {
  $: AnyFunction & AnyRecord;
  document: AnyRecord;
  settingsRaw: AnyRecord;
  settings: AnyRecord;
  game: AnyRecord;
  buildPrestigeSettings: AnyFunction;
  buildGeneralSettings: AnyFunction;
  buildInterfaceSettings: AnyFunction;
  buildStateLogSettings: AnyFunction;
  buildAchievementGuardSettings: AnyFunction;
  buildChallengeHelperSettings: AnyFunction;
  buildGovernmentSettings: AnyFunction;
  buildEvolutionSettings: AnyFunction;
  buildPlanetSettings: AnyFunction;
  buildTraitSettings: AnyFunction;
  buildTriggerSettings: AnyFunction;
  buildResearchSettings: AnyFunction;
  buildWarSettings: AnyFunction;
  buildHellSettings: AnyFunction;
  buildMechSettings: AnyFunction;
  buildFleetSettings: AnyFunction;
  buildEjectorSettings: AnyFunction;
  buildMarketSettings: AnyFunction;
  buildStorageSettings: AnyFunction;
  buildMagicSettings: AnyFunction;
  buildProductionSettings: AnyFunction;
  buildJobSettings: AnyFunction;
  buildBuildingSettings: AnyFunction;
  buildWeightingSettings: AnyFunction;
  buildProjectSettings: AnyFunction;
  buildLoggingSettings: AnyFunction;
  filterBuildingSettingsTable: AnyFunction;
  updateSettingsFromState: AnyFunction;
  importSettings: AnyFunction;
  exportSettings: AnyFunction;
  triggerFileDownload: AnyFunction;
  confirm: AnyFunction;
}

interface SettingsShellDependencies {
  getContext: () => SettingsShellContext;
}

export function createSettingsShell({ getContext }: SettingsShellDependencies) {
  const liveObject = (key: keyof SettingsShellContext) =>
    new Proxy(
      {},
      {
        get(_target, property) {
          const current = getContext()[key] as AnyRecord;
          const value = current?.[property as keyof typeof current];
          return typeof value === "function" ? value.bind(current) : value;
        },
        set(_target, property, value) {
          (getContext()[key] as AnyRecord)[property as string] = value;
          return true;
        },
        deleteProperty(_target, property) {
          return delete (getContext()[key] as AnyRecord)[property as string];
        },
        ownKeys() {
          return Reflect.ownKeys((getContext()[key] as AnyRecord) ?? {});
        },
        getOwnPropertyDescriptor() {
          return { enumerable: true, configurable: true };
        },
      },
    ) as AnyRecord;
  const $ = new Proxy(function (this: any) {}, {
    apply(_target, _thisArg, args) {
      return getContext().$(...args);
    },
    get(_target, property) {
      const current = getContext().$;
      const value = current[property as keyof typeof current];
      return typeof value === "function" ? value.bind(current) : value;
    },
  }) as AnyFunction & AnyRecord;
  const document = liveObject("document");
  const settingsRaw = liveObject("settingsRaw");
  const settings = liveObject("settings");
  const game = liveObject("game");
  const buildPrestigeSettings: AnyFunction = (...args) =>
    getContext().buildPrestigeSettings(...args);
  const buildGeneralSettings: AnyFunction = (...args) =>
    getContext().buildGeneralSettings(...args);
  const buildInterfaceSettings: AnyFunction = (...args) =>
    getContext().buildInterfaceSettings(...args);
  const buildStateLogSettings: AnyFunction = (...args) =>
    getContext().buildStateLogSettings(...args);
  const buildAchievementGuardSettings: AnyFunction = (...args) =>
    getContext().buildAchievementGuardSettings(...args);
  const buildChallengeHelperSettings: AnyFunction = (...args) =>
    getContext().buildChallengeHelperSettings(...args);
  const buildGovernmentSettings: AnyFunction = (...args) =>
    getContext().buildGovernmentSettings(...args);
  const buildEvolutionSettings: AnyFunction = (...args) =>
    getContext().buildEvolutionSettings(...args);
  const buildPlanetSettings: AnyFunction = (...args) =>
    getContext().buildPlanetSettings(...args);
  const buildTraitSettings: AnyFunction = (...args) =>
    getContext().buildTraitSettings(...args);
  const buildTriggerSettings: AnyFunction = (...args) =>
    getContext().buildTriggerSettings(...args);
  const buildResearchSettings: AnyFunction = (...args) =>
    getContext().buildResearchSettings(...args);
  const buildWarSettings: AnyFunction = (...args) =>
    getContext().buildWarSettings(...args);
  const buildHellSettings: AnyFunction = (...args) =>
    getContext().buildHellSettings(...args);
  const buildMechSettings: AnyFunction = (...args) =>
    getContext().buildMechSettings(...args);
  const buildFleetSettings: AnyFunction = (...args) =>
    getContext().buildFleetSettings(...args);
  const buildEjectorSettings: AnyFunction = (...args) =>
    getContext().buildEjectorSettings(...args);
  const buildMarketSettings: AnyFunction = (...args) =>
    getContext().buildMarketSettings(...args);
  const buildStorageSettings: AnyFunction = (...args) =>
    getContext().buildStorageSettings(...args);
  const buildMagicSettings: AnyFunction = (...args) =>
    getContext().buildMagicSettings(...args);
  const buildProductionSettings: AnyFunction = (...args) =>
    getContext().buildProductionSettings(...args);
  const buildJobSettings: AnyFunction = (...args) =>
    getContext().buildJobSettings(...args);
  const buildBuildingSettings: AnyFunction = (...args) =>
    getContext().buildBuildingSettings(...args);
  const buildWeightingSettings: AnyFunction = (...args) =>
    getContext().buildWeightingSettings(...args);
  const buildProjectSettings: AnyFunction = (...args) =>
    getContext().buildProjectSettings(...args);
  const buildLoggingSettings: AnyFunction = (...args) =>
    getContext().buildLoggingSettings(...args);
  const filterBuildingSettingsTable: AnyFunction = (...args) =>
    getContext().filterBuildingSettingsTable(...args);
  const updateSettingsFromState: AnyFunction = (...args) =>
    getContext().updateSettingsFromState(...args);
  const importSettings: AnyFunction = (...args) =>
    getContext().importSettings(...args);
  const exportSettings: AnyFunction = (...args) =>
    getContext().exportSettings(...args);
  const triggerFileDownload: AnyFunction = (...args) =>
    getContext().triggerFileDownload(...args);
  const confirm: AnyFunction = (...args) => getContext().confirm(...args);
  function removeScriptSettings() {
    $("#script_settings").remove();
  }

  function buildScriptSettings() {
    // Don't initialize the settings tab until it's been opened
    if (game.global.settings.civTabs != 7) {
      return;
    }

    let currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;

    let scriptContentNode = $("#script_settings");
    if (scriptContentNode.length !== 0) {
      return;
    }

    scriptContentNode = $(
      '<div id="script_settings" style="margin-top: 30px;"></div>',
    );
    $(".settings").append(scriptContentNode);

    buildImportExport();
    buildPrestigeSettings(scriptContentNode, "");
    buildGeneralSettings();
    buildInterfaceSettings();
    buildStateLogSettings();
    buildAchievementGuardSettings();
    buildChallengeHelperSettings();
    buildGovernmentSettings(scriptContentNode, "");
    buildEvolutionSettings();
    buildPlanetSettings();
    buildTraitSettings();
    buildTriggerSettings();
    buildResearchSettings();
    buildWarSettings(scriptContentNode, "");
    buildHellSettings(scriptContentNode, "");
    buildMechSettings();
    buildFleetSettings(scriptContentNode, "");
    buildEjectorSettings();
    buildMarketSettings();
    buildStorageSettings();
    buildMagicSettings();
    buildProductionSettings();
    buildJobSettings();
    buildBuildingSettings();
    buildWeightingSettings();
    buildProjectSettings();
    buildLoggingSettings(scriptContentNode, "");

    let collapsibles = document.querySelectorAll(
      "#script_settings .script-collapsible",
    );
    for (let i = 0; i < collapsibles.length; i++) {
      collapsibles[i].addEventListener("click", function (this: any) {
        this.classList.toggle("script-contentactive");
        let content = this.nextElementSibling;
        if (content.style.display === "block") {
          settingsRaw[collapsibles[i].id] = true;
          content.style.display = "none";

          let search = content.getElementsByClassName("script-searchsettings");
          if (search.length > 0) {
            search[0].value = "";
            filterBuildingSettingsTable();
          }
        } else {
          settingsRaw[collapsibles[i].id] = false;
          content.style.display = "block";
        }

        updateSettingsFromState();
      });
    }

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  function buildImportExport() {
    let importExportBase = $(".importExport").last();
    if (importExportBase === null) {
      return;
    }

    if (document.getElementById("script_importExportButtons") !== null) {
      return;
    }

    let importExportNode = $(
      '<div id="script_importExportButtons" style="margin-top: 6px">',
    );
    importExportBase.after(importExportNode);

    importExportNode.append(
      ' <button id="script_settingsImport" class="button">Import Script Settings</button>',
    );

    $("#script_settingsImport").on("click", function (this: any) {
      const str = $("#importExport").val();
      if (str.length > 0) {
        if (importSettings(str)) {
          $("#importExport").val("");
        }
      }
    });

    importExportNode.append(
      ' <button id="script_settingsExport" class="button">Export Script Settings</button>',
    );

    $("#script_settingsExport").on("click", function (this: any) {
      $("#importExport").val(exportSettings());
      $("#importExport").select();
      document.execCommand("copy");
    });

    importExportNode.append(
      ' <button id="script_settingsFile" class="button">Script Settings as File</button>',
    );

    $("#script_settingsFile").on("click", function (this: any) {
      // This one is pretty printed since it's much easier to do when downloading
      let json = JSON.stringify(settingsRaw, undefined, 2);
      triggerFileDownload(json, settings.scriptSettingsExportFilename);
    });
  }

  function buildSettingsSectionImpl(
    parentNode,
    sectionId,
    sectionName,
    resetFunction,
    updateSettingsContentFunction,
  ) {
    const triggerID = `${sectionId}SettingsCollapsed`;
    const resetID = `script_reset${sectionId}`;
    const contentID = `script_${sectionId}Content`;

    const section = $(`
          <div id="script_${sectionId}Settings" style="margin-top: 10px;">
            <h3 id="${triggerID}" class="script-collapsible text-center has-text-success">${sectionName} Settings</h3>
            <div class="script-content">
              <div style="margin-top: 10px;"><button id="${resetID}" class="button">Reset ${sectionName} Settings</button></div>
              <div style="margin-top: 10px; margin-bottom: 10px;" id="${contentID}"></div>
            </div>
          </div>`);

    parentNode.append(section);

    if (!settingsRaw[sectionId + "SettingsCollapsed"]) {
      // The section is open initially - build it now
      updateSettingsContentFunction();

      let element = document.getElementById(triggerID);
      element.classList.toggle("script-contentactive");
      element.nextElementSibling.style.display = "block";
    } else {
      // The section is closed - build it only once it's open
      section.find(`> #${triggerID}`).on("click", () => {
        if (section.find(`#${contentID}`).is(":empty")) {
          updateSettingsContentFunction();
        }
      });
    }

    section
      .find(`#${resetID}`)
      .on("click", genericResetFunction.bind(null, resetFunction, sectionName));
  }

  function buildSettingsSection(
    sectionId,
    sectionName,
    resetFunction,
    updateSettingsContentFunction,
  ) {
    buildSettingsSectionImpl(
      $("#script_settings"),
      sectionId,
      sectionName,
      resetFunction,
      updateSettingsContentFunction,
    );
  }

  function buildSettingsSection2(
    parentNode,
    secondaryPrefix,
    sectionId,
    sectionName,
    resetFunction,
    updateSettingsContentFunction,
  ) {
    if (secondaryPrefix !== "") {
      parentNode.append(
        `<div style="margin-top: 10px; margin-bottom: 10px;" id="script_${
          secondaryPrefix + sectionId
        }Content"></div>`,
      );
      updateSettingsContentFunction(secondaryPrefix);
    } else {
      buildSettingsSectionImpl(
        parentNode,
        sectionId,
        sectionName,
        resetFunction,
        () => updateSettingsContentFunction(""),
      );
    }
  }

  function genericResetFunction(resetFunction, sectionName) {
    if (
      confirm("Are you sure you wish to reset " + sectionName + " Settings?")
    ) {
      resetFunction();
    }
  }

  function addStandardHeading(node, heading) {
    node.append(
      `<div style="margin-top: 5px; width: 600px; text-align: left;"><span class="has-text-danger" style="margin-left: 10px;">${heading}</span></div>`,
    );
  }

  function addSettingsHeader1(node, headerText) {
    node.append(
      `<div style="margin: 4px; width: 100%; display: inline-block; text-align: left;"><span class="has-text-success" style="font-weight: bold;">${headerText}</span></div>`,
    );
  }

  function addSettingsHeader2(node, headerText) {
    node.append(
      `<div style="margin: 2px; width: 90%; display: inline-block; text-align: left;"><span class="has-text-caution">${headerText}</span></div>`,
    );
  }

  return {
    removeScriptSettings,
    buildScriptSettings,
    buildImportExport,
    buildSettingsSectionImpl,
    buildSettingsSection,
    buildSettingsSection2,
    genericResetFunction,
    addStandardHeading,
    addSettingsHeader1,
    addSettingsHeader2,
  };
}
