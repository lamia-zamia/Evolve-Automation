/**
 * Automatic Mech design: pure chassis/weapon/size choice over captured facts.
 *
 * Historical intent (legacy `MechManager.updateBestBody`/`updateBestWeapon`/
 * `getRandomMech`/`getPreferredSize` in `src/game/mech-manager.ts`): score every
 * chassis/equipment combination by body survivability for the current floor,
 * score weapons against the current Spire boss, keep all ties, and pick
 * uniformly at random. Size comes from the collector/scout/gravity policy with
 * an efficiency ranking fallback.
 *
 * The game changed underneath (`D:/work/Evolve-DeadSpace/src/portal.js`,
 * DeadSpace `fa62465f`), so exact history is impossible and this is the
 * narrowest current equivalent, evaluated under current legality:
 * - `special` is pinned at equip slot zero (`normalizeBlueprint`, line 7046);
 *   the `mechSpecial` setting chooses nothing anymore and is obsolete.
 * - general slots follow `mechGeneralSlots` (line 6989), hardpoints follow the
 *   `setSize` trimming (collector 0, small 1, medium/large 2, titan 4).
 * - power mirrors `mechRating`'s floor branch (line 7844): wrath, gladiator,
 *   concrete mods, `terrainEffect` (line 7565), `statusEffect` (line 7365),
 *   `terrainRating` jump-jet/damper/scout handling (line 7329), the
 *   `/ spire.count` scale, and per-hardpoint `weaponPower` (line 7353) over the
 *   raw `monsters` table (line 5161, transcribed in `mech-boss-armory.ts`).
 *   The seeded `checkBossResist` adjustment is ignored, exactly as history
 *   ignored it. The Infernal gene bonus is a constant across every design on a
 *   floor, so it is folded to 1: every consumer compares powers, none prints
 *   them.
 * - costs/space/refunds come from `mech-costs.ts` (`mechCost`/`mechSize`/list
 *   `scrap`).
 * - warlord frames, demon weapons/equips, and unknown floor facts read as
 *   unratable: no guessed design, no build.
 *
 * Flare no longer counters anything (`dark`/`mountain` dropped it); sonar now
 * soft-counters both. `medium` fires two half bays, so it rates two weapons.
 */

import {
  BOSS_WEAPON_RATINGS,
  CLASSIC_MECH_WEAPONS,
} from "./mech-boss-armory.ts";
import {
  CLASSIC_MECH_SIZES,
  mechFrameCost,
  mechFrameRefund,
  mechFrameSpace,
  mechFrameSupplyCost,
  type MechCostFigures,
} from "./mech-costs.ts";

export const CLASSIC_MECH_CHASSIS = Object.freeze([
  "wheel",
  "tread",
  "biped",
  "quad",
  "spider",
  "hover",
]);

/** General pool from `validEquipment`'s classic branch (line 6969). */
export const CLASSIC_GENERAL_EQUIP = Object.freeze([
  "shields",
  "sonar",
  "grapple",
  "infrared",
  "pontoon",
  "radiator",
  "coolant",
  "ablative",
  "stabilizer",
  "seals",
]);

const CLASSIC_EQUIP_SET: ReadonlySet<string> = new Set([
  "special",
  ...CLASSIC_GENERAL_EQUIP,
]);

export interface MechFloor {
  readonly terrain: string;
  readonly statuses: readonly string[];
  readonly boss: string;
  readonly spireCount: number;
  readonly scouts: number;
  readonly prepared: number;
  readonly wrath: number;
  readonly gladiatorLevel: number;
  readonly collectorValue: number;
}

export interface MechBodyChoice {
  readonly chassis: string;
  readonly equip: readonly string[];
}

export interface ScoredMechDesign extends MechBodyChoice {
  readonly size: string;
  readonly hardpoint: readonly string[];
  readonly power: number;
  readonly efficiency: number;
}

type TerrainPair = readonly [small: number, large: number];

