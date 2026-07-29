import {
  createTraitSettingsReadModel,
  type TraitSettingsReadModel,
  type TraitSettingsControl,
  type TraitSettingsMutableRow,
  type TraitSettingsSelectOption,
} from "../../../domain/traits/trait-settings.ts";
import {
  requireFunction,
  requireNumber,
  requireRecord,
  requireString,
  type UnknownRecord,
} from "../../validation.ts";

interface TraitSettingsEvolveDependencies {
  readonly getSettingsRaw: () => unknown;
  readonly getState: () => unknown;
  readonly getGame: () => unknown;
  readonly getRaces: () => unknown;
  readonly getResources: () => unknown;
  readonly getPoly: () => unknown;
  readonly getMinorTraitManager: () => unknown;
  readonly getMutableTraitManager: () => unknown;
  readonly getOcularPowerData: () => unknown;
  readonly getWishData: () => unknown;
  readonly getMutationCostMultipliers: () => unknown;
}

export interface TraitSettingsEvolveAdapter {
  readTraitSettingsReadModel(): TraitSettingsReadModel;
  clearEvolutionTarget(): void;
  reorderMinorTraits(traitIds: readonly string[]): void;
  reorderMutableTraits(traitIds: readonly string[]): void;
  setBoolean(settingName: string, value: boolean): void;
}

function callLocalization(
  game: UnknownRecord,
  key: string,
  args: unknown[] = [],
): string {
  return requireString(
    Reflect.apply(requireFunction(game["loc"], "game.loc"), game, [
      key,
      ...args,
    ]),
    `game.loc(${key})`,
  );
}

