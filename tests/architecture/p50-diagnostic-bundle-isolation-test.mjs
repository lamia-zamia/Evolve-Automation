import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import ts from "typescript";

import { createBuildOptions } from "../../build-config.mjs";
import { createP51ConstructionJobsHandoffPlugin } from "../../experiments/p51-construction-jobs-handoff-trace.mjs";

const repositoryRoot = process.cwd();
const admissionFunction = "admitAllocationDiagnosticObservation";
const observerFunction = "observeTestAllocationDiagnosticRequest";
const ordinaryProjection = "capturedOrdinaryAllocationDiagnosticFacts";
const fullJobsProjection = "capturedAllocationDiagnosticFacts";
const decisionIdentity = "capturedJobsDecisionIdentity";
const diagnosticInputSuffix =
  "src/domain/civic/allocation-diagnostic-admission.ts";
const constructionAdmissionInputSuffix =
  "src/domain/progression/build/construction-target-admission.ts";
const productionOnlyNames = [
  admissionFunction,
  observerFunction,
  ordinaryProjection,
  fullJobsProjection,
  decisionIdentity,
  "FOOD_STONE_DIAGNOSTIC_OBJECTIVE",
  "FOOD_STONE_DIAGNOSTIC_SCOPE",
  "AllocationDiagnosticRequest",
  "AllocationDiagnosticEvidence",
  "readTestAllocationDiagnosticRequest",
  "readTestWorkCycleIdentity",
  "onTestAllocationDiagnosticAdmission",
  "testObservationEnabled",
  "testControlResolutionCount",
  "testSettingsReadCount",
  "testCatalogReadCount",
  "testDemandReadCount",
  "testNativeRootReadCount",
  "publishP51ConstructionReceiptForTest",
  "consumeP51ConstructionReceiptForTest",
  "recordP51NativePostconditionForTest",
  "stageP51VerifiedPurchaseForTest",
  "completeP51ConstructionCycleForTest",
  "invalidateP51ConstructionReceiptForTest",
  "p51ConstructionRequest",
  "p51HandoffState",
  "p51AdmissionEnabled",
  "p51Mode",
  "consumeP52ConstructionReceiptForTest",
  "finalizeP52ConstructionReceiptForTest",
  "p52IdentitySampleActive",
  "p52JobsIdentitySampleActive",
  "p52HandoffClassification",
  "p52ConstructionIdentitySample",
  "p52JobsIdentitySample",
  "decideConstructionTargetAdmission",
  "ConstructionTargetAdmissionRequest",
  "ConstructionSavingPriorityRevision",
  "readActionAuthority",
  "readReservationEvidence",
  "p53ConstructionRequest",
  "p53OwnerDecision",
  "__EA_P54_CONSTRUCTION_ACTIVATION_ENABLED__",
  "p54ConstructionRequestEventSinkForTest",
  "p54PendingRequestForTest",
  "p54EventFedActivation",
  "p54Metrics",
  "readRootObservationCountForTest",
  "recordContextRootObservations",
  "onRootObservationSample",
  "localPendingRequestCheckTotalMs",
  "nativeControlAuthorityRootObservations",
  "nativePriceProbeCalls",
  "readActionAuthority",
  "constructionRequestLatchForTest",
  "activationModeReportedForTest",
  "rootObservationCountForTest",
];
const productionOnlyStrings = [
  "p48-allocation-diagnostic-observation",
  "maintain-food-buffer-and-useful-stone-production",
  "food-sustainability-and-useful-stone-replenishment",
  "allocationDiagnosticRequest",
  "observeAllocationDiagnosticAdmission",
  "p51-test-only-quarry-priority-request-v1",
  "verified-purchase",
  "handoff-authority-incomplete",
  "p51-test-only-verified-construction-jobs-handoff",
  "native-root-replaced",
  "p52-independent-construction-jobs-identity",
  "captured-runtime-shared-progression-reader",
  "post-construction-success",
  "jobs-owner-admission",
  "source-backed-known-mutation",
  "p53-test-only-city-rock-quarry-v1",
  "explicit-test-only-priority-replacement",
  "bounded-test-only-request-and-current-evidence-match",
  "local-pending-request-check",
  "requestCancellationEvents",
  "p54-test-only-event-fed-construction-request",
  "contextRootObservations",
  "native-control-authority-read",
  "native-price-authority",
  "native-action-execution",
];

