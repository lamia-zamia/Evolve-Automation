import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = path.join(root, "test-artifacts/benchmark/tmp");
const capturePath = path.join(tempDir, "p12d-native-capture.json");
const outputPath = process.argv
  .find((argument) => argument.startsWith("--out="))
  ?.slice(6);
await mkdir(tempDir, { recursive: true });
execFileSync(
  process.execPath,
  [
    path.join(root, "experiments/p12b-native-prerequisite-capture.mjs"),
    `--out=${capturePath}`,
  ],
  { cwd: root, stdio: "inherit", maxBuffer: 32 * 1024 * 1024 },
);

const capture = JSON.parse(await readFile(capturePath, "utf8"));
const planner = capture.explicitIndependentCapture.planner;
const advisory = planner.advisoryRoutes;
const expectedFrontier = [
  "tech-mad_science",
  "tech-black_powder",
  "tech-steel_containers",
  "tech-barns",
];
assert.deepEqual(
  [...planner.graph.actionableFrontier].sort(),
  [...expectedFrontier].sort(),
  "Stage 2F native graph frontier changed",
);
const advisoryCandidateIds = new Set(
  advisory.candidates.map((candidate) => candidate.actionId),
);
assert.ok(
  expectedFrontier.every((actionId) => advisoryCandidateIds.has(actionId)),
  "advisory planner omitted an observed prerequisite frontier offer",
);
assert.equal(advisory.selectedActionId, undefined);
assert.equal(
  capture.productionParity.baselineAndCandidateEqual &&
    capture.productionParity.controlUsageEqual &&
    capture.productionParity.orderedNativeInvocationsEqual &&
    capture.productionParity.researchDrawCountsEqual,
  true,
  "ordinary production parity changed",
);

const report = {
  runner: capture.runner,
  snapshotCommit: capture.snapshotCommit,
  inputs: capture.inputs,
  identities: capture.identities,
  productionParity: capture.productionParity,
  ordinaryResearchActionInvocations: {
    baseline: capture.productionParity.baselineResearchActionInvocations,
    candidate: capture.productionParity.candidateResearchActionInvocations,
  },
  independentCapture: {
    explicitlyForcedDiagnosticDraws:
      capture.explicitIndependentCapture.explicitlyForcedDiagnosticDraws,
    captureCallWallMs: capture.explicitIndependentCapture.captureCallWallMs,
    statePreservedAgainstP12AMode:
      capture.explicitIndependentCapture.statePreservedAgainstP12AMode,
    nativeInvocationsEqualToP12AMode:
      capture.explicitIndependentCapture.nativeInvocationsEqualToP12AMode,
    controlUsageEqualToP12AMode:
      capture.explicitIndependentCapture.controlUsageEqualToP12AMode,
  },
  strictMandatoryObligations: {
    status: planner.obligations.status,
    inputConsistency: planner.obligations.inputConsistency,
    mandatoryActionIds: planner.obligations.mandatoryActionIds,
    reasons: planner.obligations.reasons,
  },
  graphFrontier: planner.graph.actionableFrontier,
  advisoryRoutes: {
    status: advisory.status,
    selectedActionId: advisory.selectedActionId,
    selection: advisory.selection,
    work: advisory.work,
    reasons: advisory.reasons,
    candidates: advisory.candidates.map((candidate) => ({
      actionId: candidate.actionId,
      currentActionability: candidate.currentActionability,
      mandatoryObligation: candidate.mandatoryObligation,
      authorizationToSpend: candidate.authorizationToSpend,
      generation: candidate.generation,
      cost: candidate.cost,
      nativeAffordable: candidate.nativeAffordable,
      terminalActionId: candidate.terminalActionId,
      routeEvidence: candidate.routeEvidence,
      dependencyWitness: candidate.dependencyWitness,
      currentAffordability: candidate.currentAffordability,
      reasons: candidate.reasons,
    })),
  },
  existingP12AFrontierSelection: capture.existingP12AMode.frontier,
  diagnosticResearchActionInvocations:
    capture.explicitIndependentCapture.researchActionInvocations,
};
const output = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath === undefined) process.stdout.write(output);
else await writeFile(path.resolve(outputPath), output);
