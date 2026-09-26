/**
 * Captured boundary for DeadSpace `ascendLab()` in `src/space.js` at fdda93b5.
 * Presets go through the game's `reset()`, file-based `customImport()`, and `geneEdit()` path; this
 * adapter only observes the normalized live draft and never reproduces strand rules.
 */

import {
  customRaceDraftMatches,
  CUSTOM_RACE_TEXT_LIMITS,
  customRacePresetHasStrandState,
  customRacePresetStrandStateMatches,
  customRacePresetTraitsMatch,
  customRacePresetTextMatches,
  parseCustomRacePreset,
  type CustomRaceDesign,
  type CustomRaceTextField,
  type CustomRacePresetRequest,
} from "../../domain/progression/prestige/custom-race.ts";
import type {
  CustomRaceLabMutationResult,
  CustomRaceLabSubmitResult,
  CustomRaceLabSession,
  CustomRaceSavedSlot,
  CustomRaceLabSnapshot,
  GameCustomRaceLabPort,
} from "../../ports/game-custom-race-lab.ts";
import {
  CUSTOM_RACE_FILE_INPUT_ID,
  CUSTOM_RACE_LAB_CONTROL_ID,
  CUSTOM_RACE_LAB_PANEL_SELECTOR,
  CUSTOM_RACE_LAB_STRAND_ID,
} from "../../ports/game-custom-race-lab.ts";
import type {
  GameControlHandle,
  GameControlRegistry,
} from "../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../ports/game-root-state.ts";
import { finite, isRecord, readProperty } from "../validation.ts";

const CUSTOM_RACE_IMPORT_OBSERVATION_LIMIT = 8;
const CUSTOM_RACE_REPRICE_OBSERVATION_LIMIT = 8;

interface CustomRaceLabDocument {
  querySelector(selector: string): unknown;
  getElementById(id: string): unknown;
  readonly defaultView?: unknown;
}

interface CustomRaceLabDependencies {
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

interface PendingCustomRaceImport {
  readonly root: unknown;
  readonly sessionIdentity: object;
  readonly requestIdentity: string;
  readonly request: CustomRacePresetRequest;
  readonly input: Record<string, unknown>;
  readonly fileList: unknown;
  readonly previousFiles: unknown;
  previousGenomeRanks: unknown;
  previousError: unknown;
  stage: "native-reset" | "native-import" | "native-reprice";
  observations: number;
  baselineStrand: unknown;
  baselineStrandGeneration: number;
  baselineStrandRanks: unknown;
}

interface CompletedCustomRaceImport {
  readonly sessionIdentity: object;
  readonly requestIdentity: string;
  readonly normalizedDraftFingerprint: string;
}

interface FailedCustomRaceImport {
  readonly sessionIdentity: object;
  readonly requestIdentity: string;
  readonly status: "failed" | "stale";
}

interface CustomRaceLabFileConstructor {
  new (
    parts: readonly string[],
    name: string,
    options: Readonly<{ type: string }>,
  ): unknown;
}

interface CustomRaceLabDataTransferConstructor {
  new (): unknown;
}

function customRaceLabDocument(
  value: unknown,
): CustomRaceLabDocument | undefined {
  if (!isRecord(value)) return undefined;
  return typeof readProperty(value, "querySelector") === "function" &&
    typeof readProperty(value, "getElementById") === "function"
    ? (value as unknown as CustomRaceLabDocument)
    : undefined;
}

function customRaceLabRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  return isRecord(value) ? (value as Record<string, unknown>) : undefined;
}

function customRaceLabMap(
  value: unknown,
): Readonly<Record<string, number>> | undefined {
  const record = customRaceLabRecord(value);
  if (record === undefined) return undefined;
  const result: Record<string, number> = {};
  for (const [key, entry] of Object.entries(record)) {
    const numeric = finite(entry);
    if (numeric === undefined) return undefined;
    result[key] = numeric;
  }
  return Object.freeze(result);
}

