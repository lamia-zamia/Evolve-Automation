import { liveFunction, liveObject } from "./dependencies.ts";

type Loose = any;

interface ResearchSettingsDependencies {
  getDependency: (name: string) => Loose;
  getOverride: (name: string) => Loose;
}

export function createResearchSettings({
  getDependency,
  getOverride,
}: ResearchSettingsDependencies) {
  const $ = liveFunction(() => getDependency("$"));
  const addSettingsList = liveFunction(() => getDependency("addSettingsList"));
  const addSettingsSelect = liveFunction(() =>
    getDependency("addSettingsSelect"),
  );
  const buildSettingsSection = liveFunction(() =>
    getDependency("buildSettingsSection"),
  );
  const document = liveObject(() => getDependency("document"));
  const game = liveObject(() => getDependency("game"));
  const resetCheckbox = liveFunction(() => getDependency("resetCheckbox"));
  const resetResearchSettings = liveFunction(() =>
    getDependency("resetResearchSettings"),
  );
  const techIds = liveObject(() => getDependency("techIds"));
  const updateSettingsFromState = liveFunction(() =>
    getDependency("updateSettingsFromState"),
  );

  function buildResearchSettingsImpl() {
    let sectionId = "research";
    let sectionName = "Research";

    let resetFunction = function () {
      resetResearchSettings(true);
      updateSettingsFromState();
      updateResearchSettingsContent();

      resetCheckbox("autoResearch");
    };

    buildSettingsSection(
      sectionId,
      sectionName,
      resetFunction,
      updateResearchSettingsContent,
    );
  }

  function updateResearchSettingsContentImpl() {
    let currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;

    let currentNode = $("#script_researchContent");
    currentNode.empty().off("*");

    // Theology 1
    let theology1Options = [
      {
        val: "auto",
        label: "Script Managed",
        hint: "Picks Anthropology for MAD prestige, and Fanaticism for others. Achieve-worthy combos are exception, on such runs Fanaticism will be always picked.",
      },
      {
        val: "tech-anthropology",
        label: game.loc("tech_anthropology"),
        hint: game.loc("tech_anthropology_effect"),
      },
      {
        val: "tech-fanaticism",
        label: game.loc("tech_fanaticism"),
        hint: game.loc("tech_fanaticism_effect"),
      },
    ];
    addSettingsSelect(
      currentNode,
      "userResearchTheology_1",
      "Target Theology 1",
      "Theology 1 technology to research, have no effect after getting Transcendence perk",
      theology1Options,
    );

    // Theology 2
    let theology2Options = [
      {
        val: "auto",
        label: "Script Managed",
        hint: "Picks Deify for Ascension, Demonic Infusion, Apotheosis, AI Apocalypse, Terraform, Matrix, Retirement and Eden prestiges, or Study for others prestiges",
      },
      {
        val: "tech-study",
        label: game.loc("tech_study"),
        hint: game.loc("tech_study_desc"),
      },
      {
        val: "tech-deify",
        label: game.loc("tech_deify"),
        hint: game.loc("tech_deify_desc"),
      },
    ];
    addSettingsSelect(
      currentNode,
      "userResearchTheology_2",
      "Target Theology 2",
      "Theology 2 technology to research",
      theology2Options,
    );

    addSettingsList(
      currentNode,
      "researchIgnore",
      "Ignored researches",
      "Listed researches won't be purchased without manual input, or user defined trigger. On top of this list script will also ignore some other special techs, such as Limit Collider, Dark Energy Bomb, Exotic Infusion, etc.",
      techIds,
    );

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  function buildResearchSettings(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("buildResearchSettings") ?? buildResearchSettingsImpl;
    return implementation.apply(this, args);
  }

  function updateResearchSettingsContent(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("updateResearchSettingsContent") ??
      updateResearchSettingsContentImpl;
    return implementation.apply(this, args);
  }

  return { buildResearchSettings, updateResearchSettingsContent };
}
