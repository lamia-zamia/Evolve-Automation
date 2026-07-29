import {
  createPrestigeSettingsReadModel,
  type PrestigeSettingsOption,
  type PrestigeSettingsReadModel,
} from "../../../../domain/progression/prestige/prestige-settings.ts";
import { requireRecord, requireString } from "../../../validation.ts";

interface PrestigeSettingsEvolveDependencies {
  readonly getPrestigeTypes: () => unknown;
  readonly getGame: () => unknown;
  readonly getBuildings: () => unknown;
  readonly isPrestigeAllowed: () => unknown;
  readonly haveTech: (...args: unknown[]) => unknown;
  readonly isBioseederPrestigeAvailable: () => unknown;
  readonly isCataclysmPrestigeAvailable: () => unknown;
  readonly isWhiteholePrestigeAvailable: () => unknown;
  readonly isApocalypsePrestigeAvailable: () => unknown;
  readonly isAscensionPrestigeAvailable: () => unknown;
  readonly isWitchAscensionPrestigeAvailable: (demonic?: boolean) => unknown;
  readonly isDemonicPrestigeAvailable: () => unknown;
}
export interface PrestigeSettingsEvolveAdapter {
  read(): PrestigeSettingsReadModel;
  getConfirmationText(value: string): string;
}
function readOptions(value: unknown): readonly PrestigeSettingsOption[] {
  if (!Array.isArray(value))
    throw new TypeError("prestigeTypes must be an array");
  return Object.freeze(
    value.map((raw, index) => {
      const option = requireRecord(raw, `prestigeTypes[${index}]`);
      return Object.freeze({
        val: requireString(option["val"], `prestigeTypes[${index}].val`),
        label: requireString(option["label"], `prestigeTypes[${index}].label`),
        hint: requireString(option["hint"], `prestigeTypes[${index}].hint`),
      });
    }),
  );
}
function building(
  buildings: Record<PropertyKey, unknown>,
  id: string,
): Record<PropertyKey, unknown> | undefined {
  const value = buildings[id];
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<PropertyKey, unknown>)
    : undefined;
}
function unlocked(
  buildings: Record<PropertyKey, unknown>,
  id: string,
): boolean {
  const value = building(buildings, id)?.["isUnlocked"];
  return typeof value === "function"
    ? Boolean(Reflect.apply(value, building(buildings, id), []))
    : false;
}
function affordable(
  buildings: Record<PropertyKey, unknown>,
  id: string,
): boolean {
  const value = building(buildings, id)?.["isAffordable"];
  return typeof value === "function"
    ? Boolean(Reflect.apply(value, building(buildings, id), []))
    : false;
}
function count(buildings: Record<PropertyKey, unknown>, id: string): number {
  const value = building(buildings, id)?.["count"];
  return typeof value === "number" ? value : 0;
}

export function createPrestigeSettingsEvolveAdapter(
  deps: PrestigeSettingsEvolveDependencies,
): PrestigeSettingsEvolveAdapter {
  function read(): PrestigeSettingsReadModel {
    const game = requireRecord(deps.getGame(), "game");
    const rawLoc = game["loc"];
    if (typeof rawLoc !== "function")
      throw new TypeError("game.loc must be a function");
    const vaxOptions: PrestigeSettingsOption[] = [
      { val: "none", label: "None", hint: "Do not select strategy" },
    ];
    for (const id of ["strat1", "strat2", "strat3", "strat4"])
      vaxOptions.push({
        val: id,
        label: requireString(
          Reflect.apply(rawLoc, game, [`tech_vax_${id}`]),
          `game.loc(tech_vax_${id})`,
        ),
        hint: requireString(
          Reflect.apply(rawLoc, game, [`tech_vax_${id}_effect`]),
          `game.loc(tech_vax_${id}_effect)`,
        ),
      });
    const model = createPrestigeSettingsReadModel({
      prestigeOptions: readOptions(deps.getPrestigeTypes()),
    });
    const controls = model.controls.map((control) =>
      control.kind === "select" && control.settingName === "prestigeVaxStrat"
        ? Object.freeze({ ...control, options: Object.freeze(vaxOptions) })
        : control,
    );
    return Object.freeze({ ...model, controls: Object.freeze(controls) });
  }
  function getConfirmationText(value: string): string {
    if (!deps.isPrestigeAllowed()) return "";
    const game = requireRecord(deps.getGame(), "game");
    const global = requireRecord(game["global"], "game.global");
    const race = requireRecord(global["race"], "game.global.race");
    const buildings = requireRecord(deps.getBuildings(), "buildings");
    if (value === "mad" && Boolean(deps.haveTech("mad")))
      return "MAD has already been researched.";
    if (value === "bioseed" && Boolean(deps.isBioseederPrestigeAvailable()))
      return "Required probes are built, and bioseeder ship is ready to launch.";
    if (value === "cataclysm" && Boolean(deps.isCataclysmPrestigeAvailable()))
      return "Dial It To 11 is unlocked. You may prestige immediately.";
    if (value === "whitehole" && Boolean(deps.isWhiteholePrestigeAvailable()))
      return "Required mass is reached, and exotic infusion is unlocked.";
    if (value === "apocalypse" && Boolean(deps.isApocalypsePrestigeAvailable()))
      return "Protocol 66 is unlocked.";
    const witch = Boolean(race["witch_hunter"]);
    if (
      value === "ascension" &&
      Boolean(
        witch
          ? deps.isWitchAscensionPrestigeAvailable()
          : deps.isAscensionPrestigeAvailable(),
      )
    )
      return witch
        ? "Absorption Chamber is built and ready."
        : "Ascension machine is built and powered.";
    if (
      value === "demonic" &&
      Boolean(
        witch
          ? deps.isWitchAscensionPrestigeAvailable(true)
          : deps.isDemonicPrestigeAvailable(),
      )
    )
      return witch
        ? "Absorption Chamber is built and ready."
        : "Required floor is reached, and demon lord is already dead.";
    if (value === "terraform" && unlocked(buildings, "RedTerraform"))
      return "Terraformer is built and powered.";
    if (value === "matrix" && unlocked(buildings, "TauStarBluePill"))
      return "Matrix is built and powered.";
    if (
      value === "retire" &&
      count(buildings, "TauGas2MatrioshkaBrain") >= 1000 &&
      unlocked(buildings, "TauGas2IgniteGasGiant") &&
      affordable(buildings, "TauGas2IgniteGasGiant")
    )
      return "Ignition Device is built and ready.";
    if (
      value === "eden" &&
      unlocked(buildings, "TauStarEden") &&
      affordable(buildings, "TauStarEden")
    )
      return "Garden Of Eden is ready to build.";
    if (value === "apotheosis" && unlocked(buildings, "PalaceApotheosis"))
      return "Apotheosis is ready to build.";
    return "";
  }
  return Object.freeze({ read, getConfirmationText });
}
