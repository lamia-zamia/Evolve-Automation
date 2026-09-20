/**
 * Captures the small, game-owned surface needed by Evolution auto selection.
 *
 * DeadSpace keeps `races`, `genus_def`, and `Race.getWeighting()` module-lexical. The compatibility
 * runtime can call those objects directly, but a captured runtime cannot. This adapter therefore
 * ports the current `getHabitability()` and `getWeighting()` facts into `RaceView` values at the
 * boundary. It intentionally returns unavailable rather than manufacturing a reachable target
 * when a required fact is absent or malformed.
 */

import type { RaceView } from "../../../../domain/progression/evolution/evolution.ts";
import { calculateAchievementStarLevel } from "../../../../domain/progression/prestige/achievement-guards.ts";
import { readAchievementStarLevelContext } from "../../progression/prestige/achievement-guards.ts";
import { finite, isNonArrayRecord, readProperty } from "../../../validation.ts";
import {
  CAPTURED_EVOLUTION_RACES,
  type CapturedEvolutionRaceEntry,
} from "./captured-evolution-catalog.ts";

export type CapturedEvolutionRaceCatalogResult =
  | {
      readonly status: "ready";
      readonly races: readonly RaceView[];
      readonly massExtinction: boolean;
    }
  | {
      readonly status: "unavailable";
      readonly races: readonly RaceView[];
      readonly massExtinction: boolean;
      readonly reason: string;
    };

interface CapturedRaceFacts {
  readonly root: Record<string, unknown>;
  readonly race: Record<string, unknown>;
  readonly genes: Record<string, unknown>;
  readonly city: Record<string, unknown>;
  readonly achieve: Record<string, unknown>;
  readonly feat: Record<string, unknown>;
  readonly synth: Record<string, unknown>;
  readonly pillars: Record<string, unknown>;
  readonly universe: string;
  readonly biome: string;
  readonly gods: string | undefined;
  readonly unbound: number;
  readonly harmony: number;
  readonly settings: Record<string, unknown>;
  readonly prestigeType: string;
  readonly starLevel: number;
  readonly currentAffix: string;
}

interface CapturedRaceRow {
  readonly entry: CapturedEvolutionRaceEntry;
  readonly id: string;
  readonly name: string;
  readonly genus: string;
  readonly hybrid: readonly string[] | undefined;
  readonly compact: boolean;
}

const NO_MAD_RACES = new Set(["sludge", "ultra_sludge", "hellspawn"]);
const NO_PILLAR_RACES = new Set([
  "custom",
  "junker",
  "sludge",
  "ultra_sludge",
  "hybrid",
  "hellspawn",
]);
const NO_GREATNESS_GENERA = new Set(["hybrid"]);
const NO_GREATNESS_RACES = new Set(["hellspawn"]);
const CHALLENGE_RACES = new Set([
  "junker",
  "sludge",
  "ultra_sludge",
  "hellspawn",
]);
const GREATNESS_RESETS = new Set([
  "bioseed",
  "ascension",
  "terraform",
  "matrix",
  "retire",
  "eden",
  "apotheosis",
]);
const MID_TIER_RESETS = new Set([
  "bioseed",
  "cataclysm",
  "whitehole",
  "vacuum",
  "terraform",
]);
const HIGH_TIER_RESETS = new Set(["ascension", "demonic", "apotheosis"]);
const BEST_FOR_MID = new Set([
  "human",
  "cath",
  "capybara",
  "gnome",
  "cyclops",
  "gecko",
  "dracnid",
  "entish",
  "shroomi",
  "antid",
  "sharkin",
  "dryad",
  "salamander",
  "yeti",
  "kamel",
  "imp",
  "unicorn",
  "synth",
  "shoggoth",
]);
const BEST_FOR_HIGH = new Set([
  "human",
  "cath",
  "capybara",
  "gnome",
  "cyclops",
  "gecko",
  "dracnid",
  "entish",
  "shroomi",
  "scorpid",
  "sharkin",
  "dryad",
  "salamander",
  "wendigo",
  "kamel",
  "balorg",
  "unicorn",
  "nano",
  "ghast",
]);
const GOOD_IMITATES = [
  "wyvern",
  "dwarf",
  "dracnid",
  "octigoran",
  "unicorn",
  "salamander",
  "cyclops",
  "kamel",
  "arraak",
  "troll",
  "custom",
] as const;
const NO_IMITATES = new Set(["junker", "nano", "synth", "hellspawn"]);
const FANATIC_ACHIEVEMENTS = [
  { god: "sharkin", race: "entish", achieve: "madagascar_tree" },
  { god: "sporgar", race: "human", achieve: "infested" },
  { god: "shroomi", race: "troll", achieve: "godwin" },
] as const;

function capturedEvolutionRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  return isNonArrayRecord(value) ? value : undefined;
}

function requiredRecord(
  owner: unknown,
  key: string,
): Record<string, unknown> | undefined {
  return capturedEvolutionRecord(readProperty(owner, key));
}

function optionalRecord(
  owner: unknown,
  key: string,
): Record<string, unknown> | undefined {
  const raw = readProperty(owner, key);
  return raw === undefined || raw === null ? {} : capturedEvolutionRecord(raw);
}

function optionalNumber(owner: unknown, key: string): number | undefined {
  const raw = readProperty(owner, key);
  if (raw === undefined || raw === null) return 0;
  const value = finite(raw);
  return value !== undefined && value >= 0 ? value : undefined;
}

function settingBoolean(
  settings: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const raw = settings[key];
  return raw === undefined ? false : typeof raw === "boolean" ? raw : undefined;
}

function universeAffix(universe: string): string {
  switch (universe) {
    case "evil":
      return "e";
    case "antimatter":
      return "a";
    case "heavy":
      return "h";
    case "micro":
      return "m";
    case "magic":
      return "mg";
    default:
      return "l";
  }
}

function achievementValue(
  achievements: Record<string, unknown>,
  id: string,
  field: string,
): number | undefined {
  const achievement = readProperty(achievements, id);
  if (achievement === undefined || achievement === null) return 0;
  const record = capturedEvolutionRecord(achievement);
  if (record === undefined) return undefined;
  return optionalNumber(record, field);
}

function customRaceRow(
  root: Record<string, unknown>,
  entry: CapturedEvolutionRaceEntry,
): CapturedRaceRow | undefined {
  if (entry.id !== "custom" && entry.id !== "hybrid") {
    const hybrid =
      entry.hybrid === undefined ? undefined : Object.freeze([...entry.hybrid]);
    return Object.freeze({
      entry,
      id: entry.id,
      name: entry.label,
      genus:
        entry.genus === "variable"
          ? typeof readProperty(readProperty(root, "race"), "jtype") ===
            "string"
            ? (readProperty(readProperty(root, "race"), "jtype") as string)
            : "humanoid"
          : entry.genus,
      hybrid,
      compact: entry.id === "imp",
    });
  }

  const custom = requiredRecord(root, "custom");
  const slot = requiredRecord(
    custom,
    entry.id === "custom" ? "race0" : "race1",
  );
  const genus = readProperty(slot, "genus");
  if (typeof genus !== "string" || genus.length === 0) return undefined;
  const name = readProperty(slot, "name");
  const traits = readProperty(slot, "traits");
  const hybridValue = readProperty(slot, "hybrid");
  const hybrid = Array.isArray(hybridValue)
    ? hybridValue.filter((value): value is string => typeof value === "string")
    : undefined;
  if (genus === "hybrid" && (hybrid === undefined || hybrid.length === 0))
    return undefined;
  return Object.freeze({
    entry,
    id: entry.id,
    name: typeof name === "string" && name.length > 0 ? name : entry.label,
    genus,
    hybrid: hybrid === undefined ? undefined : Object.freeze(hybrid),
    compact: Array.isArray(traits) && traits.includes("compact"),
  });
}

function readFacts(
  rootValue: unknown,
  settingsValue: unknown,
):
  | { readonly facts: CapturedRaceFacts; readonly massExtinction: boolean }
  | undefined {
  const root = capturedEvolutionRecord(rootValue);
  const settings = capturedEvolutionRecord(settingsValue);
  const race = requiredRecord(root, "race");
  const genes = requiredRecord(root, "genes");
  const city = requiredRecord(root, "city");
  const stats = requiredRecord(root, "stats");
  const achieve = requiredRecord(stats, "achieve");
  const blood = requiredRecord(root, "blood");
  const universe = readProperty(race, "universe");
  const biome = readProperty(city, "biome");
  const prestigeType = settings?.["prestigeType"];
  const feat = optionalRecord(stats, "feat");
  const synth = optionalRecord(stats, "synth");
  const pillars = optionalRecord(root, "pillars");
  const unbound = optionalNumber(blood, "unbound");
  const settingsContext = readAchievementStarLevelContext(settingsValue);
  if (
    root === undefined ||
    settings === undefined ||
    race === undefined ||
    genes === undefined ||
    city === undefined ||
    stats === undefined ||
    achieve === undefined ||
    blood === undefined ||
    feat === undefined ||
    synth === undefined ||
    pillars === undefined ||
    typeof universe !== "string" ||
    typeof biome !== "string" ||
    typeof prestigeType !== "string" ||
    unbound === undefined ||
    settingsContext.status !== "ready"
  ) {
    return undefined;
  }

  const harmonyRecord = requiredRecord(
    requiredRecord(root, "prestige"),
    "Harmony",
  );
  const harmony =
    harmonyRecord === undefined ? 0 : optionalNumber(harmonyRecord, "count");
  if (harmony === undefined) return undefined;

  return {
    facts: Object.freeze({
      root,
      race,
      genes,
      city,
      achieve,
      feat,
      synth,
      pillars,
      universe,
      biome,
      gods:
        typeof readProperty(race, "gods") === "string"
          ? (readProperty(race, "gods") as string)
          : undefined,
      unbound,
      harmony,
      settings,
      prestigeType,
      starLevel: calculateAchievementStarLevel(settingsContext.context),
      currentAffix: universeAffix(universe),
    }),
    massExtinction:
      readProperty(achieve, "mass_extinction") !== undefined &&
      readProperty(achieve, "mass_extinction") !== null,
  };
}

