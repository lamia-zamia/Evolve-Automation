/**
 * Captured boundary for DeadSpace `ascendLab()` in `src/space.js`.
 *
 * It reads the materialized `#celestialLab` binding data, calls its captured `geneEdit`/submit
 * methods, and scans the game's rendered `.field.t<trait-id>` rows. Genome score, trait cost and
 * trait descriptions stay with the game.
 */

import {
  CUSTOM_RACE_TEXT_LIMITS,
  customRaceGenesAreAffordable,
  customRaceDraftMatches,
  customRaceTextIsComplete,
  type CustomRaceDesign,
} from "../../domain/progression/prestige/custom-race.ts";
import type { CelestialLabMode } from "../../domain/progression/prestige/prestige.ts";
import type {
  CustomRaceLabMutationResult,
  CustomRaceLabSession,
  CustomRaceSavedSlot,
  CustomRaceLabSnapshot,
  GameCustomRaceLabPort,
} from "../../ports/game-custom-race-lab.ts";
import {
  CUSTOM_RACE_LAB_CONTROL_ID,
  CUSTOM_RACE_LAB_PANEL_SELECTOR,
} from "../../ports/game-custom-race-lab.ts";
import type {
  GameControlHandle,
  GameControlRegistry,
} from "../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../ports/game-root-state.ts";
import { finite, isRecord, readProperty } from "../validation.ts";

const CUSTOM_RACE_TRAIT_ROWS_SELECTOR = "#celestialLab .trait_selection .field";
const CUSTOM_RACE_LAB_SUMMARY_CONTROL_ID = "#traitSummary .trait_selection";
const CUSTOM_RACE_TRAIT_CLASS_PREFIX = "t";
const CUSTOM_RACE_GENUS_ACHIEVEMENT_PREFIX = "genus_";
const CUSTOM_RACE_RANKS_PROPERTY = "ranks";

interface CustomRaceLabDocument {
  querySelector(selector: string): unknown;
  querySelectorAll(selector: string): ArrayLike<unknown>;
}

export interface GameCustomRaceLabDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly getDocument: () => unknown;
}

interface MountedCustomRaceLab {
  readonly root: unknown;
  readonly handle: Readonly<GameControlHandle>;
  readonly view: Record<string, unknown>;
  readonly genome: Record<string, unknown>;
  readonly session: CustomRaceLabSession;
}

interface PendingCustomRaceRecalculation {
  readonly identity: object;
  readonly expected: CustomRaceDesign;
  lastGenes: number | undefined;
}

function customRaceSubmitMethod(mode: CelestialLabMode): string {
  return mode === "terraform" ? "setPlanet" : "setRace";
}

function customRaceDocument(value: unknown): CustomRaceLabDocument | undefined {
  if (!isRecord(value)) return undefined;
  const querySelector = readProperty(value, "querySelector");
  const querySelectorAll = readProperty(value, "querySelectorAll");
  return typeof querySelector === "function" &&
    typeof querySelectorAll === "function"
    ? (value as unknown as CustomRaceLabDocument)
    : undefined;
}

function customRaceRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? (value as Record<string, unknown>) : undefined;
}

function customRaceTraitsFromDom(
  doc: CustomRaceLabDocument,
): readonly string[] {
  const found = doc.querySelectorAll(CUSTOM_RACE_TRAIT_ROWS_SELECTOR);
  const traits = new Set<string>();
  for (let index = 0; index < found.length; index += 1) {
    const row = customRaceRecord(found[index]);
    const classValue = readProperty(row, "className");
    if (typeof classValue !== "string") continue;
    for (const className of classValue.split(/\s+/)) {
      if (!className.startsWith(CUSTOM_RACE_TRAIT_CLASS_PREFIX)) continue;
      const trait = className.slice(CUSTOM_RACE_TRAIT_CLASS_PREFIX.length);
      if (/^[a-z0-9_]+$/.test(trait)) traits.add(trait);
    }
  }
  return Object.freeze([...traits]);
}

