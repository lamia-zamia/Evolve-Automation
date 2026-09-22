/**
 * Normalized captured Mech state: the one read model the planner, settings UI,
 * build executor, and scrap/replacement logic share.
 *
 * Everything here is validated game-owned fact from the captured root
 * (`portal.mechbay`, `portal.purifier`, `portal.spire`, `resource.Soul_Gem`,
 * `blood`, `stats.achieve.gladiator`) plus the persisted script settings with
 * the shipped defaults. Game formulas this model feeds (costs, space, refunds,
 * design power) mirror `D:/work/Evolve-DeadSpace/src/portal.js` (`mechCost`,
 * `mechSize`, the list `scrap`, `mechRating`) and name it where they do.
 */

import { computeMechDefaults } from "../settings-defaults.ts";
import { isNonArrayRecord } from "../../validation/records.ts";

export type MechBuildMode = "none" | "random" | "user";
export type MechScrapMode = "none" | "single" | "all" | "mixed";
export type MechSpecialMode = "always" | "prefered" | "random" | "never";

export interface CapturedMechDesign {
  readonly size: string;
  readonly chassis: string;
  readonly hardpoint: readonly string[];
  readonly equip: readonly string[];
  readonly infernal: boolean;
}

export interface CapturedMechInventoryItem extends CapturedMechDesign {
  /** Position in `mechbay.mechs`. The game's list `scrap` takes this index. */
  readonly index: number;
}

export interface CapturedMechBay {
  readonly maximum: number;
  readonly occupied: number;
  readonly active: number;
  readonly scouts: number;
}

export interface CapturedSpireFacts {
  readonly count: number;
  readonly type: string;
  readonly progress: number;
  readonly statuses: readonly string[];
  readonly boss: string;
}

export interface CapturedMechFunds {
  readonly purifierSupply: number;
  readonly purifierMax: number;
  readonly soulGems: number;
}

export interface CapturedMechSettings {
  readonly autoMech: boolean;
  readonly buildMode: MechBuildMode;
  readonly scrapMode: MechScrapMode;
  readonly scrapEfficiency: number;
  readonly collectorValue: number;
  readonly preferredSize: string;
  readonly gravitySize: string;
  readonly specialMode: MechSpecialMode;
  readonly waygatePotential: number;
  readonly minimumSupplyRate: number;
  readonly maximumCollectorShare: number;
  readonly saveSupplyRatio: number;
  readonly scoutsRatio: number;
  readonly infernalCollector: boolean;
  readonly rebuildScouts: boolean;
  readonly fillBay: boolean;
  readonly buildingsFirst: boolean;
  readonly baysFirst: boolean;
}

export interface CapturedMechState {
  readonly available: boolean;
  readonly queueKeyHeld: boolean;
  readonly warlord: boolean;
  readonly bay: CapturedMechBay;
  readonly inventory: readonly CapturedMechInventoryItem[];
  readonly blueprint: CapturedMechDesign | null;
  readonly spire: CapturedSpireFacts | null;
  readonly funds: CapturedMechFunds;
  readonly prepared: number;
  readonly wrath: number;
  readonly gladiatorLevel: number;
  readonly settings: CapturedMechSettings;
}

const MECH_DEFAULTS = computeMechDefaults().def as Record<string, unknown>;

function defaultNumber(key: string): number {
  const value = MECH_DEFAULTS[key];
  return typeof value === "number" ? value : 0;
}

function defaultString(key: string): string {
  const value = MECH_DEFAULTS[key];
  return typeof value === "string" ? value : "";
}

function finiteQuantity(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function nonNegativeQuantity(value: unknown): number | undefined {
  const amount = finiteQuantity(value);
  return amount !== undefined && amount >= 0 ? amount : undefined;
}

function stringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  return Object.freeze(
    value.filter(
      (entry): entry is string => typeof entry === "string" && entry.length > 0,
    ),
  );
}

