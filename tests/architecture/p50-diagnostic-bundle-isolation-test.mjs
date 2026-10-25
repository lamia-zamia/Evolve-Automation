import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import ts from "typescript";

import { createBuildOptions } from "../../build-config.mjs";

const repositoryRoot = process.cwd();
const admissionFunction = "admitAllocationDiagnosticObservation";
const observerFunction = "observeTestAllocationDiagnosticRequest";
const ordinaryProjection = "capturedOrdinaryAllocationDiagnosticFacts";
const fullJobsProjection = "capturedAllocationDiagnosticFacts";
const decisionIdentity = "capturedJobsDecisionIdentity";
const diagnosticInputSuffix =
  "src/domain/civic/allocation-diagnostic-admission.ts";
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
];
const productionOnlyStrings = [
  "p48-allocation-diagnostic-observation",
  "maintain-food-buffer-and-useful-stone-production",
  "food-sustainability-and-useful-stone-replenishment",
  "allocationDiagnosticRequest",
  "observeAllocationDiagnosticAdmission",
];

async function bundle(testSurface) {
  const result = await esbuild.build({
    ...createBuildOptions({
      root: repositoryRoot,
      outfile: `test-artifacts/p50/p50-${testSurface ? "test" : "production"}.js`,
      banner: { js: "" },
      testSurface,
    }),
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

  return {
    text: output.text,
    functions,
    identifiers,
    identifierNodes,
    strings,
    calls,
    diagnosticModuleBytes,
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
assert.ok(testSurface.diagnosticModuleBytes > 0);

console.log(
  "P50 production diagnostic isolation and test-surface retention tests passed",
);
