/**
 * The settings tab shell: the script's settings container, the import/export buttons, and the
 * collapsible section and heading builders every settings adapter renders into.
 *
 * TRANSITIONAL: the node and document surfaces below are the game's jQuery and DOM today. They are
 * declared as narrow structural types so replacing that surface is a local change.
 */

/** The single node operation the section and heading builders need from their caller. */
interface AppendableNode {
  append(content: unknown): unknown;
}

/** The jQuery node surface this shell drives itself. */
interface ShellNode {
  after(content: ShellNode): ShellNode;
  append(content: unknown): ShellNode;
  find(selector: string): ShellNode;
  is(selector: string): boolean;
  last(): ShellNode;
  readonly length: number;
  on(events: string, handler: () => void): ShellNode;
  remove(): ShellNode;
  select(): ShellNode;
  val(): string;
  val(value: string): ShellNode;
}

type ShellJQuery = (selector: string) => ShellNode;

/** The search box a building-settings section clears when it collapses. */
interface SearchInput {
  value: string;
}

/** The `.script-content` div that follows a collapsible heading. */
interface SectionContent {
  readonly style: { display: string };
  getElementsByClassName(className: string): Iterable<SearchInput>;
}

/** A `.script-collapsible` heading, whose id is also its collapsed-state setting name. */
interface SectionHeading {
  readonly id: string;
  readonly classList: { toggle(className: string): void };
  readonly nextElementSibling: SectionContent;
  addEventListener(type: string, listener: () => void): void;
}

interface ShellDocument {
  readonly documentElement: { scrollTop: number };
  readonly body: { scrollTop: number };
  querySelectorAll(selector: string): Iterable<SectionHeading>;
  getElementById(id: string): SectionHeading | null;
  execCommand(command: string): boolean;
}

/** A settings section that renders itself into the script settings container. */
type SectionBuilder = () => void;

/**
 * A settings section that can also render into another parent under a prefix, so the same content
 * appears both as its own section and inside a larger one.
 */
type PrefixedSectionBuilder = (
  parentNode: AppendableNode,
  secondaryPrefix: string,
) => void;

interface ShellGame {
  readonly global: { readonly settings: { readonly civTabs: number } };
}

interface SettingsShellDependencies {
  readonly $: ShellJQuery;
  readonly getDocument: () => ShellDocument;
  readonly getSettingsRaw: () => Record<string, unknown>;
  readonly getSettings: () => { readonly scriptSettingsExportFilename: string };
  readonly getGame: () => ShellGame;
  readonly buildPrestigeSettings: PrefixedSectionBuilder;
  readonly buildGeneralSettings: SectionBuilder;
  readonly buildInterfaceSettings: SectionBuilder;
  readonly buildStateLogSettings: SectionBuilder;
  readonly buildAchievementGuardSettings: SectionBuilder;
  readonly buildChallengeHelperSettings: SectionBuilder;
  readonly buildGovernmentSettings: PrefixedSectionBuilder;
  readonly buildAuthoritySettings: SectionBuilder;
  readonly buildEvolutionSettings: SectionBuilder;
  readonly buildPlanetSettings: SectionBuilder;
  readonly buildTraitSettings: SectionBuilder;
  readonly buildTriggerSettings: SectionBuilder;
  readonly buildResearchSettings: SectionBuilder;
  readonly buildWarSettings: PrefixedSectionBuilder;
  readonly buildHellSettings: PrefixedSectionBuilder;
  readonly buildMechSettings: SectionBuilder;
  readonly buildFleetSettings: PrefixedSectionBuilder;
  readonly buildEjectorSettings: SectionBuilder;
  readonly buildMarketSettings: SectionBuilder;
  readonly buildStorageSettings: SectionBuilder;
  readonly buildMagicSettings: SectionBuilder;
  readonly buildProductionSettings: SectionBuilder;
  readonly buildJobSettings: SectionBuilder;
  readonly buildBuildingSettings: SectionBuilder;
  readonly buildWeightingSettings: SectionBuilder;
  readonly buildProjectSettings: SectionBuilder;
  readonly buildLoggingSettings: PrefixedSectionBuilder;
  readonly filterBuildingSettingsTable: () => void;
  readonly updateSettingsFromState: () => void;
  readonly importSettings: (serialized: string) => boolean;
  readonly exportSettings: () => string;
  readonly triggerFileDownload: (content: string, filename: string) => void;
  readonly confirm: (message: string) => boolean;
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
    if (getGame().global.settings.civTabs !== 7) {
      return;
    }

