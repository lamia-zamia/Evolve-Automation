/**
 * Static Fleet settings catalog for the captured path, verified against DeadSpace 1.5.0.
 *
 * The compat reader mixes three sources: hardcoded control labels, the script-side
 * `FleetManagerOuter` mirror (`ShipConfig` part ids, `Regions` outer region ids), and live
 * game answers (`loc` part labels, action names, the `galaxyRegions` export, `fleet_pr_*`
 * priorities, override presence). The captured path keeps the hardcoded controls verbatim,
 * freezes the upstream-verified id sets below, and reads region labels off the game's own
 * drawn action controls with the raw id as fallback — planet and alien-system names are
 * dynamic per species and discovery, so nothing static can reproduce them.
 *
 * Verified at the port reference:
 * - `shipParts` in `src/ships.js` (shipyard unlock order) owns the component types and ids.
 * - `strings.json` `outer_shipyard_<type>_<id>` entries own the component labels below.
 * - `space.js` owns the ten syndicate regions (`spc_dwarf` excepted) and the six-entry
 *   `galaxyRegions` export.
 */

import type {
  FleetSettingsControl,
  FleetSettingsOption,
} from "../../../domain/combat/fleet-settings.ts";
import type { GameControlRegistry } from "../../../ports/game-control-registry.ts";
import { readCapturedControlLabel } from "../captured-control-label.ts";

function shipComponentOption(
  value: string,
  label: string,
): FleetSettingsOption {
  return Object.freeze({
    val: value,
    label,
    hint: "Preset ship component",
  });
}

export const CAPTURED_FLEET_OUTER_CONTROLS: readonly FleetSettingsControl[] =
  Object.freeze([
    Object.freeze({
      kind: "select",
      settingName: "fleetOuterShips",
      label: "Ships to build",
      hint: "Once avalable and affordable script will build ship of selected design, and send it to region with most piracy * weighting",
      options: Object.freeze([
        Object.freeze({
          val: "none",
          label: "None",
          hint: "Ship building disabled",
        }),
        Object.freeze({
          val: "user",
          label: "Current design",
          hint: "Build whatever currently set in Ship Yard",
        }),
        Object.freeze({
          val: "manual",
          label: "Manual mode",
          hint: "Assists accumulating resources needed for current blueprint, without building or deploying anything. It also might need tweaking prioritization settings to work.",
        }),
        Object.freeze({
          val: "custom",
          label: "Presets",
          hint: "Build ships with components configured below. All components need to be unlocked, and resulting design should have enough power",
        }),
      ]),
    }),
    Object.freeze({
      kind: "number",
      settingName: "fleetOuterCrew",
      label: "Minimum idle soldiers",
      hint: "Only build ships when the remaining idle soldiers exceed this number. In Evil, the configured Authority target can reserve more soldiers automatically.",
    }),
    Object.freeze({
      kind: "toggle",
      settingName: "fleetExploreTau",
      label: "Explore Tau Ceti",
      hint: "Send explorer to Tau Ceti",
    }),
  ]);

export const CAPTURED_FLEET_ANDROMEDA_CONTROLS: readonly FleetSettingsControl[] =
  Object.freeze([
    Object.freeze({
      kind: "toggle",
      settingName: "fleetMaxCover",
      label: "Maximize protection of prioritized systems",
      hint: "Adjusts ships distribution to fully supress piracy in prioritized regions. Some potential defense will be wasted, as it will use big ships to cover small holes, when it doesn't have anything fitting better. This option is not required: all your dreadnoughts still will be used even without this option.",
    }),
    Object.freeze({
      kind: "toggle",
      settingName: "fleetCrewReclaim",
      label: "Crew combat ships only when useful",
      hint: "Power combat ships only when reducing piracy improves a resource or knowledge output the automation currently needs, and release all other crews back to the workforce. Active trade routes are protected only while their purchased resource is useful. Inactive while fleet is being accumulated for an assault mission. Surplus ships won't be parked at Gorddon for the Symposium bonus while this is enabled.",
    }),
    Object.freeze({
      kind: "number",
      settingName: "fleetEmbassyKnowledge",
      label: "Minimum knowledge for Embassy",
      hint: "Building Embassy increases maximum piracy up to 100, script won't Auto Build it until this knowledge cap is reached.",
    }),
    Object.freeze({
      kind: "number",
      settingName: "fleetAlienGiftKnowledge",
      label: "Minimum knowledge for Alien Gift",
      hint: "Researching Alien Gift increases maximum piracy up to 250, script won't Auto Research it until this knowledge cap is reached.",
    }),
    Object.freeze({
      kind: "number",
      settingName: "fleetAlien2Knowledge",
      label: "Minimum knowledge for Alien 2 Assault",
      hint: "Assaulting Alien 2 increases maximum piracy up to 500, script won't do it until this knowledge cap is reached. Regardless of set value it won't ever try to assault until you have big enough fleet to do it without loses.",
    }),
    Object.freeze({
      kind: "select",
      settingName: "fleetAlien2Loses",
      label: "Alien 2 Mission",
      hint: "Assault Alien 2 when chosen outcome is achievable. You should really keep the default, unless you're speed running and want to take it out ASAP with losses.",
      options: Object.freeze([
        Object.freeze({
          val: "none",
          label: "No Losses",
          hint: "Min fleet strength 650. No losses.",
        }),
        Object.freeze({
          val: "suicide",
          label: "Suicide Mission",
          hint: "Attack as soon as we hit 400 fleet rating. There will be losses.",
        }),
      ]),
    }),
    Object.freeze({
      kind: "select",
      settingName: "fleetChthonianLoses",
      label: "Chthonian Mission",
      hint: "Assault Chthonian when chosen outcome is achievable. Mixed fleet formed to clear mission with minimum possible wasted ships, e.g. for low causlities it can sacriface 8 scouts, or 2 corvettes and 2 scouts, or frigate, and such. Whatever will be first available. It also takes in account perks and challenges, adjusting fleet accordingly.",
      options: Object.freeze([
        Object.freeze({
          val: "ignore",
          label: "Manual assault",
          hint: "Won't ever launch assault mission on Chthonian",
        }),
        Object.freeze({
          val: "high",
          label: "High casualties",
          hint: "Unlock Chthonian using mixed fleet, high casualties (1250+ total fleet power, 500 will be lost)",
        }),
        Object.freeze({
          val: "avg",
          label: "Average casualties",
          hint: "Unlock Chthonian using mixed fleet, average casualties (2500+ total fleet power, 160 will be lost)",
        }),
        Object.freeze({
          val: "low",
          label: "Low casualties",
          hint: "Unlock Chthonian using mixed fleet, low casualties (4500+ total fleet power, 80 will be lost)",
        }),
        Object.freeze({
          val: "frigate",
          label: "Frigate",
          hint: "Unlock Chthonian loosing Frigate ship(s) (4500+ total fleet power, suboptimal for banana\\instinct runs)",
        }),
        Object.freeze({
          val: "dread",
          label: "Dreadnought",
          hint: "Unlock Chthonian with Dreadnought suicide mission",
        }),
      ]),
    }),
  ]);

