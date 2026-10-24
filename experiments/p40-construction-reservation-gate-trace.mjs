function replaceOnce(source, before, after, file, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(
      "P40 instrumentation anchor changed in " +
        file +
        ": " +
        label +
        " (" +
        count +
        ")",
    );
  }
  return source.replace(before, after);
}

export const P40_TRACE_HOOK_PROPERTIES = [
  "  p40TraceEnabled: false,",
  "  p40TraceEvents: [],",
  "  p40TraceSynchronousMs: 0,",
  "  p40ContextSynchronousMs: 0,",
  "  p40GuardSynchronousMs: 0,",
  "  p40ResourceReadMs: 0,",
  "  p40ResourceReadCount: 0,",
  "  p40GuardCalls: 0,",
  "  p40DiagnosticClockReads: 0,",
  "  p40OwnerDecisionCount: 0,",
  "  p41ConflictReaderCalls: 0,",
  "  p41ConflictReaderElapsedMs: 0,",
  "  p41DiagnosticClockReads: 0,",
  "  p40TraceOverflow: 0,",
  "  p40TraceClockUnavailable: false,",
  "  p40CurrentPeriod: null,",
  "  p40OwnerContext: null,",
  "  p40CurrentBuildCandidate: null,",
  "  p40BuildPolicyBackend: null,",
  "  p40ShouldCaptureCandidate(key, actionId) {",
  "    const period = this.p40OwnerContext?.period;",
  "    if (this.p40TraceEnabled !== true || period !== 720) return false;",
  "    const clock = window.eaDiagnosticsNow;",
  '    const started = typeof clock === "function" ? clock() : 0;',
  '    const matches = /(?:rock_quarry|basic_housing)/i.test(String(key) + " " + String(actionId));',
  "    this.p40GuardCalls++;",
  '    if (typeof clock === "function") { this.p40DiagnosticClockReads += 2; this.p40GuardSynchronousMs += clock() - started; }',
  "    else this.p40TraceClockUnavailable = true;",
  "    return matches;",
  "  },",
  "  p40CaptureConstructionTrace(type, build) {",
  "    const context = this.p40OwnerContext;",
  "    if (this.p40TraceEnabled !== true || context?.period !== 720) return;",
  "    const clock = window.eaDiagnosticsNow;",
  '    if (typeof clock !== "function") { this.p40TraceClockUnavailable = true; return; }',
  "    const started = clock();",
  "    this.p40DiagnosticClockReads += 1;",
  "    const record = build();",
  "    if (this.p40TraceEvents.length >= 4096) {",
  "      this.p40TraceOverflow++;",
  "      this.p40TraceSynchronousMs += clock() - started; this.p40DiagnosticClockReads += 1;",
  "      return;",
  "    }",
  "    this.p40TraceEvents.push({ sequence: this.p40TraceEvents.length, period: context.period, workCycleId: context.workCycleId, rootGeneration: context.rootGeneration, progressionGeneration: context.progressionGeneration, type, ...record });",
  "    this.p40TraceSynchronousMs += clock() - started; this.p40DiagnosticClockReads += 1;",
  "  },",
].join("\n");