const TERRAIN_MODS: Record<string, Record<string, TerrainPair>> = {
  wheel: {
    sand: [0.9, 0.85],
    swamp: [0.35, 0.18],
    forest: [1, 1],
    jungle: [0.92, 0.85],
    rocky: [0.65, 0.5],
    gravel: [1, 0.95],
    muddy: [0.85, 0.58],
    grass: [1.3, 1.2],
    brush: [0.9, 0.8],
    concrete: [1.1, 1],
  },
  tread: {
    sand: [1.15, 1.1],
    swamp: [0.55, 0.4],
    forest: [1, 0.95],
    jungle: [0.95, 0.9],
    rocky: [0.65, 0.5],
    gravel: [1.3, 1.2],
    muddy: [0.88, 0.72],
    grass: [1, 1],
    brush: [1, 1],
    concrete: [1, 1],
  },
  biped: {
    sand: [0.78, 0.65],
    swamp: [0.68, 0.5],
    forest: [1, 0.95],
    jungle: [0.82, 0.7],
    rocky: [0.48, 0.4],
    gravel: [1, 1],
    muddy: [0.85, 0.7],
    grass: [1.25, 1.2],
    brush: [0.92, 0.85],
    concrete: [1, 1],
  },
  quad: {
    sand: [0.86, 0.75],
    swamp: [0.58, 0.42],
    forest: [1.25, 1.2],
    jungle: [1, 1],
    rocky: [0.95, 0.9],
    gravel: [0.9, 0.8],
    muddy: [0.68, 0.5],
    grass: [1, 0.95],
    brush: [0.95, 0.9],
    concrete: [1, 1],
  },
  spider: {
    sand: [0.75, 0.65],
    swamp: [0.9, 0.78],
    forest: [0.82, 0.75],
    jungle: [0.77, 0.65],
    rocky: [1.25, 1.2],
    gravel: [0.86, 0.75],
    muddy: [0.92, 0.82],
    grass: [1, 1],
    brush: [1, 0.95],
    concrete: [1, 1],
  },
  hover: {
    sand: [1, 1],
    swamp: [1.35, 1.2],
    forest: [0.65, 0.48],
    jungle: [0.55, 0.35],
    rocky: [0.82, 0.68],
    gravel: [1, 1],
    muddy: [1.15, 1.08],
    grass: [1, 1],
    brush: [0.78, 0.7],
    concrete: [1, 1],
  },
};

function terrainFactor(
  chassis: string,
  size: string,
  terrain: string,
): number | undefined {
  const table = TERRAIN_MODS[chassis];
  if (table === undefined) return undefined;
  const pair = table[terrain];
  if (pair === undefined) return undefined;
  return size === "small" || size === "medium" ? pair[0] : pair[1];
}

