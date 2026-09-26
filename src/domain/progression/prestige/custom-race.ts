/**
 * Pure Custom Race policy for DeadSpace's Ascension Lab.
 *
 * Genome score, trait pricing/descriptions, genus opposition and rank stepping are owned by the
 * game (`calcGenomeScore`, `geneCost`, `getTraitDesc` and `stepLabRank` in `space.js`). This module
 * validates named preset JSON and decides when the captured lab may apply or submit it; it does not
 * reproduce those game rules. The few import-format conversions mirror `customImport()` because
 * that upstream method is a FileReader event handler, not a callable record-normalization API.
 */

/** Text lengths mirrored only for checking the result of `customImport()` in DeadSpace `space.js`. */
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
  /** Current DeadSpace placement map: trait name to gene-slot index. */
  readonly slots: Readonly<Record<string, number>>;
  readonly recessive: number;
  readonly span: number;
}

export interface CustomRacePresetRequest {
  /** Exact selected settings value, used to invalidate work when selection changes. */
  readonly sourceJson: string;
  /** JSON handed to DeadSpace's native file importer, with saved-race field aliases filled in. */
  readonly importJson: string;
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
  | { readonly ok: true; readonly request: CustomRacePresetRequest }
  | { readonly ok: false; readonly reason: string };

export type CustomRaceLabDecision =
  | { readonly kind: "pause" }
  | { readonly kind: "wait" }
  | { readonly kind: "apply"; readonly request: CustomRacePresetRequest }
  | { readonly kind: "submit" };

export interface CustomRaceLabDecisionInput {
  readonly mode: "reuse" | "pause" | "import";
  readonly savedCustomRaceReady: boolean;
  readonly canSubmit: boolean;
  readonly preset: CustomRacePresetParseResult;
  readonly draftMatchesPreset: boolean;
  readonly recalculation: "idle" | "pending" | "settled" | "failed" | "stale";
}

function isCustomRaceRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCustomRaceNumericMap(
  value: unknown,
): value is Record<string, unknown> {
  return (
    isCustomRaceRecord(value) &&
    Object.values(value).every(
      (entry) => typeof entry === "number" && Number.isFinite(entry),
    )
  );
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

/** Validates JSON transport shape; DeadSpace owns all race and strand normalization. */
export function parseCustomRacePreset(
  rawJson: unknown,
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
  const rawTraits = parsed["traitlist"] ?? parsed["traits"];
  if (
    !Array.isArray(rawTraits) ||
    rawTraits.some((trait) => typeof trait !== "string")
  ) {
    return Object.freeze({
      ok: false,
      reason: "preset must include a valid trait list",
    });
  }
  if (typeof parsed["genus"] !== "string") {
    return Object.freeze({
      ok: false,
      reason: "preset must include a valid genus",
    });
  }
  const rawHybrid = parsed["hybrid"];
  if (
    rawHybrid !== undefined &&
    (!Array.isArray(rawHybrid) ||
      rawHybrid.length !== 2 ||
      rawHybrid.some((genus) => typeof genus !== "string"))
  ) {
    return Object.freeze({
      ok: false,
      reason: "preset hybrid data has an invalid JSON shape",
    });
  }
  if (parsed["genus"] === "hybrid" && rawHybrid === undefined) {
    return Object.freeze({
      ok: false,
      reason: "hybrid preset must include its lineage pair",
    });
  }
  if (
    parsed["ranks"] !== undefined &&
    !isCustomRaceNumericMap(parsed["ranks"])
  ) {
    return Object.freeze({
      ok: false,
      reason: "preset rank map has an invalid JSON shape",
    });
  }
  if (
    parsed["slots"] !== undefined &&
    !isCustomRaceNumericMap(parsed["slots"])
  ) {
    return Object.freeze({
      ok: false,
      reason: "preset slot map has an invalid JSON shape",
    });
  }
  for (const field of ["span", "slotSpan", "recessive"] as const) {
    if (
      parsed[field] !== undefined &&
      (typeof parsed[field] !== "number" || !Number.isFinite(parsed[field]))
    ) {
      return Object.freeze({
        ok: false,
        reason: `preset ${field} has an invalid JSON shape`,
      });
    }
  }
  if (parsed["genus"] !== undefined && typeof parsed["genus"] !== "string") {
    return Object.freeze({
      ok: false,
      reason: "preset genus has an invalid JSON shape",
    });
  }
  if (
    parsed["fanaticism"] !== undefined &&
    parsed["fanaticism"] !== false &&
    typeof parsed["fanaticism"] !== "string"
  ) {
    return Object.freeze({
      ok: false,
      reason: "preset fanaticism has an invalid JSON shape",
    });
  }
  for (const field of Object.keys(
    CUSTOM_RACE_TEXT_LIMITS,
  ) as CustomRaceTextField[]) {
    if (parsed[field] !== undefined && typeof parsed[field] !== "string") {
      return Object.freeze({
        ok: false,
        reason: `preset ${field} has an invalid JSON shape`,
      });
    }
  }
  const nativeInput: Record<string, unknown> = { ...parsed };
  if (nativeInput["traitlist"] === undefined && rawTraits !== undefined) {
    nativeInput["traitlist"] = rawTraits;
  }
  if (
    nativeInput["slotSpan"] === undefined &&
    typeof nativeInput["span"] === "number"
  ) {
    nativeInput["slotSpan"] = nativeInput["span"];
  }
  if (nativeInput["rankVersion"] === undefined && nativeInput["v"] === 2) {
    nativeInput["rankVersion"] = 2;
  }
  let importJson: string;
  try {
    importJson = JSON.stringify(nativeInput);
  } catch {
    return Object.freeze({ ok: false, reason: "preset cannot be serialized" });
  }
  return Object.freeze({
    ok: true,
    request: Object.freeze({
      sourceJson: rawJson,
      importJson,
    }),
  });
}

/** Compares only complete native exports; legacy layouts must be normalized by the game first. */
export function customRaceDraftMatches(
  current: CustomRaceDesign,
  request: CustomRacePresetRequest,
): boolean {
  let wanted: unknown;
  try {
    wanted = JSON.parse(request.sourceJson);
  } catch {
    return false;
  }
  if (!isCustomRaceRecord(wanted)) return false;
  const rawTraits = wanted["traitlist"] ?? wanted["traits"];
  const rawRanks = wanted["ranks"];
  const rawSlots = wanted["slots"];
  const rawSpan = wanted["slotSpan"] ?? wanted["span"];
  const hybrid = wanted["hybrid"];
  // Without the saved slot map and span the preset says nothing about effective strand layout.
  if (
    !Array.isArray(rawTraits) ||
    !rawTraits.every((trait) => typeof trait === "string") ||
    !isCustomRaceRecord(rawRanks) ||
    !isCustomRaceRecord(rawSlots) ||
    typeof rawSpan !== "number" ||
    typeof wanted["recessive"] !== "number" ||
    typeof wanted["genus"] !== "string"
  ) {
    return false;
  }
  const slots: Record<string, number> = {};
  for (const [trait, slot] of Object.entries(rawSlots)) {
    if (typeof slot !== "number" || !Number.isFinite(slot)) return false;
    slots[trait] = slot;
  }
  const ranks: Record<string, number> = {};
  for (const [trait, rank] of Object.entries(rawRanks)) {
    if (typeof rank !== "number" || !Number.isFinite(rank)) return false;
    ranks[trait] = rank;
  }
  if (!customRacePresetTextMatches(current, request)) return false;
  if (
    wanted["genus"] !== current.genus ||
    wanted["recessive"] !== current.recessive ||
    rawSpan !== current.span ||
    (wanted["fanaticism"] ?? false) !== current.fanaticism ||
    rawTraits.length !== current.traits.length ||
    rawTraits.some((trait) => !current.traits.includes(trait)) ||
    Object.keys(ranks).length !== Object.keys(current.ranks).length ||
    Object.entries(ranks).some(
      ([trait, rank]) => current.ranks[trait] !== rank,
    ) ||
    Object.keys(slots).length !== Object.keys(current.slots).length ||
    Object.entries(slots).some(([trait, slot]) => current.slots[trait] !== slot)
  ) {
    return false;
  }
  if (Array.isArray(hybrid)) {
    return (
      hybrid.length === 2 &&
      hybrid[0] === current.hybrid?.[0] &&
      hybrid[1] === current.hybrid?.[1]
    );
  }
  return current.hybrid === undefined;
}

/** Current-format exports carry enough state to require an exact normalized strand comparison. */
export function customRacePresetHasStrandState(
  request: CustomRacePresetRequest,
): boolean {
  let wanted: unknown;
  try {
    wanted = JSON.parse(request.sourceJson);
  } catch {
    return false;
  }
  if (!isCustomRaceRecord(wanted)) return false;
  const traits = wanted["traitlist"] ?? wanted["traits"];
  const span = wanted["slotSpan"] ?? wanted["span"];
  return (
    Array.isArray(traits) &&
    isCustomRaceRecord(wanted["ranks"]) &&
    isCustomRaceRecord(wanted["slots"]) &&
    typeof wanted["recessive"] === "number" &&
    Number.isFinite(wanted["recessive"]) &&
    typeof span === "number" &&
    Number.isFinite(span)
  );
}

/** Native import may normalize a legacy strand, but it must retain every requested trait. */
export function customRacePresetTraitsMatch(
  current: CustomRaceDesign,
  request: CustomRacePresetRequest,
): boolean {
  let wanted: unknown;
  try {
    wanted = JSON.parse(request.sourceJson);
  } catch {
    return false;
  }
  if (!isCustomRaceRecord(wanted)) return false;
  const rawTraits = wanted["traitlist"] ?? wanted["traits"];
  if (
    !Array.isArray(rawTraits) ||
    !rawTraits.every((trait) => typeof trait === "string")
  ) {
    return false;
  }
  const expected = new Set(rawTraits);
  return (
    expected.size === rawTraits.length &&
    current.traits.length === expected.size &&
    current.traits.every((trait) => expected.has(trait))
  );
}

/**
 * Mirrors customImport()'s truthy text assignment and field truncation for live-state checks.
 * Empty strings are not assigned by the native importer, so they make no text postcondition.
 */
export function customRacePresetTextMatches(
  current: CustomRaceDesign,
  request: CustomRacePresetRequest,
): boolean {
  let wanted: unknown;
  try {
    wanted = JSON.parse(request.sourceJson);
  } catch {
    return false;
  }
  if (!isCustomRaceRecord(wanted)) return false;
  for (const field of Object.keys(
    CUSTOM_RACE_TEXT_LIMITS,
  ) as CustomRaceTextField[]) {
    const value = wanted[field];
    if (value === undefined || value === "") continue;
    if (
      typeof value !== "string" ||
      current.text[field] !== value.slice(0, CUSTOM_RACE_TEXT_LIMITS[field])
    ) {
      return false;
    }
  }
  return true;
}

/** Checks imported strand state while leaving cross-lab genus conversion to DeadSpace. */
export function customRacePresetStrandStateMatches(
  current: CustomRaceDesign,
  request: CustomRacePresetRequest,
): boolean {
  let wanted: unknown;
  try {
    wanted = JSON.parse(request.sourceJson);
  } catch {
    return false;
  }
  if (!isCustomRaceRecord(wanted)) return false;
  const rawTraits = wanted["traitlist"] ?? wanted["traits"];
  const rawRanks = wanted["ranks"];
  const rawSlots = wanted["slots"];
  const rawSpan = wanted["slotSpan"] ?? wanted["span"];
  if (
    !Array.isArray(rawTraits) ||
    !rawTraits.every((trait) => typeof trait === "string") ||
    !isCustomRaceNumericMap(rawRanks) ||
    !isCustomRaceNumericMap(rawSlots) ||
    typeof wanted["recessive"] !== "number" ||
    typeof rawSpan !== "number"
  ) {
    return false;
  }
  return (
    rawTraits.length === current.traits.length &&
    rawTraits.every((trait) => current.traits.includes(trait)) &&
    Object.keys(rawRanks).length === Object.keys(current.ranks).length &&
    Object.entries(rawRanks).every(
      ([trait, rank]) => current.ranks[trait] === rank,
    ) &&
    Object.keys(rawSlots).length === Object.keys(current.slots).length &&
    Object.entries(rawSlots).every(
      ([trait, slot]) => current.slots[trait] === slot,
    ) &&
    wanted["recessive"] === current.recessive &&
    rawSpan === current.span &&
    (wanted["fanaticism"] ?? false) === current.fanaticism
  );
}

/** Chooses the safe next step; the caller owns whether the lab session is still current. */
export function planCustomRaceLab(
  input: CustomRaceLabDecisionInput,
): CustomRaceLabDecision {
  if (input.mode === "pause") return Object.freeze({ kind: "pause" });
  if (input.recalculation === "pending") return Object.freeze({ kind: "wait" });
  if (input.mode === "reuse") {
    if (
      !input.preset.ok ||
      input.recalculation === "failed" ||
      input.recalculation === "stale"
    ) {
      return Object.freeze({ kind: "pause" });
    }
    if (!input.canSubmit) {
      return Object.freeze({ kind: "pause" });
    }
    return input.savedCustomRaceReady || input.draftMatchesPreset
      ? Object.freeze({ kind: "submit" })
      : Object.freeze({ kind: "apply", request: input.preset.request });
  }
  if (
    !input.preset.ok ||
    input.recalculation === "failed" ||
    input.recalculation === "stale"
  ) {
    return Object.freeze({ kind: "pause" });
  }
  if (!input.draftMatchesPreset) {
    return Object.freeze({ kind: "apply", request: input.preset.request });
  }
  return input.canSubmit
    ? Object.freeze({ kind: "submit" })
    : Object.freeze({ kind: "pause" });
}