function genusHabitability(genus: string, facts: CapturedRaceFacts): number {
  const unboundMod =
    facts.unbound >= 4
      ? 0.95
      : facts.unbound >= 2
        ? 0.9
        : facts.unbound >= 1
          ? 0.8
          : 0;
  const shadowMod = facts.unbound >= 3 ? unboundMod : 0;
  switch (genus) {
    case "aquatic":
      return ["swamp", "oceanic"].includes(facts.biome) ? 1 : unboundMod;
    case "fey":
      return ["forest", "swamp", "taiga"].includes(facts.biome)
        ? 1
        : unboundMod;
    case "sand":
      return ["ashland", "desert"].includes(facts.biome) ? 1 : unboundMod;
    case "heat":
      return ["ashland", "volcanic"].includes(facts.biome) ? 1 : unboundMod;
    case "polar":
      return ["tundra", "taiga"].includes(facts.biome) ? 1 : unboundMod;
    case "demonic":
      return facts.biome === "hellscape" ? 1 : shadowMod;
    case "angelic":
      return facts.biome === "eden" ? 1 : shadowMod;
    case "synthetic":
      return (achievementValue(facts.achieve, "obsolete", "l") ?? -1) >= 5
        ? 1
        : 0;
    case "eldritch":
      return (achievementValue(facts.achieve, "nightmare", "mg") ?? -1) > 0
        ? 1
        : 0;
    case "primordial":
      return (achievementValue(facts.achieve, "living_extinction", "l") ?? -1) >
        0
        ? 1
        : 0;
    default:
      return 1;
  }
}

function raceHabitability(
  row: CapturedRaceRow,
  facts: CapturedRaceFacts,
): number | undefined {
  switch (row.id) {
    case "hellspawn":
      return facts.universe === "evil" &&
        (achievementValue(facts.achieve, "godslayer", "e") ?? -1) > 0
        ? 1
        : 0;
    case "junker":
      return readProperty(facts.genes, "challenge") === true ? 1 : 0;
    case "sludge":
      return ((achievementValue(facts.achieve, "ascended", "l") ?? -1) > 0 ||
        (achievementValue(facts.achieve, "corrupted", "l") ?? -1) > 0) &&
        (achievementValue(facts.achieve, "extinct_junker", "l") ?? -1) > 0
        ? 1
        : 0;
    case "ultra_sludge":
      return capturedEvolutionRecord(
        readProperty(facts.achieve, "godslayer"),
      ) !== undefined &&
        (achievementValue(facts.achieve, "extinct_sludge", "l") ?? -1) > 0
        ? 1
        : 0;
    default:
      if (row.genus === "hybrid") {
        if (
          capturedEvolutionRecord(readProperty(facts.achieve, "godslayer")) ===
          undefined
        )
          return 0;
        return row.hybrid === undefined || row.hybrid.length === 0
          ? 1
          : Math.max(
              ...row.hybrid.map((genus) => genusHabitability(genus, facts)),
            );
      }
      return genusHabitability(row.genus, facts);
  }
}

function raceConditionExists(row: CapturedRaceRow): boolean {
  return (
    row.id === "custom" ||
    row.id === "hybrid" ||
    CHALLENGE_RACES.has(row.id) ||
    [
      "aquatic",
      "fey",
      "sand",
      "heat",
      "polar",
      "demonic",
      "angelic",
      "synthetic",
      "eldritch",
      "primordial",
    ].includes(row.genus)
  );
}