function statusFactor(
  effect: string,
  chassis: string,
  size: string,
  equip: ReadonlySet<string>,
): number | undefined {
  const hasEquip = (name: string): boolean => equip.has(name);
  switch (effect) {
    case "freeze":
      return hasEquip("radiator") ? 1 : hasEquip("ablative") ? 0.45 : 0.25;
    case "hot":
      return hasEquip("coolant") ? 1 : hasEquip("shields") ? 0.45 : 0.25;
    case "corrosive":
      return hasEquip("ablative")
        ? 1
        : hasEquip("shields")
          ? 0.6
          : hasEquip("seals")
            ? 0.45
            : 0.25;
    case "hail":
      return hasEquip("ablative") ? 1 : hasEquip("shields") ? 0.9 : 0.75;
    case "radioactive":
      return hasEquip("shields") ? 1 : hasEquip("ablative") ? 0.75 : 0.5;
    case "static":
      return hasEquip("shields")
        ? 1
        : hasEquip("ablative")
          ? 0.7
          : hasEquip("stabilizer")
            ? 0.65
            : hasEquip("coolant")
              ? 0.6
              : 0.4;
    case "humid":
      return hasEquip("seals") ? 1 : hasEquip("radiator") ? 0.9 : 0.75;
    case "dust":
      return hasEquip("seals")
        ? 1
        : hasEquip("infrared")
          ? 0.75
          : hasEquip("sonar")
            ? 0.7
            : 0.5;
    case "ashfall":
      return hasEquip("coolant")
        ? 1
        : hasEquip("seals") || hasEquip("infrared")
          ? 0.7
          : hasEquip("ablative")
            ? 0.6
            : 0.4;
    case "steam":
      return hasEquip("coolant") || hasEquip("radiator") || hasEquip("shields")
        ? 0.9
        : 0.75;
    case "rain":
      return hasEquip("seals") ? 0.95 : hasEquip("radiator") ? 0.9 : 0.75;
    case "quake":
      return hasEquip("stabilizer") ? 1 : hasEquip("grapple") ? 0.45 : 0.25;
    case "fog":
      return hasEquip("sonar") ? 1 : hasEquip("infrared") ? 0.5 : 0.2;
    case "dark":
      return hasEquip("infrared") ? 1 : hasEquip("sonar") ? 0.35 : 0.1;
    case "chasm":
      return hasEquip("grapple") ? 1 : hasEquip("sonar") ? 0.3 : 0.1;
    case "mountain":
      return chassis === "spider" || hasEquip("grapple")
        ? 1
        : hasEquip("sonar")
          ? 0.7
          : 0.5;
    case "hilly":
      return chassis === "spider"
        ? 1
        : hasEquip("grapple") || hasEquip("stabilizer")
          ? 0.9
          : 0.75;
    case "flooded":
      return chassis === "hover" || hasEquip("pontoon")
        ? 1
        : hasEquip("seals")
          ? 0.55
          : 0.35;
    case "river":
      return chassis === "hover" ? 1 : hasEquip("pontoon") ? 0.9 : 0.65;
    case "tar":
      if (chassis === "quad") return 1;
      if (chassis === "tread" || chassis === "wheel") {
        return hasEquip("pontoon") || hasEquip("stabilizer") ? 0.75 : 0.5;
      }
      return hasEquip("pontoon") ? 0.9 : hasEquip("stabilizer") ? 0.85 : 0.75;
    case "windy":
      return chassis === "hover" ? (hasEquip("stabilizer") ? 0.75 : 0.5) : 1;
    case "gravity":
      if (size === "medium") return 0.8;
      if (size === "large") return 0.45;
      if (size === "titan") return 0.25;
      return 1;
    default:
      return undefined;
  }
}

/** `terrainRating`: jump jets, inertial dampers, and scout coverage. */
function scoutTerrainBonus(
  size: string,
  factor: number,
  statuses: readonly string[],
  scouts: number,
  equip: ReadonlySet<string>,
): number {
  let rating = factor;
  if (equip.has("special") && (size === "small" || size === "collector")) {
    if (rating < 1) {
      rating += (1 - rating) * (statuses.includes("gravity") ? 0.325 : 0.65);
    }
  }
  if (equip.has("special") && size === "medium") {
    if (rating < 1 && !statuses.includes("gravity")) {
      rating += (1 - rating) * 0.75;
    }
  }
  if (size !== "small" && rating < 1) {
    rating +=
      (statuses.includes("fog") || statuses.includes("dark") ? 0.005 : 0.01) *
      scouts;
    if (rating > 1) rating = 1;
  }
  return rating;
}

/** `weaponPower` mount handling for one raw weapon rating. */
function mountWeaponPower(
  size: string,
  equip: ReadonlySet<string>,
  power: number,
): number {
  let adjusted = power;
  if (adjusted < 1 && adjusted !== 0) {
    if (equip.has("special") && size === "titan") {
      adjusted += (1 - adjusted) * 0.1;
    }
  }
  if (equip.has("special") && size === "large") {
    adjusted *= 1.1;
  }
  return adjusted;
}