function readOptions(value: unknown, path: string): readonly UnknownRecord[] {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`);
  return value.map((item, index) => requireRecord(item, `${path}[${index}]`));
}

function option(
  val: string,
  label: string,
  hint = "",
): TraitSettingsSelectOption {
  return { val, label, hint };
}

export function createTraitSettingsEvolveAdapter({
  getSettingsRaw,
  getState,
  getGame,
  getRaces,
  getResources,
  getPoly,
  getMinorTraitManager,
  getMutableTraitManager,
  getOcularPowerData,
  getWishData,
  getMutationCostMultipliers,
}: TraitSettingsEvolveDependencies): TraitSettingsEvolveAdapter {
  function readTraitSettingsReadModel(): TraitSettingsReadModel {
    const settingsRaw = requireRecord(getSettingsRaw(), "settingsRaw");
    const game = requireRecord(getGame(), "game");
    const gameRaces = requireRecord(game["races"], "game.races");
    const races = requireRecord(getRaces(), "races");
    const resources = requireRecord(getResources(), "resources");
    const poly = requireRecord(getPoly(), "poly");
    const synth = requireRecord(
      requireRecord(game["global"], "game.global")["stats"],
      "game.global.stats",
    );
    const synthRaces = requireRecord(synth["synth"], "game.global.stats.synth");

    const genusTypes = [
      ...new Set(
        Object.values(gameRaces).flatMap((rawRace, index) => {
          const race = requireRecord(rawRace, `game.races[${index}]`);
          const type = race["type"];
          // Evolve retains placeholder race entries without a type; legacy UI code ignored them.
          return typeof type === "string" && type.length > 0 ? [type] : [];
        }),
      ),
    ].filter((type) => type !== "organism" && type !== "synthetic");
    const genusOptions = [
      option("ignore", "Ignore", "Do not shift genus"),
      option("none", callLocalization(game, "genelab_genus_none")),
      ...genusTypes.map((type) =>
        option(type, callLocalization(game, `genelab_genus_${type}`)),
      ),
    ];

    const imitateOptions = [
      option(
        "ignore",
        "Ignore",
        "Do not imitate race. IMPORTANT: script will stall at evolution if none selected",
      ),
      ...Object.entries(races).map(([id, rawRace]) => {
        const race = requireRecord(rawRace, `races.${id}`);
        const raceId = requireString(race["id"], `races.${id}.id`);
        const completed = Boolean(synthRaces[raceId]);
        return option(
          raceId,
          completed
            ? requireString(race["name"], `races.${id}.name`)
            : `--${requireString(race["name"], `races.${id}.name`)}--`,
          requireString(race["desc"], `races.${id}.desc`),
        );
      }),
    ];

    const psychicOptions = [
      option("none", "Ignore", "Psychic Powers ignored by script"),
      option(
        "auto",
        "Script Managed",
        "Performs one of available actions in this order: Capture, Mind Break, Boost Profits, Boost Resource, Boost Attack Power.",
      ),
      ...["boost", "murder", "assault", "profit", "stun", "mind_break"].map(
        (id) =>
          option(
            id,
            callLocalization(game, `psychic_${id}_title`),
            callLocalization(game, `psychic_${id}_desc`),
          ),
      ),
    ];
    const psychicBoostOptions = [
      option(
        "auto",
        "Script Managed",
        "Resource selected by looking for highest income among ones having enough free storage room.",
      ),
      ...Object.entries(resources).flatMap(([key, rawResource]) => {
        const resource = requireRecord(rawResource, `resources.${key}`);
        const atomicMass = requireNumber(
          resource["atomicMass"],
          `resources.${key}.atomicMass`,
        );
        return atomicMass > 0
          ? [
              option(
                requireString(resource["id"], `resources.${key}.id`),
                requireString(resource["title"], `resources.${key}.title`),
              ),
            ]
          : [];
      }),
    ];

    const polyLoc = requireFunction(poly["loc"], "poly.loc");
    const readWishes = (key: "minor" | "major") =>
      readOptions(
        requireRecord(getWishData(), "wishData")[key],
        `wishData.${key}`,
      ).map((wish, index) => {
        const id = requireString(wish["id"], `wishData.${key}[${index}].id`);
        const loc = requireString(wish["loc"], `wishData.${key}[${index}].loc`);
        const label = Reflect.apply(polyLoc, poly, [
          "wish_for",
          [Reflect.apply(polyLoc, poly, [loc])],
        ]);
        return option(
          id,
          requireString(label, `poly.loc(wishData.${key}[${index}])`),
        );
      });

    const ocularRows = readOptions(getOcularPowerData(), "ocularPowerData").map(
      (power, index) => {
        const id = requireString(power["id"], `ocularPowerData[${index}].id`);
        const locParam = power["locParam"];
        return {
          id,
          label: callLocalization(game, `ocular_${id}`),
          hint: callLocalization(
            game,
            `ocular_${id}_desc`,
            locParam === undefined ? [] : [locParam],
          ),
        };
      },
    );

    const minorRows = readOptions(
      requireRecord(getMinorTraitManager(), "MinorTraitManager")[
        "priorityList"
      ],
      "MinorTraitManager.priorityList",
    ).map((trait, index) => {
      const id = requireString(
        trait["traitName"],
        `MinorTraitManager.priorityList[${index}].traitName`,
      );
      return {
        id,
        label: callLocalization(game, `trait_${id}_name`),
        hint: callLocalization(game, `trait_${id}`),
      };
    });

    const multipliers = requireRecord(
      getMutationCostMultipliers(),
      "mutationCostMultipliers",
    );
    const custom = requireRecord(
      multipliers["custom"],
      "mutationCostMultipliers.custom",
    );
    const negRollTraits = requireRecord(poly, "poly")["neg_roll_traits"];
    if (!Array.isArray(negRollTraits))
      throw new TypeError("poly.neg_roll_traits must be an array");
    const mutableRows: TraitSettingsMutableRow[] = readOptions(
      requireRecord(getMutableTraitManager(), "MutableTraitManager")[
        "priorityList"
      ],
      "MutableTraitManager.priorityList",
    ).map((trait, index) => {
      const id = requireString(
        trait["traitName"],
        `MutableTraitManager.priorityList[${index}].traitName`,
      );
      const source = requireString(
        trait["source"],
        `MutableTraitManager.priorityList[${index}].source`,
      );
      const type = requireString(
        trait["type"],
        `MutableTraitManager.priorityList[${index}].type`,
      );
      const baseCost = requireNumber(
        trait["baseCost"],
        `MutableTraitManager.priorityList[${index}].baseCost`,
      );
      const isPositive = Boolean(trait["isPositive"]);
      const gainable = Boolean(
        Reflect.apply(
          requireFunction(
            trait["isGainable"],
            `MutableTraitManager.priorityList[${index}].isGainable`,
          ),
          trait,
          [],
        ),
      );
      const sourceLabel =
        source === ""
          ? "-"
          : callLocalization(
              game,
              `${type === "major" ? "race_" : "genelab_genus_"}${source}`,
            );
      return {
        id,
        sourceLabel,
        sourceHint: type === "major" ? "Major" : "Genus",
        sourceColor: type === "genus" ? "has-text-special" : "has-text",
        traitLabel: requireString(
          trait["name"],
          `MutableTraitManager.priorityList[${index}].name`,
        ),
        traitHint: callLocalization(game, `trait_${id}`),
        traitColor: isPositive ? "has-text-success" : "has-text-danger",
        costLabel: `${baseCost * 5}`,
        costHint: `${baseCost * 5 * requireNumber(custom["gain"], "mutationCostMultipliers.custom.gain")} for Custom${id !== "ooze" ? " and Sludge" : ""}`,
        gainable,
        resettable: negRollTraits.includes(id),
      };
    });

    const controls: TraitSettingsControl[] = [
      {
        kind: "select",
        settingName: "shifterGenus",
        label: "Mimic genus",
        hint: "Mimic selected genus, if avaialble. If you want to add some conditional overrides to this setting, keep in mind changing genus redraws game page, frequent changes can drastically harm game performance.",
        options: genusOptions,
      },
      {
        kind: "select",
        settingName: "imitateRace",
        label: "Imitate race",
        hint: "Imitate selected race, if available.",
        options: imitateOptions,
      },
      {
        kind: "select",
        settingName: "buildingShrineType",
        label: "Magnificent shrine",
        hint: "Auto Build shrines only at moons of chosen shrine",
        options: [
          option(
            "any",
            "Any",
            "Build any Shrines, whenever have resources for it",
          ),
          option("equally", "Equally", "Build all Shrines equally"),
          option("morale", "Morale", "Build only Morale Shrines"),
          option("metal", "Metal", "Build only Metal Shrines"),
          option("know", "Knowledge", "Build only Knowledge Shrines"),
          option("tax", "Tax", "Build only Tax Shrines"),
          option(
            "rotating",
            "Rotating",
            "Build Shrines during quarter/full phases for rotating effect shrines",
          ),
        ],
      },
      {
        kind: "number",
        settingName: "slaveIncome",
        label: "Minimum income to buy slave",
        hint: "Script will use Slave Market only when money is capped, or have income above given number",
      },
      {
        kind: "select",
        settingName: "psychicPower",
        label: "Psychic Powers",
        hint: "Activates selected power with full energy. 10 murders required to research advanced powers will be performed automatically, if needed.",
        options: psychicOptions,
      },
      {
        kind: "select",
        settingName: "psychicBoostRes",
        label: "Boosted Resource",
        hint: "Resource for Boost Resource Production psychic power.",
        options: psychicBoostOptions,
      },
      {
        kind: "select",
        settingName: "wishMinor",
        label: "Minor Wish",
        hint: "Uses this minor wish when available.",
        options: [
          option("none", "None", "Disable using minor wishes."),
          ...readWishes("minor"),
        ],
      },
      {
        kind: "select",
        settingName: "wishMajor",
        label: "Major Wish",
        hint: "Uses this major wish when available.",
        options: [
          option("none", "None", "Disable using major wishes."),
          ...readWishes("major"),
        ],
      },
      {
        kind: "toggle",
        settingName: "jobScalePop",
        label: "High Pop job scale",
        hint: "Auto Job will automatically scaly breakpoints to match population increase",
      },
      {
        kind: "select",
        settingName: "geneticsSequence",
        label: "Sequencer",
        hint: "Manages genome decoding, and mutations",
        options: [
          option(
            "none",
            "Ignore",
            "Ignored by script, managed by game and player",
          ),
          option("enabled", "Enable", "Sequencer enabled"),
          option("disabled", "Disable", "Sequencer disabled"),
          option(
            "decode",
            "Decode",
            "Decode genome only, with no further mutations",
          ),
        ],
      },
      {
        kind: "select",
        settingName: "geneticsBoost",
        label: "Sequence Booster",
        hint: "Manages sequencer booster",
        options: [
          option(
            "none",
            "Ignore",
            "Ignored by script, managed by game and player",
          ),
          option("enabled", "Enable", "Booster enabled"),
          option("disabled", "Disable", "Booster disabled"),
        ],
      },
      {
        kind: "select",
        settingName: "geneticsAssemble",
        label: "Auto Sequence",
        hint: "Manages genome decoding, and mutations",
        options: [
          option(
            "none",
            "Ignore",
            "Ignored by script, managed by game and player",
          ),
          option("enabled", "Enable", "Auto Sequencer enable"),
          option("disabled", "Disable", "Auto Sequencer disable"),
          option(
            "auto",
            "Script Managed",
            "Gene assembling managed by script, allowing to dump excess knowledge at faster rate, matching income",
          ),
        ],
      },
      {
        kind: "toggle",
        settingName: "doNotGoBelowPlasmidSoftcap",
        label: "Do not go below Plasmid softcap",
        hint: "Script will not mutate if the number of remaining plasmids or anti plamids would be lower than the softcap (250 + Phage)",
      },
      {
        kind: "number",
        settingName: "minimumPlasmidsToPreserve",
        label: "Minimum Plasmids / Anti-Plasmids to preserve",
        hint: "Script will not mutate if the number of remaining plasmids or anti plamids would be lower than this value",
      },
    ];
    const imitateRaceId =
      typeof settingsRaw["imitateRace"] === "string"
        ? settingsRaw["imitateRace"]
        : "";
    const selectedRace = races[imitateRaceId];
    return createTraitSettingsReadModel({
      controls,
      genusOptions,
      imitateOptions,
      imitateRaceId,
      imitateRaceCompleted:
        selectedRace === undefined
          ? undefined
          : Boolean(
              synthRaces[
                requireString(
                  requireRecord(selectedRace, `races.${imitateRaceId}`)["id"],
                  `races.${imitateRaceId}.id`,
                )
              ],
            ),
      psychicOptions,
      psychicBoostOptions,
      wishMinorOptions:
        controls[6]!.kind === "select" ? controls[6]!.options : [],
      wishMajorOptions:
        controls[7]!.kind === "select" ? controls[7]!.options : [],
      ocularRows,
      minorRows,
      mutableRows,
    });
  }

  function clearEvolutionTarget(): void {
    requireRecord(getState(), "state")["evolutionTarget"] = null;
  }
  function reorderMinorTraits(traitIds: readonly string[]): void {
    const settingsRaw = requireRecord(getSettingsRaw(), "settingsRaw");
    const manager = requireRecord(getMinorTraitManager(), "MinorTraitManager");
    traitIds.forEach((id, index) => {
      settingsRaw[`mTrait_p_${requireString(id, `traitIds[${index}]`)}`] =
        index;
    });
    Reflect.apply(
      requireFunction(
        manager["sortByPriority"],
        "MinorTraitManager.sortByPriority",
      ),
      manager,
      [],
    );
  }
  function reorderMutableTraits(traitIds: readonly string[]): void {
    const settingsRaw = requireRecord(getSettingsRaw(), "settingsRaw");
    const manager = requireRecord(
      getMutableTraitManager(),
      "MutableTraitManager",
    );
    traitIds.forEach((id, index) => {
      settingsRaw[`mutableTrait_p_${requireString(id, `traitIds[${index}]`)}`] =
        index;
    });
    Reflect.apply(
      requireFunction(
        manager["sortByPriority"],
        "MutableTraitManager.sortByPriority",
      ),
      manager,
      [],
    );
  }
  function setBoolean(settingName: string, value: boolean): void {
    const settingsRaw = requireRecord(getSettingsRaw(), "settingsRaw");
    settingsRaw[requireString(settingName, "settingName")] = value;
  }

  return Object.freeze({
    readTraitSettingsReadModel,
    clearEvolutionTarget,
    reorderMinorTraits,
    reorderMutableTraits,
    setBoolean,
  });
}