/** Shipyard unlock order per component type, mirroring upstream `shipParts`. */
export const CAPTURED_SHIP_COMPONENTS: Readonly<
  Record<string, readonly FleetSettingsOption[]>
> = Object.freeze({
  class: Object.freeze([
    shipComponentOption("corvette", "Corvette"),
    shipComponentOption("frigate", "Frigate"),
    shipComponentOption("destroyer", "Destroyer"),
    shipComponentOption("cruiser", "Cruiser"),
    shipComponentOption("battlecruiser", "Battlecruiser"),
    shipComponentOption("dreadnought", "Dreadnought"),
    shipComponentOption("freighter", "Freighter"),
    shipComponentOption("explorer", "Explorer"),
    shipComponentOption("supply_ship", "Supply Ship"),
  ]),
  power: Object.freeze([
    shipComponentOption("solar", "Solar"),
    shipComponentOption("diesel", "Diesel"),
    shipComponentOption("fission", "Fission"),
    shipComponentOption("fusion", "Fusion"),
    shipComponentOption("elerium", "Elerium"),
    shipComponentOption("antimatter", "Antimatter"),
  ]),
  weapon: Object.freeze([
    shipComponentOption("railgun", "Railguns"),
    shipComponentOption("laser", "Lasers"),
    shipComponentOption("p_laser", "Pulse Lasers"),
    shipComponentOption("plasma", "Plasma Beams"),
    shipComponentOption("phaser", "Phasers"),
    shipComponentOption("disruptor", "Disruptors"),
    shipComponentOption("gauss", "Gauss Cannons"),
  ]),
  armor: Object.freeze([
    shipComponentOption("steel", "Steel"),
    shipComponentOption("alloy", "Alloy"),
    shipComponentOption("neutronium", "Neutronium"),
    shipComponentOption("aerographene", "Aerographene"),
  ]),
  engine: Object.freeze([
    shipComponentOption("ion", "Ion Engine"),
    shipComponentOption("tie", "Twin Ion Engine"),
    shipComponentOption("pulse", "Pulse Drive"),
    shipComponentOption("photon", "Photon Drive"),
    shipComponentOption("vacuum", "Vacuum Drive"),
    shipComponentOption("emdrive", "EmDrive"),
    shipComponentOption("electrokinetic", "Electrokinetic Thruster"),
  ]),
  sensor: Object.freeze([
    shipComponentOption("visual", "Visual Only"),
    shipComponentOption("radar", "Radar"),
    shipComponentOption("lidar", "Lidar"),
    shipComponentOption("quantum", "Quantum Scanner"),
  ]),
});

/** The ten syndicate regions, mirroring the script-side mirror of upstream `space.js`. */
export const CAPTURED_OUTER_REGION_IDS: readonly string[] = Object.freeze([
  "spc_moon",
  "spc_red",
  "spc_gas",
  "spc_gas_moon",
  "spc_belt",
  "spc_titan",
  "spc_enceladus",
  "spc_triton",
  "spc_makemake",
  "spc_eris",
]);

/** Mirrors the upstream `galaxyRegions` export in `space.js`. */
export const CAPTURED_ANDROMEDA_REGION_IDS: readonly string[] = Object.freeze([
  "gxy_gateway",
  "gxy_stargate",
  "gxy_gorddon",
  "gxy_alien1",
  "gxy_alien2",
  "gxy_chthonian",
]);

/**
 * Reads the region label the game already resolved for one drawn action control.
 * Falls back to the raw region id when the game has not drawn the region.
 */
export function readCapturedFleetRegionLabel(
  controls: GameControlRegistry,
  binding: string,
  regionId: string,
): string {
  const handle = controls.resolve(binding);
  if (handle === undefined) return regionId;
  return readCapturedControlLabel(handle, regionId);
}