function customRaceDraftFromLive(
  genome: Record<string, unknown>,
  controls: GameControlRegistry,
): CustomRaceDesign | undefined {
  const genus = genome["genus"];
  const rawTraits = genome["traitlist"];
  const rawRanks = genome[CUSTOM_RACE_RANKS_PROPERTY];
  if (
    typeof genus !== "string" ||
    !Array.isArray(rawTraits) ||
    !isRecord(rawRanks)
  ) {
    return undefined;
  }
  const traits: string[] = [];
  for (const trait of rawTraits) {
    if (typeof trait !== "string") return undefined;
    traits.push(trait);
  }
  const ranks: Record<string, number> = {};
  const summary = controls.resolve(CUSTOM_RACE_LAB_SUMMARY_CONTROL_ID);
  const summaryData =
    summary === undefined ? undefined : customRaceRecord(summary.data);
  const hasCurrentSummary =
    summaryData !== undefined && summaryData["g"] === genome;
  for (const trait of traits) {
    let rank = rawRanks[trait];
    if (hasCurrentSummary && summary?.methods.includes("tRank")) {
      const result = controls.invoke(summary, "tRank", [trait]);
      if (!result.ok) return undefined;
      rank = result.value;
    }
    const numericRank = rank === undefined ? 1 : finite(rank);
    if (numericRank === undefined) return undefined;
    ranks[trait] = numericRank;
  }
  const text: Partial<Record<keyof typeof CUSTOM_RACE_TEXT_LIMITS, string>> =
    {};
  for (const field of Object.keys(CUSTOM_RACE_TEXT_LIMITS) as Array<
    keyof typeof CUSTOM_RACE_TEXT_LIMITS
  >) {
    const value = genome[field];
    if (typeof value === "string") text[field] = value;
  }
  const rawFanaticism = genome["fanaticism"];
  if (rawFanaticism !== false && typeof rawFanaticism !== "string") {
    return undefined;
  }
  let hybrid: readonly [string, string] | undefined;
  const rawHybrid = genome["hybrid"];
  if (Array.isArray(rawHybrid) && rawHybrid.length === 2) {
    if (typeof rawHybrid[0] !== "string" || typeof rawHybrid[1] !== "string") {
      return undefined;
    }
    hybrid = Object.freeze([rawHybrid[0], rawHybrid[1]]);
  }
  return Object.freeze({
    text: Object.freeze(text),
    genus,
    traits: Object.freeze(traits),
    ranks: Object.freeze(ranks),
    fanaticism: rawFanaticism,
    ...(hybrid === undefined ? {} : { hybrid }),
  });
}

function customRaceAvailableGenera(
  root: unknown,
  currentDraft: CustomRaceDesign,
): readonly string[] {
  const stats = readProperty(root, "stats");
  const achievements = readProperty(stats, "achieve");
  const genera = new Set<string>();
  if (isRecord(achievements)) {
    for (const [key, value] of Object.entries(achievements)) {
      if (
        key.startsWith(CUSTOM_RACE_GENUS_ACHIEVEMENT_PREFIX) &&
        finite(readProperty(value, "l")) !== undefined &&
        (finite(readProperty(value, "l")) ?? 0) > 0
      ) {
        const genus = key.slice(CUSTOM_RACE_GENUS_ACHIEVEMENT_PREFIX.length);
        if (/^[a-z0-9_]+$/.test(genus)) genera.add(genus);
      }
    }
  }
  if (currentDraft.genus !== "hybrid") genera.add(currentDraft.genus);
  for (const genus of currentDraft.hybrid ?? []) genera.add(genus);
  return Object.freeze([...genera]);
}

function customRaceSavedRecord(
  root: unknown,
  slot: CustomRaceSavedSlot,
): Record<string, unknown> | undefined {
  return customRaceRecord(readProperty(readProperty(root, "custom"), slot));
}

function customRaceSavedJson(
  root: unknown,
  slot: CustomRaceSavedSlot,
): string | undefined {
  const saved = customRaceSavedRecord(root, slot);
  if (saved === undefined) return undefined;
  const traits = Array.isArray(saved["traits"])
    ? saved["traits"]
    : Array.isArray(saved["traitlist"])
      ? saved["traitlist"]
      : undefined;
  if (traits === undefined) return undefined;
  try {
    return JSON.stringify({
      ...saved,
      genes: 0,
      traitlist: traits,
      traits: undefined,
      rankVersion: 2,
    });
  } catch {
    return undefined;
  }
}

