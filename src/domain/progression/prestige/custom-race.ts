/**
 * Pure Custom Race policy for DeadSpace's Ascension Lab.
 *
 * Genome score, trait pricing/descriptions, genus opposition and rank stepping are owned by the
 * game (`calcGenomeScore`, `geneCost`, `getTraitDesc` and `stepLabRank` in `space.js`). This module
 * validates named preset JSON and decides when the captured lab may apply or submit it; it does not
 * reproduce those game rules. The few import-format conversions mirror `customImport()` because
 * that upstream method is a FileReader event handler, not a callable record-normalization API.
 */

export const CUSTOM_RACE_TEXT_LIMITS = Object.freeze({
  name: 20,
  desc: 255,
  entity: 40,
  home: 20,
  red: 20,
  hell: 20,
  gas: 20,
  gas_moon: 20,
  dwarf: 20,
  titan: 20,
  enceladus: 20,
  triton: 20,
  makemake: 20,
  eris: 20,
});

export type CustomRaceTextField = keyof typeof CUSTOM_RACE_TEXT_LIMITS;

export interface CustomRaceDesign {
  readonly text: Readonly<Partial<Record<CustomRaceTextField, string>>>;
  readonly genus: string;
  readonly traits: readonly string[];
  readonly ranks: Readonly<Record<string, number>>;
  readonly fanaticism: string | false;
  readonly hybrid?: readonly [string, string];
}

export interface CustomRacePreset {
  readonly name: string;
  readonly json: string;
}

export interface CustomRacePresetOption {
  readonly val: string;
  readonly label: string;
  readonly hint: string;
}

export type CustomRacePresetParseResult =
  | { readonly ok: true; readonly design: CustomRaceDesign }
  | { readonly ok: false; readonly reason: string };

export interface CustomRacePresetFacts {
  readonly availableTraits: readonly string[];
  readonly availableGenera: readonly string[];
  readonly hybridLab: boolean;
}

export type CustomRaceLabDecision =
  | { readonly kind: "pause" }
  | { readonly kind: "wait" }
  | { readonly kind: "apply"; readonly design: CustomRaceDesign }
  | { readonly kind: "submit" };

export interface CustomRaceLabDecisionInput {
  readonly mode: "reuse" | "pause" | "import";
  readonly savedCustomRaceExists: boolean;
  readonly canSubmit: boolean;
  readonly preset: CustomRacePresetParseResult;
  readonly draftMatchesPreset: boolean;
  readonly recalculation: "idle" | "pending" | "settled" | "failed";
  readonly genes: number;
}

const CUSTOM_RACE_REQUIRED_TEXT_FIELDS: readonly CustomRaceTextField[] =
  Object.freeze([
    "name",
    "desc",
    "entity",
    "home",
    "red",
    "hell",
    "gas",
    "gas_moon",
    "dwarf",
  ]);

/** Mirrors `setRace()`'s required-text check over the fields captured from the live genome. */
export function customRaceTextIsComplete(
  text: Readonly<Partial<Record<CustomRaceTextField, string>>>,
): boolean {
  return CUSTOM_RACE_REQUIRED_TEXT_FIELDS.every(
    (field) => typeof text[field] === "string" && text[field]!.length > 0,
  );
}

/** Mirrors DeadSpace `setRace()`'s nonnegative `calcGenomeScore()` submit gate. */
export function customRaceGenesAreAffordable(genes: number): boolean {
  return Number.isFinite(genes) && genes >= 0;
}

function isCustomRaceRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function customRaceStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !/^[a-z0-9_]+$/.test(entry)) {
      return undefined;
    }
    items.push(entry);
  }
  return items;
}

/**
 * Mirrors upstream `legacyTraitRank` in `races.js` for presets predating rankVersion 2. The helper
 * is lexical to the game module and the captured lab exposes no rank-normalization method; its
 * native `customImport()` requires a file input, so named JSON presets need this small format shim.
 */
function normalizeLegacyCustomRaceRank(rank: number): number {
  if (rank === 2) return 1.33;
  if (rank === 3) return 1.67;
  if (rank === 4) return 2;
  return rank;
}

/** Reads and normalizes the named preset list without exposing the settings record itself. */
export function normalizeCustomRacePresetList(
  rawSettings: unknown,
): readonly CustomRacePreset[] {
  const settings = isCustomRaceRecord(rawSettings) ? rawSettings : {};
  const rawPresets = settings["prestigeCustomRacePresets"];
  const presets = Array.isArray(rawPresets)
    ? rawPresets.flatMap((raw): CustomRacePreset[] => {
        if (!isCustomRaceRecord(raw)) return [];
        return [
          Object.freeze({
            name:
              typeof raw["name"] === "string" && raw["name"].trim() !== ""
                ? raw["name"].trim().slice(0, 60)
                : "Custom Race",
            json: typeof raw["json"] === "string" ? raw["json"] : "",
          }),
        ];
      })
    : [];
  return Object.freeze(
    presets.length > 0
      ? presets
      : [Object.freeze({ name: "General", json: "" })],
  );
}