function customRaceLabDraft(
  genome: Record<string, unknown>,
  ranksValue: unknown,
): CustomRaceDesign | undefined {
  const genus = genome["genus"];
  const rawTraits = genome["traitlist"];
  if (typeof genus !== "string" || !Array.isArray(rawTraits)) return undefined;
  const traitList: string[] = [];
  for (const trait of rawTraits) {
    if (typeof trait !== "string") return undefined;
    traitList.push(trait);
  }
  const ranks = customRaceLabMap(ranksValue);
  const slots = customRaceLabMap(genome["slots"]);
  const recessive = finite(genome["recessive"]);
  const span = finite(genome["span"]);
  if (
    ranks === undefined ||
    slots === undefined ||
    recessive === undefined ||
    span === undefined
  ) {
    return undefined;
  }
  const text: Partial<Record<CustomRaceTextField, string>> = {};
  for (const field of Object.keys(
    CUSTOM_RACE_TEXT_LIMITS,
  ) as CustomRaceTextField[]) {
    const value = genome[field];
    if (typeof value === "string") text[field] = value;
  }
  const fanaticism = genome["fanaticism"];
  if (fanaticism !== false && typeof fanaticism !== "string") return undefined;
  let hybrid: readonly [string, string] | undefined;
  const rawHybrid = genome["hybrid"];
  if (Array.isArray(rawHybrid)) {
    if (
      rawHybrid.length !== 2 ||
      typeof rawHybrid[0] !== "string" ||
      typeof rawHybrid[1] !== "string"
    ) {
      return undefined;
    }
    hybrid = Object.freeze([rawHybrid[0], rawHybrid[1]]);
  }
  return Object.freeze({
    text: Object.freeze(text),
    genus,
    traits: Object.freeze(traitList),
    ranks,
    fanaticism,
    slots,
    recessive,
    span,
    ...(hybrid === undefined ? {} : { hybrid }),
  });
}

function customRaceLabFingerprint(draft: CustomRaceDesign): string {
  return JSON.stringify([
    Object.entries(draft.text).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
    draft.genus,
    [...draft.traits].sort(),
    Object.entries(draft.ranks).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
    draft.fanaticism,
    draft.hybrid ?? null,
    Object.entries(draft.slots).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
    draft.recessive,
    draft.span,
  ]);
}

function customRaceLabSavedRecord(
  root: unknown,
  slot: CustomRaceSavedSlot,
): Record<string, unknown> | undefined {
  return customRaceLabRecord(readProperty(readProperty(root, "custom"), slot));
}

function customRaceLabSavedJson(
  saved: Record<string, unknown> | undefined,
): string | undefined {
  if (saved === undefined) return undefined;
  const rawTraits = Array.isArray(saved["traits"])
    ? saved["traits"]
    : Array.isArray(saved["traitlist"])
      ? saved["traitlist"]
      : undefined;
  if (rawTraits === undefined) return undefined;
  const nativeExport: Record<string, unknown> = {
    ...saved,
    traitlist: rawTraits,
  };
  delete nativeExport["traits"];
  if (
    nativeExport["slotSpan"] === undefined &&
    typeof saved["span"] === "number"
  ) {
    nativeExport["slotSpan"] = saved["span"];
  }
  if (nativeExport["rankVersion"] === undefined && finite(saved["v"]) === 2) {
    nativeExport["rankVersion"] = 2;
  }
  try {
    return JSON.stringify(nativeExport);
  } catch {
    return undefined;
  }
}

function customRaceLabImportFileList(
  doc: CustomRaceLabDocument,
  json: string,
): unknown {
  const pageWindow = customRaceLabRecord(doc.defaultView);
  const FileConstructor = readProperty(pageWindow, "File");
  const DataTransferConstructor = readProperty(pageWindow, "DataTransfer");
  if (
    typeof FileConstructor !== "function" ||
    typeof DataTransferConstructor !== "function"
  ) {
    return undefined;
  }
  const file = Reflect.construct(
    FileConstructor as CustomRaceLabFileConstructor,
    [[json], "evolve-custom-race.txt", { type: "text/plain" }],
  );
  const transfer = Reflect.construct(
    DataTransferConstructor as CustomRaceLabDataTransferConstructor,
    [],
  );
  const items = customRaceLabRecord(readProperty(transfer, "items"));
  const add = readProperty(items, "add");
  if (items === undefined || typeof add !== "function") return undefined;
  Reflect.apply(add, items, [file]);
  return readProperty(transfer, "files");
}

