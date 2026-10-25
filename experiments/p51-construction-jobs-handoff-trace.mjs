import { readFile } from "node:fs/promises";
import { applyP40ConstructionTraceInstrumentation } from "./p40-construction-reservation-gate-trace.mjs";

const modulePath = "experiments/p51-construction-jobs-handoff-contract.mjs";

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1)
    throw new Error(`P51 instrumentation anchor changed: ${label} (${count})`);
  return source.replace(before, after);
}

function withImport(source, names, prefix) {
  return `import { ${names.join(", ")} } from "${prefix}${modulePath}";\n${source}`;
}

function instrumentBuild(source) {
  source = applyP40ConstructionTraceInstrumentation(
    "application/build.ts",
    source,
  );
  source = withImport(
    source,
    [
      "completeP51ConstructionCycleForTest",
      "recordP51ConstructionAttemptForTest",
      "stageP51VerifiedPurchaseForTest",
    ],
    "../../",
  );
  source = replaceOnce(
    source,
    "    if (result.clicked) dependencies.onMutation?.();",
    `    if (result.clicked) dependencies.onMutation?.();
    if (typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" && __EA_TEST_SURFACE_ENABLED__ === true) {
      const p51Hooks = (globalThis as any).__EA_TEST_HOOKS__;
      if (p51Hooks?.p51Mode === true) recordP51ConstructionAttemptForTest(p51Hooks, { candidate: setup.candidates[index], result });
    }`,
    "record non-success outcomes without changing onMutation",
  );
  source = replaceOnce(
    source,
    `    if (result.disposition !== "verified-success") {
      return result.outcome;
    }
    const application = measure("autoBuild.applyClickResult", () =>`,
    `    if (result.disposition !== "verified-success") {
      return result.outcome;
    }
    if (typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" && __EA_TEST_SURFACE_ENABLED__ === true) {
      const p51Hooks = (globalThis as any).__EA_TEST_HOOKS__;
      if (p51Hooks?.p51Mode === true) stageP51VerifiedPurchaseForTest(p51Hooks, { candidate: setup.candidates[index], result });
    }
    const application = measure("autoBuild.applyClickResult", () =>`,
    "stage the verified target after the disposition guard",
  );
  return replaceOnce(
    source,
    `  } finally {
    dependencies.reader.finishCycle?.(outcome?.status === "succeeded");
  }`,
    `  } finally {
    const p51CycleCompleted = outcome?.status === "succeeded";
    dependencies.reader.finishCycle?.(p51CycleCompleted);
    if (typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" && __EA_TEST_SURFACE_ENABLED__ === true) {
      const p51Hooks = (globalThis as any).__EA_TEST_HOOKS__;
      if (p51Hooks?.p51Mode === true) completeP51ConstructionCycleForTest(p51Hooks, p51CycleCompleted);
    }
  }`,
    "publish only after the Construction reader confirms the completed cycle",
  );
}

function instrumentNativeBuildPostcondition(source) {
  source = applyP40ConstructionTraceInstrumentation(
    "captured-build.ts",
    source,
  );
  source = withImport(
    source,
    ["recordP51NativePostconditionForTest"],
    "../../../../../",
  );
  return replaceOnce(
    source,
    "      const built = after > before;",
    `      const built = after > before;
      if (typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" && __EA_TEST_SURFACE_ENABLED__ === true) {
        const p51Hooks = (globalThis as any).__EA_TEST_HOOKS__;
        if (p51Hooks?.p51Mode === true) recordP51NativePostconditionForTest(p51Hooks, { targetBuildingId: candidate.target.elementId, actionReportedSuccess: result.ok, beforeCount: before, afterCount: after });
      }`,
    "reuse the native building-count postcondition already read by Build",
  );
}