async function bundle(
  testSurface,
  p51Surface = false,
  p52Surface = false,
  p53Surface = false,
  p54Surface = false,
) {
  assert.equal(
    (p51Surface || p52Surface) && !testSurface,
    false,
    "P51/P52 instrumentation can only be compiled into the test surface",
  );
  assert.equal(
    p52Surface && !p51Surface,
    false,
    "P52 instrumentation extends the P51 test surface",
  );
  assert.equal(
    p53Surface && (!p51Surface || !p52Surface),
    false,
    "P53 comparison requires the retained P51/P52 test surface",
  );
  assert.equal(
    p54Surface && !p53Surface,
    false,
    "P54 activation requires the retained P53 owner-authority test surface",
  );
  const result = await esbuild.build({
    ...createBuildOptions({
      root: repositoryRoot,
      outfile: `test-artifacts/p50/p50-${testSurface ? "test" : "production"}.js`,
      banner: { js: "" },
      testSurface,
      p53Surface,
      p54Surface,
    }),
    ...(p51Surface
      ? { plugins: [createP51ConstructionJobsHandoffPlugin(p52Surface)] }
      : {}),
    write: false,
    metafile: true,
    logLevel: "silent",
  });
  const output = result.outputFiles[0];
  const parsed = ts.createSourceFile(
    output.path,
    output.text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const functions = new Set();
  const identifiers = new Set();
  const identifierNodes = new Map();
  const strings = new Set();
  const calls = new Map();
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name)
      functions.add(node.name.text);
    if (ts.isIdentifier(node)) {
      identifiers.add(node.text);
      const nodes = identifierNodes.get(node.text) ?? [];
      nodes.push(node);
      identifierNodes.set(node.text, nodes);
    }
    if (ts.isStringLiteralLike(node)) strings.add(node.text);
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      calls.set(name, (calls.get(name) ?? 0) + 1);
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);

  const outputMetadata = Object.values(result.metafile.outputs)[0];
  const diagnosticModuleBytes =
    Object.entries(outputMetadata.inputs).find(([inputPath]) =>
      inputPath.replaceAll("\\", "/").endsWith(diagnosticInputSuffix),
    )?.[1].bytesInOutput ?? 0;
  const constructionAdmissionModuleBytes =
    Object.entries(outputMetadata.inputs).find(([inputPath]) =>
      inputPath
        .replaceAll("\\", "/")
        .endsWith(constructionAdmissionInputSuffix),
    )?.[1].bytesInOutput ?? 0;

  return {
    text: output.text,
    functions,
    identifiers,
    identifierNodes,
    strings,
    calls,
    diagnosticModuleBytes,
    constructionAdmissionModuleBytes,
  };
}

const production = await bundle(false);
for (const name of productionOnlyNames) {
  assert.equal(
    production.identifiers.has(name),
    false,
    `ordinary bundle retains P48/P49 diagnostic identifier ${name}`,
  );
}
for (const name of [
  "targetAdmissionForTest",
  "readSavingTargetForConflict",
  "completedWorkCycleId",
  "completedAuthorityForTest",
  "admissionRequestForCycle",
  "admissionContextForCycle",
  "candidateAffordable",
  "admissionAttempted",
  "admissionAcceptedForCycle",
  "admissionExecutionAttempted",
  "verifiedPurchaseCount",
  "verifiedResourceDebits",
  "savingPriorityRevision",
  "revisionControlGeneration",
  "currentConflictCandidateKey",
  "admissionRequestReadFailed",
  "activationModeReportedForTest",
  "constructionRequestLatchForTest",
  "rootObservationCountForTest",
]) {
  const nodes = production.identifierNodes.get(name) ?? [];
  assert.ok(
    nodes.length <= 1,
    `ordinary bundle retains P53 ${name} references`,
  );
  if (nodes.length === 1) {
    const declaration = nodes[0].parent;
    assert.equal(ts.isVariableDeclaration(declaration), true);
    assert.equal(declaration.initializer, undefined);
  }
}
for (const marker of productionOnlyStrings) {
  assert.equal(
    production.strings.has(marker),
    false,
    `ordinary bundle retains P48/P49 diagnostic string ${marker}`,
  );
}
assert.equal(
  production.calls.get(admissionFunction) ?? 0,
  0,
  "ordinary bundle invokes the diagnostic admission predicate",
);
assert.equal(
  production.constructionAdmissionModuleBytes,
  0,
  "ordinary bundle includes P53 target-admission implementation bytes",
);
assert.equal(
  production.diagnosticModuleBytes,
  0,
  "ordinary bundle includes emitted bytes from the admission module",
);
const diagnosticDependencyBindings =
  production.identifierNodes.get("allocationDiagnosticAdmissionDependencies") ??
  [];
