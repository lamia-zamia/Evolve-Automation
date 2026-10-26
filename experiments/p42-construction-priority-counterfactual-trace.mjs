import { readFile } from "node:fs/promises";

import { applyP40ConstructionTraceInstrumentation } from "./p40-construction-reservation-gate-trace.mjs";

export const P42_TRACE_HOOK_PROPERTIES = [
  "  p42Enabled: false,",
  "  p42Arm: null,",
  "  p42Identity: null,",
  "  p42P38Authorization: null,",
  "  p42P36GatherActions: 0,",
  "  p42ExpectedAuthorizationHistory: null,",
  "  p42PreSubstitutionBoundary: null,",
  "  p42BoundaryRecorded: false,",
  "  p42QuarryOrder: null,",
  "  p42BuildConflictReadActive: false,",
  "  p42OwnerCycleApplied: false,",
  "  p42Released: false,",
  "  p42Trace: [],",
  "  p42TraceLimit: 64,",
  "  p42TraceBytes: 0,",
  "  p42TraceByteLimit: 524288,",
  "  p42TraceOverflow: 0,",
  "  p42ResourceAmountReads: 0,",
  "  p42OwnerAuthorityReads: 0,",
  "  p42AppliedReservationReads: 0,",
  "  p42DiagnosticClockReads: 0,",
  "  p42SynchronousMs: 0,",
  "  p42TraceElapsedMs: 0,",
  "  p42TraceClockUnavailable: false,",
  "  p42Record(record) {",
  "    const bytes = JSON.stringify(record).length * 2;",
  "    if (this.p42Trace.length >= this.p42TraceLimit || this.p42TraceBytes + bytes > this.p42TraceByteLimit) { this.p42TraceOverflow++; return false; }",
  "    this.p42Trace.push(record); this.p42TraceBytes += bytes; return true;",
  "  },",
].join("\n");

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1)
    throw new Error(`P42 instrumentation anchor changed: ${label} (${count})`);
  return source.replace(before, after);
}

function instrumentConstructionAdapter(source) {
  source = applyP40ConstructionTraceInstrumentation(
    "captured-construction.ts",
    source,
  );
  source = replaceOnce(
    source,
    [
      "      if (__p40Hooks?.p40ShouldCaptureCandidate(candidate.key, candidate.actionId)) {",
      '        __p40Hooks.p40CaptureConstructionTrace("candidate-order", () => ({',
    ].join("\n"),
    [
      "      if (__p40Hooks?.p40ShouldCaptureCandidate(candidate.key, candidate.actionId)) {",
      '        if (__p40Hooks?.p42Enabled === true && candidate.key === "city-rock_quarry" && index === 0) {',
      "          const authorityClock = window.eaDiagnosticsNow;",
      "          const authorityStarted = typeof authorityClock === 'function' ? authorityClock() : 0;",
      "          const authority = __p40Hooks.p38JobsApi?.readOwnerAuthority(candidate.actionId) ?? null;",
      "          __p40Hooks.p42OwnerAuthorityReads++;",
      "          if (typeof authorityClock === 'function') { __p40Hooks.p42DiagnosticClockReads += 2; __p40Hooks.p42SynchronousMs += authorityClock() - authorityStarted; } else __p40Hooks.p42TraceClockUnavailable = true;",
      "          __p40Hooks.p42QuarryOrder = { orderingGeneration: constructionCycleId, orderingIndex: index, key: candidate.key, actionId: candidate.actionId ?? null, weighting: candidate.weighting, important: candidate.important, knowledge: candidate.knowledge, cost: candidate.cost, authority };",
      "        }",
      '        __p40Hooks.p40CaptureConstructionTrace("candidate-order", () => ({',
    ].join("\n"),
    "record p720 Quarry order and generation at candidate sampling",
  );

  return replaceOnce(
    source,
    [
      "        evaluated = conflicts.evaluate(",
      "          candidate.cost,",
      "          candidate.pool,",
      "          candidate.key,",
      "        );",
    ].join("\n"),
    [
      "      const __p42BuildConflictRead = __p40Hooks?.p42Mode === true;",
      "      if (__p42BuildConflictRead) __p40Hooks.p42BuildConflictReadActive = true;",
      "      try {",
      "        evaluated = conflicts.evaluate(candidate.cost, candidate.pool, candidate.key);",
      "      } finally {",
      "        if (__p42BuildConflictRead) __p40Hooks.p42BuildConflictReadActive = false;",
      "      }",
    ].join("\n"),
    "scope substitution to Construction Build conflict reads",
  );
}

