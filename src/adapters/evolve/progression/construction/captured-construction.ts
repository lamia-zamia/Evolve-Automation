/**
 * The one construction cycle on the captured page surface: several families in, one weighting
 * order out, decided by the existing pure build planners.
 *
 * Each family says what it offers and how it buys. Everything a candidate is judged by —
 * affordability, cost conflicts, resource competition — is asked here, over one live sample, so a
 * building and a project compete against each other exactly as two buildings do.
 *
 * Optional script-derived inputs stay explicit at this boundary: managed candidates may carry
 * validated consumption entries, storage requirements may be supplied by the storage planner, and
 * Knowledge-cap requirements may be supplied by the Knowledge gate reader. If a caller omits one,
 * the cycle leaves that gate unknown rather than guessing from the upstream root.
 */

import type {
  BuildConsumptionView,
  BuildAnnotation,
  BuildCandidateSample,
  BuildClickDecision,
  BuildCompetitionRequest,
  BuildCompetitionSample,
  BuildConflictSample,
  BuildCycleSetup,
  BuildScopedResourceSample,
  BuildResourceView,
  BuildResourceScope,
  BuildSampleRequest,
} from "../../../../domain/progression/build/build.ts";
import { storageRequirementScopeKey } from "../../../../domain/economy/storage/storage-requirements.ts";
import { resourceView } from "../../../../domain/game-world.ts";
import type { ResourceView } from "../../../../domain/game-world.ts";
import {
  findPlannerLimit,
  type PlannerRequirement,
  type PlannerReadoutBlocker,
} from "../../../../domain/planner-analysis.ts";
import type {
  BuildClickResult,
  BuildExecutor,
  BuildReader,
} from "../../../../ports/build.ts";
import type {
  ConstructionCandidate,
  ConstructionCandidateSource,
  ConstructionCycleOptions,
} from "../../../../ports/construction-candidates.ts";
import type { GameResourceSource } from "../../../../ports/game-world-state.ts";
import type {
  ConstructionReadoutSnapshot,
  ConstructionTargetReadout,
  SavingTarget,
  ConstructionObservations,
} from "../../../../ports/game-construction-observations.ts";
import type { KnowledgeGateLevels } from "../../../../domain/progression/build/building-weighting.ts";
import { stale, SUCCEEDED } from "../../../command-outcomes.ts";
import type { CapturedCostConflictReader } from "../../captured-cost-conflict.ts";
import { costFitsNow, costFitsStorage } from "../../captured-affordability.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import {
  decideConstructionTargetAdmission,
  type ConstructionSavingPriorityRevision,
  type ConstructionTargetAdmissionDecision,
  type ConstructionTargetAdmissionRequest,
} from "../../../../domain/progression/build/construction-target-admission.ts";

declare global {
  var __EA_P53_CONSTRUCTION_AUTHORITY_ENABLED__: boolean | undefined;
  var __EA_P54_CONSTRUCTION_ACTIVATION_ENABLED__: boolean | undefined;
}

export interface CapturedConstructionDependencies {
  /** Families in the order they break weighting ties, matching the game's own list order. */
  readonly sources: readonly ConstructionCandidateSource[];
  readonly resources: GameResourceSource;
  readonly rootState: GameRootStateSource;
  readonly conflicts: CapturedCostConflictReader;
  readonly readOptions: () => ConstructionCycleOptions;
  /** Optional script-computed Knowledge requirements; absent means no gate is applied. */
  readonly readKnowledgeGate?: () => KnowledgeGateLevels;
  /** Script storage-planner values; missing ids remain unknown rather than treated as capped. */
  readonly readStorageRequired?: (
    resourceIds: readonly string[],
    resourceScopes?: readonly BuildResourceScope[],
  ) => Readonly<Record<string, number>> | undefined;
  /** Enables the planner's read-only resource sample; disabled panels add no planner sampling. */
  readonly readPresentationSettings?: () => Readonly<{
    activeTargetsUI: boolean;
    buildPlannerUI: boolean;
  }>;
  /** A due State Log sample needs the same planner-detail observations as Script Planner. */
  readonly readStateLogPlannerDetailsDue?: () => boolean;
  /** Prospective test-only authority; erased from ordinary bundles at build time. */
  readonly targetAdmissionForTest?: Readonly<{
    readRequest: (
      eventFed?: boolean,
    ) => ConstructionTargetAdmissionRequest | undefined;
    readEventFedMode?: () => boolean;
    /** Compatibility for existing test owners that provide a fixed activation mode. */
    eventFed?: boolean;
    readRootObservationCountForTest?: () => number | undefined;
    readContext: () =>
      | Readonly<{
          period: number;
          rootGeneration: number;
          progressionGeneration: string;
        }>
      | undefined;
    onDecision?: (
      decision: Readonly<ConstructionTargetAdmissionDecision>,
      candidateKey?: string,
      evaluationMs?: number,
    ) => void;
    onOperation?: (
      operation:
        | "request-source-read"
        | "local-pending-request-check"
        | "context-identity-sample"
        | "reservation-evidence-read"
        | "native-control-authority-read"
        | "native-action-execution"
        | "construction-cycle",
      elapsedMs?: number,
    ) => void;
    onActivationModeSample?: (
      enabled: boolean,
      boundary:
        | "adapter-created"
        | "cycle-begin"
        | "admission"
        | "publication-finish"
        | "execution-revalidation",
      workCycleId: number,
      request?: Readonly<ConstructionTargetAdmissionRequest>,
    ) => void;
    onPublicationAuthoritySample?: (
      sample: Readonly<{
        constructionWorkCycleId: number;
        nextWorkCycleId: number;
        capturedContextPeriod: number | null;
        completedIntentCandidateKeys: readonly string[];
        requestId: string | null;
        requestGeneration: number | null;
        capturedRootGeneration: number | null;
        capturedProgressionGeneration: string | null;
      }>,
    ) => void;
    onRequestConsumed?: (
      request: Readonly<ConstructionTargetAdmissionRequest>,
    ) => void;
    onRequestExpired?: (
      request: Readonly<ConstructionTargetAdmissionRequest>,
    ) => void;
    onRequestInvalidated?: (
      request: Readonly<ConstructionTargetAdmissionRequest>,
    ) => void;
    onRequestCycleReleased?: (
      request: Readonly<ConstructionTargetAdmissionRequest>,
    ) => void;
    onRootObservationSample?: (
      operation: "reservation-evidence-read" | "native-control-authority-read",
      rootReads: number,
    ) => void;
  }>;
}

export interface CapturedConstructionAdapter {
  readonly reader: BuildReader;
  readonly executor: BuildExecutor;
  /** Samples and publishes the same complete candidate order without executing purchases. */
  readonly establishOrdering: () => boolean;
  /** Previous completed ordering with affordability read from the current root. */
  readonly observations: ConstructionObservations;
}

interface CycleEntry {
  readonly candidate: Readonly<ConstructionCandidate>;
  readonly source: ConstructionCandidateSource;
}

const NO_CONSUMPTION: readonly Readonly<BuildConsumptionView>[] = Object.freeze(
  [],
);
const ZERO_KNOWLEDGE_GATE = Object.freeze({
  cheapestTechKnowledge: 0,
  knowledgeRequiredByBuildTargets: 0,
  knowledgeCapacity: 0,
});