assert.equal(
  diagnosticDependencyBindings.length,
  1,
  "ordinary bundle has a diagnostic dependency reference",
);
assert.equal(
  ts.isVariableDeclaration(diagnosticDependencyBindings[0].parent),
  true,
  "the remaining diagnostic dependency identifier is not a declaration",
);
assert.equal(
  diagnosticDependencyBindings[0].parent.initializer,
  undefined,
  "the diagnostic dependency declaration performs initialization work",
);

const testSurface = await bundle(true);
assert.equal(testSurface.functions.has(admissionFunction), true);
assert.equal(testSurface.functions.has(observerFunction), true);
assert.equal(testSurface.functions.has(ordinaryProjection), true);
assert.equal(testSurface.functions.has(fullJobsProjection), true);
assert.equal(testSurface.functions.has(decisionIdentity), true);
assert.equal(testSurface.calls.get(admissionFunction), 1);
assert.equal(testSurface.calls.get(observerFunction), 2);
for (const marker of [
  "p54ConstructionRequestEventSinkForTest",
  "readRootObservationCountForTest",
  "local-pending-request-check",
]) {
  assert.equal(
    testSurface.identifiers.has(marker) || testSurface.strings.has(marker),
    false,
    `ordinary test surface unexpectedly includes P54 activation code ${marker}`,
  );
}
for (const marker of [
  "p48-allocation-diagnostic-observation",
  "maintain-food-buffer-and-useful-stone-production",
  "food-sustainability-and-useful-stone-replenishment",
  "allocationDiagnosticRequest",
  "observeAllocationDiagnosticAdmission",
  "ordinary-jobs-only",
  "full-jobs-and-foundry",
  "cancelledAtGeneration",
  "replacedAtGeneration",
  "referenceMatchedAtExecution",
  "requestIdentity",
  "executionAuthority",
  "none",
]) {
  assert.equal(
    testSurface.strings.has(marker) || testSurface.identifiers.has(marker),
    true,
    `test-surface bundle omits diagnostic contract marker ${marker}`,
  );
}

for (const name of [
  "consumeP52ConstructionReceiptForTest",
  "finalizeP52ConstructionReceiptForTest",
  "p52JobsIdentitySampleActive",
  "p52HandoffClassification",
]) {
  assert.equal(
    testSurface.identifiers.has(name) || testSurface.strings.has(name),
    false,
    `ordinary test surface unexpectedly includes P52 instrumentation ${name}`,
  );
}

assert.ok(testSurface.diagnosticModuleBytes > 0);
assert.equal(testSurface.constructionAdmissionModuleBytes, 0);
for (const marker of [
  "decideConstructionTargetAdmission",
  "explicit-test-only-priority-replacement",
]) {
  assert.equal(
    testSurface.identifiers.has(marker) || testSurface.strings.has(marker),
    false,
    `ordinary test-surface bundle unexpectedly includes P53 owner-authority marker ${marker}`,
  );
}
for (const name of ["targetAdmissionForTest", "readSavingTargetForConflict"]) {
  const nodes = testSurface.identifierNodes.get(name) ?? [];
  assert.ok(
    nodes.length <= 1,
    `ordinary test surface retains P53 ${name} behavior`,
  );
  if (nodes.length === 1) {
    assert.equal(ts.isVariableDeclaration(nodes[0].parent), true);
    assert.equal(nodes[0].parent.initializer, undefined);
  }
}