/** Reads just the selected preset and repairs malformed imported setting values in its read model. */
export function readCustomRacePresetSelection(
  rawSettings: unknown,
): Readonly<{ index: number; preset: CustomRacePreset }> {
  const settings = isCustomRaceRecord(rawSettings) ? rawSettings : {};
  const available = normalizeCustomRacePresetList(rawSettings);
  const parsedIndex = Number.parseInt(
    String(settings["prestigeCustomRacePreset"] ?? "0"),
    10,
  );
  const index =
    Number.isInteger(parsedIndex) &&
    parsedIndex >= 0 &&
    parsedIndex < available.length
      ? parsedIndex
      : 0;
  return Object.freeze({ index, preset: available[index]! });
}

/** Settings UI options use preset array positions as the persisted ids. */
export function customRacePresetOptions(
  rawSettings: unknown,
): readonly CustomRacePresetOption[] {
  return Object.freeze(
    normalizeCustomRacePresetList(rawSettings).map((preset, index) =>
      Object.freeze({
        val: String(index),
        label: preset.name || `Preset ${index + 1}`,
        hint: "Custom race preset",
      }),
    ),
  );
}

/**
 * Validates and normalizes an exported race against facts read from the mounted lab. The text
 * limits and missing-rank default mirror DeadSpace `customImport()` and `repriceGenome()` in
 * `space.js`; score and rank unlock rules remain game-owned.
 */
export function parseCustomRacePreset(
  rawJson: unknown,
  facts: CustomRacePresetFacts,
): CustomRacePresetParseResult {
  if (typeof rawJson !== "string" || rawJson.trim() === "") {
    return Object.freeze({ ok: false, reason: "preset is empty" });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return Object.freeze({ ok: false, reason: "preset is not valid JSON" });
  }
  if (!isCustomRaceRecord(parsed)) {
    return Object.freeze({ ok: false, reason: "preset must be a race object" });
  }

  const traits = customRaceStringArray(parsed["traitlist"] ?? parsed["traits"]);
  if (traits === undefined) {
    return Object.freeze({
      ok: false,
      reason: "preset has no valid trait list",
    });
  }
  if (new Set(traits).size !== traits.length) {
    return Object.freeze({
      ok: false,
      reason: "preset contains duplicate traits",
    });
  }
  const offeredTraits = new Set(facts.availableTraits);
  if (traits.some((trait) => !offeredTraits.has(trait))) {
    return Object.freeze({
      ok: false,
      reason: "preset contains traits unavailable in this lab",
    });
  }

  const text: Partial<Record<CustomRaceTextField, string>> = {};
  for (const field of Object.keys(
    CUSTOM_RACE_TEXT_LIMITS,
  ) as CustomRaceTextField[]) {
    const value = parsed[field];
    if (typeof value === "string") {
      text[field] = value.slice(0, CUSTOM_RACE_TEXT_LIMITS[field]);
    }
  }
  if (!customRaceTextIsComplete(text)) {
    return Object.freeze({
      ok: false,
      reason: "preset is missing required race names or description",
    });
  }

  let hybrid: readonly [string, string] | undefined;
  const rawHybrid = customRaceStringArray(parsed["hybrid"]);
  if (rawHybrid !== undefined && rawHybrid.length === 2) {
    hybrid = Object.freeze([rawHybrid[0]!, rawHybrid[1]!]);
  }
  const rawGenus = parsed["genus"];
  if (typeof rawGenus !== "string" || !/^[a-z0-9_]+$/.test(rawGenus)) {
    return Object.freeze({ ok: false, reason: "preset has no valid genus" });
  }

  // DeadSpace `customImport()` applies these format conversions for a preset created in the other
  // lab mode. The native function cannot accept structured JSON through the captured port because
  // it is bound to the file input, so keep only this cross-mode JSON normalization here.
  let genus = rawGenus;
  if (facts.hybridLab && rawGenus !== "hybrid") {
    hybrid = Object.freeze([
      rawGenus,
      rawGenus === "humanoid" ? "small" : "humanoid",
    ]);
    genus = "hybrid";
  } else if (!facts.hybridLab && rawGenus === "hybrid") {
    if (hybrid === undefined) {
      return Object.freeze({
        ok: false,
        reason: "hybrid preset is missing its genus pair",
      });
    }
    genus = hybrid[0];
    hybrid = undefined;
  } else if (rawGenus === "hybrid" && hybrid === undefined) {
    return Object.freeze({
      ok: false,
      reason: "hybrid preset is missing its genus pair",
    });
  }
  const availableGenera = new Set(facts.availableGenera);
  if (
    (genus !== "hybrid" && !availableGenera.has(genus)) ||
    (hybrid !== undefined &&
      hybrid.some((entry) => !availableGenera.has(entry)))
  ) {
    return Object.freeze({
      ok: false,
      reason: "preset contains a genus unavailable in this lab",
    });
  }

  const rawRanks = parsed["ranks"];
  if (rawRanks !== undefined && !isCustomRaceRecord(rawRanks)) {
    return Object.freeze({ ok: false, reason: "preset ranks are malformed" });
  }
  const ranks: Record<string, number> = {};
  const isCurrentRankVersion = parsed["rankVersion"] === 2;
  if (isCustomRaceRecord(rawRanks)) {
    for (const [trait, rank] of Object.entries(rawRanks)) {
      const normalizedRank =
        typeof rank === "number" && !isCurrentRankVersion
          ? normalizeLegacyCustomRaceRank(rank)
          : rank;
      if (
        !traits.includes(trait) ||
        typeof normalizedRank !== "number" ||
        !Number.isFinite(normalizedRank) ||
        normalizedRank < 0.1 ||
        normalizedRank > 2 ||
        (normalizedRank !== 1.33 &&
          normalizedRank !== 1.67 &&
          Math.abs(normalizedRank * 20 - Math.round(normalizedRank * 20)) >
            1e-8)
      ) {
        return Object.freeze({
          ok: false,
          reason:
            "preset ranks must use the lab's 0.05 steps from 0.1 through 2",
        });
      }
      ranks[trait] = normalizedRank;
    }
  }
  for (const trait of traits) ranks[trait] ??= 1;

  const rawFanaticism = parsed["fanaticism"];
  const fanaticism =
    typeof rawFanaticism === "string" && rawFanaticism !== ""
      ? rawFanaticism
      : false;
  if (fanaticism !== false && !traits.includes(fanaticism)) {
    return Object.freeze({
      ok: false,
      reason: "Fanaticism must target a selected trait",
    });
  }
  return Object.freeze({
    ok: true,
    design: Object.freeze({
      text: Object.freeze(text),
      genus,
      traits: Object.freeze(traits),
      ranks: Object.freeze(ranks),
      fanaticism,
      ...(hybrid === undefined ? {} : { hybrid }),
    }),
  });
}

