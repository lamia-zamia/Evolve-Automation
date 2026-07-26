/** Immutable description of the Production settings panel. */
export interface ProductionSettingsSelectOption {
  readonly val: string;
  readonly label: string;
  readonly hint: string;
}

export type ProductionSettingsControl =
  | Readonly<{
      kind: "toggle";
      settingName: string;
      label: string;
      hint: string;
    }>
  | Readonly<{
      kind: "number";
      settingName: string;
      label: string;
      hint: string;
    }>
  | Readonly<{
      kind: "select";
      settingName: string;
      label: string;
      hint: string;
      options: readonly ProductionSettingsSelectOption[];
    }>;

export interface ProductionSettingsRow {
  readonly id: string;
  readonly label: string;
}

export interface ProductionSettingsFoundryRow extends ProductionSettingsRow {
  readonly managed: boolean;
}

export interface ProductionSettingsReadModel {
  readonly sectionId: "production";
  readonly sectionName: "Production";
  readonly controls: readonly ProductionSettingsControl[];
  readonly smelterFuels: readonly ProductionSettingsRow[];
  readonly foundryRows: readonly ProductionSettingsFoundryRow[];
  readonly factoryRows: readonly ProductionSettingsRow[];
  readonly miningDroidRows: readonly ProductionSettingsRow[];
  readonly replicatorRows: readonly ProductionSettingsRow[];
}

export type ProductionSettingsIntent =
  | Readonly<{ type: "reset-production-settings" }>
  | Readonly<{ type: "reorder-smelter-fuels"; fuelIds: readonly string[] }>;

function freezeControl(
  control: ProductionSettingsControl,
): ProductionSettingsControl {
  return Object.freeze({
    ...control,
    ...(control.kind === "select"
      ? {
          options: Object.freeze(
            control.options.map((option) => Object.freeze({ ...option })),
          ),
        }
      : {}),
  });
}