export function applyP52RuntimeAdmissionInstrumentation(source) {
  source = withImport(
    source,
    [
      "consumeP51ConstructionReceiptForTest",
      "consumeP52ConstructionReceiptForTest",
      "finalizeP52ConstructionReceiptForTest",
      "invalidateP51ConstructionReceiptForTest",
    ],
    "../../",
  );
  source = replaceOnce(
    source,
    `  pageCapture.rootState.subscribeRootReplaced(() => {
    mechSupplyReservation.reset();`,
    `  pageCapture.rootState.subscribeRootReplaced(() => {
    const p51Hooks = readProperty(settingsHostWindow, "__EA_TEST_HOOKS__");
    if (readProperty(p51Hooks, "p51Mode") === true) invalidateP51ConstructionReceiptForTest(p51Hooks, "native-root-replaced");
    mechSupplyReservation.reset();`,
    "release staged or published receipt on the existing root replacement event",
  );
  source = replaceOnce(
    source,
    '        const candidate = readProperty(hooks, "allocationDiagnosticRequest");',
    `        if (readProperty(hooks, "p51Mode") === true && readProperty(hooks, "p51AdmissionEnabled") !== true) return undefined;
        const candidate = readProperty(hooks, "allocationDiagnosticRequest");`,
    "keep P49 admission inactive until the P51 handoff window",
  );
  source = replaceOnce(
    source,
    "          if (forwardedAdmissions >= maxForwardedAdmissions) return;",
    `          const p51Hooks = readProperty(settingsHostWindow, "__EA_TEST_HOOKS__");
          if (readProperty(p51Hooks, "p51Mode") === true) {
            if (readProperty(p51Hooks, "p51AdmissionEnabled") !== true) return;
            const p51State = readProperty(p51Hooks, "p51HandoffState");
            if (readProperty(p51Hooks, "p52Mode") === true && (!isRecord(p51State) || p51State.pendingReceipt === null)) {
              Reflect.set(p51Hooks, "p52DormantAdmissionCallbacks", Number(readProperty(p51Hooks, "p52DormantAdmissionCallbacks") ?? 0) + 1);
              const metrics = readProperty(p51State, "metrics");
              if (isRecord(metrics)) Reflect.set(metrics, "p52DormantCallbacks", Number(readProperty(metrics, "p52DormantCallbacks") ?? 0) + 1);
            }
            if (isRecord(p51State) && p51State.pendingReceipt !== null) {
              const runner = readProperty(settingsHostWindow, "__EA_RUNNER__");
              const readPeriod = readProperty(runner, "periods");
            const period = typeof readPeriod === "function" ? Reflect.apply(readPeriod, runner, []) : undefined;
            if (readProperty(p51Hooks, "p52Mode") === true) {
              const clock = window.eaDiagnosticsNow;
              const started = typeof clock === "function" ? clock() : 0;
              const readsBefore = Number(readProperty(p51Hooks, "p52IdentityNativeRootReads") ?? 0);
              let jobsIdentity;
              try {
                Reflect.set(p51Hooks, "p52JobsIdentitySampleActive", true);
                const rootGeneration = progression.readRootGeneration();
                const progressionFingerprint = progression.readProgressionEpoch();
                jobsIdentity = Object.freeze({ sourceProvenance: "captured-runtime-shared-progression-reader", sourceIdentity: progression, samplePoint: "jobs-owner-admission", rootGeneration, progressionFingerprint });
              } catch (error) {
                Reflect.set(p51Hooks, "p52JobsIdentityError", String(error));
              } finally {
                Reflect.set(p51Hooks, "p52JobsIdentitySampleActive", false);
              }
              const elapsedMs = typeof clock === "function" ? Math.max(0, clock() - started) : null;
              const nativeRootReads = Number(readProperty(p51Hooks, "p52IdentityNativeRootReads") ?? 0) - readsBefore;
              const startIndex = readProperty(p51Hooks, "p52NativeInvocationStartIndex");
              let nativeMutationsAfterPublication = [];
              try {
                const diagnostics = readProperty(runner, "diagnostics");
                const nativeCalls = typeof diagnostics === "function" ? Reflect.apply(diagnostics, runner, [])?.nativeInvocations : undefined;
                if (Array.isArray(nativeCalls) && Number.isSafeInteger(startIndex)) nativeMutationsAfterPublication = nativeCalls.slice(startIndex).filter((call) => call?.method === "action" || call?.method === "click").map((call) => ({ period: call.period ?? null, elementId: call.elementId ?? null, method: call.method ?? null }));
              } catch {}
              const identitySample = Object.freeze({ jobsIdentity: jobsIdentity ?? null, sampleCount: jobsIdentity === undefined ? 0 : 1, nativeRootReads, synchronousMs: elapsedMs, nativeMutationsAfterPublication });
              Reflect.set(p51Hooks, "p52JobsIdentitySample", identitySample);
              const p52Metrics = readProperty(p51State, "metrics");
              if (isRecord(p52Metrics)) {
                Reflect.set(p52Metrics, "p52IdentitySamples", Number(readProperty(p52Metrics, "p52IdentitySamples") ?? 0) + identitySample.sampleCount);
                Reflect.set(p52Metrics, "p52IdentityNativeRootReads", Number(readProperty(p52Metrics, "p52IdentityNativeRootReads") ?? 0) + nativeRootReads);
                Reflect.set(p52Metrics, "p52IdentitySampleMs", Number(readProperty(p52Metrics, "p52IdentitySampleMs") ?? 0) + (elapsedMs ?? 0));
              }
              const result = consumeP52ConstructionReceiptForTest(p51Hooks, event, { workCycleId: automationCycle, period, jobsIdentity, nativeMutationsAfterPublication });
              Reflect.set(p51Hooks, "p52HandoffClassification", result);
            } else {
              const constructionOwner = readProperty(p51Hooks, "p40OwnerContext");
              consumeP51ConstructionReceiptForTest(p51Hooks, event, {
                workCycleId: automationCycle,
                period,
                rootGeneration: readProperty(constructionOwner, "rootGeneration"),
                progressionGeneration: readProperty(constructionOwner, "progressionGeneration"),
              });
            }
            }
          }
          if (forwardedAdmissions >= maxForwardedAdmissions) return;`,
    "consume only at the existing P49 prepared Jobs admission",
  );
  source = replaceOnce(
    source,
    `            const publicationAuthority = Object.freeze({
              workCycleId: automationCycle,
              rootGeneration: progression.readRootGeneration(),
              progressionGeneration: progression.readProgressionEpoch(),
            });`,
    `            const p52Mode = readProperty(testHooks, "p52Mode") === true;
            const p52Clock = window.eaDiagnosticsNow;
            const p52Started = p52Mode && typeof p52Clock === "function" ? p52Clock() : 0;
            const p52ReadsBefore = Number(readProperty(testHooks, "p52ConstructionIdentityNativeRootReads") ?? 0);
            if (p52Mode) Reflect.set(testHooks, "p52ConstructionIdentitySampleActive", true);
            let p52RootGeneration;
            let p52ProgressionFingerprint;
            try {
              p52RootGeneration = progression.readRootGeneration();
              p52ProgressionFingerprint = progression.readProgressionEpoch();
            } finally {
              if (p52Mode) Reflect.set(testHooks, "p52ConstructionIdentitySampleActive", false);
            }
            const p52ElapsedMs = p52Mode && typeof p52Clock === "function" ? Math.max(0, p52Clock() - p52Started) : null;
            const publicationAuthority = Object.freeze({
              workCycleId: automationCycle,
              rootGeneration: p52RootGeneration,
              progressionGeneration: p52ProgressionFingerprint,
              ...(p52Mode ? {
                sourceProvenance: "captured-runtime-shared-progression-reader",
                identitySource: progression,
                samplePoint: "post-construction-success",
                identitySampleMs: p52ElapsedMs,
                identityNativeRootReads: Number(readProperty(testHooks, "p52ConstructionIdentityNativeRootReads") ?? 0) - p52ReadsBefore,
                incrementalNativeRootReads: 0,
              } : {}),
            });`,
    "reuse and provenance-tag Construction's existing shared-reader sample",
  );
  source = replaceOnce(
    source,
    `            if (isRecord(testHooks)) {
              Reflect.set(
                testHooks,
                "constructionPublicationAuthority",
                publicationAuthority,
              );
            }
            const observeSavingTarget = readProperty(`,
    `            if (isRecord(testHooks)) {
              Reflect.set(
                testHooks,
                "constructionPublicationAuthority",
                publicationAuthority,
              );
              if (p52Mode) {
                try {
                  const runner = readProperty(settingsHostWindow, "__EA_RUNNER__");
                  const diagnostics = readProperty(runner, "diagnostics");
                  const nativeCalls = typeof diagnostics === "function" ? Reflect.apply(diagnostics, runner, [])?.nativeInvocations : undefined;
                  Reflect.set(testHooks, "p52NativeInvocationStartIndex", Array.isArray(nativeCalls) ? nativeCalls.length : null);
                  Reflect.set(testHooks, "p52ConstructionIdentitySample", publicationAuthority);
                  finalizeP52ConstructionReceiptForTest(testHooks);
                } catch (error) {
                  Reflect.set(testHooks, "p52ConstructionIdentityError", String(error));
                }
              }
            }
            const observeSavingTarget = readProperty(`,
    "publish the P52 receipt after the existing post-success Construction identity sample",
  );
  return source;
}