function raceWeighting(
  row: CapturedRaceRow,
  habitability: number,
  rows: readonly CapturedRaceRow[],
  facts: CapturedRaceFacts,
):
  | { readonly weighting: number; readonly goals: readonly string[] }
  | undefined {
  const autoUnbound = settingBoolean(facts.settings, "evolutionAutoUnbound");
  const prestigeAscensionPillar = settingBoolean(
    facts.settings,
    "prestigeAscensionPillar",
  );
  const challengeEmfield = settingBoolean(facts.settings, "challenge_emfield");
  if (
    autoUnbound === undefined ||
    prestigeAscensionPillar === undefined ||
    challengeEmfield === undefined
  )
    return undefined;
  if (habitability < (autoUnbound ? 0.8 : 1)) {
    return Object.freeze({ weighting: -1, goals: Object.freeze([]) });
  }

  let weighting = 0;
  const goals: string[] = [];
  const checkAchievement = (baseWeight: number, id: string): boolean => {
    const current = achievementValue(facts.achieve, id, facts.currentAffix);
    const standard = achievementValue(facts.achieve, id, "l");
    if (current === undefined || standard === undefined) return false;
    const improve = facts.starLevel - current;
    if (improve > 0) {
      weighting += baseWeight * improve;
      goals.push(`achieve_${id}_name`);
      if (facts.universe !== "micro" && facts.universe !== "standard") {
        weighting += baseWeight * Math.max(0, facts.starLevel - standard);
      }
    }
    return true;
  };

  if (
    ((facts.prestigeType === "ascension" && prestigeAscensionPillar) ||
      ["demonic", "apotheosis"].includes(facts.prestigeType)) &&
    facts.universe !== "micro"
  ) {
    const speciesPillarLevel = optionalNumber(facts.pillars, row.id);
    if (speciesPillarLevel === undefined) return undefined;
    const canPillar = speciesPillarLevel === 0 && facts.harmony >= 1;
    const canUpgrade =
      speciesPillarLevel > 0 && speciesPillarLevel < facts.starLevel;
    if (canPillar || canUpgrade) {
      weighting += 1000 * Math.max(0, facts.starLevel - speciesPillarLevel);
      if (speciesPillarLevel === 0 && !CHALLENGE_RACES.has(row.id))
        weighting += 100000;
      goals.push("feat_equilibrium_name");
      if (!NO_PILLAR_RACES.has(row.id)) {
        const genusPillar = Math.max(
          0,
          ...rows
            .filter(
              (candidate) =>
                candidate.genus === row.genus &&
                !NO_PILLAR_RACES.has(candidate.id),
            )
            .map(
              (candidate) => optionalNumber(facts.pillars, candidate.id) ?? 0,
            ),
        );
        const improve = facts.starLevel - genusPillar;
        if (improve > 0) {
          weighting += 10000 * improve;
          goals.push("achieve_enlightenment_name");
        }
      }
    }
  }

  if (facts.prestigeType === "apocalypse") {
    const imitateUnlocked = Boolean(readProperty(facts.synth, row.id));
    if (!NO_IMITATES.has(row.id) && !imitateUnlocked) {
      weighting += 10000;
      goals.push("feat_planned_obsolescence_name");
      const index = GOOD_IMITATES.indexOf(
        row.id as (typeof GOOD_IMITATES)[number],
      );
      if (index >= 0) weighting += (GOOD_IMITATES.length - 1 - index) * 5000;
    }
  }

  if (GREATNESS_RESETS.has(facts.prestigeType)) {
    if (
      !NO_GREATNESS_GENERA.has(row.genus) &&
      !NO_GREATNESS_RACES.has(row.id) &&
      !checkAchievement(100, `genus_${row.genus}`)
    )
      return undefined;
  } else if (
    !NO_GREATNESS_RACES.has(row.id) &&
    (!NO_MAD_RACES.has(row.id) || facts.prestigeType !== "mad")
  ) {
    if (!checkAchievement(100, `extinct_${row.id}`)) return undefined;
  }

  if (
    row.genus === "demonic" &&
    facts.prestigeType !== "mad" &&
    facts.prestigeType !== "bioseed"
  ) {
    if (!checkAchievement(50, "blood_war")) return undefined;
  }
  if (
    row.id === "sharkin" &&
    facts.prestigeType !== "mad" &&
    !checkAchievement(50, "laser_shark")
  )
    return undefined;
  if (
    facts.universe === "micro" &&
    facts.prestigeType === "bioseed" &&
    !checkAchievement(
      50,
      row.compact || row.genus === "small" ? "macro" : "marble",
    )
  )
    return undefined;
  if (
    row.id === "balorg" &&
    facts.universe === "magic" &&
    facts.prestigeType === "vacuum" &&
    !checkAchievement(50, "pass")
  )
    return undefined;

  for (const set of FANATIC_ACHIEVEMENTS) {
    if (
      row.id === set.race &&
      facts.gods === set.god &&
      !checkAchievement(150, set.achieve)
    )
      return undefined;
  }
  if (
    weighting > 0 &&
    habitability === 1 &&
    raceConditionExists(row) &&
    !CHALLENGE_RACES.has(row.id)
  )
    weighting += 500;
  if (
    (MID_TIER_RESETS.has(facts.prestigeType) && BEST_FOR_MID.has(row.id)) ||
    (HIGH_TIER_RESETS.has(facts.prestigeType) && BEST_FOR_HIGH.has(row.id))
  )
    weighting += 1;
  if (row.id === facts.gods && !checkAchievement(10, "second_evolution"))
    return undefined;
  for (const set of FANATIC_ACHIEVEMENTS) {
    if (row.id === set.god && !checkAchievement(5, set.achieve))
      return undefined;
  }

  if (facts.universe !== "micro") {
    const checkFeat = (id: string): void => {
      const earned = optionalNumber(facts.feat, id);
      if (earned !== undefined && facts.starLevel - earned > 0) {
        weighting += facts.starLevel - earned;
        goals.push(`feat_${id}_name`);
      }
    };
    if (facts.biome === "hellscape" && row.genus !== "demonic") {
      if (facts.prestigeType === "mad" || facts.prestigeType === "cataclysm")
        checkFeat("take_no_advice");
      else if (facts.prestigeType === "bioseed") checkFeat("ill_advised");
    }
    if (row.id === "junker") {
      if (facts.prestigeType === "bioseed") checkFeat("organ_harvester");
      if (
        facts.prestigeType === "ascension" ||
        facts.prestigeType === "demonic"
      )
        checkFeat("garbage_pie");
      if (
        [
          "ascension",
          "demonic",
          "terraform",
          "whitehole",
          "vacuum",
          "apocalypse",
        ].includes(facts.prestigeType)
      )
        checkFeat("the_misery");
    }
    if (
      facts.prestigeType === "whitehole" &&
      facts.universe === "evil" &&
      row.genus === "angelic"
    )
      checkFeat("nephilim");
    if (facts.prestigeType === "demonic" && row.genus === "angelic")
      checkFeat("twisted");
    if (
      facts.prestigeType === "ascension" &&
      challengeEmfield &&
      row.genus === "artifical" &&
      row.id !== "custom"
    )
      checkFeat("digital_ascension");
    if (facts.prestigeType === "demonic" && row.id === "sludge")
      checkFeat("slime_lord");
  }

  if (CHALLENGE_RACES.has(row.id)) weighting *= facts.starLevel < 5 ? 0 : 0.01;
  return Object.freeze({
    weighting: weighting * habitability,
    goals: Object.freeze(goals),
  });
}