function instrumentProgressionControl(source) {
  source = replaceOnce(
    source,
    [
      "      : createScriptBuildPolicyReader({",
      "          getBuildingManager,",
      "          getSettings: readSettings,",
      "          ...(onSkipped === undefined ? {} : { onSkipped }),",
      "        });",
    ].join("\n"),
    [
      "      : createScriptBuildPolicyReader({",
      "          getBuildingManager,",
      "          getSettings: readSettings,",
      "          ...(onSkipped === undefined ? {} : { onSkipped }),",
      "        });",
      '  if (typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" && __EA_TEST_SURFACE_ENABLED__ === true) {',
      "    const __p40Hooks = (globalThis as any).__EA_TEST_HOOKS__;",
      '    if (__p40Hooks) __p40Hooks.p40BuildPolicyBackend = getBuildingManager === undefined ? "progression-captured" : "script-backed";',
      "  }",
    ].join("\n"),
    "captured-progression-control.ts",
    "record selected Build policy backend",
  );
  return replaceOnce(
    source,
    [
      "      if (!readObservations().hasCompletedOrdering()) return NO_RESERVATIONS;",
      "      const target = readObservations().readSavingTarget();",
    ].join("\n"),
    [
      "      const __p40HasCompletedOrdering = readObservations().hasCompletedOrdering();",
      "      const target = __p40HasCompletedOrdering ? readObservations().readSavingTarget() : null;",
      "      const __p40Hooks = (globalThis as any).__EA_TEST_HOOKS__;",
      "      const __p40Candidate = __p40Hooks?.p40CurrentBuildCandidate;",
      "      if (__p40Candidate && __p40Hooks?.p40ShouldCaptureCandidate(__p40Candidate.candidateKey, __p40Candidate.actionId)) {",
      '        __p40Hooks.p40CaptureConstructionTrace("saving-reservation", () => ({',
      "          orderingGeneration: __p40Candidate.orderingGeneration,",
      "          input: { candidate: __p40Candidate, hasCompletedOrdering: __p40HasCompletedOrdering },",
      "          output: { target, completeCost: target?.cost ?? null, reservationSupplied: target !== null },",
      "        }));",
      "      }",
      "      if (!__p40HasCompletedOrdering) return NO_RESERVATIONS;",
    ].join("\n"),
    "captured-progression-control.ts",
    "capture actual saving reservation read",
  );
}