/** A cost key that names no stored resource (`Morale`, `Army`) has nothing to report. */
const LOCKED_RESOURCE: BuildResourceView = Object.freeze({
  resourcePresent: false,
  unlocked: false,
  currentQuantity: 0,
  maximumQuantity: 0,
  rateOfChange: 0,
  storageRatio: 0,
  storageRequired: Number.NaN,
});

function toBuildResourceView(
  view: Readonly<ResourceView>,
  storageRequired: number,
): BuildResourceView {
  return Object.freeze({
    resourcePresent: view.present,
    unlocked: view.unlocked,
    currentQuantity: view.amount,
    maximumQuantity: view.max,
    rateOfChange: view.rateOfChange,
    storageRatio: view.storageRatio,
    storageRequired,
  });
}

function sameAuthorityRecord(
  left: Readonly<Record<string, number>>,
  right: Readonly<Record<string, number>>,
): boolean {
  if (
    left === null ||
    right === null ||
    typeof left !== "object" ||
    typeof right !== "object"
  )
    return false;
  const leftKeys = Object.keys(left);
  return (
    leftKeys.length === Object.keys(right).length &&
    leftKeys.every((key) => left[key] === right[key])
  );
}

function sameCompletePrice(
  expected: Readonly<Record<string, number>>,
  actual: Readonly<Record<string, number | undefined>> | undefined,
): boolean {
  if (actual === undefined || actual === null || typeof actual !== "object")
    return false;
  const expectedKeys = Object.keys(expected);
  return (
    expectedKeys.length === Object.keys(actual).length &&
    expectedKeys.every(
      (key) =>
        typeof actual[key] === "number" &&
        Number.isFinite(actual[key]) &&
        actual[key] === expected[key],
    )
  );
}

function sameTargetAdmissionRequest(
  left: Readonly<ConstructionTargetAdmissionRequest> | undefined,
  right: Readonly<ConstructionTargetAdmissionRequest>,
): boolean {
  if (left === undefined) return false;
  try {
    return (
      left.requestId === right.requestId &&
      left.generation === right.generation &&
      left.active === right.active &&
      left.origin === right.origin &&
      left.targetBuildingId === right.targetBuildingId &&
      left.maximumPurchases === right.maximumPurchases &&
      sameAuthorityRecord(
        left.maximumTotalAuthorizedResourceDebit,
        right.maximumTotalAuthorizedResourceDebit,
      ) &&
      left.scope.period === right.scope.period &&
      left.scope.workCycleId === right.scope.workCycleId &&
      left.scope.orderingGeneration === right.scope.orderingGeneration &&
      left.expiresAt.period === right.expiresAt.period &&
      left.expiresAt.workCycleId === right.expiresAt.workCycleId &&
      left.cancelledAtGeneration === right.cancelledAtGeneration &&
      left.replacedAtGeneration === right.replacedAtGeneration &&
      left.targetPermission === right.targetPermission &&
      left.priorityReplacement.permitted ===
        right.priorityReplacement.permitted &&
      left.priorityReplacement.displacedTargetId ===
        right.priorityReplacement.displacedTargetId &&
      left.priorityReplacement.displacedPublicationWorkCycleId ===
        right.priorityReplacement.displacedPublicationWorkCycleId &&
      left.nativeExecutionPermission === right.nativeExecutionPermission &&
      left.materialGatheringPermission === right.materialGatheringPermission &&
      left.jobsAssignmentPermission === right.jobsAssignmentPermission &&
      left.playerSelected === right.playerSelected &&
      left.productionAuthorized === right.productionAuthorized &&
      left.testAuthorization === right.testAuthorization
    );
  } catch {
    return false;
  }
}