function weaponBasePower(size: string): number | undefined {
  switch (size) {
    case "small":
      return 0.0025;
    case "medium":
      return 0.00375;
    case "large":
      return 0.01;
    case "titan":
      return 0.012;
    default:
      return undefined;
  }
}

/** Concrete-floor frame mods; 1 on every other terrain. */
function concreteMod(terrain: string, size: string): number {
  if (terrain !== "concrete") return 1;
  switch (size) {
    case "small":
      return 0.92;
    case "medium":
      return 0.95;
    case "titan":
      return 1.25;
    default:
      return 1;
  }
}

export function mechHardpoints(size: string): number | undefined {
  switch (size) {
    case "collector":
      return 0;
    case "small":
      return 1;
    case "medium":
    case "large":
      return 2;
    case "titan":
      return 4;
    default:
      return undefined;
  }
}

/** General slots from `mechGeneralSlots`; `prepared` is any War boon. */
export function mechGeneralSlotCount(
  size: string,
  prepared: number,
): number | undefined {
  const bonus = prepared > 0 ? 1 : 0;
  switch (size) {
    case "small":
      return 1 + bonus;
    case "medium":
      return 2 + bonus;
    case "large":
    case "collector":
      return 3 + bonus;
    case "titan":
      return 4 + bonus;
    default:
      return undefined;
  }
}

function bodyScore(
  size: string,
  chassis: string,
  equip: ReadonlySet<string>,
  floor: MechFloor,
): number | undefined {
  if (
    !(CLASSIC_MECH_SIZES as readonly string[]).includes(size) ||
    !(CLASSIC_MECH_CHASSIS as readonly string[]).includes(chassis)
  ) {
    return undefined;
  }
  const factor = terrainFactor(chassis, size, floor.terrain);
  if (factor === undefined) return undefined;
  let rating = scoutTerrainBonus(
    size,
    factor,
    floor.statuses,
    floor.scouts,
    equip,
  );
  for (const effect of floor.statuses) {
    const mod = statusFactor(effect, chassis, size, equip);
    if (mod === undefined) return undefined;
    rating *= mod;
  }
  return rating;
}

/**
 * Current-formula power for a classic design, on the game's own accumulation
 * scale (`main.js` sums `mechRating` per mid loop). Null when any part is
 * outside the classic line or the floor names an unknown fact.
 */
export function rateMechDesign(
  design: Readonly<{
    size: string;
    chassis: string;
    hardpoint: readonly string[];
    equip: readonly string[];
  }>,
  floor: MechFloor,
): Readonly<{ power: number; efficiency: number }> | null {
  for (const part of [...design.hardpoint, ...design.equip]) {
    if (
      !CLASSIC_EQUIP_SET.has(part) &&
      !(CLASSIC_MECH_WEAPONS as readonly string[]).includes(part)
    ) {
      return null;
    }
  }
  const equip = new Set(design.equip);
  const body = bodyScore(design.size, design.chassis, equip, floor);
  if (body === undefined) return null;
  const space = mechFrameSpace(design.size, floor.prepared);
  if (space === undefined || space <= 0) return null;
  if (design.size === "collector") {
    if (design.hardpoint.length !== 0 || floor.collectorValue <= 0) return null;
    const collectorPower = (body * 25 * floor.collectorValue) / 20_000;
    return Object.freeze({
      power: collectorPower,
      efficiency: collectorPower / space,
    });
  }
  const mounts = mechHardpoints(design.size);
  if (mounts === undefined || design.hardpoint.length !== mounts) return null;
  const base = weaponBasePower(design.size);
  const ratings = BOSS_WEAPON_RATINGS[floor.boss];
  if (base === undefined || ratings === undefined) return null;
  let rating =
    base *
    (1 + floor.wrath / 20) *
    (1 + floor.gladiatorLevel * 0.2) *
    concreteMod(floor.terrain, design.size) *
    body;
  let damage = 0;
  for (const weapon of design.hardpoint) {
    const index = (CLASSIC_MECH_WEAPONS as readonly string[]).indexOf(weapon);
    if (index < 0) return null;
    damage +=
      rating * mountWeaponPower(design.size, equip, ratings[index] ?? 0);
  }
  const power = damage / floor.spireCount;
  return Object.freeze({ power, efficiency: power / space });
}