export function createGameCustomRaceLab({
  rootState,
  controls,
  getDocument,
}: GameCustomRaceLabDependencies): GameCustomRaceLabPort {
  let mounted: MountedCustomRaceLab | undefined;
  let recalculation: PendingCustomRaceRecalculation | undefined;

  function mountedLab(
    mode?: CelestialLabMode,
  ): MountedCustomRaceLab | undefined {
    const root = rootState.readRoot();
    if (root === undefined || rootState.isReactivitySuppressed())
      return undefined;
    const doc = customRaceDocument(getDocument());
    if (
      doc === undefined ||
      doc.querySelector(CUSTOM_RACE_LAB_PANEL_SELECTOR) == null
    ) {
      return undefined;
    }
    const handle = controls.resolve(CUSTOM_RACE_LAB_CONTROL_ID);
    if (
      handle === undefined ||
      (mode !== undefined &&
        !handle.methods.includes(customRaceSubmitMethod(mode))) ||
      !handle.methods.includes("geneEdit")
    ) {
      return undefined;
    }
    const view = customRaceRecord(handle.data);
    const genome = customRaceRecord(readProperty(view, "g"));
    if (view === undefined || genome === undefined) return undefined;
    if (
      mounted === undefined ||
      mounted.root !== root ||
      mounted.handle.generation !== handle.generation
    ) {
      const identity = Object.freeze({});
      mounted = Object.freeze({
        root,
        handle,
        view,
        genome,
        session: Object.freeze({ identity }),
      });
      recalculation = undefined;
    } else {
      mounted = Object.freeze({ ...mounted, handle, view, genome });
    }
    return mounted;
  }

  function sessionMatches(
    session: CustomRaceLabSession,
  ): MountedCustomRaceLab | undefined {
    const current = mountedLab();
    return current !== undefined &&
      current.session.identity === session.identity &&
      rootState.readRoot() === current.root
      ? current
      : undefined;
  }

  function read(mode: CelestialLabMode): CustomRaceLabSnapshot | undefined {
    const current = mountedLab(mode);
    if (current === undefined) return undefined;
    const draft = customRaceDraftFromLive(current.genome, controls);
    if (draft === undefined) return undefined;
    const doc = customRaceDocument(getDocument());
    if (doc === undefined) return undefined;
    const genes = finite(current.genome["genes"]);
    let status: CustomRaceLabSnapshot["recalculation"] = "idle";
    if (recalculation !== undefined) {
      if (recalculation.identity !== current.session.identity) {
        recalculation = undefined;
      } else if (!customRaceDraftMatches(draft, recalculation.expected)) {
        recalculation = undefined;
      } else if (genes === undefined) {
        status = "failed";
      } else if (recalculation.lastGenes === genes) {
        status = "settled";
        recalculation = undefined;
      } else {
        recalculation.lastGenes = genes;
        status = "pending";
      }
    }
    const hybridLab = draft.genus === "hybrid";
    const savedSlot: CustomRaceSavedSlot = hybridLab ? "race1" : "race0";
    const handle = current.handle;
    const submitMethod = customRaceSubmitMethod(mode);
    return Object.freeze({
      session: current.session,
      draft,
      availableTraits: customRaceTraitsFromDom(doc),
      availableGenera: customRaceAvailableGenera(current.root, draft),
      hybridLab,
      savedCustomRaceExists:
        customRaceSavedRecord(current.root, savedSlot) !== undefined,
      canSubmit:
        handle.methods.includes(submitMethod) &&
        doc.querySelector(`${CUSTOM_RACE_LAB_PANEL_SELECTOR} .create button`) !=
          null,
      genes: genes ?? Number.NaN,
      recalculation: status,
    });
  }

  function applyDesign(
    session: CustomRaceLabSession,
    design: CustomRaceDesign,
  ): CustomRaceLabMutationResult {
    const current = sessionMatches(session);
    if (current === undefined) {
      return Object.freeze({
        status: "stale",
        reason: "lab session was replaced",
      });
    }
    const doc = customRaceDocument(getDocument());
    if (doc === undefined) {
      return Object.freeze({
        status: "unavailable",
        reason: "lab document is unavailable",
      });
    }
    const offered = new Set(customRaceTraitsFromDom(doc));
    if (design.traits.some((trait) => !offered.has(trait))) {
      return Object.freeze({
        status: "rejected",
        reason: "preset contains an unavailable trait",
      });
    }
    const currentDraft = customRaceDraftFromLive(current.genome, controls);
    if (currentDraft === undefined) {
      return Object.freeze({
        status: "unavailable",
        reason: "live race draft is unavailable",
      });
    }
    const availableGenera = new Set(
      customRaceAvailableGenera(current.root, currentDraft),
    );
    if (
      (design.genus !== "hybrid" && !availableGenera.has(design.genus)) ||
      (design.hybrid !== undefined &&
        design.hybrid.some((genus) => !availableGenera.has(genus)))
    ) {
      return Object.freeze({
        status: "rejected",
        reason: "preset contains an unavailable genus",
      });
    }
    const ranks = customRaceRecord(current.genome[CUSTOM_RACE_RANKS_PROPERTY]);
    if (ranks === undefined) {
      return Object.freeze({
        status: "rejected",
        reason: "live rank map is unavailable",
      });
    }
    const preparedSummary = controls.invoke(current.handle, "swapTab", [4]);
    if (!preparedSummary.ok) {
      return Object.freeze({
        status: "unavailable",
        reason: "game rank controls are unavailable",
      });
    }
    const originalSummary = controls.resolve(
      CUSTOM_RACE_LAB_SUMMARY_CONTROL_ID,
    );
    const originalSummaryData =
      originalSummary === undefined
        ? undefined
        : customRaceRecord(originalSummary.data);
    const originalRanks = customRaceRecord(
      readProperty(originalSummaryData, "t"),
    );
    const liveLab = current;
    if (
      originalSummaryData?.["g"] !== current.genome ||
      originalRanks === undefined ||
      !originalSummary?.methods.includes("tRank")
    ) {
      return Object.freeze({
        status: "unavailable",
        reason: "game rank controls are unavailable",
      });
    }
    const rankValuesBefore = Object.freeze({ ...originalRanks });
    const previousDesign = customRaceDraftFromLive(current.genome, controls);
    if (previousDesign === undefined) {
      return Object.freeze({
        status: "unavailable",
        reason: "live race draft changed while preparing rank controls",
      });
    }
    const rollbackDesign = previousDesign;
    const textValuesBefore = Object.freeze(
      Object.fromEntries(
        Object.keys(design.text).map((field) => [
          field,
          readProperty(current.genome, field),
        ]),
      ),
    );

    function restorePreviousDesign(
      status: "stale" | "rejected",
      reason: string,
    ): CustomRaceLabMutationResult {
      for (const [field, value] of Object.entries(textValuesBefore)) {
        if (value === undefined) delete liveLab.genome[field];
        else liveLab.genome[field] = value;
      }
      liveLab.genome["genus"] = rollbackDesign.genus;
      liveLab.genome["traitlist"] = [...rollbackDesign.traits];
      liveLab.genome["fanaticism"] = rollbackDesign.fanaticism;
      if (rollbackDesign.hybrid === undefined) delete liveLab.genome["hybrid"];
      else liveLab.genome["hybrid"] = [...rollbackDesign.hybrid];

      const latestSummary = controls.resolve(
        CUSTOM_RACE_LAB_SUMMARY_CONTROL_ID,
      );
      const latestData =
        latestSummary === undefined
          ? undefined
          : customRaceRecord(latestSummary.data);
      const latestRanks = customRaceRecord(readProperty(latestData, "t"));
      if (latestRanks === undefined || latestData?.["g"] !== liveLab.genome) {
        return Object.freeze({
          status: "stale",
          reason: "failed apply could not restore the live rank map",
        });
      }
      for (const key of Object.keys(latestRanks)) delete latestRanks[key];
      Object.assign(latestRanks, rankValuesBefore);

      const refreshed = controls.resolve(CUSTOM_RACE_LAB_CONTROL_ID);
      if (
        refreshed === undefined ||
        refreshed.generation !== liveLab.handle.generation
      ) {
        return Object.freeze({
          status: "stale",
          reason: "lab was redrawn before the failed apply could be restored",
        });
      }
      const recost = controls.invoke(refreshed, "geneEdit");
      if (!recost.ok) {
        return Object.freeze({
          status: "stale",
          reason: "failed apply could not recalculate the restored design",
        });
      }
      const restored = customRaceDraftFromLive(liveLab.genome, controls);
      if (
        restored === undefined ||
        !customRaceDraftMatches(restored, rollbackDesign)
      ) {
        return Object.freeze({
          status: "stale",
          reason: "failed apply did not restore the previous design",
        });
      }
      recalculation = {
        identity: liveLab.session.identity,
        expected: rollbackDesign,
        lastGenes: undefined,
      };
      return Object.freeze({ status, reason });
    }

    for (const [field, value] of Object.entries(design.text)) {
      current.genome[field] = value;
    }
    current.genome["genus"] = design.genus;
    current.genome["traitlist"] = [...design.traits];
    current.genome["fanaticism"] = design.fanaticism;
    if (design.hybrid === undefined) {
      delete current.genome["hybrid"];
    } else {
      current.genome["hybrid"] = [...design.hybrid];
    }
    // DeadSpace's native customImport assigns its lexical `tRanks` map directly, then calls
    // geneEdit(). The captured summary binding exposes that same map as `t`; use the game method
    // for recalculation because increase/reduce cannot reach imported legacy tiers 1.33/1.67.
    const swapSummary = controls.invoke(current.handle, "swapTab", [4]);
    if (!swapSummary.ok) {
      return restorePreviousDesign(
        "stale",
        "game rank controls became unavailable",
      );
    }
    const summary = controls.resolve(CUSTOM_RACE_LAB_SUMMARY_CONTROL_ID);
    const summaryData =
      summary === undefined ? undefined : customRaceRecord(summary.data);
    const currentRanks = customRaceRecord(readProperty(summaryData, "t"));
    if (
      summary === undefined ||
      summaryData?.["g"] !== current.genome ||
      currentRanks === undefined ||
      !summary.methods.includes("tRank")
    ) {
      return restorePreviousDesign(
        "stale",
        "game rank controls became unavailable",
      );
    }
    for (const trait of design.traits) {
      currentRanks[trait] = design.ranks[trait]!;
      const rankResult = controls.invoke(summary, "tRank", [trait]);
      if (!rankResult.ok || finite(rankResult.value) !== design.ranks[trait]) {
        return restorePreviousDesign(
          "stale",
          "lab did not retain the requested trait rank",
        );
      }
    }
    const refreshedHandle = controls.resolve(CUSTOM_RACE_LAB_CONTROL_ID);
    if (
      refreshedHandle === undefined ||
      refreshedHandle.generation !== current.handle.generation
    ) {
      return Object.freeze({
        status: "stale",
        reason: "lab was redrawn while applying the preset",
      });
    }
    const liveDraft = customRaceDraftFromLive(current.genome, controls);
    if (liveDraft === undefined || !customRaceDraftMatches(liveDraft, design)) {
      return restorePreviousDesign(
        "rejected",
        "lab did not retain the requested design",
      );
    }
    const result = controls.invoke(refreshedHandle, "geneEdit");
    if (!result.ok) {
      return restorePreviousDesign("stale", result.detail ?? result.reason);
    }
    recalculation = {
      identity: current.session.identity,
      expected: design,
      lastGenes: undefined,
    };
    return Object.freeze({ status: "applied" });
  }

  function submit(
    session: CustomRaceLabSession,
    mode: CelestialLabMode,
  ): CustomRaceLabMutationResult {
    const current = sessionMatches(session);
    if (current === undefined) {
      return Object.freeze({
        status: "stale",
        reason: "lab session was replaced",
      });
    }
    const snapshot = read(mode);
    if (
      snapshot === undefined ||
      snapshot.session.identity !== session.identity
    ) {
      return Object.freeze({
        status: "stale",
        reason: "lab snapshot is unavailable",
      });
    }
    if (
      snapshot.recalculation === "pending" ||
      snapshot.recalculation === "failed"
    ) {
      return Object.freeze({
        status: "unavailable",
        reason: "lab recost has not settled",
      });
    }
    if (!snapshot.canSubmit) {
      return Object.freeze({
        status: "unavailable",
        reason: "lab submit control is unavailable",
      });
    }
    if (!customRaceGenesAreAffordable(snapshot.genes)) {
      return Object.freeze({
        status: "rejected",
        reason: "game gene balance is not affordable",
      });
    }
    if (!customRaceTextIsComplete(snapshot.draft.text)) {
      return Object.freeze({
        status: "rejected",
        reason: "required race text is empty",
      });
    }
    const result = controls.invoke(
      current.handle,
      customRaceSubmitMethod(mode),
    );
    return result.ok
      ? Object.freeze({ status: "applied" })
      : Object.freeze({
          status: "stale",
          reason: result.detail ?? result.reason,
        });
  }

  return Object.freeze({
    read,
    applyDesign,
    submit,
    readSavedRaceJson(slot: CustomRaceSavedSlot): string | undefined {
      return customRaceSavedJson(rootState.readRoot(), slot);
    },
  });
}