function customRaceLabFileInput(
  doc: CustomRaceLabDocument,
): Record<string, unknown> | undefined {
  return customRaceLabRecord(doc.getElementById(CUSTOM_RACE_FILE_INPUT_ID));
}

export function createGameCustomRaceLab(
  dependencies: CustomRaceLabDependencies,
): GameCustomRaceLabPort {
  const { rootState, controls, getDocument } = dependencies;
  let mounted: MountedCustomRaceLab | undefined;
  let pendingImport: PendingCustomRaceImport | undefined;
  let completedImport: CompletedCustomRaceImport | undefined;
  let failedImport: FailedCustomRaceImport | undefined;

  function mountedRaceLab(): MountedCustomRaceLab | undefined {
    const root = rootState.readRoot();
    if (root === undefined || rootState.isReactivitySuppressed())
      return undefined;
    const doc = customRaceLabDocument(getDocument());
    if (
      doc === undefined ||
      doc.querySelector(CUSTOM_RACE_LAB_PANEL_SELECTOR) == null
    ) {
      return undefined;
    }
    const handle = controls.resolve(CUSTOM_RACE_LAB_CONTROL_ID);
    const view =
      handle === undefined ? undefined : customRaceLabRecord(handle.data);
    const genome = customRaceLabRecord(readProperty(view, "g"));
    if (
      handle === undefined ||
      view === undefined ||
      genome === undefined ||
      !handle.methods.includes("reset") ||
      !handle.methods.includes("customImport") ||
      !handle.methods.includes("geneEdit") ||
      !handle.methods.includes("setRace")
    ) {
      return undefined;
    }
    if (
      mounted === undefined ||
      mounted.root !== root ||
      mounted.handle.generation !== handle.generation
    ) {
      mounted = Object.freeze({
        root,
        handle,
        view,
        genome,
        session: Object.freeze({ identity: Object.freeze({}) }),
      });
      pendingImport = undefined;
      completedImport = undefined;
      failedImport = undefined;
    } else {
      mounted = Object.freeze({ ...mounted, handle, view, genome });
    }
    return mounted;
  }

  function currentRaceSession(
    session: CustomRaceLabSession,
  ): MountedCustomRaceLab | undefined {
    const current = mountedRaceLab();
    return current !== undefined &&
      current.session.identity === session.identity &&
      current.root === rootState.readRoot()
      ? current
      : undefined;
  }

  function readLiveDraft(
    current: MountedCustomRaceLab,
    doc: CustomRaceLabDocument,
  ):
    | Readonly<{
        draft: CustomRaceDesign;
        strandHandle: Readonly<GameControlHandle>;
        strandRanks: Record<string, unknown>;
        strandSurface: unknown;
        savedSlot: CustomRaceSavedSlot;
      }>
    | undefined {
    const strandHandle = controls.resolve(CUSTOM_RACE_LAB_STRAND_ID);
    const strandData =
      strandHandle === undefined
        ? undefined
        : customRaceLabRecord(strandHandle.data);
    const strandRanks = customRaceLabRecord(readProperty(strandData, "t"));
    if (
      strandHandle === undefined ||
      strandData === undefined ||
      readProperty(strandData, "g") !== current.genome ||
      strandRanks === undefined
    ) {
      return undefined;
    }
    const savedSlot: CustomRaceSavedSlot = Array.isArray(
      current.genome["hybrid"],
    )
      ? "race1"
      : "race0";
    const draft = customRaceLabDraft(current.genome, strandRanks);
    const strandSurface = doc.querySelector(CUSTOM_RACE_LAB_STRAND_ID);
    if (draft === undefined || strandSurface == null) return undefined;
    return Object.freeze({
      draft,
      strandHandle,
      strandRanks,
      strandSurface,
      savedSlot,
    });
  }

  function restoreImportFile(
    pending: PendingCustomRaceImport,
    doc: CustomRaceLabDocument,
  ): void {
    if (doc.getElementById(CUSTOM_RACE_FILE_INPUT_ID) !== pending.input) return;
    try {
      pending.input["files"] = pending.previousFiles;
    } catch {
      // FileList restoration is cosmetic; native FileReader already owns its File reference.
    }
  }

  function failPendingImport(
    current: MountedCustomRaceLab,
    requestIdentity: string,
    status: "failed" | "stale",
    doc: CustomRaceLabDocument,
  ): void {
    if (pendingImport !== undefined) restoreImportFile(pendingImport, doc);
    pendingImport = undefined;
    completedImport = undefined;
    failedImport = Object.freeze({
      sessionIdentity: current.session.identity,
      requestIdentity,
      status,
    });
  }

  function observeImport(
    current: MountedCustomRaceLab,
    doc: CustomRaceLabDocument,
    live: NonNullable<ReturnType<typeof readLiveDraft>>,
  ): CustomRaceLabSnapshot["recalculation"] {
    const pending = pendingImport;
    if (pending === undefined) return "idle";
    if (
      pending.root !== current.root ||
      pending.sessionIdentity !== current.session.identity
    ) {
      return "pending";
    }
    const observedRequestIdentity = pending.requestIdentity;
    pending.observations += 1;
    if (pending.stage === "native-reset") {
      if (
        live.strandSurface !== pending.baselineStrand &&
        live.strandHandle.generation > pending.baselineStrandGeneration &&
        live.strandRanks !== pending.baselineStrandRanks
      ) {
        const currentHandle = controls.resolve(CUSTOM_RACE_LAB_CONTROL_ID);
        if (
          currentHandle === undefined ||
          currentHandle.generation !== current.handle.generation ||
          currentHandle.data !== current.handle.data ||
          doc.getElementById(CUSTOM_RACE_FILE_INPUT_ID) !== pending.input
        ) {
          failPendingImport(current, observedRequestIdentity, "stale", doc);
          return "stale";
        }
        pending.previousGenomeRanks = current.genome["ranks"];
        pending.previousError = readProperty(
          readProperty(current.view, "err"),
          "msg",
        );
        pending.stage = "native-import";
        pending.observations = 0;
        try {
          pending.input["files"] = pending.fileList;
        } catch {
          failPendingImport(current, observedRequestIdentity, "failed", doc);
          return "failed";
        }
        const result = controls.invoke(currentHandle, "customImport");
        if (!result.ok) {
          failPendingImport(current, observedRequestIdentity, "stale", doc);
          return "stale";
        }
        return "pending";
      }
      if (pending.observations >= CUSTOM_RACE_REPRICE_OBSERVATION_LIMIT) {
        failPendingImport(current, observedRequestIdentity, "failed", doc);
        return "failed";
      }
      return "pending";
    }
    if (pending.stage === "native-import") {
      const gameError = readProperty(readProperty(current.view, "err"), "msg");
      if (
        typeof gameError === "string" &&
        gameError !== "" &&
        gameError !== pending.previousError
      ) {
        failPendingImport(current, observedRequestIdentity, "failed", doc);
        return "failed";
      }
      if (current.genome["ranks"] !== pending.previousGenomeRanks) {
        const currentHandle = controls.resolve(CUSTOM_RACE_LAB_CONTROL_ID);
        if (
          currentHandle === undefined ||
          currentHandle.generation !== current.handle.generation
        ) {
          failPendingImport(current, observedRequestIdentity, "stale", doc);
          return "stale";
        }
        pending.stage = "native-reprice";
        pending.observations = 0;
        pending.baselineStrand = live.strandSurface;
        pending.baselineStrandGeneration = live.strandHandle.generation;
        pending.baselineStrandRanks = live.strandRanks;
        restoreImportFile(pending, doc);
        const result = controls.invoke(currentHandle, "geneEdit");
        if (!result.ok) {
          failPendingImport(current, observedRequestIdentity, "stale", doc);
          return "stale";
        }
        return "pending";
      }
      if (pending.observations >= CUSTOM_RACE_IMPORT_OBSERVATION_LIMIT) {
        failPendingImport(current, observedRequestIdentity, "failed", doc);
        return "failed";
      }
      return "pending";
    }
    if (
      live.strandSurface !== pending.baselineStrand &&
      live.strandHandle.generation > pending.baselineStrandGeneration &&
      live.strandRanks !== pending.baselineStrandRanks
    ) {
      const fingerprint = customRaceLabFingerprint(live.draft);
      if (
        !customRacePresetTraitsMatch(live.draft, pending.request) ||
        !customRacePresetTextMatches(live.draft, pending.request) ||
        (customRacePresetHasStrandState(pending.request) &&
          !customRacePresetStrandStateMatches(live.draft, pending.request))
      ) {
        failPendingImport(current, observedRequestIdentity, "failed", doc);
        return "failed";
      }
      completedImport = Object.freeze({
        sessionIdentity: current.session.identity,
        requestIdentity: observedRequestIdentity,
        normalizedDraftFingerprint: fingerprint,
      });
      restoreImportFile(pending, doc);
      pendingImport = undefined;
      failedImport = undefined;
      return "settled";
    }
    if (pending.observations >= CUSTOM_RACE_REPRICE_OBSERVATION_LIMIT) {
      failPendingImport(current, observedRequestIdentity, "failed", doc);
      return "failed";
    }
    return "pending";
  }

  function read(requestIdentity: string): CustomRaceLabSnapshot | undefined {
    const current = mountedRaceLab();
    const doc = customRaceLabDocument(getDocument());
    if (current === undefined || doc === undefined) return undefined;
    const live = readLiveDraft(current, doc);
    if (live === undefined) return undefined;
    if (
      failedImport !== undefined &&
      (failedImport.sessionIdentity !== current.session.identity ||
        failedImport.requestIdentity !== requestIdentity)
    ) {
      failedImport = undefined;
    }
    let recalculation: CustomRaceLabSnapshot["recalculation"] = observeImport(
      current,
      doc,
      live,
    );
    if (failedImport?.requestIdentity === requestIdentity) {
      recalculation = failedImport.status;
    } else if (
      pendingImport === undefined &&
      completedImport?.sessionIdentity === current.session.identity &&
      completedImport.requestIdentity === requestIdentity
    ) {
      const currentFingerprint = customRaceLabFingerprint(live.draft);
      if (currentFingerprint === completedImport.normalizedDraftFingerprint) {
        recalculation = "settled";
      } else {
        completedImport = undefined;
        recalculation = "idle";
      }
    } else if (
      completedImport?.sessionIdentity === current.session.identity ||
      failedImport?.sessionIdentity === current.session.identity
    ) {
      recalculation = "idle";
    }
    const currentHandle = current.handle;
    const savedRace = customRaceLabSavedRecord(current.root, live.savedSlot);
    const savedCustomRaceJson = customRaceLabSavedJson(savedRace);
    const savedPreset =
      savedCustomRaceJson === undefined
        ? undefined
        : parseCustomRacePreset(savedCustomRaceJson);
    return Object.freeze({
      session: current.session,
      draft: live.draft,
      hybridLab: live.savedSlot === "race1",
      savedCustomRaceExists: savedRace !== undefined,
      ...(savedCustomRaceJson === undefined ? {} : { savedCustomRaceJson }),
      savedCustomRaceReady:
        savedPreset?.ok === true &&
        customRacePresetHasStrandState(savedPreset.request) &&
        customRaceDraftMatches(live.draft, savedPreset.request),
      canSubmit:
        currentHandle.methods.includes("setRace") &&
        doc.querySelector(`${CUSTOM_RACE_LAB_PANEL_SELECTOR} .create button`) !=
          null,
      recalculation,
      ...(completedImport?.sessionIdentity === current.session.identity
        ? { appliedPresetIdentity: completedImport.requestIdentity }
        : {}),
    });
  }

  function applyDesign(
    session: CustomRaceLabSession,
    request: CustomRacePresetRequest,
    requestIdentity: string,
  ): CustomRaceLabMutationResult {
    const current = currentRaceSession(session);
    if (current === undefined) {
      return Object.freeze({
        status: "stale",
        reason: "Custom Race lab session was replaced",
      });
    }
    if (pendingImport !== undefined) {
      return Object.freeze({
        status: "unavailable",
        reason: "a native preset import is still pending",
      });
    }
    if (
      failedImport?.sessionIdentity === current.session.identity &&
      failedImport.requestIdentity === requestIdentity
    ) {
      return Object.freeze({
        status: "rejected",
        reason: "native preset application already failed",
      });
    }
    const doc = customRaceLabDocument(getDocument());
    const input = doc === undefined ? undefined : customRaceLabFileInput(doc);
    const live = doc === undefined ? undefined : readLiveDraft(current, doc);
    if (doc === undefined || input === undefined || live === undefined) {
      return Object.freeze({
        status: "unavailable",
        reason: "native Custom Race import surface is unavailable",
      });
    }
    const fileList = customRaceLabImportFileList(doc, request.importJson);
    if (fileList === undefined) {
      return Object.freeze({
        status: "unavailable",
        reason: "page File and DataTransfer APIs are unavailable",
      });
    }
    const previousFiles = input["files"];
    const pending: PendingCustomRaceImport = {
      root: current.root,
      sessionIdentity: current.session.identity,
      requestIdentity,
      request,
      input,
      fileList,
      previousFiles,
      previousGenomeRanks: undefined,
      previousError: undefined,
      stage: "native-reset",
      observations: 0,
      baselineStrand: live.strandSurface,
      baselineStrandGeneration: live.strandHandle.generation,
      baselineStrandRanks: live.strandRanks,
    };
    pendingImport = pending;
    failedImport = undefined;
    completedImport = undefined;
    const currentHandle = controls.resolve(CUSTOM_RACE_LAB_CONTROL_ID);
    if (
      currentHandle === undefined ||
      currentHandle.generation !== current.handle.generation ||
      currentHandle.data !== current.handle.data ||
      !currentHandle.methods.includes("reset")
    ) {
      pendingImport = undefined;
      return Object.freeze({
        status: "stale",
        reason: "Custom Race lab changed before native reset",
      });
    }
    const result = controls.invoke(currentHandle, "reset");
    if (!result.ok) {
      pendingImport = undefined;
      return Object.freeze({
        status: "stale",
        reason: result.detail ?? result.reason,
      });
    }
    return Object.freeze({ status: "pending" });
  }

  function submit(
    session: CustomRaceLabSession,
    requestIdentity: string,
  ): CustomRaceLabSubmitResult {
    const current = currentRaceSession(session);
    if (current === undefined) {
      return Object.freeze({
        status: "stale",
        reason: "Custom Race lab session was replaced",
      });
    }
    const snapshot = read(requestIdentity);
    if (
      snapshot === undefined ||
      snapshot.session.identity !== session.identity
    ) {
      return Object.freeze({
        status: "stale",
        reason: "Custom Race draft is unavailable",
      });
    }
    if (
      snapshot.recalculation === "pending" ||
      snapshot.recalculation === "failed" ||
      snapshot.recalculation === "stale"
    ) {
      return Object.freeze({
        status: "unavailable",
        reason: "native Custom Race recalculation is not settled",
      });
    }
    if (!snapshot.canSubmit) {
      return Object.freeze({
        status: "unavailable",
        reason: "native setRace control is unavailable",
      });
    }
    const handle = controls.resolve(CUSTOM_RACE_LAB_CONTROL_ID);
    if (
      handle === undefined ||
      handle.generation !== current.handle.generation
    ) {
      return Object.freeze({
        status: "stale",
        reason: "Custom Race lab changed before setRace",
      });
    }
    const result = controls.invoke(handle, "setRace");
    if (!result.ok) {
      return Object.freeze({
        status: "stale",
        reason: result.detail ?? result.reason,
      });
    }
    if (result.value === false) {
      return Object.freeze({
        status: "rejected",
        reason: "DeadSpace setRace rejected the live design",
      });
    }
    return Object.freeze({ status: "requested" });
  }

  return Object.freeze({
    read,
    applyDesign,
    submit,
    readCurrentSavedRaceJson(): string | undefined {
      const current = mountedRaceLab();
      if (current === undefined) return undefined;
      const slot: CustomRaceSavedSlot = Array.isArray(current.genome["hybrid"])
        ? "race1"
        : "race0";
      return customRaceLabSavedJson(
        customRaceLabSavedRecord(current.root, slot),
      );
    },
    readSavedRaceJson(slot: CustomRaceSavedSlot): string | undefined {
      return customRaceLabSavedJson(
        customRaceLabSavedRecord(rootState.readRoot(), slot),
      );
    },
  });
}