function instrumentConstructionAdapter(source) {
  source = replaceOnce(
    source,
    "  function affordable(candidate: Readonly<ConstructionCandidate>): boolean {",
    [
      "  function beginP40OwnerDecision(candidate: Readonly<ConstructionCandidate>): void {",
      "    const hooks = (globalThis as any).__EA_TEST_HOOKS__;",
      '    if (orderingOnly || hooks?.p40TraceEnabled !== true || !/(?:rock_quarry|basic_housing)/i.test(candidate.key + " " + String(candidate.actionId ?? ""))) return;',
      "    const period = hooks.p40CurrentPeriod ?? null;",
      "    if (period !== 720) { hooks.p40OwnerContext = null; return; }",
      "    if (hooks.p40OwnerContext?.orderingGeneration === constructionCycleId) return;",
      "    const clock = window.eaDiagnosticsNow;",
      '    const started = typeof clock === "function" ? clock() : 0;',
      "    const publication = hooks.constructionPublicationAuthority ?? null;",
      "    const context = { period, workCycleId: constructionCycleId, orderingGeneration: constructionCycleId, rootGeneration: publication?.rootGeneration ?? null, progressionGeneration: publication?.progressionGeneration ?? null };",
      "    hooks.p40OwnerDecisionCount++;",
      "    hooks.p40OwnerContext = context;",
      "    hooks.p40CurrentBuildCandidate = null;",
      '    if (typeof clock === "function") { hooks.p40DiagnosticClockReads += 2; hooks.p40ContextSynchronousMs += clock() - started; } else hooks.p40TraceClockUnavailable = true;',
      '    hooks.p40CaptureConstructionTrace("owner-decision", () => ({ input: { policyBackend: hooks.p40BuildPolicyBackend, ownerContext: context, publishedWorkCycleId: publication?.workCycleId ?? null }, output: { buildCandidateSampleStarted: true } }));',
      "  }",
      "  function affordable(candidate: Readonly<ConstructionCandidate>): boolean {",
    ].join("\n"),
    "captured-construction.ts",
    "start trace only when the actual Build application samples a relevant candidate",
  );
  source = replaceOnce(
    source,
    [
      "  function affordable(candidate: Readonly<ConstructionCandidate>): boolean {",
      "    const root = rootState.readRoot();",
      "    if (",
      "      root !== undefined &&",
      "      costFitsNow(root, candidate.cost, { pool: candidate.pool }) === true",
      "    ) {",
      "      return true;",
      "    }",
      "    return false;",
      "  }",
    ].join("\n"),
    [
      "  function affordable(candidate: Readonly<ConstructionCandidate>): boolean {",
      "    const root = rootState.readRoot();",
      "    return root !== undefined && costFitsNow(root, candidate.cost, { pool: candidate.pool }) === true;",
      "  }",
    ].join("\n"),
    "captured-construction.ts",
    "capture affordability root holdings without an extra root read",
  );

  source = replaceOnce(
    source,
    [
      "      const { candidate } = entryAt(index);",
      "      const sample: {",
      "        affordable?: boolean;",
      "        consumption?: readonly Readonly<BuildConsumptionView>[];",
      "      } = {};",
    ].join("\n"),
    [
      "      const { candidate } = entryAt(index);",
      "      beginP40OwnerDecision(candidate);",
      "      const sample: {",
      "        affordable?: boolean;",
      "        consumption?: readonly Readonly<BuildConsumptionView>[];",
      "      } = {};",
    ].join("\n"),
    "captured-construction.ts",
    "bind trace context to an actual Build candidate sample",
  );
  source = replaceOnce(
    source,
    [
      "      if (request.needConsumption) {",
      "        sample.consumption = candidate.consumption ?? NO_CONSUMPTION;",
      "      }",
      "      return Object.freeze(sample);",
    ].join("\n"),
    [
      "      if (request.needConsumption) {",
      "        sample.consumption = candidate.consumption ?? NO_CONSUMPTION;",
      "      }",
      "      const __p40Hooks = (globalThis as any).__EA_TEST_HOOKS__;",
      "      if (__p40Hooks?.p40ShouldCaptureCandidate(candidate.key, candidate.actionId)) {",
      '        __p40Hooks.p40CaptureConstructionTrace("candidate-order", () => ({',
      "          orderingGeneration: constructionCycleId,",
      "          input: { candidateKey: candidate.key, targetId: candidate.key, actionId: candidate.actionId ?? null, weighting: candidate.weighting, important: candidate.important, knowledge: candidate.knowledge, cost: candidate.cost, pool: candidate.pool ?? null, respectReservations },",
      "          output: { orderingIndex: index, sourcesComplete: cycleReadyToPublish, affordability: sample.affordable ?? null },",
      "        }));",
      '        __p40Hooks.p40CaptureConstructionTrace("candidate-affordability", () => ({',
      "          orderingGeneration: constructionCycleId,",
      "          input: { candidateKey: candidate.key, actionId: candidate.actionId ?? null, weighting: candidate.weighting, important: candidate.important, knowledge: candidate.knowledge, cost: candidate.cost, request, respectReservations },",
      "          output: { ...sample },",
      "        }));",
      "      }",
      "      return Object.freeze(sample);",
    ].join("\n"),
    "captured-construction.ts",
    "capture candidate affordability",
  );
  source = replaceOnce(
    source,
    [
      "      const important = candidate.important;",
      "      if (!respectReservations) {",
      "        return Object.freeze({ conflict: null, important });",
      "      }",
      "      const evaluated = conflicts.evaluate(",
      "        candidate.cost,",
      "        candidate.pool,",
      "        candidate.key,",
      "      );",
    ].join("\n"),
    [
      "      const important = candidate.important;",
      "      const __p40Hooks = (globalThis as any).__EA_TEST_HOOKS__;",
      "      const __p40Relevant = __p40Hooks?.p40ShouldCaptureCandidate(candidate.key, candidate.actionId);",
      "      const __p40Candidate = { orderingGeneration: constructionCycleId, candidateKey: candidate.key, targetId: candidate.key, actionId: candidate.actionId ?? null, weighting: candidate.weighting, important, knowledge: candidate.knowledge, cost: candidate.cost, pool: candidate.pool ?? null, respectReservations };",
      "      if (__p40Relevant) __p40Hooks.p40CurrentBuildCandidate = __p40Candidate;",
      "      if (!respectReservations) {",
      "        if (__p40Relevant) {",
      '          __p40Hooks.p40CaptureConstructionTrace("conflict-adapter", () => ({ orderingGeneration: constructionCycleId, input: { candidate: __p40Candidate }, output: { evaluated: false, status: "not-evaluated", conflict: null, important } }));',
      "        }",
      "        return Object.freeze({ conflict: null, important });",
      "      }",
      "      let evaluated;",
      "      const __p41MeasureReader = __p40Relevant && __p40Hooks?.p40OwnerContext?.period === 720;",
      "      const __p41Clock = __p41MeasureReader ? window.eaDiagnosticsNow : undefined;",
      '      const __p41Started = typeof __p41Clock === "function" ? __p41Clock() : 0;',
      "      evaluated = conflicts.evaluate(candidate.cost, candidate.pool, candidate.key);",
      '      if (__p41MeasureReader && typeof __p41Clock === "function") { __p40Hooks.p41ConflictReaderCalls++; __p40Hooks.p41ConflictReaderElapsedMs += __p41Clock() - __p41Started; __p40Hooks.p41DiagnosticClockReads += 2; }',
    ].join("\n"),
    "captured-construction.ts",
    "expose the actual candidate to conflict source instrumentation",
  );
  source = replaceOnce(
    source,
    [
      '      if (evaluated.status === "none") {',
      "        return Object.freeze({ conflict: null, important });",
      "      }",
    ].join("\n"),
    [
      '      if (evaluated.status === "none") {',
      "        const sample = Object.freeze({ conflict: null, important });",
      '        if (__p40Relevant) __p40Hooks.p40CaptureConstructionTrace("conflict-adapter", () => ({ orderingGeneration: constructionCycleId, input: { candidate: __p40Candidate, rawStatus: evaluated.status, evidence: evaluated.evidence ?? null }, output: sample }));',
      "        return sample;",
      "      }",
    ].join("\n"),
    "captured-construction.ts",
    "record none and unavailable evidence mapping",
  );
  source = replaceOnce(
    source,
    [
      '      if (evaluated.status === "unavailable") {',
      "        // Something is saving and the reservation could not be priced. Skipping on incomplete",
      "        // data is the safe half of the trade; spending is not recoverable.",
      "        return Object.freeze({",
      "          conflict: Object.freeze({",
      "            unavailable: true,",
      "            targetNames: Object.freeze([]),",
      "            resourceNames: Object.freeze([]),",
      '            targetCause: "",',
      "          }),",
      "          important,",
      "        });",
      "      }",
      "      return Object.freeze({",
      "        conflict: Object.freeze({",
      "          unavailable: false,",
      "          targetNames: evaluated.conflict.targetNames,",
      "          resourceNames: evaluated.conflict.resourceNames,",
      "          targetCause: evaluated.conflict.targetCause,",
      "        }),",
      "        important,",
      "      });",
    ].join("\n"),
    [
      '      if (evaluated.status === "unavailable") {',
      "        // Something is saving and the reservation could not be priced. Skipping on incomplete",
      "        // data is the safe half of the trade; spending is not recoverable.",
      '        const sample = Object.freeze({ conflict: Object.freeze({ unavailable: true, targetNames: Object.freeze([]), resourceNames: Object.freeze([]), targetCause: "" }), important });',
      '        if (__p40Relevant) __p40Hooks.p40CaptureConstructionTrace("conflict-adapter", () => ({ orderingGeneration: constructionCycleId, input: { candidate: __p40Candidate, rawStatus: evaluated.status }, output: sample }));',
      "        return sample;",
      "      }",
      "      const sample = Object.freeze({",
      "        conflict: Object.freeze({ unavailable: false, targetNames: evaluated.conflict.targetNames, resourceNames: evaluated.conflict.resourceNames, targetCause: evaluated.conflict.targetCause }),",
      "        important,",
      "      });",
      '      if (__p40Relevant) __p40Hooks.p40CaptureConstructionTrace("conflict-adapter", () => ({ orderingGeneration: constructionCycleId, input: { candidate: __p40Candidate, rawStatus: evaluated.status, rawConflict: evaluated.conflict }, output: sample }));',
      "      return sample;",
    ].join("\n"),
    "captured-construction.ts",
    "record adapter conflict outcomes",
  );
  return source;
}