const productionSettingsControls = [
  {
    kind: "number",
    settingName: "productionChrysotileWeight",
    label: "Chrysotile weighting (Quarry, Smoldering)",
    hint: "Chrysotile weighting for autoQuarry, applies after adjusting to difference between current amounts of Stone and Chrysotile",
  },
  {
    kind: "number",
    settingName: "productionAdamantiteWeight",
    label: "Adamantite weighting (Mine, The True Path)",
    hint: "Adamantite weighting for autoMine, applies after adjusting to difference between current amounts of Aluminium and Adamantite",
  },
  {
    kind: "number",
    settingName: "productionExtWeight_common",
    label: "Aluminium weighting (Extractor Ship, The True Path)",
    hint: "Aluminium weighting for autoExtractor, applies after adjusting to difference between current amounts of Iron and Aluminium",
  },
  {
    kind: "number",
    settingName: "productionExtWeight_uncommon",
    label: "Neutronium weighting (Extractor Ship, The True Path)",
    hint: "Neutronium weighting for autoExtractor, applies after adjusting to difference between current amounts of Iridium and Neutronium",
  },
  {
    kind: "number",
    settingName: "productionExtWeight_rare",
    label: "Elerium weighting (Extractor Ship, The True Path)",
    hint: "Elerium weighting for autoExtractor, applies after adjusting to difference between current amounts of Orichalcum and Elerium",
  },
  {
    kind: "toggle",
    settingName: "productionFactoryFocusMaterials",
    label: "Prioritize keeping materials stockpiled",
    hint: "",
  },
  {
    kind: "select",
    settingName: "productionSmelting",
    label: "Smelters production",
    hint: "Distribution of smelters between iron and steel",
    options: [
      {
        val: "iron",
        label: "Prioritize Iron",
        hint: "Produce only Iron, untill storage capped, and switch to Steel after that",
      },
      {
        val: "steel",
        label: "Prioritize Steel",
        hint: "Produce as much Steel as possible, untill storage capped, and switch to Iron after that",
      },
      {
        val: "storage",
        label: "Up to full storages",
        hint: "Produce both Iron and Steel at ratio which will fill both storages at same time for both",
      },
      {
        val: "required",
        label: "Up to required amounts",
        hint: "Produce both Iron and Steel at ratio which will produce maximum amount of resources required for buildings at same time for both",
      },
    ],
  },
  {
    kind: "number",
    settingName: "productionSmeltingIridium",
    label: "Iridium ratio",
    hint: "Share of smelters dedicated to Iridium",
  },
  {
    kind: "select",
    settingName: "productionFoundryWeighting",
    label: "Weightings adjustments",
    hint: "Configures how exactly craftables will be weighted against each other",
    options: [
      {
        val: "none",
        label: "None",
        hint: "Use configured weightings with no additional adjustments, craftables with x2 weighting will be crafted two times more intense than with x1, etc.",
      },
      {
        val: "demanded",
        label: "Prioritize demanded",
        hint: "Ignore craftables once stored amount surpass cost of most expensive building, until all missing resources will be crafted. After that works as with 'none' adjustments.",
      },
      {
        val: "buildings",
        label: "Buildings weightings",
        hint: "Uses weightings of buildings which are waiting for craftables, as multipliers to craftables weighting. This option requires autoBuild.",
      },
    ],
  },
  {
    kind: "select",
    settingName: "productionCraftsmen",
    label: "Assign craftsmen",
    hint: "Configures when workers should be assigned to crafting jobs",
    options: [
      { val: "always", label: "Always", hint: "Always assign all craftsmens" },
      {
        val: "nocraft",
        label: "No Manual Crafting",
        hint: "Assign workers only manual crafting is not possible, servants still always will be assigned",
      },
      {
        val: "advanced",
        label: "Advanced",
        hint: "Assign workers only to advanced craftables(Scarletite, Quantium), basic craftables will be crafted by servants",
      },
      { val: "servants", label: "Servants", hint: "Assign only servants" },
    ],
  },
  {
    kind: "select",
    settingName: "productionFactoryWeighting",
    label: "Weightings adjustments",
    hint: "Configures how exactly the resources will be weighted against each other",
    options: [
      {
        val: "none",
        label: "None",
        hint: "Use configured weightings with no additional adjustments, resources with x2 weighting will be produced two times more intense than with x1, etc.",
      },
      {
        val: "demanded",
        label: "Prioritize demanded",
        hint: "Ignore resources once stored amount surpass cost of most expensive building, until all missing resources will be crafted. After that works as with 'none' adjustments.",
      },
      {
        val: "buildings",
        label: "Buildings weightings",
        hint: "Uses weightings of buildings which are waiting for resources, as multipliers to production weighting. This option requires autoBuild.",
      },
    ],
  },
  {
    kind: "number",
    settingName: "productionFactoryMinIngredients",
    label: "Minimum materials to preserve",
    hint: "Factory will craft resources only when all required materials above given ratio",
  },
  {
    kind: "toggle",
    settingName: "replicatorAssignGovernorTask",
    label: "Assign governor task",
    hint: "If active, the replicator scheduler governor task will be set, the power adjustment will be enabled.",
  },
  {
    kind: "select",
    settingName: "replicatorWeightingMode",
    label: "Weighting mode",
    hint: "Replicator only picks from enabled resources with the current highest valid priority (or -1 priority). After that, replicator use is split between resources of identical weighting. Setting configures how that split happens.",
    options: [
      {
        val: "mass",
        label: "By atomic mass",
        hint: "Spends more time on resources that are easy to replicate. A resource with 2x the weighting will have roughly 2x the time spent. Based on differences in atomic mass, resources at similar weightings may have very different quantities.",
      },
      {
        val: "quantity",
        label: "By resource quantity",
        hint: "Spends more time on resources that are hard to replicate. A resource with 2x the weighting will be focused until you have roughly 2x the amount. Resources at similar weightings will have similar quantities.",
      },
      {
        val: "legacy",
        label: "Legacy (deprecated)",
        hint: "Legacy mode, similar to previous script behavior. Only the resource with the lowest weighting is picked. If multiple resources have the same weighting then it will focus exclusively on one of those resources. This mode exists only to give you time to migrate your config to using the priority field.",
      },
    ],
  },
] satisfies readonly ProductionSettingsControl[];

export function createProductionSettingsReadModel({
  consumptionBalanceTarget,
  smelterFuels,
  foundryRows,
  factoryRows,
  miningDroidRows,
  replicatorRows,
}: {
  readonly consumptionBalanceTarget: number;
  readonly smelterFuels: readonly ProductionSettingsRow[];
  readonly foundryRows: readonly ProductionSettingsFoundryRow[];
  readonly factoryRows: readonly ProductionSettingsRow[];
  readonly miningDroidRows: readonly ProductionSettingsRow[];
  readonly replicatorRows: readonly ProductionSettingsRow[];
}): ProductionSettingsReadModel {
  const controls = productionSettingsControls.map((control) =>
    control.settingName === "productionFactoryFocusMaterials"
      ? {
          ...control,
          hint: `Aggressively request stockpiling ${consumptionBalanceTarget}s + min materials worth of materials to ensure factory and craftsmen can always produce`,
        }
      : control,
  );
  return Object.freeze({
    sectionId: "production",
    sectionName: "Production",
    controls: Object.freeze(controls.map(freezeControl)),
    smelterFuels: Object.freeze(
      smelterFuels.map((row) => Object.freeze({ ...row })),
    ),
    foundryRows: Object.freeze(
      foundryRows.map((row) => Object.freeze({ ...row })),
    ),
    factoryRows: Object.freeze(
      factoryRows.map((row) => Object.freeze({ ...row })),
    ),
    miningDroidRows: Object.freeze(
      miningDroidRows.map((row) => Object.freeze({ ...row })),
    ),
    replicatorRows: Object.freeze(
      replicatorRows.map((row) => Object.freeze({ ...row })),
    ),
  });
}