/** Compares only the intended design fields, including the in-place game-owned rank map. */
export function customRaceDraftMatches(
  current: CustomRaceDesign,
  wanted: CustomRaceDesign,
): boolean {
  const wantedTraits = new Set(wanted.traits);
  if (
    current.genus !== wanted.genus ||
    current.fanaticism !== wanted.fanaticism ||
    current.traits.length !== wanted.traits.length ||
    current.traits.some((trait) => !wantedTraits.has(trait))
  ) {
    return false;
  }
  for (const [field, value] of Object.entries(wanted.text)) {
    if (current.text[field as CustomRaceTextField] !== value) return false;
  }
  const wantedRanks = Object.keys(wanted.ranks);
  const currentRanks = Object.keys(current.ranks);
  if (
    wantedRanks.length !== currentRanks.length ||
    wantedRanks.some((trait) => current.ranks[trait] !== wanted.ranks[trait])
  ) {
    return false;
  }
  return (
    (current.hybrid?.[0] ?? undefined) === (wanted.hybrid?.[0] ?? undefined) &&
    (current.hybrid?.[1] ?? undefined) === (wanted.hybrid?.[1] ?? undefined)
  );
}

/** Chooses the safe next step; the caller owns whether the lab session is still current. */
export function planCustomRaceLab(
  input: CustomRaceLabDecisionInput,
): CustomRaceLabDecision {
  if (input.mode === "pause") return Object.freeze({ kind: "pause" });
  if (input.recalculation === "pending") return Object.freeze({ kind: "wait" });
  if (input.mode === "reuse") {
    return input.savedCustomRaceExists &&
      input.canSubmit &&
      input.recalculation !== "failed" &&
      customRaceGenesAreAffordable(input.genes)
      ? Object.freeze({ kind: "submit" })
      : Object.freeze({ kind: "pause" });
  }
  if (!input.preset.ok || input.recalculation === "failed") {
    return Object.freeze({ kind: "pause" });
  }
  if (!input.draftMatchesPreset) {
    return Object.freeze({ kind: "apply", design: input.preset.design });
  }
  return input.canSubmit && customRaceGenesAreAffordable(input.genes)
    ? Object.freeze({ kind: "submit" })
    : Object.freeze({ kind: "pause" });
}