function instrumentCostConflictReader(source) {
  source = replaceOnce(
    source,
    [
      "      const sample = reservations.readReservations();",
      "      const additional = additionalReservations?.readReservations();",
      "      if (sample.unavailable || additional?.unavailable) return UNAVAILABLE;",
    ].join("\n"),
    [
      "      const sample = reservations.readReservations();",
      "      const additional = additionalReservations?.readReservations();",
      "      const __p40Hooks = (globalThis as any).__EA_TEST_HOOKS__;",
      "      const __p40Candidate = __p40Hooks?.p40CurrentBuildCandidate;",
      "      if (sample.unavailable || additional?.unavailable) {",
      '        if (__p40Candidate) __p40Hooks.p40CaptureConstructionTrace("cost-conflict", () => ({ orderingGeneration: __p40Candidate.orderingGeneration, input: { candidate: __p40Candidate, reservationSources: { nativeQueue: sample, scriptReservations: additional ?? null }, candidateCost: cost, candidatePool: pool ?? null, excludeTargetName: excludeTargetName ?? null, holdings: null, status: "unavailable-source" }, output: { status: "unavailable" } }));',
      "        return UNAVAILABLE;",
      "      }",
    ].join("\n"),
    "captured-cost-conflict.ts",
    "capture unavailable reservation sources",
  );
  source = replaceOnce(
    source,
    [
      "      const targets = [",
      "        ...sample.targets,",
      "        ...(additional?.targets ?? []),",
      "      ].filter(",
      "        (target) =>",
      "          target.name !== excludeTargetName &&",
      "          contendsWithPool(target.pool, pool),",
      "      );",
      "      if (targets.length === 0) return NONE;",
    ].join("\n"),
    [
      "      const reservationEntries = [",
      '        ...sample.targets.map((target) => ({ source: "native-queue", target })),',
      '        ...(additional?.targets ?? []).map((target) => ({ source: "script-reservations", target })),',
      "      ];",
      "      const reservationDecisions = reservationEntries.map(({ source, target }) => {",
      "        const sameTarget = target.name === excludeTargetName;",
      "        const poolContends = contendsWithPool(target.pool, pool);",
      '        return { source, target, included: !sameTarget && poolContends, exclusionReason: sameTarget ? "same-target" : poolContends ? null : "different-resource-pool" };',
      "      });",
      "      const targets = reservationDecisions.filter((entry) => entry.included).map((entry) => entry.target);",
      "      const __p40ReservationInput = {",
      "        candidate: __p40Candidate ?? null,",
      "        reservationSources: { nativeQueue: sample, scriptReservations: additional ?? null, nativeQueueAvailable: !sample.unavailable, scriptReservationsAvailable: additional === undefined ? null : !additional.unavailable, nativeQueueUnavailableReason: sample.unavailableReason ?? null, scriptReservationsUnavailableReason: additional?.unavailableReason ?? null },",
      "        reservationDecisions,",
      "        suppliedTargets: targets,",
      "        candidateCost: cost,",
      "        candidatePool: pool ?? null,",
      "        excludeTargetName: excludeTargetName ?? null,",
      "      };",
      "      if (targets.length === 0) {",
      '        if (__p40Candidate) __p40Hooks.p40CaptureConstructionTrace("cost-conflict", () => ({ orderingGeneration: __p40Candidate.orderingGeneration, input: { ...__p40ReservationInput, holdings: null }, output: { status: "none", reason: "no-contending-reservation" } }));',
      "        return NONE;",
      "      }",
    ].join("\n"),
    "captured-cost-conflict.ts",
    "capture supplied reservation entries and exclusions",
  );
  source = replaceOnce(
    source,
    [
      "      if (held === undefined) return UNAVAILABLE;",
      "      const holdings: Record<string, CostConflictResource> = {};",
    ].join("\n"),
    [
      "      if (held === undefined) {",
      '        if (__p40Candidate) __p40Hooks.p40CaptureConstructionTrace("cost-conflict", () => ({ orderingGeneration: __p40Candidate.orderingGeneration, input: { ...__p40ReservationInput, requestedResourceIds: [...wanted], holdings: null, evidence: "unavailable" }, output: { status: "unavailable" } }));',
      "        return UNAVAILABLE;",
      "      }",
      "      const holdings: Record<string, CostConflictResource> = {};",
    ].join("\n"),
    "captured-cost-conflict.ts",
    "capture missing holdings as unavailable evidence",
  );
  return replaceOnce(
    source,
    [
      "      return conflict === null",
      "        ? NONE",
      '        : Object.freeze({ status: "conflict", conflict });',
    ].join("\n"),
    [
      '      const result = conflict === null ? NONE : Object.freeze({ status: "conflict", conflict });',
      '      if (__p40Candidate) __p40Hooks.p40CaptureConstructionTrace("cost-conflict", () => ({ orderingGeneration: __p40Candidate.orderingGeneration, input: { ...__p40ReservationInput, requestedResourceIds: [...wanted], holdings }, output: result }));',
      "      return result;",
    ].join("\n"),
    "captured-cost-conflict.ts",
    "capture pure conflict result and evaluated holdings",
  );
}

