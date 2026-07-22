import {
  createFleetSettingsReadModel,
  type FleetSettingsControl,
  type FleetSettingsOption,
  type FleetSettingsReadModel,
  type FleetSettingsRegion,
} from "../../domain/fleet-settings.ts";
import { requireRecord } from "../validation.ts";

interface FleetSettingsEvolveDependencies {
  readonly getFleetManagerOuter: () => unknown;
  readonly getGalaxyRegions: () => unknown;
  readonly getGame: () => unknown;
  readonly getSettingsRaw: () => unknown;
}

export interface FleetSettingsEvolveAdapter {
  read(): FleetSettingsReadModel;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string")
    throw new TypeError(`${path} must be a string`);
  return value;
}

function requireArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`);
  return value;
}

function localize(game: Record<PropertyKey, unknown>, key: string): string {
  const loc = game["loc"];
  if (typeof loc !== "function")
    throw new TypeError("game.loc must be a function");
  return requireString(
    Reflect.apply(loc, game, [key]),
    `game.loc(${key}) result`,
  );
}

function option(
  value: string,
  label: string,
  hint = "Preset ship component",
): FleetSettingsOption {
  return { val: value, label, hint };
}

function readName(
  game: Record<PropertyKey, unknown>,
  category: string,
  id: string,
): string {
  const actions = requireRecord(game["actions"], "game.actions");
  const group = requireRecord(actions[category], `game.actions.${category}`);
  const action = requireRecord(group[id], `game.actions.${category}.${id}`);
  const info = requireRecord(
    action["info"],
    `game.actions.${category}.${id}.info`,
  );
  const rawName = info["name"];
  const name =
    typeof rawName === "function"
      ? Reflect.apply(rawName, action, [])
      : rawName;
  return requireString(name, `game.actions.${category}.${id}.info.name`);
}

const outerControls: readonly FleetSettingsControl[] = Object.freeze([
  {
    kind: "select",
    settingName: "fleetOuterShips",
    label: "Ships to build",
    hint: "Once avalable and affordable script will build ship of selected design, and send it to region with most piracy * weighting",
    options: Object.freeze([
      option("none", "None", "Ship building disabled"),
      option(
        "user",
        "Current design",
        "Build whatever currently set in Ship Yard",
      ),
      option(
        "manual",
        "Manual mode",
        "Assists accumulating resources needed for current blueprint, without building or deploying anything. It also might need tweaking prioritization settings to work.",
      ),
      option(
        "custom",
        "Presets",
        "Build ships with components configured below. All components need to be unlocked, and resulting design should have enough power",
      ),
    ]),
  },
  {
    kind: "number",
    settingName: "fleetOuterCrew",
    label: "Minimum idle soldiers",
    hint: "Only build ships when the remaining idle soldiers exceed this number. In Evil, the configured Authority target can reserve more soldiers automatically.",
  },
  {
    kind: "toggle",
    settingName: "fleetExploreTau",
    label: "Explore Tau Ceti",
    hint: "Send explorer to Tau Ceti",
  },
]);

const andromedaControls: readonly FleetSettingsControl[] = Object.freeze([
  {
    kind: "toggle",
    settingName: "fleetMaxCover",
    label: "Maximize protection of prioritized systems",
    hint: "Adjusts ships distribution to fully supress piracy in prioritized regions. Some potential defense will be wasted, as it will use big ships to cover small holes, when it doesn't have anything fitting better. This option is not required: all your dreadnoughts still will be used even without this option.",
  },
  {
    kind: "toggle",
    settingName: "fleetCrewReclaim",
    label: "Crew combat ships only when useful",
    hint: "Power combat ships only when reducing piracy improves a resource or knowledge output the automation currently needs, and release all other crews back to the workforce. Active trade routes are protected only while their purchased resource is useful. Inactive while fleet is being accumulated for an assault mission. Surplus ships won't be parked at Gorddon for the Symposium bonus while this is enabled.",
  },
  {
    kind: "number",
    settingName: "fleetEmbassyKnowledge",
    label: "Minimum knowledge for Embassy",
    hint: "Building Embassy increases maximum piracy up to 100, script won't Auto Build it until this knowledge cap is reached.",
  },
  {
    kind: "number",
    settingName: "fleetAlienGiftKnowledge",
    label: "Minimum knowledge for Alien Gift",
    hint: "Researching Alien Gift increases maximum piracy up to 250, script won't Auto Research it until this knowledge cap is reached.",
  },
  {
    kind: "number",
    settingName: "fleetAlien2Knowledge",
    label: "Minimum knowledge for Alien 2 Assault",
    hint: "Assaulting Alien 2 increases maximum piracy up to 500, script won't do it until this knowledge cap is reached. Regardless of set value it won't ever try to assault until you have big enough fleet to do it without loses.",
  },
  {
    kind: "select",
    settingName: "fleetAlien2Loses",
    label: "Alien 2 Mission",
    hint: "Assault Alien 2 when chosen outcome is achievable. You should really keep the default, unless you're speed running and want to take it out ASAP with losses.",
    options: Object.freeze([
      option("none", "No Losses", "Min fleet strength 650. No losses."),
      option(
        "suicide",
        "Suicide Mission",
        "Attack as soon as we hit 400 fleet rating. There will be losses.",
      ),
    ]),
  },
  {
    kind: "select",
    settingName: "fleetChthonianLoses",
    label: "Chthonian Mission",
    hint: "Assault Chthonian when chosen outcome is achievable. Mixed fleet formed to clear mission with minimum possible wasted ships, e.g. for low causlities it can sacriface 8 scouts, or 2 corvettes and 2 scouts, or frigate, and such. Whatever will be first available. It also takes in account perks and challenges, adjusting fleet accordingly.",
    options: Object.freeze([
      option(
        "ignore",
        "Manual assault",
        "Won't ever launch assault mission on Chthonian",
      ),
      option(
        "high",
        "High casualties",
        "Unlock Chthonian using mixed fleet, high casualties (1250+ total fleet power, 500 will be lost)",
      ),
      option(
        "avg",
        "Average casualties",
        "Unlock Chthonian using mixed fleet, average casualties (2500+ total fleet power, 160 will be lost)",
      ),
      option(
        "low",
        "Low casualties",
        "Unlock Chthonian using mixed fleet, low casualties (4500+ total fleet power, 80 will be lost)",
      ),
      option(
        "frigate",
        "Frigate",
        "Unlock Chthonian loosing Frigate ship(s) (4500+ total fleet power, suboptimal for banana\\instinct runs)",
      ),
      option(
        "dread",
        "Dreadnought",
        "Unlock Chthonian with Dreadnought suicide mission",
      ),
    ]),
  },
]);

export function createFleetSettingsEvolveAdapter({
  getFleetManagerOuter,
  getGalaxyRegions,
  getGame,
  getSettingsRaw,
}: FleetSettingsEvolveDependencies): FleetSettingsEvolveAdapter {
  return Object.freeze({
    read(): FleetSettingsReadModel {
      const manager = requireRecord(
        getFleetManagerOuter(),
        "FleetManagerOuter",
      );
      const game = requireRecord(getGame(), "game");
      const config = requireRecord(
        manager["ShipConfig"],
        "FleetManagerOuter.ShipConfig",
      );
      const components: Record<string, readonly FleetSettingsOption[]> = {};
      for (const [type, rawParts] of Object.entries(config)) {
        const parts = requireArray(
          rawParts,
          `FleetManagerOuter.ShipConfig.${type}`,
        );
        components[type] = Object.freeze(
          parts.map((raw, index) => {
            const id = requireString(
              raw,
              `FleetManagerOuter.ShipConfig.${type}[${index}]`,
            );
            return option(id, localize(game, `outer_shipyard_${type}_${id}`));
          }),
        );
      }
      const rawOuterRegions = requireArray(
        manager["Regions"],
        "FleetManagerOuter.Regions",
      );
      const outerRegionIds = rawOuterRegions.map((raw, index) =>
        requireString(raw, `FleetManagerOuter.Regions[${index}]`),
      );
      const outerRegions: FleetSettingsRegion[] = outerRegionIds.map((id) => ({
        id,
        label: readName(game, "space", id),
      }));
      const rawGalaxyRegions = requireArray(
        getGalaxyRegions(),
        "galaxyRegions",
      );
      const galaxyRegions = rawGalaxyRegions.map((raw, index) =>
        requireString(raw, `galaxyRegions[${index}]`),
      );
      const settings = requireRecord(getSettingsRaw(), "settingsRaw");
      const overrides = requireRecord(
        settings["overrides"],
        "settingsRaw.overrides",
      );
      const andromedaRegions = galaxyRegions
        .map((id) => ({
          id,
          label:
            id === "gxy_alien1"
              ? "Alien 1 System"
              : id === "gxy_alien2"
                ? "Alien 2 System"
                : readName(game, "galaxy", id),
          settingName: `fleet_pr_${id}`,
        }))
        .sort((a, b) => {
          const left =
            typeof settings[a.settingName] === "number"
              ? (settings[a.settingName] as number)
              : 0;
          const right =
            typeof settings[b.settingName] === "number"
              ? (settings[b.settingName] as number)
              : 0;
          return left - right;
        })
        .map((region) => ({
          ...region,
          ...(overrides[region.settingName!]
            ? { settingName: region.settingName }
            : {}),
        }));
      return createFleetSettingsReadModel({
        outerControls,
        outerComponents: components,
        outerRegions,
        andromedaControls,
        andromedaRegions,
      });
    },
  });
}