function readMechDesign(value: unknown): CapturedMechDesign | null {
  if (!isNonArrayRecord(value)) return null;
  const size = value["size"];
  if (typeof size !== "string" || size.length === 0) return null;
  const chassis = value["chassis"];
  return Object.freeze({
    size,
    chassis: typeof chassis === "string" ? chassis : "",
    hardpoint: stringArray(value["hardpoint"]),
    equip: stringArray(value["equip"]),
    // The game reads a missing infernal flag leniently (falsy in `mechCost`);
    // the capture keeps that coercion and names it.
    infernal: value["infernal"] === true,
  });
}

function readMechSettings(value: unknown): CapturedMechSettings {
  const settings = isNonArrayRecord(value) ? value : {};
  const pick = <T extends string>(
    key: string,
    allowed: readonly T[],
    fallback: T,
  ): T => {
    const raw = settings[key];
    return typeof raw === "string" &&
      (allowed as readonly string[]).includes(raw)
      ? (raw as T)
      : fallback;
  };
  const mechSettingNumber = (key: string): number => {
    const raw = finiteQuantity(settings[key]);
    return raw === undefined || raw < 0 ? defaultNumber(key) : raw;
  };
  const mechSettingString = (key: string): string => {
    const raw = settings[key];
    return typeof raw === "string" && raw.length > 0 ? raw : defaultString(key);
  };
  return Object.freeze({
    autoMech: settings["autoMech"] === true,
    buildMode: pick("mechBuild", ["none", "random", "user"], "none"),
    scrapMode: pick("mechScrap", ["none", "single", "all", "mixed"], "mixed"),
    scrapEfficiency: mechSettingNumber("mechScrapEfficiency"),
    collectorValue: mechSettingNumber("mechCollectorValue"),
    preferredSize: mechSettingString("mechSize"),
    gravitySize: mechSettingString("mechSizeGravity"),
    specialMode: pick(
      "mechSpecial",
      ["always", "prefered", "random", "never"],
      "prefered",
    ),
    waygatePotential: mechSettingNumber("mechWaygatePotential"),
    minimumSupplyRate: mechSettingNumber("mechMinSupply"),
    maximumCollectorShare: mechSettingNumber("mechMaxCollectors"),
    saveSupplyRatio: mechSettingNumber("mechSaveSupplyRatio"),
    scoutsRatio: mechSettingNumber("mechScouts"),
    infernalCollector: settings["mechInfernalCollector"] === true,
    rebuildScouts: settings["mechScoutsRebuild"] === true,
    fillBay: settings["mechFillBay"] === true,
    buildingsFirst: settings["buildingMechsFirst"] === true,
    baysFirst: settings["mechBaysFirst"] === true,
  });
}

function unavailableMechState(
  queueKeyHeld: boolean,
  warlord: boolean,
  settings: CapturedMechSettings,
): CapturedMechState {
  return Object.freeze({
    available: false,
    queueKeyHeld,
    warlord,
    bay: Object.freeze({ maximum: 0, occupied: 0, active: 0, scouts: 0 }),
    inventory: Object.freeze([]),
    blueprint: null,
    spire: null,
    funds: Object.freeze({ purifierSupply: 0, purifierMax: 0, soulGems: 0 }),
    prepared: 0,
    wrath: 0,
    gladiatorLevel: 0,
    settings,
  });
}

/**
 * Validate one captured root into the shared Mech model. Anything the game
 * does not guarantee reads as unavailable or absent — never guessed.
 */
