type AnyRecord = Record<string, any>;
type AnyFunction = (...args: any[]) => any;

interface SettingsShellDependencies {
  $: AnyFunction & AnyRecord;
  getDocument: () => AnyRecord;
  getSettingsRaw: () => AnyRecord;
  getSettings: () => AnyRecord;
  getGame: () => AnyRecord;
  buildPrestigeSettings: AnyFunction;
  buildGeneralSettings: AnyFunction;
  buildInterfaceSettings: AnyFunction;
  buildStateLogSettings: AnyFunction;
  buildAchievementGuardSettings: AnyFunction;
  buildChallengeHelperSettings: AnyFunction;
  buildGovernmentSettings: AnyFunction;
  buildAuthoritySettings: AnyFunction;
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

export function createSettingsShell({
  $,
  getDocument,
  getSettingsRaw,
  getSettings,
  getGame,
  buildPrestigeSettings,
  buildGeneralSettings,
  buildInterfaceSettings,
  buildStateLogSettings,
  buildAchievementGuardSettings,
  buildChallengeHelperSettings,
  buildGovernmentSettings,
  buildAuthoritySettings,
  buildEvolutionSettings,
  buildPlanetSettings,
  buildTraitSettings,
  buildTriggerSettings,
  buildResearchSettings,
  buildWarSettings,
  buildHellSettings,
  buildMechSettings,
  buildFleetSettings,
  buildEjectorSettings,
  buildMarketSettings,
  buildStorageSettings,
  buildMagicSettings,
  buildProductionSettings,
  buildJobSettings,
  buildBuildingSettings,
  buildWeightingSettings,
  buildProjectSettings,
  buildLoggingSettings,
  filterBuildingSettingsTable,
  updateSettingsFromState,
  importSettings,
  exportSettings,
  triggerFileDownload,
  confirm,
}: SettingsShellDependencies) {
  function removeScriptSettings() {
    $("#script_settings").remove();
  }

  function buildScriptSettings() {
    // Don't initialize the settings tab until it's been opened
    if (getGame().global.settings.civTabs != 7) {
      return;
    }

    let currentScrollPosition =
      getDocument().documentElement.scrollTop || getDocument().body.scrollTop;

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
    buildAuthoritySettings();
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

    let collapsibles = getDocument().querySelectorAll(
      "#script_settings .script-collapsible",
    );
    for (let i = 0; i < collapsibles.length; i++) {
      collapsibles[i].addEventListener("click", function (this: any) {
        this.classList.toggle("script-contentactive");
        let content = this.nextElementSibling;
        if (content.style.display === "block") {
          getSettingsRaw()[collapsibles[i].id] = true;
          content.style.display = "none";

          let search = content.getElementsByClassName("script-searchsettings");
          if (search.length > 0) {
            search[0].value = "";
            filterBuildingSettingsTable();
          }
        } else {
          getSettingsRaw()[collapsibles[i].id] = false;
          content.style.display = "block";
        }

        updateSettingsFromState();
      });
    }

    getDocument().documentElement.scrollTop = getDocument().body.scrollTop =
      currentScrollPosition;
  }

  function buildImportExport() {
    let importExportBase = $(".importExport").last();
    if (importExportBase === null) {
      return;
    }

    if (getDocument().getElementById("script_importExportButtons") !== null) {
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
      getDocument().execCommand("copy");
    });

    importExportNode.append(
      ' <button id="script_settingsFile" class="button">Script Settings as File</button>',
    );

    $("#script_settingsFile").on("click", function (this: any) {
      // This one is pretty printed since it's much easier to do when downloading
      let json = JSON.stringify(getSettingsRaw(), undefined, 2);
      triggerFileDownload(json, getSettings().scriptSettingsExportFilename);
    });
  }

  function buildSettingsSectionImpl(
    parentNode: any,
    sectionId: any,
    sectionName: any,
    resetFunction: any,
    updateSettingsContentFunction: any,
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

    if (!getSettingsRaw()[sectionId + "SettingsCollapsed"]) {
      // The section is open initially - build it now
      updateSettingsContentFunction();

      let element = getDocument().getElementById(triggerID);
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
    sectionId: any,
    sectionName: any,
    resetFunction: any,
    updateSettingsContentFunction: any,
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
    parentNode: any,
    secondaryPrefix: any,
    sectionId: any,
    sectionName: any,
    resetFunction: any,
    updateSettingsContentFunction: any,
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

  function genericResetFunction(resetFunction: any, sectionName: any) {
    if (
      confirm("Are you sure you wish to reset " + sectionName + " Settings?")
    ) {
      resetFunction();
    }
  }

  function addStandardHeading(node: any, heading: any) {
    node.append(
      `<div style="margin-top: 5px; width: 600px; text-align: left;"><span class="has-text-danger" style="margin-left: 10px;">${heading}</span></div>`,
    );
  }

  function addSettingsHeader1(node: any, headerText: any) {
    node.append(
      `<div style="margin: 4px; width: 100%; display: inline-block; text-align: left;"><span class="has-text-success" style="font-weight: bold;">${headerText}</span></div>`,
    );
  }

  function addSettingsHeader2(node: any, headerText: any) {
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