for (const name of [
  "publishP51ConstructionReceiptForTest",
  "consumeP51ConstructionReceiptForTest",
  "recordP51NativePostconditionForTest",
  "stageP51VerifiedPurchaseForTest",
  "completeP51ConstructionCycleForTest",
  "invalidateP51ConstructionReceiptForTest",
]) {
  assert.equal(
    testSurface.identifiers.has(name),
    false,
    `ordinary test surface unexpectedly includes P51 hook ${name}`,
  );
}

const p51Surface = await bundle(true, true);
for (const name of [
  "publishP51ConstructionReceiptForTest",
  "consumeP51ConstructionReceiptForTest",
  "recordP51NativePostconditionForTest",
  "stageP51VerifiedPurchaseForTest",
  "completeP51ConstructionCycleForTest",
  "invalidateP51ConstructionReceiptForTest",
  "p51AdmissionEnabled",
  "p51Mode",
]) {
  assert.equal(
    p51Surface.identifiers.has(name) || p51Surface.strings.has(name),
    true,
    `P51 exact test surface omits ${name}`,
  );
}
for (const marker of [
  "p51-test-only-quarry-priority-request-v1",
  "verified-purchase",
  "handoff-authority-incomplete",
  "captured-build-count-postcondition",
  "Construction",
]) {
  assert.equal(
    p51Surface.strings.has(marker),
    true,
    `P51 exact test surface omits contract marker ${marker}`,
  );
}

for (const name of [
  "consumeP52ConstructionReceiptForTest",
  "finalizeP52ConstructionReceiptForTest",
  "p52JobsIdentitySampleActive",
  "p52HandoffClassification",
]) {
  assert.equal(
    p51Surface.identifiers.has(name) || p51Surface.strings.has(name),
    false,
    `P51-only test surface unexpectedly includes the P52 observer ${name}`,
  );
}

const p52Surface = await bundle(true, true, true);
for (const marker of [
  "consumeP52ConstructionReceiptForTest",
  "finalizeP52ConstructionReceiptForTest",
  "p52JobsIdentitySampleActive",
  "p52IdentityNativeRootReads",
  "captured-runtime-shared-progression-reader",
  "post-construction-success",
  "jobs-owner-admission",
]) {
  assert.equal(
    p52Surface.identifiers.has(marker) || p52Surface.strings.has(marker),
    true,
    `P52 exact test surface omits identity provenance marker ${marker}`,
  );
}

const p53Surface = await bundle(true, true, true, true);
assert.ok(p53Surface.constructionAdmissionModuleBytes > 0);
for (const marker of [
  "decideConstructionTargetAdmission",
  "targetAdmissionForTest",
  "readSavingTargetForConflict",
  "explicit-test-only-priority-replacement",
  "p53-test-only-city-rock-quarry-v1",
]) {
  assert.equal(
    p53Surface.identifiers.has(marker) || p53Surface.strings.has(marker),
    true,
    `P53 exact test surface omits owner-authority marker ${marker}`,
  );
}

for (const name of [
  "p54ConstructionRequestEventSinkForTest",
  "readRootObservationCountForTest",
  "rootObservationCountForTest",
  "activationModeReportedForTest",
  "constructionRequestLatchForTest",
  "local-pending-request-check",
]) {
  assert.equal(
    p53Surface.identifiers.has(name) || p53Surface.strings.has(name),
    false,
    `ordinary P53 test surface unexpectedly includes P54 activation code ${name}`,
  );
}

const p54Surface = await bundle(true, true, true, true, true);
for (const marker of [
  "p54ConstructionRequestEventSinkForTest",
  "readRootObservationCountForTest",
  "local-pending-request-check",
  "requestCancellationEvents",
  "native-action-execution",
]) {
  assert.equal(
    p54Surface.identifiers.has(marker) || p54Surface.strings.has(marker),
    true,
    `P54 exact test surface omits activation/cost marker ${marker}`,
  );
}

console.log(
  "P50 production diagnostic isolation and P51/P52/P53/P54 test-only surface retention tests passed",
);