function instrumentBuildApplication(source) {
  source = replaceOnce(
    source,
    [
      '    const conflict = measure("autoBuild.planConflict", () =>',
      "      planBuildConflict(",
      "        setup,",
      "        index,",
      '        measure("autoBuild.sampleConflict", () => reader.sampleConflict(index)),',
      "      ),",
      "    );",
    ].join("\n"),
    [
      '    const conflictSample = measure("autoBuild.sampleConflict", () => reader.sampleConflict(index));',
      '    const conflict = measure("autoBuild.planConflict", () => planBuildConflict(setup, index, conflictSample));',
      "    const __p40Hooks = (globalThis as any).__EA_TEST_HOOKS__;",
      "    if (__p40Hooks?.p40ShouldCaptureCandidate(candidate.key, candidate.key)) {",
      '      const __p40KnowledgeException = candidate.knowledge && conflictSample.conflict !== null && !conflictSample.conflict.unavailable && conflictSample.conflict.targetCause === "Saving" && (setup.knowledgeGate.cheapestTechKnowledge > setup.knowledgeGate.knowledgeCapacity || setup.knowledgeGate.knowledgeRequiredByBuildTargets > setup.knowledgeGate.knowledgeCapacity);',
      '      __p40Hooks.p40CaptureConstructionTrace("build-conflict-plan", () => ({',
      "        orderingGeneration: __p40Hooks.p40CurrentBuildCandidate?.orderingGeneration ?? null,",
      "        input: { candidateKey: candidate.key, weighting: candidate.weighting, cost: candidate.cost, knowledge: candidate.knowledge, conflictSample, knowledgeGate: setup.knowledgeGate },",
      '        output: { kind: conflict.kind, branch: conflictSample.conflict === null ? "no-conflict" : conflictSample.important ? "important-bypass" : __p40KnowledgeException ? "knowledge-gated-exception" : conflict.kind === "skip" ? "conflict-enforced" : "proceed-without-documented-bypass", knowledgeGateException: __p40KnowledgeException, annotation: conflict.kind === "skip" ? conflict.annotation : null },',
      "      }));",
      "    }",
    ].join("\n"),
    "application/build.ts",
    "capture Build conflict plan and gate branch",
  );
  source = replaceOnce(
    source,
    [
      '    const competitionRequest = measure("autoBuild.sampleRequest", () =>',
      "      competitionSampleRequest(setup, state, index),",
      "    );",
      '    const competition = measure("autoBuild.planCompetition", () =>',
      "      planBuildCompetition(",
      "        setup,",
      "        index,",
      '        measure("autoBuild.sampleCompetition", () =>',
      "          reader.sampleCompetition(index, competitionRequest),",
      "        ),",
      "        state,",
      "      ),",
      "    );",
    ].join("\n"),
    [
      '    const competitionRequest = measure("autoBuild.sampleRequest", () => competitionSampleRequest(setup, state, index));',
      '    const competitionSample = measure("autoBuild.sampleCompetition", () => reader.sampleCompetition(index, competitionRequest));',
      '    const competition = measure("autoBuild.planCompetition", () => planBuildCompetition(setup, index, competitionSample, state));',
      '    if (__p40Hooks?.p40ShouldCaptureCandidate(candidate.key, candidate.key)) __p40Hooks.p40CaptureConstructionTrace("build-competition-plan", () => ({ orderingGeneration: __p40Hooks.p40CurrentBuildCandidate?.orderingGeneration ?? null, input: { candidateKey: candidate.key, competitionRequest, competitionSample }, output: { kind: competition.kind, decision: competition.kind === "build" ? competition.decision : null, annotation: competition.kind === "delay" ? competition.annotation : null } }));',
    ].join("\n"),
    "application/build.ts",
    "capture resource competition sample and outcome",
  );
  return source;
}