function mechEquipCombinations(
  pool: readonly string[],
  slots: number,
): string[][] {
  if (slots < 0) return [];
  if (slots === 0) return [[]];
  const out: string[][] = [];
  const walk = (start: number, current: string[]): void => {
    if (current.length === slots) {
      out.push([...current]);
      return;
    }
    for (let index = start; index < pool.length; index++) {
      current.push(pool[index] as string);
      walk(index + 1, current);
      current.pop();
    }
  };
  walk(0, []);
  return out;
}

/** All tied-best bodies for a size: max survivability, `special` at slot 0. */
export function bestMechBodies(
  size: string,
  floor: MechFloor,
): MechBodyChoice[] | null {
  const slots = mechGeneralSlotCount(size, floor.prepared);
  if (slots === undefined) return null;
  let best = -Infinity;
  let tied: MechBodyChoice[] = [];
  for (const chassis of CLASSIC_MECH_CHASSIS) {
    for (const combo of mechEquipCombinations(CLASSIC_GENERAL_EQUIP, slots)) {
      const equip = Object.freeze(["special", ...combo]);
      const score = bodyScore(size, chassis, new Set(equip), floor);
      if (score === undefined) return null;
      if (score > best) {
        best = score;
        tied = [{ chassis, equip }];
      } else if (score === best) {
        tied.push({ chassis, equip });
      }
    }
  }
  return tied;
}

/** Tied-best classic weapons for the floor boss; null on an unknown boss. */
export function bestMechWeapons(boss: string): string[] | null {
  const ratings = BOSS_WEAPON_RATINGS[boss];
  if (ratings === undefined) return null;
  let best = -Infinity;
  let tied: string[] = [];
  CLASSIC_MECH_WEAPONS.forEach((weapon, index) => {
    const rating = ratings[index] as number;
    if (rating > best) {
      best = rating;
      tied = [weapon];
    } else if (rating === best) {
      tied.push(weapon);
    }
  });
  return tied;
}

/**
 * One automatic design for a size: uniform pick among tied-best bodies and
 * weapons, one weapon filling every hardpoint — the `getRandomMech` shape.
 * `pickIndex` chooses in `[0, count)`; the application wires randomness in.
 */
export function chooseAutoDesign(
  size: string,
  floor: MechFloor,
  pickIndex: (count: number) => number,
): ScoredMechDesign | null {
  const bodies = bestMechBodies(size, floor);
  const weapons = bestMechWeapons(floor.boss);
  const mounts = mechHardpoints(size);
  if (
    bodies === null ||
    bodies.length === 0 ||
    weapons === null ||
    mounts === undefined
  ) {
    return null;
  }
  const bodyIndex = pickIndex(bodies.length);
  const weaponIndex = pickIndex(weapons.length);
  const body = bodies[bodyIndex];
  const weapon = weapons[weaponIndex];
  if (body === undefined || weapon === undefined) return null;
  const hardpoint = Object.freeze(new Array<string>(mounts).fill(weapon));
  const rated = rateMechDesign(
    { size, chassis: body.chassis, hardpoint, equip: body.equip },
    floor,
  );
  if (rated === null) return null;
  return Object.freeze({
    size,
    chassis: body.chassis,
    hardpoint,
    equip: body.equip,
    power: rated.power,
    efficiency: rated.efficiency,
  });
}