function instrumentCostConflictReader(source) {
  source = applyP40ConstructionTraceInstrumentation(
    "captured-cost-conflict.ts",
    source,
  );
  source = `import { readProperty } from "../validation.ts";\nimport { applyP42ConstructionReservation, shouldReleaseP42ConstructionReservation } from "../../../experiments/p42-construction-priority-counterfactual-policy.mjs";\n${source}`;
  source = replaceOnce(
    source,
    "      const additional = additionalReservations?.readReservations();",
    "      let additional = additionalReservations?.readReservations();",
    "retain the source values while substituting the returned reservation view",
  );
  source = replaceOnce(
    source,
    [
      "      if (sample.unavailable || additional?.unavailable) {",
      '        if (__p40Candidate) __p40Hooks.p40CaptureConstructionTrace("cost-conflict", () => ({ orderingGeneration: __p40Candidate.orderingGeneration, input: { candidate: __p40Candidate, reservationSources: { nativeQueue: sample, scriptReservations: additional ?? null }, candidateCost: cost, candidatePool: pool ?? null, excludeTargetName: excludeTargetName ?? null, holdings: null, status: "unavailable-source" }, output: { status: "unavailable" } }));',
    ].join("\n"),
    [
      "      if (sample.unavailable || additional?.unavailable) {",
      '        if (__p40Hooks?.p42BuildConflictReadActive === true && __p40Hooks?.p42Enabled === true && __p40Hooks.p40OwnerContext?.period === 720) __p40Hooks.p42Record({ type: "reservation-rejected", period: 720, candidateKey: __p40Candidate?.candidateKey ?? null, applied: false, reason: "reservation-source-unavailable" });',
      '        if (__p40Candidate) __p40Hooks.p40CaptureConstructionTrace("cost-conflict", () => ({ orderingGeneration: __p40Candidate.orderingGeneration, input: { candidate: __p40Candidate, reservationSources: { nativeQueue: sample, scriptReservations: additional ?? null }, candidateCost: cost, candidatePool: pool ?? null, excludeTargetName: excludeTargetName ?? null, holdings: null, status: "unavailable-source" }, output: { status: "unavailable" } }));',
    ].join("\n"),
    "record unavailable P42 reservation qualification without substitution",
  );
  return replaceOnce(
    source,
    "      const reservationEntries = [",
    [
      "      const __p42Hooks = __p40Hooks;",
      "      const __p42Owner = __p42Hooks?.p40OwnerContext;",
      "      if (__p42Hooks?.p42Mode === true && __p42Hooks.p42BoundaryRecorded !== true && __p42Hooks.p42BuildConflictReadActive === true && __p42Owner?.period === 720 && __p42Owner?.workCycleId === 90 && __p42Owner?.orderingGeneration === 90) {",
      "        const __p42BoundaryClock = window.eaDiagnosticsNow;",
      "        const __p42BoundaryStarted = typeof __p42BoundaryClock === 'function' ? __p42BoundaryClock() : 0;",
      "        const __p42BoundaryDiagnostics = window.__EA_RUNNER__?.diagnostics?.() ?? null;",
      "        const __p42BoundarySave = typeof window.exportGame === 'function' ? window.exportGame() : null;",
      "        const __p42Boundary = { captured: typeof __p42BoundaryClock === 'function' && typeof __p42BoundarySave === 'string' && Array.isArray(__p42BoundaryDiagnostics?.nativeInvocations) && __p42BoundaryDiagnostics?.controlUsage !== null && typeof __p42BoundaryDiagnostics?.controlUsage === 'object' && Number.isSafeInteger(__p42BoundaryDiagnostics?.randomCalls) && __p42BoundaryDiagnostics?.rngState !== undefined, save: __p42BoundarySave, nativeInvocations: __p42BoundaryDiagnostics?.nativeInvocations ?? null, controlUsage: __p42BoundaryDiagnostics?.controlUsage ?? null, randomCalls: __p42BoundaryDiagnostics?.randomCalls ?? null, rngState: __p42BoundaryDiagnostics?.rngState ?? null };",
      "        const __p42BoundaryBytes = JSON.stringify(__p42Boundary).length * 2;",
      "        if (__p42BoundaryBytes > 2097152) { __p42Boundary.captured = false; __p42Boundary.save = null; __p42Boundary.nativeInvocations = null; __p42Boundary.controlUsage = null; __p42Boundary.reason = 'boundary-payload-exceeds-2097152-bytes'; }",
      "        __p42Hooks.p42PreSubstitutionBoundary = __p42Boundary;",
      "        __p42Hooks.p42BoundaryRecorded = true;",
      '        __p42Hooks.p42Record({ type: "pre-substitution-boundary", period: 720, workCycleId: 90, orderingGeneration: 90, captured: __p42Boundary.captured, boundaryBytes: __p42BoundaryBytes, reason: __p42Boundary.reason ?? null });',
      "        if (typeof __p42BoundaryClock === 'function') { __p42Hooks.p42DiagnosticClockReads += 2; __p42Hooks.p42SynchronousMs += __p42BoundaryClock() - __p42BoundaryStarted; } else __p42Hooks.p42TraceClockUnavailable = true;",
      "      }",
      "      if (shouldReleaseP42ConstructionReservation({ ownerCycleApplied: __p42Hooks?.p42OwnerCycleApplied, ownerContext: __p42Owner, released: __p42Hooks?.p42Released })) {",
      '        __p42Hooks.p42Record({ type: "intervention-release", period: __p42Hooks.p40CurrentPeriod ?? null, ownerContext: __p42Owner ?? null, reason: "Construction owner cycle ended" });',
      "        __p42Hooks.p42Released = true;",
      "      }",
      "      if (__p42Hooks?.p42BuildConflictReadActive === true && __p42Hooks?.p42Enabled === true && __p42Owner?.period === 720 && __p42Owner?.workCycleId === 90 && __p42Owner?.orderingGeneration === 90) {",
      "        const __p42Clock = window.eaDiagnosticsNow;",
      "        const __p42Started = typeof __p42Clock === 'function' ? __p42Clock() : 0;",
      '        const __p42PageCapture = window[Symbol.for("evolve-automation.page-capture")];',
      "        const __p42Root = __p42PageCapture?.rootState?.readRoot?.();",
      '        const __p42Resource = readProperty(__p42Root, "resource");',
      '        const __p42Lumber = Number(readProperty(readProperty(__p42Resource, "Lumber"), "amount"));',
      '        const __p42Stone = Number(readProperty(readProperty(__p42Resource, "Stone"), "amount"));',
      "        __p42Hooks.p42ResourceAmountReads += 2;",
      '        const __p42Authority = __p42Hooks.p38JobsApi?.readOwnerAuthority("city-rock_quarry") ?? null;',
      "        __p42Hooks.p42OwnerAuthorityReads++;",
      "        const __p42AuthorizationHistoryMatched = __p42Hooks.p42AuthorizationHistoryMatched();",
      "        const __p42Application = applyP42ConstructionReservation({",
      "          enabled: __p42Hooks.p42Enabled,",
      "          arm: __p42Hooks.p42Arm,",
      "          identity: __p42Hooks.p42Identity,",
      "          authorizationHistoryMatched: __p42AuthorizationHistoryMatched,",
      "          preSubstitutionBoundaryCaptured: __p42Hooks.p42PreSubstitutionBoundary?.captured === true,",
      "          p36GatherActions: __p42Hooks.p42P36GatherActions,",
      "          p38Authorization: __p42Hooks.p42P38Authorization,",
      "          ownerContext: __p42Owner,",
      "          currentCandidate: __p40Candidate,",
      "          publishedWorkCycleId: __p42Hooks.constructionPublicationAuthority?.workCycleId ?? null,",
      "          quarryOrder: __p42Hooks.p42QuarryOrder,",
      "          currentAuthority: __p42Authority,",
      "          nativeQueue: { available: !sample.unavailable, targets: sample.targets },",
      "          scriptReservations: { available: additional !== undefined && !additional.unavailable, targets: additional?.targets ?? [] },",
      "          stock: { Lumber: Number.isFinite(__p42Lumber) ? __p42Lumber : null, Stone: Number.isFinite(__p42Stone) ? __p42Stone : null },",
      "        });",
      "        const __p42ReservationBefore = additional?.targets ?? [];",
      "        if (__p42Application.applied) {",
      "          additional = Object.freeze({ ...additional, targets: __p42Application.targets });",
      "          __p42Hooks.p42OwnerCycleApplied = true;",
      "          __p42Hooks.p42AppliedReservationReads++;",
      "        }",
      '        __p42Hooks.p42Record({ type: "reservation-read", period: __p42Owner.period, workCycleId: __p42Owner.workCycleId, orderingGeneration: __p40Candidate?.orderingGeneration ?? null, candidateKey: __p40Candidate?.candidateKey ?? null, previousCompletedPublication: __p42Hooks.constructionPublicationAuthority?.workCycleId ?? null, reservationBefore: __p42ReservationBefore, reservationAfter: additional?.targets ?? [], candidateCost: __p40Candidate?.cost ?? null, quarryPrice: __p42Hooks.p42QuarryOrder?.cost ?? null, stock: { Lumber: __p42Lumber, Stone: __p42Stone }, currentAuthority: __p42Authority, authorizationHistoryMatched: __p42AuthorizationHistoryMatched, applied: __p42Application.applied, reason: __p42Application.reason, sameTargetExcluded: __p42Application.applied && additional?.targets?.some((target) => target.name === "city-rock_quarry" && target.name === excludeTargetName) === true });',
      "        if (typeof __p42Clock === 'function') { const __p42Elapsed = __p42Clock() - __p42Started; __p42Hooks.p42DiagnosticClockReads += 2; __p42Hooks.p42SynchronousMs += __p42Elapsed; __p42Hooks.p42TraceElapsedMs += __p42Elapsed; } else __p42Hooks.p42TraceClockUnavailable = true;",
      "      }",
      "      const reservationEntries = [",
    ].join("\n"),
    "qualify and substitute only the Construction Build reservation view",
  );
}

export function createP42ConstructionPriorityTracePlugin() {
  const transforms = [
    ["captured-construction.ts", instrumentConstructionAdapter],
    ["captured-cost-conflict.ts", instrumentCostConflictReader],
  ];
  return {
    name: "p42-test-only-construction-priority-counterfactual",
    setup(build) {
      build.onLoad({ filter: /\.ts$/ }, async (args) => {
        const normalized = args.path.replaceAll("\\", "/");
        const entry = transforms.find(([suffix]) =>
          normalized.endsWith(suffix),
        );
        if (entry === undefined) return undefined;
        return {
          contents: entry[1](await readFile(args.path, "utf8")),
          loader: "ts",
        };
      });
    },
  };
}
