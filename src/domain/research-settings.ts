/** Immutable description of the Research settings panel. */
export interface ResearchSettingsOption {
  readonly val: string;
  readonly label: string;
  readonly hint: string;
}

export interface ResearchSettingsTechnology {
  readonly _vueBinding: string;
  readonly name: string;
}

export type ResearchSettingsTechnologyCatalog = Readonly<
  Record<string, ResearchSettingsTechnology>
>;

interface ResearchSettingsControlBase {
  readonly settingName: string;
  readonly label: string;
  readonly hint: string;
}

export type ResearchSettingsControl =
  | (ResearchSettingsControlBase & {
      readonly kind: "select";
      readonly options: readonly ResearchSettingsOption[];
    })
  | (ResearchSettingsControlBase & {
      readonly kind: "list";
      readonly list: ResearchSettingsTechnologyCatalog;
    });

export interface ResearchSettingsReadModel {
  readonly sectionId: "research";
  readonly sectionName: "Research";
  readonly controls: readonly ResearchSettingsControl[];
}

export interface ResearchSettingsReadModelInput {
  readonly localize: (key: string) => string;
  readonly technologies: ResearchSettingsTechnologyCatalog;
}

export type ResearchSettingsIntent = Readonly<{
  type: "reset-research-settings";
}>;

function freezeOption(option: ResearchSettingsOption): ResearchSettingsOption {
  return Object.freeze({ ...option });
}

function freezeTechnologyCatalog(
  technologies: ResearchSettingsTechnologyCatalog,
): ResearchSettingsTechnologyCatalog {
  const frozen: Record<string, ResearchSettingsTechnology> = {};
  for (const [key, technology] of Object.entries(technologies)) {
    frozen[key] = Object.freeze({ ...technology });
  }
  return Object.freeze(frozen);
}

/** Build the panel read model from validated localization and technology data. */
export function createResearchSettingsReadModel({
  localize,
  technologies,
}: ResearchSettingsReadModelInput): ResearchSettingsReadModel {
  const technologyCatalog = freezeTechnologyCatalog(technologies);
  const theologyOneOptions = Object.freeze([
    freezeOption({
      val: "auto",
      label: "Script Managed",
      hint: "Picks Anthropology for MAD prestige, and Fanaticism for others. Achieve-worthy combos are exception, on such runs Fanaticism will be always picked.",
    }),
    freezeOption({
      val: "tech-anthropology",
      label: localize("tech_anthropology"),
      hint: localize("tech_anthropology_effect"),
    }),
    freezeOption({
      val: "tech-fanaticism",
      label: localize("tech_fanaticism"),
      hint: localize("tech_fanaticism_effect"),
    }),
  ]);
  const theologyTwoOptions = Object.freeze([
    freezeOption({
      val: "auto",
      label: "Script Managed",
      hint: "Picks Deify for Ascension, Demonic Infusion, Apotheosis, AI Apocalypse, Terraform, Matrix, Retirement and Eden prestiges, or Study for others prestiges",
    }),
    freezeOption({
      val: "tech-study",
      label: localize("tech_study"),
      hint: localize("tech_study_desc"),
    }),
    freezeOption({
      val: "tech-deify",
      label: localize("tech_deify"),
      hint: localize("tech_deify_desc"),
    }),
  ]);

  return Object.freeze({
    sectionId: "research",
    sectionName: "Research",
    controls: Object.freeze([
      Object.freeze({
        kind: "select",
        settingName: "userResearchTheology_1",
        label: "Target Theology 1",
        hint: "Theology 1 technology to research, have no effect after getting Transcendence perk",
        options: theologyOneOptions,
      }),
      Object.freeze({
        kind: "select",
        settingName: "userResearchTheology_2",
        label: "Target Theology 2",
        hint: "Theology 2 technology to research",
        options: theologyTwoOptions,
      }),
      Object.freeze({
        kind: "list",
        settingName: "researchIgnore",
        label: "Ignored researches",
        hint: "Listed researches won't be purchased without manual input, or user defined trigger. On top of this list script will also ignore some other special techs, such as Limit Collider, Dark Energy Bomb, Exotic Infusion, etc.",
        list: technologyCatalog,
      }),
    ]),
  });
}