export function createCapturedConstructionAdapter(
  dependencies: CapturedConstructionDependencies,
): CapturedConstructionAdapter {
  const { sources, resources, rootState, conflicts, readOptions } =
    dependencies;
  const readKnowledgeGate = dependencies.readKnowledgeGate;
  const readStorageRequired = dependencies.readStorageRequired;
  let cycle: readonly CycleEntry[] = Object.freeze([]);
  let respectReservations = true;
  let completedIntent: readonly CycleEntry[] | undefined;
  let cycleReadyToPublish = false;
  let knowledgeRequirement = 0;
  let constructionCycleId = 0;
  let orderingOnly = false;
  let uiPresentationMode: "off" | "targets" | "planner" = "off";
  let capturePlannerDetails = false;
  let stateLogDetailsDue = false;
  let plannerAffordability = new Map<number, boolean>();
  let plannerResources = new Map<
    number,
    readonly Readonly<BuildScopedResourceSample>[]
  >();
  let targetAdmissionForTest:
    CapturedConstructionDependencies["targetAdmissionForTest"] | undefined;
  if (globalThis.__EA_P53_CONSTRUCTION_AUTHORITY_ENABLED__ === true)
    targetAdmissionForTest = dependencies.targetAdmissionForTest;
  let completedWorkCycleId: number | undefined;
  let completedAuthorityForTest:
    | Readonly<{
        rootGeneration: number;
        progressionGeneration: string;
      }>
    | undefined;
  let admissionRequestForCycle:
    Readonly<ConstructionTargetAdmissionRequest> | undefined;
  let admissionContextForCycle:
    | Readonly<{
        period: number;
        rootGeneration: number;
        progressionGeneration: string;
      }>
    | undefined;
  let candidateAffordable: Map<number, boolean> | undefined;
  let admissionAttempted: boolean | undefined;
  let admissionAcceptedForCycle: boolean | undefined;
  let admissionExecutionAttempted: boolean | undefined;
  let verifiedPurchaseCount: number | undefined;
  let verifiedResourceDebits: Record<string, number> | undefined;
  let savingPriorityRevision:
    Readonly<ConstructionSavingPriorityRevision> | undefined;
  let revisionControlGeneration: number | undefined;
  let currentConflictCandidateKey: string | undefined;
  let admissionRequestReadFailed: boolean | undefined;
  if (globalThis.__EA_P53_CONSTRUCTION_AUTHORITY_ENABLED__ === true) {
    if (
      globalThis.__EA_P54_CONSTRUCTION_ACTIVATION_ENABLED__ === true &&
      targetAdmissionForTest !== undefined
    )
      targetAdmissionForTest.onActivationModeSample?.(
        targetAdmissionForTest.readEventFedMode?.() === true,
        "adapter-created",
        constructionCycleId,
      );
    candidateAffordable = new Map();
    admissionAttempted = false;
    admissionAcceptedForCycle = false;
    admissionExecutionAttempted = false;
    verifiedPurchaseCount = 0;
    verifiedResourceDebits = {};
  }
  rootState.subscribeRootReplaced?.(() => {
    completedIntent = undefined;
    cycleReadyToPublish = false;
    if (globalThis.__EA_P53_CONSTRUCTION_AUTHORITY_ENABLED__ === true) {
      completedWorkCycleId = undefined;
      completedAuthorityForTest = undefined;
      savingPriorityRevision = undefined;
      if (
        globalThis.__EA_P54_CONSTRUCTION_ACTIVATION_ENABLED__ === true &&
        admissionRequestForCycle !== undefined
      )
        targetAdmissionForTest?.onRequestInvalidated?.(
          admissionRequestForCycle,
        );
    }
  });

  function capturePlannerResources(
    index: number,
    candidate: Readonly<ConstructionCandidate>,
  ): void {
    try {
      const resourceIds = Object.keys(candidate.cost);
      const sample = resources.readResources(
        resourceIds,
        candidate.pool === undefined ? undefined : { pool: candidate.pool },
      );
      plannerResources.set(
        index,
        Object.freeze(
          resourceIds.map((resourceId) =>
            Object.freeze({
              resourceId,
              ...(candidate.pool === undefined ? {} : { pool: candidate.pool }),
              view:
                sample === undefined
                  ? LOCKED_RESOURCE
                  : toBuildResourceView(
                      resourceView(sample, resourceId),
                      Number.NaN,
                    ),
            }),
          ),
        ),
      );
    } catch {
      // Planner-only resource sampling is read-only; malformed or missing samples must not stop
      // the construction decision that this observation accompanies.
      plannerResources.set(index, Object.freeze([]));
    }
  }

  function buildConstructionReadoutSnapshot(
    detailLevel: "targets" | "planner",
  ): Readonly<ConstructionReadoutSnapshot> {
    const targets = cycle.map((entry, index) => {
      const { candidate } = entry;
      let blocker: PlannerReadoutBlocker = "unavailable";
      let resourceId: string | undefined;
      let timeSeconds: number | undefined;

      if (detailLevel === "planner") {
        const affordable = plannerAffordability.get(index);
        if (affordable === true) {
          blocker = "ready";
        } else if (affordable === false) {
          const sampled = plannerResources.get(index) ?? [];
          const requirements: PlannerRequirement[] = [];
          let available = true;
          for (const [id, requiredQuantity] of Object.entries(candidate.cost)) {
            const resource = sampled.find(
              (item) => item.resourceId === id && item.pool === candidate.pool,
            );
            if (resource === undefined || !Number.isFinite(requiredQuantity)) {
              available = false;
              break;
            }
            const view = resource.view;
            if (
              view.resourcePresent !== true ||
              !Number.isFinite(view.currentQuantity) ||
              (view.unlocked &&
                (!Number.isFinite(view.maximumQuantity) ||
                  !Number.isFinite(view.rateOfChange)))
            ) {
              available = false;
              break;
            }
            requirements.push(
              Object.freeze({
                resourceId: id,
                resourceTitle: id,
                requiredQuantity,
                currentQuantity: view.currentQuantity,
                maximumQuantity: view.maximumQuantity,
                income: view.rateOfChange,
                unlocked: view.unlocked,
              }),
            );
          }

          if (available) {
            const limit = findPlannerLimit({
              affordable: false,
              requirements: Object.freeze(requirements),
            });
            if (limit !== null) {
              blocker = limit.blocker;
              resourceId = limit.resourceId;
              if (limit.blocker === "income") timeSeconds = limit.time;
            }
          }
        }
      }

      return Object.freeze({
        key: candidate.key,
        family: entry.source.family,
        ...(candidate.actionId === undefined
          ? {}
          : { actionId: candidate.actionId }),
        ...(candidate.projectId === undefined
          ? {}
          : { projectId: candidate.projectId }),
        weighting: candidate.weighting,
        cost: Object.freeze({ ...candidate.cost }),
        ...(candidate.pool === undefined ? {} : { pool: candidate.pool }),
        queued: candidate.ignored,
        blocker,
        ...(resourceId === undefined ? {} : { resourceId }),
        ...(timeSeconds === undefined ? {} : { timeSeconds }),
      }) satisfies Readonly<ConstructionTargetReadout>;
    });

    return Object.freeze({
      cycleId: constructionCycleId,
      detailLevel,
      targets: Object.freeze(targets),
    });
  }

  function readPlannerSnapshot(): Readonly<ConstructionReadoutSnapshot> | null {
    return uiPresentationMode === "off"
      ? null
      : buildConstructionReadoutSnapshot(uiPresentationMode);
  }

  function readStateLogSnapshot(): Readonly<ConstructionReadoutSnapshot> | null {
    return stateLogDetailsDue
      ? buildConstructionReadoutSnapshot("planner")
      : null;
  }

  function entryAt(index: number): CycleEntry {
    const entry = cycle[index];
    if (entry === undefined) {
      throw new TypeError(`no construction candidate at index ${index}`);
    }
    return entry;
  }

  function entryFor(index: number, key: string): CycleEntry | null {
    const entry = cycle[index];
    return entry !== undefined && entry.candidate.key === key ? entry : null;
  }

  let readTargetAdmissionRequest:
    | ((
        boundary:
          | "cycle-begin"
          | "admission"
          | "publication-finish"
          | "execution-revalidation",
      ) => Readonly<ConstructionTargetAdmissionRequest> | undefined)
    | undefined;
  let reportTargetAdmissionDecision:
    | ((
        decision: Readonly<ConstructionTargetAdmissionDecision>,
        candidateKey?: string,
        evaluationMs?: number,
      ) => void)
    | undefined;
  let reportTargetAdmissionOperation:
    | ((
        operation:
          | "context-identity-sample"
          | "request-source-read"
          | "local-pending-request-check"
          | "reservation-evidence-read"
          | "native-control-authority-read"
          | "native-action-execution"
          | "construction-cycle",
        elapsedMs?: number,
      ) => void)
    | undefined;
  let decideTargetAdmission:
    | ((
        index: number,
        entry: CycleEntry,
        candidateCatalogComplete: boolean,
      ) => void)
    | undefined;
  let evaluateTargetAdmission:
    | ((
        input: Parameters<typeof decideConstructionTargetAdmission>[0],
      ) => Readonly<{
        decision: ConstructionTargetAdmissionDecision;
        evaluationMs: number | undefined;
      }>)
    | undefined;
  if (globalThis.__EA_P53_CONSTRUCTION_AUTHORITY_ENABLED__ === true) {
    evaluateTargetAdmission = (input) => {
      const startedAt =
        typeof performance !== "undefined" ? performance.now() : undefined;
      const decision = decideConstructionTargetAdmission(input);
      const finishedAt =
        typeof performance !== "undefined" ? performance.now() : undefined;
      return Object.freeze({
        decision,
        evaluationMs:
          startedAt === undefined || finishedAt === undefined
            ? undefined
            : Math.max(0, finishedAt - startedAt),
      });
    };
    readTargetAdmissionRequest = (
      boundary,
    ): Readonly<ConstructionTargetAdmissionRequest> | undefined => {
      if (targetAdmissionForTest === undefined) return undefined;
      const configuredEventFedMode =
        targetAdmissionForTest.readEventFedMode?.() ??
        targetAdmissionForTest.eventFed === true;
      const eventFed =
        globalThis.__EA_P54_CONSTRUCTION_ACTIVATION_ENABLED__ === true &&
        configuredEventFedMode;
      const startedAt =
        globalThis.__EA_P54_CONSTRUCTION_ACTIVATION_ENABLED__ === true &&
        typeof performance !== "undefined"
          ? performance.now()
          : undefined;
      try {
        const request = targetAdmissionForTest.readRequest(eventFed);
        const finishedAt =
          startedAt === undefined ? undefined : performance.now();
        if (globalThis.__EA_P54_CONSTRUCTION_ACTIVATION_ENABLED__ === true)
          targetAdmissionForTest.onActivationModeSample?.(
            eventFed,
            boundary,
            constructionCycleId,
            request,
          );
        reportTargetAdmissionOperation?.(
          globalThis.__EA_P54_CONSTRUCTION_ACTIVATION_ENABLED__ === true &&
            eventFed
            ? "local-pending-request-check"
            : "request-source-read",
          startedAt === undefined || finishedAt === undefined
            ? undefined
            : Math.max(0, finishedAt - startedAt),
        );
        return request;
      } catch {
        admissionRequestReadFailed = true;
        if (globalThis.__EA_P54_CONSTRUCTION_ACTIVATION_ENABLED__ === true)
          targetAdmissionForTest.onActivationModeSample?.(
            eventFed,
            boundary,
            constructionCycleId,
          );
        reportTargetAdmissionOperation?.(
          globalThis.__EA_P54_CONSTRUCTION_ACTIVATION_ENABLED__ === true &&
            eventFed
            ? "local-pending-request-check"
            : "request-source-read",
        );
        return undefined;
      }
    };
    reportTargetAdmissionDecision = (
      decision: Readonly<ConstructionTargetAdmissionDecision>,
      candidateKey?: string,
      evaluationMs?: number,
    ): void => {
      try {
        targetAdmissionForTest?.onDecision?.(
          decision,
          candidateKey,
          evaluationMs,
        );
      } catch {
        // Test evidence cannot affect Construction.
      }
    };
    reportTargetAdmissionOperation = (operation, elapsedMs): void => {
      try {
        targetAdmissionForTest?.onOperation?.(operation, elapsedMs);
      } catch {
        // Test evidence cannot affect Construction.
      }
    };
    decideTargetAdmission = (
      index: number,
      entry: CycleEntry,
      candidateCatalogComplete: boolean,
    ): void => {
      const request = admissionRequestForCycle;
      if (
        targetAdmissionForTest === undefined ||
        request === undefined ||
        entry.candidate.key !== request.targetBuildingId ||
        request.scope?.workCycleId !== constructionCycleId ||
        request.scope?.orderingGeneration !== constructionCycleId
      )
        return;
      if (admissionAttempted === true) {
        reportTargetAdmissionDecision?.(
          Object.freeze({
            status: "stale",
            reason: "request-already-evaluated-this-construction-cycle",
          }),
          entry.candidate.key,
        );
        return;
      }
      admissionAttempted = true;
      const currentRequest = readTargetAdmissionRequest?.("admission");
      if (
        currentRequest === undefined ||
        currentRequest.requestId !== request.requestId ||
        currentRequest.generation !== request.generation
      ) {
        reportTargetAdmissionDecision?.(
          Object.freeze({
            status: "stale",
            reason: admissionRequestReadFailed
              ? "request-source-unavailable"
              : "request-cancelled-or-replaced-before-decision",
          }),
          entry.candidate.key,
        );
        return;
      }
      const affordable = candidateAffordable?.get(index);
      if (entry.candidate.ignored || affordable !== true) {
        const { decision, evaluationMs } = evaluateTargetAdmission!({
          request: currentRequest,
          owner: Object.freeze({
            period: admissionContextForCycle?.period,
            workCycleId: constructionCycleId,
            orderingGeneration: constructionCycleId,
            rootGeneration: admissionContextForCycle?.rootGeneration,
            progressionGeneration:
              admissionContextForCycle?.progressionGeneration,
            publicationWorkCycleId: completedWorkCycleId,
            publicationRootGeneration:
              completedAuthorityForTest?.rootGeneration,
            publicationProgressionGeneration:
              completedAuthorityForTest?.progressionGeneration,
          }),
          candidate: Object.freeze({
            ...entry.candidate,
            family: entry.source.family,
          }),
          orderingIndex: index,
          candidateCatalogComplete,
          affordable,
          control: undefined,
          nativeQueue: undefined,
          scriptReservations: undefined,
          previousSavingTarget: undefined,
          verifiedPurchases: verifiedPurchaseCount ?? 0,
          verifiedResourceDebits: verifiedResourceDebits ?? Object.freeze({}),
        });
        reportTargetAdmissionDecision?.(
          decision,
          entry.candidate.key,
          evaluationMs,
        );
        return;
      }
      const reservationStartedAt =
        globalThis.__EA_P54_CONSTRUCTION_ACTIVATION_ENABLED__ === true &&
        typeof performance !== "undefined"
          ? performance.now()
          : undefined;
      const reservationRootReadsBefore =
        globalThis.__EA_P54_CONSTRUCTION_ACTIVATION_ENABLED__ === true
          ? targetAdmissionForTest.readRootObservationCountForTest?.()
          : undefined;
      const evidence =
        conflicts.readReservationEvidence?.() ??
        Object.freeze({
          nativeQueue: undefined,
          scriptReservations: undefined,
        });
      const reservationRootReadsAfter =
        globalThis.__EA_P54_CONSTRUCTION_ACTIVATION_ENABLED__ === true
          ? targetAdmissionForTest.readRootObservationCountForTest?.()
          : undefined;
      reportTargetAdmissionOperation?.(
        "reservation-evidence-read",
        reservationStartedAt === undefined
          ? undefined
          : Math.max(0, performance.now() - reservationStartedAt),
      );
      if (
        reservationRootReadsBefore !== undefined &&
        reservationRootReadsAfter !== undefined
      )
        targetAdmissionForTest.onRootObservationSample?.(
          "reservation-evidence-read",
          reservationRootReadsAfter - reservationRootReadsBefore,
        );
      const scriptTargets = evidence.scriptReservations?.targets;
      const saving = scriptTargets?.find((target) => target.cause === "Saving");
      const authorityStartedAt =
        globalThis.__EA_P54_CONSTRUCTION_ACTIVATION_ENABLED__ === true &&
        typeof performance !== "undefined"
          ? performance.now()
          : undefined;
      const authorityRootReadsBefore =
        globalThis.__EA_P54_CONSTRUCTION_ACTIVATION_ENABLED__ === true
          ? targetAdmissionForTest.readRootObservationCountForTest?.()
          : undefined;
      const control = entry.source.readActionAuthority?.(entry.candidate.key);
      const authorityRootReadsAfter =
        globalThis.__EA_P54_CONSTRUCTION_ACTIVATION_ENABLED__ === true
          ? targetAdmissionForTest.readRootObservationCountForTest?.()
          : undefined;
      reportTargetAdmissionOperation?.(
        "native-control-authority-read",
        authorityStartedAt === undefined
          ? undefined
          : Math.max(0, performance.now() - authorityStartedAt),
      );
      if (
        authorityRootReadsBefore !== undefined &&
        authorityRootReadsAfter !== undefined
      )
        targetAdmissionForTest.onRootObservationSample?.(
          "native-control-authority-read",
          authorityRootReadsAfter - authorityRootReadsBefore,
        );
      const context = admissionContextForCycle;
      const { decision, evaluationMs } = evaluateTargetAdmission!({
        request: currentRequest,
        owner: Object.freeze({
          period: context?.period,
          workCycleId: constructionCycleId,
          orderingGeneration: constructionCycleId,
          rootGeneration: context?.rootGeneration,
          progressionGeneration: context?.progressionGeneration,
          publicationWorkCycleId: completedWorkCycleId,
          publicationRootGeneration: completedAuthorityForTest?.rootGeneration,
          publicationProgressionGeneration:
            completedAuthorityForTest?.progressionGeneration,
        }),
        candidate: Object.freeze({
          ...entry.candidate,
          family: entry.source.family,
        }),
        orderingIndex: index,
        candidateCatalogComplete,
        affordable,
        control,
        nativeQueue: evidence.nativeQueue,
        scriptReservations: evidence.scriptReservations,
        previousSavingTarget:
          saving === undefined
            ? undefined
            : Object.freeze({
                name: saving.name,
                ...(saving.pool === undefined ? {} : { pool: saving.pool }),
                cost: saving.cost,
              }),
        verifiedPurchases: verifiedPurchaseCount ?? 0,
        verifiedResourceDebits: verifiedResourceDebits ?? Object.freeze({}),
      });
      reportTargetAdmissionDecision?.(
        decision,
        entry.candidate.key,
        evaluationMs,
      );
      if (decision.status !== "accepted-for-owner-decision") return;
      savingPriorityRevision = decision.revision;
      revisionControlGeneration = control?.generation;
      admissionAcceptedForCycle = true;
    };
  }

  /**
   * Affordable means the game's own prices are covered by what the game says is held, sampled for
   * exactly the cost keys in question. Before the root is captured there are no holdings to
   * compare against, so nothing is affordable.
   */
  function affordable(candidate: Readonly<ConstructionCandidate>): boolean {
    const root = rootState.readRoot();
    if (
      root !== undefined &&
      costFitsNow(root, candidate.cost, { pool: candidate.pool }) === true
    ) {
      return true;
    }
    return false;
  }

  const reader: BuildReader = Object.freeze({
    beginCycle(): BuildCycleSetup {
      if (globalThis.__EA_P54_CONSTRUCTION_ACTIVATION_ENABLED__ === true)
        reportTargetAdmissionOperation?.("construction-cycle");
      cycleReadyToPublish = false;
      const options = readOptions();
      if (!orderingOnly) constructionCycleId++;
      if (globalThis.__EA_P53_CONSTRUCTION_AUTHORITY_ENABLED__ === true) {
        candidateAffordable = new Map();
        admissionAttempted = false;
        admissionAcceptedForCycle = false;
        admissionExecutionAttempted = false;
        verifiedPurchaseCount = 0;
        verifiedResourceDebits = {};
        if (
          globalThis.__EA_P54_CONSTRUCTION_ACTIVATION_ENABLED__ === true &&
          admissionRequestForCycle !== undefined
        )
          targetAdmissionForTest?.onRequestCycleReleased?.(
            admissionRequestForCycle,
          );
        admissionRequestForCycle = undefined;
        admissionContextForCycle = undefined;
        savingPriorityRevision = undefined;
        revisionControlGeneration = undefined;
        currentConflictCandidateKey = undefined;
        admissionRequestReadFailed = false;
      }
      if (
        globalThis.__EA_P53_CONSTRUCTION_AUTHORITY_ENABLED__ === true &&
        targetAdmissionForTest !== undefined &&
        !orderingOnly
      ) {
        admissionRequestForCycle = readTargetAdmissionRequest?.("cycle-begin");
        if (
          globalThis.__EA_P54_CONSTRUCTION_ACTIVATION_ENABLED__ === true &&
          admissionRequestForCycle?.active === true &&
          Number.isSafeInteger(
            admissionRequestForCycle.expiresAt?.workCycleId,
          ) &&
          admissionRequestForCycle.expiresAt.workCycleId < constructionCycleId
        ) {
          targetAdmissionForTest.onRequestExpired?.(admissionRequestForCycle);
          admissionRequestForCycle = undefined;
        }
        if (
          admissionRequestForCycle?.active === true &&
          admissionRequestForCycle.scope?.workCycleId === constructionCycleId
        ) {
          const contextStartedAt =
            globalThis.__EA_P54_CONSTRUCTION_ACTIVATION_ENABLED__ === true &&
            typeof performance !== "undefined"
              ? performance.now()
              : undefined;
          try {
            admissionContextForCycle = targetAdmissionForTest.readContext();
          } catch {
            admissionContextForCycle = undefined;
          }
          reportTargetAdmissionOperation?.(
            "context-identity-sample",
            contextStartedAt === undefined
              ? undefined
              : Math.max(0, performance.now() - contextStartedAt),
          );
        }
      }
      const presentationSettings = dependencies.readPresentationSettings?.();
      const stateLogPlannerDetailsDue =
        dependencies.readStateLogPlannerDetailsDue?.() === true;
      uiPresentationMode =
        presentationSettings?.buildPlannerUI === true
          ? "planner"
          : presentationSettings?.activeTargetsUI === true
            ? "targets"
            : "off";
      stateLogDetailsDue = stateLogPlannerDetailsDue;
      capturePlannerDetails =
        uiPresentationMode === "planner" || stateLogDetailsDue;
      plannerAffordability = new Map();
      plannerResources = new Map();
      respectReservations = options.respectReservations;
      const entries: CycleEntry[] = [];
      const owners = new Map<string, string>();
      let sourcesComplete = true;
      for (const source of sources) {
        const sample = source.beginCycle();
        if (!sample.complete) sourcesComplete = false;
        for (const candidate of sample.candidates) {
          const owner = owners.get(candidate.key);
          if (owner !== undefined) {
            throw new TypeError(
              `${source.family} and ${owner} both offer construction candidate ${candidate.key}`,
            );
          }
          owners.set(candidate.key, source.family);
          entries.push({ candidate, source });
        }
      }
      // Highest weighting first; a stable sort keeps each family's own order, and the order the
      // families were given in, on ties.
      entries.sort((a, b) => b.candidate.weighting - a.candidate.weighting);
      // A missing higher-priority price or family catalog makes competition incomplete. Keep
      // previously published intent and refrain from spending from this partial list.
      if (!sourcesComplete) entries.length = 0;
      cycle = Object.freeze(entries);
      cycleReadyToPublish = sourcesComplete;
      if (
        globalThis.__EA_P53_CONSTRUCTION_AUTHORITY_ENABLED__ === true &&
        targetAdmissionForTest !== undefined
      ) {
        const request = admissionRequestForCycle;
        if (
          request?.active === true &&
          request.scope?.workCycleId === constructionCycleId &&
          !cycle.some(
            ({ candidate }) => candidate.key === request.targetBuildingId,
          )
        ) {
          const { decision, evaluationMs } = evaluateTargetAdmission!({
            request,
            owner: Object.freeze({
              period: admissionContextForCycle?.period,
              workCycleId: constructionCycleId,
              orderingGeneration: constructionCycleId,
              rootGeneration: admissionContextForCycle?.rootGeneration,
              progressionGeneration:
                admissionContextForCycle?.progressionGeneration,
              publicationWorkCycleId: completedWorkCycleId,
              publicationRootGeneration:
                completedAuthorityForTest?.rootGeneration,
              publicationProgressionGeneration:
                completedAuthorityForTest?.progressionGeneration,
            }),
            candidate: undefined,
            orderingIndex: -1,
            candidateCatalogComplete: sourcesComplete,
            affordable: undefined,
            control: undefined,
            nativeQueue: undefined,
            scriptReservations: undefined,
            previousSavingTarget: undefined,
            verifiedPurchases: verifiedPurchaseCount ?? 0,
            verifiedResourceDebits: verifiedResourceDebits ?? Object.freeze({}),
          });
          admissionAttempted = true;
          reportTargetAdmissionDecision?.(decision, undefined, evaluationMs);
        }
      }
      // The Knowledge requirement needs only the sorted list, so it describes this cycle. Only the
      // highest-weighted candidate that does not itself raise the cap counts: a Knowledge building
      // is the answer to a capacity shortage, not evidence of one.
      if (sourcesComplete) {
        knowledgeRequirement = 0;
        for (const entry of entries) {
          if (entry.candidate.knowledge) continue;
          const cost = entry.candidate.cost["Knowledge"];
          knowledgeRequirement =
            typeof cost === "number" && Number.isFinite(cost) ? cost : 0;
          break;
        }
      }
      return Object.freeze({
        candidates: Object.freeze(
          entries.map((entry) =>
            Object.freeze({
              ...entry.candidate,
              family: entry.source.family,
            }),
          ),
        ),
        consumptionMode: options.consumptionMode,
        buildIfStorageFull: options.buildIfStorageFull,
        ignoreZeroRate: options.ignoreZeroRate,
        saveWhiteholeGems: options.saveWhiteholeGems,
        knowledgeGate: readKnowledgeGate?.() ?? ZERO_KNOWLEDGE_GATE,
      });
    },

    finishCycle(completed: boolean): void {
      try {
        if (!cycleReadyToPublish) return;
        if (completed) {
          for (const source of sources) source.finishCycle?.();
          completedIntent = Object.freeze(
            cycle
              .filter(
                ({ candidate }) =>
                  !candidate.ignored && candidate.weighting > 0,
              )
              .map(({ candidate, source }) =>
                Object.freeze({
                  candidate: Object.freeze({
                    ...candidate,
                    cost: Object.freeze({ ...candidate.cost }),
                  }),
                  source,
                }),
              ),
          );
          if (!orderingOnly) {
            if (globalThis.__EA_P53_CONSTRUCTION_AUTHORITY_ENABLED__ === true) {
              completedWorkCycleId = constructionCycleId;
              completedAuthorityForTest = undefined;
            }
            if (
              globalThis.__EA_P53_CONSTRUCTION_AUTHORITY_ENABLED__ === true &&
              targetAdmissionForTest !== undefined
            ) {
              const request =
                readTargetAdmissionRequest?.("publication-finish");
              let capturedContextPeriod: number | null = null;
              if (
                request?.active === true &&
                request.scope?.workCycleId === constructionCycleId + 1 &&
                request.scope?.orderingGeneration === constructionCycleId + 1
              ) {
                const contextStartedAt =
                  globalThis.__EA_P54_CONSTRUCTION_ACTIVATION_ENABLED__ ===
                    true && typeof performance !== "undefined"
                    ? performance.now()
                    : undefined;
                try {
                  const context = targetAdmissionForTest.readContext();
                  capturedContextPeriod = context?.period ?? null;
                  if (
                    context !== undefined &&
                    context.period < request.scope?.period
                  ) {
                    completedAuthorityForTest = Object.freeze({
                      rootGeneration: context.rootGeneration,
                      progressionGeneration: context.progressionGeneration,
                    });
                  }
                } catch {
                  completedAuthorityForTest = undefined;
                }
                reportTargetAdmissionOperation?.(
                  "context-identity-sample",
                  contextStartedAt === undefined
                    ? undefined
                    : Math.max(0, performance.now() - contextStartedAt),
                );
              }
              if (
                globalThis.__EA_P54_CONSTRUCTION_ACTIVATION_ENABLED__ ===
                  true &&
                constructionCycleId === 89
              )
                targetAdmissionForTest.onPublicationAuthoritySample?.(
                  Object.freeze({
                    constructionWorkCycleId: constructionCycleId,
                    nextWorkCycleId: constructionCycleId + 1,
                    capturedContextPeriod,
                    completedIntentCandidateKeys: Object.freeze(
                      (completedIntent ?? []).map(
                        ({ candidate }) => candidate.key,
                      ),
                    ),
                    requestId: request?.requestId ?? null,
                    requestGeneration: request?.generation ?? null,
                    capturedRootGeneration:
                      completedAuthorityForTest?.rootGeneration ?? null,
                    capturedProgressionGeneration:
                      completedAuthorityForTest?.progressionGeneration ?? null,
                  }),
                );
            }
          }
        }
      } finally {
        cycleReadyToPublish = false;
        if (!orderingOnly) {
          if (globalThis.__EA_P53_CONSTRUCTION_AUTHORITY_ENABLED__ === true) {
            savingPriorityRevision = undefined;
            revisionControlGeneration = undefined;
            currentConflictCandidateKey = undefined;
          }
        }
      }
    },

    sampleCandidate(
      index: number,
      request: Readonly<BuildSampleRequest>,
    ): BuildCandidateSample {
      const { candidate } = entryAt(index);
      const entry = entryAt(index);
      const sample: {
        affordable?: boolean;
        consumption?: readonly Readonly<BuildConsumptionView>[];
      } = {};
      if (request.needAffordability) {
        sample.affordable = affordable(candidate);
        if (globalThis.__EA_P53_CONSTRUCTION_AUTHORITY_ENABLED__ === true)
          candidateAffordable?.set(index, sample.affordable);
        if (
          globalThis.__EA_P53_CONSTRUCTION_AUTHORITY_ENABLED__ === true &&
          sample.affordable !== true
        )
          decideTargetAdmission?.(index, entry, cycleReadyToPublish);
        if (capturePlannerDetails) {
          plannerAffordability.set(index, sample.affordable);
          if (!sample.affordable) capturePlannerResources(index, candidate);
        }
      }
      if (request.needConsumption) {
        sample.consumption = candidate.consumption ?? NO_CONSUMPTION;
      }
      return Object.freeze(sample);
    },

    sampleConflict(index: number): BuildConflictSample {
      const entry = entryAt(index);
      const { candidate } = entry;
      const important = candidate.important;
      if (!respectReservations) {
        return Object.freeze({ conflict: null, important });
      }
      if (globalThis.__EA_P53_CONSTRUCTION_AUTHORITY_ENABLED__ === true) {
        decideTargetAdmission?.(index, entry, cycleReadyToPublish);
        currentConflictCandidateKey = candidate.key;
      }
      let evaluated;
      try {
        evaluated = conflicts.evaluate(
          candidate.cost,
          candidate.pool,
          candidate.key,
        );
      } finally {
        if (globalThis.__EA_P53_CONSTRUCTION_AUTHORITY_ENABLED__ === true)
          currentConflictCandidateKey = undefined;
      }
      if (evaluated.status === "none") {
        return Object.freeze({ conflict: null, important });
      }
      if (evaluated.status === "unavailable") {
        // Something is saving and the reservation could not be priced. Skipping on incomplete
        // data is the safe half of the trade; spending is not recoverable.
        return Object.freeze({
          conflict: Object.freeze({
            unavailable: true,
            targetNames: Object.freeze([]),
            resourceNames: Object.freeze([]),
            targetCause: "",
          }),
          important,
        });
      }
      return Object.freeze({
        conflict: Object.freeze({
          unavailable: false,
          targetNames: evaluated.conflict.targetNames,
          resourceNames: evaluated.conflict.resourceNames,
          targetCause: evaluated.conflict.targetCause,
        }),
        important,
      });
    },

    sampleCompetition(
      index: number,
      request: Readonly<BuildCompetitionRequest>,
    ): BuildCompetitionSample {
      entryAt(index);
      const byKey = new Map(
        cycle.map((entry) => [entry.candidate.key, entry.candidate]),
      );
      const compared: {
        readonly key: string;
        readonly candidate: Readonly<ConstructionCandidate>;
      }[] = [];
      for (const key of request.affordabilityKeys) {
        const candidate = byKey.get(key);
        if (candidate === undefined) {
          throw new TypeError(`unknown construction candidate ${key}`);
        }
        compared.push({ key, candidate });
      }
      const scopes: readonly BuildResourceScope[] =
        request.resourceScopes.length > 0
          ? request.resourceScopes
          : Object.freeze(
              request.resourceIds.map((resourceId) =>
                Object.freeze({ resourceId }),
              ),
            );
      const storageRequired = readStorageRequired?.(
        request.resourceIds,
        scopes,
      );
      const affordability: Record<string, boolean> = {};
      const root = rootState.readRoot();
      for (const entry of compared) {
        affordability[entry.key] =
          root !== undefined &&
          costFitsNow(root, entry.candidate.cost, {
            pool: entry.candidate.pool,
          }) === true;
      }
      if (capturePlannerDetails) {
        for (const [candidateIndex, cycleEntry] of cycle.entries()) {
          const sampledAffordability = affordability[cycleEntry.candidate.key];
          if (sampledAffordability !== undefined) {
            plannerAffordability.set(candidateIndex, sampledAffordability);
          }
        }
      }
      const resourceViews: Record<string, BuildResourceView> = {};
      const scopedResources: {
        readonly resourceId: string;
        readonly pool?: string;
        readonly view: BuildResourceView;
      }[] = [];
      const scopesByPool = new Map<string | undefined, string[]>();
      for (const scope of scopes) {
        const ids = scopesByPool.get(scope.pool);
        if (ids === undefined) scopesByPool.set(scope.pool, [scope.resourceId]);
        else if (!ids.includes(scope.resourceId)) ids.push(scope.resourceId);
      }
      for (const [pool, ids] of scopesByPool) {
        const sample = resources.readResources(
          ids,
          pool === undefined ? undefined : { pool },
        );
        for (const id of ids) {
          const view =
            sample === undefined
              ? LOCKED_RESOURCE
              : toBuildResourceView(
                  resourceView(sample, id),
                  storageRequired?.[storageRequirementScopeKey(id, pool)] ??
                    storageRequired?.[id] ??
                    Number.NaN,
                );
          scopedResources.push({
            resourceId: id,
            ...(pool === undefined ? {} : { pool }),
            view,
          });
          if (pool === undefined) resourceViews[id] = view;
        }
      }
      if (capturePlannerDetails) {
        for (const [candidateIndex, cycleEntry] of cycle.entries()) {
          const cost = cycleEntry.candidate.cost;
          const relevant = scopedResources.filter(
            (sample) =>
              sample.pool === cycleEntry.candidate.pool &&
              Object.hasOwn(cost, sample.resourceId),
          );
          if (relevant.length === Object.keys(cost).length) {
            plannerResources.set(candidateIndex, Object.freeze(relevant));
          }
        }
      }
      return Object.freeze({
        affordability: Object.freeze(affordability),
        resources: Object.freeze(resourceViews),
        scopedResources: Object.freeze(scopedResources),
      });
    },
  });

  const executor: BuildExecutor = Object.freeze({
    annotate(annotation: Readonly<BuildAnnotation>) {
      // Annotations are tooltip text on a rendered panel. The cycle runs with the panel torn
      // down, so a delay is a decision that simply produced no purchase.
      return entryFor(annotation.index, annotation.key) === null
        ? stale(
            "stale-construction-target",
            "construction candidate list changed",
            { key: annotation.key, index: annotation.index },
          )
        : SUCCEEDED;
    },

    executeClick(decision: Readonly<BuildClickDecision>): BuildClickResult {
      const entry = entryFor(decision.index, decision.key);
      if (entry === null) {
        return Object.freeze({
          outcome: stale(
            "stale-construction-target",
            "construction candidate list changed",
            { key: decision.key, index: decision.index },
          ),
          disposition: "stopped" as const,
          clicked: false,
          mission: false,
          consumption: NO_CONSUMPTION,
        });
      }
      let p53AuthorizedForCandidate: boolean | undefined;
      if (
        globalThis.__EA_P53_CONSTRUCTION_AUTHORITY_ENABLED__ === true &&
        targetAdmissionForTest !== undefined
      ) {
        const request = admissionRequestForCycle;
        p53AuthorizedForCandidate =
          admissionAcceptedForCycle === true &&
          request?.targetBuildingId === decision.key;
        if (p53AuthorizedForCandidate && request !== undefined) {
          const currentRequest = readTargetAdmissionRequest?.(
            "execution-revalidation",
          );
          let currentContext:
            | Readonly<{
                period: number;
                rootGeneration: number;
                progressionGeneration: string;
              }>
            | undefined;
          const contextStartedAt =
            globalThis.__EA_P54_CONSTRUCTION_ACTIVATION_ENABLED__ === true &&
            typeof performance !== "undefined"
              ? performance.now()
              : undefined;
          try {
            currentContext = targetAdmissionForTest.readContext();
          } catch {
            currentContext = undefined;
          }
          reportTargetAdmissionOperation?.(
            "context-identity-sample",
            contextStartedAt === undefined
              ? undefined
              : Math.max(0, performance.now() - contextStartedAt),
          );
          const executionAuthorityStartedAt =
            globalThis.__EA_P54_CONSTRUCTION_ACTIVATION_ENABLED__ === true &&
            typeof performance !== "undefined"
              ? performance.now()
              : undefined;
          const executionRootReadsBefore =
            globalThis.__EA_P54_CONSTRUCTION_ACTIVATION_ENABLED__ === true
              ? targetAdmissionForTest.readRootObservationCountForTest?.()
              : undefined;
          const control = entry.source.readActionAuthority?.(decision.key);
          const executionRootReadsAfter =
            globalThis.__EA_P54_CONSTRUCTION_ACTIVATION_ENABLED__ === true
              ? targetAdmissionForTest.readRootObservationCountForTest?.()
              : undefined;
          reportTargetAdmissionOperation?.(
            "native-control-authority-read",
            executionAuthorityStartedAt === undefined
              ? undefined
              : Math.max(0, performance.now() - executionAuthorityStartedAt),
          );
          if (
            executionRootReadsBefore !== undefined &&
            executionRootReadsAfter !== undefined
          )
            targetAdmissionForTest.onRootObservationSample?.(
              "native-control-authority-read",
              executionRootReadsAfter - executionRootReadsBefore,
            );
          let staleReason: string | undefined;
          if (savingPriorityRevision === undefined) {
            staleReason = "saving-priority-revision-was-invalidated";
          } else if (!sameTargetAdmissionRequest(currentRequest, request)) {
            staleReason = "request-cancelled-or-replaced-before-execution";
          } else if ((verifiedPurchaseCount ?? 0) >= request.maximumPurchases) {
            staleReason = "request-purchase-budget-exhausted";
          } else if (
            currentContext === undefined ||
            currentContext.period !== admissionContextForCycle?.period ||
            currentContext.rootGeneration !==
              admissionContextForCycle?.rootGeneration ||
            currentContext.progressionGeneration !==
              admissionContextForCycle?.progressionGeneration
          ) {
            staleReason = "root-or-progression-changed-before-execution";
          } else if (
            control === undefined ||
            control.available !== true ||
            control.actionId !== decision.key ||
            control.generation !== revisionControlGeneration
          ) {
            staleReason = "native-control-generation-changed-before-execution";
          } else if (control.price === undefined) {
            staleReason = "native-price-unavailable-before-execution";
          } else if (
            !sameCompletePrice(entry.candidate.cost, control.price.cost) ||
            control.price.pool !== entry.candidate.pool
          ) {
            staleReason = "native-price-changed-before-execution";
          }
          if (staleReason !== undefined) {
            admissionExecutionAttempted = true;
            reportTargetAdmissionDecision?.(
              Object.freeze({ status: "stale", reason: staleReason }),
              decision.key,
            );
            return Object.freeze({
              // The explicit target is deferred; ordinary Construction candidates can still run.
              outcome: SUCCEEDED,
              disposition: "candidate-rejected" as const,
              clicked: false,
              mission: false,
              consumption: NO_CONSUMPTION,
            });
          }
          if (admissionExecutionAttempted === true) {
            reportTargetAdmissionDecision?.(
              Object.freeze({
                status: "stale",
                reason: "request-execution-already-attempted-this-cycle",
              }),
              decision.key,
            );
            return Object.freeze({
              outcome: SUCCEEDED,
              disposition: "candidate-rejected" as const,
              clicked: false,
              mission: false,
              consumption: NO_CONSUMPTION,
            });
          }
          admissionExecutionAttempted = true;
        }
      }
      const result =
        globalThis.__EA_P54_CONSTRUCTION_ACTIVATION_ENABLED__ === true
          ? (() => {
              const actionStartedAt = performance.now();
              const result = entry.source.execute(decision.key);
              reportTargetAdmissionOperation?.(
                "native-action-execution",
                Math.max(0, performance.now() - actionStartedAt),
              );
              return result;
            })()
          : entry.source.execute(decision.key);
      if (
        globalThis.__EA_P53_CONSTRUCTION_AUTHORITY_ENABLED__ === true &&
        p53AuthorizedForCandidate === true &&
        result.outcome.status === "succeeded" &&
        result.disposition === "verified-success" &&
        result.clicked
      ) {
        verifiedPurchaseCount = (verifiedPurchaseCount ?? 0) + 1;
        if (
          admissionRequestForCycle !== undefined &&
          targetAdmissionForTest?.onRequestConsumed !== undefined
        )
          targetAdmissionForTest.onRequestConsumed(admissionRequestForCycle);
        verifiedResourceDebits ??= {};
        for (const [resourceId, amount] of Object.entries(
          entry.candidate.cost,
        )) {
          verifiedResourceDebits[resourceId] =
            (verifiedResourceDebits[resourceId] ?? 0) + amount;
        }
      }
      return result;
    },
  });

  const readPublishedSavingTarget = (): SavingTarget | null => {
    const intent = completedIntent;
    if (intent === undefined) {
      throw new TypeError("construction saving order is not established");
    }
    const root = rootState.readRoot();
    if (root === undefined) {
      throw new TypeError("construction saving root is unavailable");
    }
    for (const { candidate, source } of intent) {
      const cost =
        source.readSavingCost === undefined
          ? candidate.cost
          : source.readSavingCost(candidate);
      if (cost === null) continue;
      if (cost === undefined) {
        throw new TypeError(
          `construction saving cost unavailable for ${candidate.key}`,
        );
      }
      const options = { pool: candidate.pool };
      const storable = costFitsStorage(root, cost, options);
      if (storable === false) continue;
      if (storable === undefined) {
        throw new TypeError(
          `construction storage fit unavailable for ${candidate.key}`,
        );
      }
      const affordable = costFitsNow(root, cost, options);
      if (affordable === undefined) {
        throw new TypeError(
          `construction affordability unavailable for ${candidate.key}`,
        );
      }
      if (affordable) continue;
      return Object.freeze({
        name: candidate.key,
        ...(candidate.pool === undefined ? {} : { pool: candidate.pool }),
        cost: Object.freeze({ ...cost }),
      });
    }
    return null;
  };
  let readSavingTargetForConflict: (() => SavingTarget | null) | undefined;
  if (globalThis.__EA_P53_CONSTRUCTION_AUTHORITY_ENABLED__ === true) {
    readSavingTargetForConflict = (): SavingTarget | null => {
      const revision = savingPriorityRevision;
      return revision !== undefined &&
        revision.workCycleId === constructionCycleId &&
        revision.orderingGeneration === constructionCycleId &&
        currentConflictCandidateKey === revision.replacement.name
        ? revision.replacement
        : readPublishedSavingTarget();
    };
  }
  const observations: Omit<
    ConstructionObservations,
    "readSavingTargetForConflict"
  > & {
    readSavingTargetForConflict?: () => SavingTarget | null;
  } = {
    hasCompletedOrdering: (): boolean => completedIntent !== undefined,
    readSavingTarget: readPublishedSavingTarget,
    readKnowledgeRequirement: (): number => knowledgeRequirement,
    readPlannerSnapshot,
    readStateLogSnapshot,
  };
  if (
    globalThis.__EA_P53_CONSTRUCTION_AUTHORITY_ENABLED__ === true &&
    targetAdmissionForTest !== undefined &&
    readSavingTargetForConflict !== undefined
  )
    observations.readSavingTargetForConflict = readSavingTargetForConflict;
  const publishedObservations: ConstructionObservations =
    Object.freeze(observations);

  return Object.freeze({
    reader,
    executor,
    establishOrdering(): boolean {
      orderingOnly = true;
      try {
        reader.beginCycle();
        if (!cycleReadyToPublish) return false;
        reader.finishCycle?.(true);
        return true;
      } finally {
        orderingOnly = false;
      }
    },
    observations: publishedObservations,
  });
}