export function applyP51RuntimeAdmissionInstrumentation(source) {
  source = withImport(
    source,
    [
      "consumeP51ConstructionReceiptForTest",
      "invalidateP51ConstructionReceiptForTest",
    ],
    "../../",
  );
  source = replaceOnce(
    source,
    `  pageCapture.rootState.subscribeRootReplaced(() => {
    mechSupplyReservation.reset();`,
    `  pageCapture.rootState.subscribeRootReplaced(() => {
    const p51Hooks = readProperty(settingsHostWindow, "__EA_TEST_HOOKS__");
    if (readProperty(p51Hooks, "p51Mode") === true) invalidateP51ConstructionReceiptForTest(p51Hooks, "native-root-replaced");
    mechSupplyReservation.reset();`,
    "release staged or published receipt on the existing root replacement event",
  );
  source = replaceOnce(
    source,
    '        const candidate = readProperty(hooks, "allocationDiagnosticRequest");',
    `        if (readProperty(hooks, "p51Mode") === true && readProperty(hooks, "p51AdmissionEnabled") !== true) return undefined;
        const candidate = readProperty(hooks, "allocationDiagnosticRequest");`,
    "keep P49 admission inactive until the P51 handoff window",
  );
  return replaceOnce(
    source,
    "          if (forwardedAdmissions >= maxForwardedAdmissions) return;",
    `          const p51Hooks = readProperty(settingsHostWindow, "__EA_TEST_HOOKS__");
          if (readProperty(p51Hooks, "p51Mode") === true) {
            if (readProperty(p51Hooks, "p51AdmissionEnabled") !== true) return;
            const p51State = readProperty(p51Hooks, "p51HandoffState");
            if (isRecord(p51State) && p51State.pendingReceipt !== null) {
              const runner = readProperty(settingsHostWindow, "__EA_RUNNER__");
              const readPeriod = readProperty(runner, "periods");
              const constructionOwner = readProperty(p51Hooks, "p40OwnerContext");
              consumeP51ConstructionReceiptForTest(p51Hooks, event, {
                workCycleId: automationCycle,
                period: typeof readPeriod === "function" ? Reflect.apply(readPeriod, runner, []) : undefined,
                rootGeneration: readProperty(constructionOwner, "rootGeneration"),
                progressionGeneration: readProperty(constructionOwner, "progressionGeneration"),
              });
            }
          }
          if (forwardedAdmissions >= maxForwardedAdmissions) return;`,
    "consume only at the existing P49 prepared Jobs admission",
  );
}