    if ($("#script_settings").length !== 0) {
      return;
    }

    const currentScrollPosition =
      getDocument().documentElement.scrollTop || getDocument().body.scrollTop;

    const scriptContentNode = $(
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

    const collapsibles = getDocument().querySelectorAll(
      "#script_settings .script-collapsible",
    );
    for (const collapsible of collapsibles) {
      collapsible.addEventListener("click", () => {
        collapsible.classList.toggle("script-contentactive");
        const content = collapsible.nextElementSibling;
        if (content.style.display === "block") {
          getSettingsRaw()[collapsible.id] = true;
          content.style.display = "none";

          const [search] = content.getElementsByClassName(
            "script-searchsettings",
          );
          if (search !== undefined) {
            search.value = "";
            filterBuildingSettingsTable();
          }
        } else {
          getSettingsRaw()[collapsible.id] = false;
          content.style.display = "block";
        }

        updateSettingsFromState();
      });
    }

    getDocument().documentElement.scrollTop = getDocument().body.scrollTop =
      currentScrollPosition;
  }

  function buildImportExport() {
    const importExportBase = $(".importExport").last();
    if (importExportBase.length === 0) {
      return;
    }

    if (getDocument().getElementById("script_importExportButtons") !== null) {
      return;
    }

    const importExportNode = $(
      '<div id="script_importExportButtons" style="margin-top: 6px">',
    );
    importExportBase.after(importExportNode);

    importExportNode.append(
      ' <button id="script_settingsImport" class="button">Import Script Settings</button>',
    );

    $("#script_settingsImport").on("click", () => {
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

    $("#script_settingsExport").on("click", () => {
      $("#importExport").val(exportSettings());
      $("#importExport").select();
      getDocument().execCommand("copy");
    });

    importExportNode.append(
      ' <button id="script_settingsFile" class="button">Script Settings as File</button>',
    );

    $("#script_settingsFile").on("click", () => {
      // This one is pretty printed since it's much easier to do when downloading
      const json = JSON.stringify(getSettingsRaw(), undefined, 2);
      triggerFileDownload(json, getSettings().scriptSettingsExportFilename);
    });
  }

  function buildSettingsSectionImpl(
    parentNode: AppendableNode,
    sectionId: string,
    sectionName: string,
    resetFunction: () => void,
    updateSettingsContentFunction: () => void,
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

    if (!getSettingsRaw()[triggerID]) {
      // The section is open initially - build it now
      updateSettingsContentFunction();

      // The heading was just appended, so it is missing only when the parent is detached.
      const element = getDocument().getElementById(triggerID);
      if (element !== null) {
        element.classList.toggle("script-contentactive");
        element.nextElementSibling.style.display = "block";
      }
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
      .on("click", () => genericResetFunction(resetFunction, sectionName));
  }

  function buildSettingsSection(
    sectionId: string,
    sectionName: string,
    resetFunction: () => void,
    updateSettingsContentFunction: () => void,
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
    parentNode: AppendableNode,
    secondaryPrefix: string,
    sectionId: string,
    sectionName: string,
    resetFunction: () => void,
    updateSettingsContentFunction: (secondaryPrefix: string) => void,
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

  function genericResetFunction(
    resetFunction: () => void,
    sectionName: string,
  ) {
    if (
      confirm("Are you sure you wish to reset " + sectionName + " Settings?")
    ) {
      resetFunction();
    }
  }

  function addStandardHeading(node: AppendableNode, heading: string) {
    node.append(
      `<div style="margin-top: 5px; width: 600px; text-align: left;"><span class="has-text-danger" style="margin-left: 10px;">${heading}</span></div>`,
    );
  }

  function addSettingsHeader1(node: AppendableNode, headerText: string) {
    node.append(
      `<div style="margin: 4px; width: 100%; display: inline-block; text-align: left;"><span class="has-text-success" style="font-weight: bold;">${headerText}</span></div>`,
    );
  }

  function addSettingsHeader2(node: AppendableNode, headerText: string) {
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