function instrumentCapturedBuild(source) {
  source = replaceOnce(
    source,
    '      const result = controls.invoke(handle, "action");',
    [
      "      const __p40Hooks = (globalThis as any).__EA_TEST_HOOKS__;",
      "      const __p40TracePurchase = __p40Hooks?.p40ShouldCaptureCandidate(key, candidate.target.elementId) === true;",
      "      const __p40DebitBeforeRootHoldings = __p40TracePurchase ? Object.create(null) as Record<string, number | null> : null;",
      "      if (__p40TracePurchase) {",
      "        const __p40Clock = window.eaDiagnosticsNow;",
      '        const __p40Started = typeof __p40Clock === "function" ? __p40Clock() : 0;',
      "        for (const resourceId of Object.keys(candidate.candidate.cost)) {",
      '          const amount = Number(readProperty(readProperty(readProperty(rootBefore, "resource"), resourceId), "amount"));',
      "          __p40DebitBeforeRootHoldings![resourceId] = Number.isFinite(amount) ? amount : null;",
      "        }",
      "        __p40Hooks.p40ResourceReadCount += Object.keys(candidate.candidate.cost).length;",
      '        if (typeof __p40Clock === "function") { __p40Hooks.p40DiagnosticClockReads += 2; __p40Hooks.p40ResourceReadMs += __p40Clock() - __p40Started; } else __p40Hooks.p40TraceClockUnavailable = true;',
      "      }",
      '      const result = controls.invoke(handle, "action");',
    ].join("\n"),
    "captured-build.ts",
    "snapshot purchase holdings immediately before the native action",
  );
  return replaceOnce(
    source,
    [
      "      const queued =",
      "        candidate.target.readCount === undefined &&",
      "        candidateQueueAfter > candidateQueueBefore;",
    ].join("\n"),
    [
      "      const queued =",
      "        candidate.target.readCount === undefined &&",
      "        candidateQueueAfter > candidateQueueBefore;",
      "      if (__p40TracePurchase) {",
      "        const __p40ResourceDebit = Object.fromEntries(Object.keys(candidate.candidate.cost).map((resourceId) => {",
      '          const afterResource = readProperty(readProperty(rootAfter, "resource"), resourceId);',
      "          const beforeAmount = __p40DebitBeforeRootHoldings?.[resourceId] ?? null;",
      '          const afterAmount = Number(readProperty(afterResource, "amount"));',
      '          return [resourceId, { before: beforeAmount, after: Number.isFinite(afterAmount) ? afterAmount : null, debit: typeof beforeAmount === "number" && Number.isFinite(afterAmount) ? beforeAmount - afterAmount : null }];',
      "        }));",
      "        __p40Hooks.p40ResourceReadCount += Object.keys(candidate.candidate.cost).length;",
      '        __p40Hooks.p40CaptureConstructionTrace("purchase-postcondition", () => ({',
      "          orderingGeneration: __p40Hooks.p40CurrentBuildCandidate?.orderingGeneration ?? null,",
      "          input: { candidateKey: key, targetId: candidate.target.key, actionId: candidate.target.elementId, cost: candidate.candidate.cost, beforeCount: before, queueBefore, candidateQueueBefore },",
      "          output: { nativeActionResult: result, afterCount: after, queueAfter, candidateQueueAfter, built, queued, verifiedSuccess: result.ok && (built || queued), resourceDebit: __p40ResourceDebit },",
      "        }));",
      "      }",
    ].join("\n"),
    "captured-build.ts",
    "capture native purchase verification and resource debit from existing roots",
  );
}

export function createP40ConstructionTracePlugin() {
  const transforms = [
    ["captured-progression-control.ts", instrumentProgressionControl],
    ["captured-construction.ts", instrumentConstructionAdapter],
    ["captured-cost-conflict.ts", instrumentCostConflictReader],
    ["application/build.ts", instrumentBuildApplication],
    ["captured-build.ts", instrumentCapturedBuild],
  ];
  return {
    name: "p40-test-only-construction-reservation-trace",
    setup(build) {
      build.onLoad({ filter: /\.ts$/ }, async (args) => {
        const normalized = args.path.replaceAll("\\", "/");
        const entry = transforms.find(([suffix]) =>
          normalized.endsWith(suffix),
        );
        if (entry === undefined) return undefined;
        const fs = await import("node:fs/promises");
        return {
          contents: entry[1](await fs.readFile(args.path, "utf8")),
          loader: "ts",
        };
      });
    },
  };
}