export function applyP52ProgressionSampleInstrumentation(source) {
  return replaceOnce(
    source,
    "    const root = rootState.readRoot();",
    `    const root = rootState.readRoot();
    const p52Hooks = (globalThis as any).__EA_TEST_HOOKS__;
    if (p52Hooks?.p52ConstructionIdentitySampleActive === true) p52Hooks.p52ConstructionIdentityNativeRootReads = Number(p52Hooks.p52ConstructionIdentityNativeRootReads ?? 0) + 1;
    if (p52Hooks?.p52JobsIdentitySampleActive === true) p52Hooks.p52IdentityNativeRootReads = Number(p52Hooks.p52IdentityNativeRootReads ?? 0) + 1;`,
    "count only root observations made by bounded P52 identity samples",
  );
}

export function createP51ConstructionJobsHandoffPlugin(p52Mode = false) {
  const transforms = [
    ["application/build.ts", instrumentBuild],
    [
      "adapters/evolve/progression/build/captured-build.ts",
      instrumentNativeBuildPostcondition,
    ],
    [
      "bootstrap/captured-runtime-control.ts",
      p52Mode
        ? applyP52RuntimeAdmissionInstrumentation
        : applyP51RuntimeAdmissionInstrumentation,
    ],
    ...(p52Mode
      ? [
          [
            "adapters/evolve/progression-epoch.ts",
            applyP52ProgressionSampleInstrumentation,
          ],
        ]
      : []),
  ];
  return {
    name: "p51-test-only-verified-construction-jobs-handoff",
    setup(build) {
      build.onLoad({ filter: /\.ts$/ }, async (args) => {
        const normalized = args.path.replaceAll("\\", "/");
        const transform = transforms.find(([suffix]) =>
          normalized.endsWith(suffix),
        )?.[1];
        if (transform === undefined) return undefined;
        return {
          contents: transform(await readFile(args.path, "utf8")),
          loader: "ts",
        };
      });
    },
  };
}