/** Best power/cost figures per size for rankings, scrap, and potential. */
export function bestDesignFigures(
  floor: MechFloor,
  pickIndex: (count: number) => number,
): Record<
  string,
  Readonly<{
    power: number;
    efficiency: number;
    gemsEff: number;
    supplyEff: number;
    cost: MechCostFigures;
  }>
> | null {
  const figures: Record<
    string,
    Readonly<{
      power: number;
      efficiency: number;
      gemsEff: number;
      supplyEff: number;
      cost: MechCostFigures;
    }>
  > = {};
  for (const size of CLASSIC_MECH_SIZES) {
    const design = chooseAutoDesign(size, floor, pickIndex);
    const cost = mechFrameCost(size, floor.prepared);
    const refund = mechFrameRefund(size, floor.prepared);
    if (design === null || cost === undefined || refund === undefined) {
      return null;
    }
    figures[size] = Object.freeze({
      power: design.power,
      efficiency: design.efficiency,
      gemsEff: design.power / Math.max(cost.gems - refund.gems, 1e-9),
      supplyEff: design.power / Math.max(cost.supply - refund.supply, 1e-9),
      cost,
    });
  }
  return figures;
}

export interface PreferredSizeInput {
  readonly bayMaximum: number;
  readonly bayOccupied: number;
  readonly bayScouts: number;
  readonly activeCollectors: number;
  readonly supplyRate: number;
  readonly supplyMaximum: number;
  readonly supplyRatio: number;
  readonly gemsSpare: number;
  readonly prepared: number;
  readonly gravityFloor: boolean;
  readonly preferredSize: string;
  readonly gravitySize: string;
  readonly fillBay: boolean;
  readonly minimumSupplyRate: number;
  readonly maximumCollectorShare: number;
  readonly scoutsRatio: number;
  readonly rankByEff: readonly string[];
  readonly rankByGems: readonly string[];
  readonly rankBySupply: readonly string[];
}

/**
 * `getPreferredSize` port: collector bootstrap, scout coverage, gravity
 * override, then the efficiency/gems/supply ranking fallback. `force` builds
 * regardless of the efficiency gates downstream.
 */
export function choosePreferredSize(
  input: PreferredSizeInput,
): Readonly<{ size: string; force: boolean }> {
  if (
    input.fillBay &&
    Number.isInteger(input.bayMaximum) &&
    (input.prepared >= 2
      ? input.bayOccupied % 2 !== input.bayMaximum % 2
      : input.bayMaximum - input.bayOccupied === 1)
  ) {
    return Object.freeze({ size: "collector", force: true });
  }
  if (
    input.supplyRatio < 0.9 &&
    input.supplyRate < input.minimumSupplyRate &&
    input.bayMaximum > 0 &&
    input.activeCollectors / input.bayMaximum < input.maximumCollectorShare
  ) {
    return Object.freeze({ size: "collector", force: true });
  }
  if (
    input.bayMaximum > 0 &&
    (input.bayScouts * 2) / input.bayMaximum < input.scoutsRatio
  ) {
    return Object.freeze({ size: "small", force: true });
  }
  const floorSize = input.gravityFloor
    ? input.gravitySize
    : input.preferredSize;
  if (
    (CLASSIC_MECH_SIZES as readonly string[]).includes(floorSize) &&
    (!input.fillBay ||
      (mechFrameSupplyCost(floorSize, input.prepared) ?? Infinity) <=
        input.supplyMaximum)
  ) {
    return Object.freeze({ size: floorSize, force: false });
  }
  const ranking =
    floorSize === "gems"
      ? input.rankByGems
      : floorSize === "supply"
        ? input.rankBySupply
        : input.rankByEff;
  for (const size of ranking) {
    const cost = mechFrameCost(size, input.prepared);
    if (
      cost !== undefined &&
      input.gemsSpare >= cost.gems &&
      input.supplyMaximum >= cost.supply
    ) {
      return Object.freeze({ size, force: false });
    }
  }
  return Object.freeze({ size: "titan", force: false });
}
