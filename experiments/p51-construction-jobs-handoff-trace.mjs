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

export function createP51ConstructionJobsHandoffPlugin() {
  const transforms = [
    ["application/build.ts", instrumentBuild],
    [
      "adapters/evolve/progression/build/captured-build.ts",
      instrumentNativeBuildPostcondition,
    ],
    [
      "bootstrap/captured-runtime-control.ts",
      applyP51RuntimeAdmissionInstrumentation,
    ],
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