export function sampleCapturedEvolutionRaceCatalog(
  rootValue: unknown,
  settingsValue: unknown,
): CapturedEvolutionRaceCatalogResult {
  const read = readFacts(rootValue, settingsValue);
  if (read === undefined) {
    return Object.freeze({
      status: "unavailable",
      races: [],
      massExtinction: false,
      reason: "required evolution facts unavailable",
    });
  }
  const rows = CAPTURED_EVOLUTION_RACES.map((entry) =>
    customRaceRow(read.facts.root, entry),
  ).filter((row): row is CapturedRaceRow => row !== undefined);
  const races: RaceView[] = [];
  for (const row of rows) {
    const habitability = raceHabitability(row, read.facts);
    if (habitability === undefined) {
      return Object.freeze({
        status: "unavailable",
        races: [],
        massExtinction: read.massExtinction,
        reason: `invalid facts for ${row.id}`,
      });
    }
    const weighting = raceWeighting(row, habitability, rows, read.facts);
    if (weighting === undefined) {
      return Object.freeze({
        status: "unavailable",
        races: [],
        massExtinction: read.massExtinction,
        reason: `invalid weighting facts for ${row.id}`,
      });
    }
    races.push(
      Object.freeze({
        id: row.id,
        name: row.name,
        genus: row.genus,
        habitability,
        weighting: weighting.weighting,
        goals: weighting.goals,
      }),
    );
  }
  return Object.freeze({
    status: "ready",
    races: Object.freeze(races),
    massExtinction: read.massExtinction,
  });
}