export function readCapturedMechState(
  input: Readonly<{
    root: unknown;
    settings: unknown;
    queueKeyHeld: boolean | undefined;
  }>,
): CapturedMechState {
  const settings = readMechSettings(input.settings);
  const root = isNonArrayRecord(input.root) ? input.root : undefined;
  const race =
    root !== undefined && isNonArrayRecord(root["race"]) ? root["race"] : {};
  const warlord = race["warlord"] === true;
  if (
    root === undefined ||
    !settings.autoMech ||
    input.queueKeyHeld === undefined
  ) {
    return unavailableMechState(input.queueKeyHeld === true, warlord, settings);
  }
  const portal = isNonArrayRecord(root["portal"]) ? root["portal"] : undefined;
  const mechbay =
    portal !== undefined && isNonArrayRecord(portal["mechbay"])
      ? portal["mechbay"]
      : undefined;
  const purifier =
    portal !== undefined && isNonArrayRecord(portal["purifier"])
      ? portal["purifier"]
      : undefined;
  const resources = isNonArrayRecord(root["resource"])
    ? root["resource"]
    : undefined;
  const soulGem =
    resources !== undefined && isNonArrayRecord(resources["Soul_Gem"])
      ? resources["Soul_Gem"]
      : undefined;
  if (
    mechbay === undefined ||
    purifier === undefined ||
    soulGem === undefined
  ) {
    return unavailableMechState(input.queueKeyHeld, warlord, settings);
  }
  const maximum = nonNegativeQuantity(mechbay["max"]);
  const occupied = nonNegativeQuantity(mechbay["bay"]);
  const active = nonNegativeQuantity(mechbay["active"]);
  const scouts = nonNegativeQuantity(mechbay["scouts"]);
  const purifierSupply = nonNegativeQuantity(purifier["supply"]);
  const purifierMax = nonNegativeQuantity(purifier["sup_max"]);
  const soulGems = nonNegativeQuantity(soulGem["amount"]);
  const stored = Array.isArray(mechbay["mechs"]) ? mechbay["mechs"] : undefined;
  if (
    maximum === undefined ||
    occupied === undefined ||
    active === undefined ||
    scouts === undefined ||
    purifierSupply === undefined ||
    purifierMax === undefined ||
    soulGems === undefined ||
    stored === undefined
  ) {
    return unavailableMechState(input.queueKeyHeld, warlord, settings);
  }
  const inventory = Object.freeze(
    stored.map((entry, index) => {
      const design = readMechDesign(entry) ?? {
        size: "",
        chassis: "",
        hardpoint: Object.freeze([]),
        equip: Object.freeze([]),
        infernal: false,
      };
      return Object.freeze({ ...design, index });
    }),
  );
  const spire =
    portal !== undefined && isNonArrayRecord(portal["spire"])
      ? portal["spire"]
      : undefined;
  const spireCount =
    spire !== undefined ? finiteQuantity(spire["count"]) : undefined;
  const spireFacts =
    spire !== undefined &&
    spireCount !== undefined &&
    spireCount >= 1 &&
    typeof spire["type"] === "string" &&
    typeof spire["boss"] === "string" &&
    finiteQuantity(spire["progress"]) !== undefined
      ? Object.freeze({
          count: spireCount,
          type: spire["type"] as string,
          progress: spire["progress"] as number,
          statuses: Object.freeze(
            isNonArrayRecord(spire["status"])
              ? Object.keys(spire["status"])
              : [],
          ),
          boss: spire["boss"] as string,
        })
      : null;
  const blood = isNonArrayRecord(root["blood"]) ? root["blood"] : {};
  const stats = isNonArrayRecord(root["stats"]) ? root["stats"] : {};
  const achieve = isNonArrayRecord(stats["achieve"]) ? stats["achieve"] : {};
  const gladiator =
    isNonArrayRecord(achieve["gladiator"]) &&
    finiteQuantity(achieve["gladiator"]["l"]) !== undefined &&
    (achieve["gladiator"]["l"] as number) >= 0
      ? (achieve["gladiator"]["l"] as number)
      : 0;
  return Object.freeze({
    available: true,
    queueKeyHeld: input.queueKeyHeld,
    warlord,
    bay: Object.freeze({ maximum, occupied, active, scouts }),
    inventory,
    blueprint: readMechDesign(mechbay["blueprint"]),
    spire: spireFacts,
    funds: Object.freeze({ purifierSupply, purifierMax, soulGems }),
    prepared: nonNegativeQuantity(blood["prepared"]) ?? 0,
    wrath: nonNegativeQuantity(blood["wrath"]) ?? 0,
    gladiatorLevel: gladiator,
    settings,
  });
}
