import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as prettier from "prettier";

import { createP541ActivationLifecycleEvidence } from "./p54-1-activation-lifecycle-correction-evidence.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const interimPath = path.join(
  root,
  "test-artifacts/benchmark/tmp/p54-1-activation-lifecycle-correction-interim.json",
);
const evidencePath = path.join(
  root,
  "experiments/p54-1-activation-lifecycle-correction-evidence.json",
);
const [interimBytes, previousBytes] = await Promise.all([
  readFile(interimPath),
  readFile(evidencePath),
]);
const interim = JSON.parse(interimBytes.toString("utf8"));
const previous = JSON.parse(previousBytes.toString("utf8"));
assert.equal(
  interim.replayHarnessSha256,
  previous.pinnedInputs.replayHarnessSha256,
  "retained P54.1 interim evidence must match the recorded replay harness",
);
for (const arm of ["A", "C", "D-early", "D-early-repeat", "D-late"])
  assert.ok(interim.arms[arm], `retained P54.1 evidence is missing ${arm}`);

const evidence = createP541ActivationLifecycleEvidence({
  A: interim.arms.A,
  C: interim.arms.C,
  DEarly: interim.arms["D-early"],
  DEarlyRepeat: interim.arms["D-early-repeat"],
  DLate: interim.arms["D-late"],
  gameSnapshotSha256: previous.pinnedInputs.gameSnapshotSha256,
  bundleSha256: previous.pinnedInputs.bundleSha256,
  replayHarnessSha256: previous.pinnedInputs.replayHarnessSha256,
  sourceHashes: previous.pinnedInputs.sourceHashes,
  priorP42EvidenceSha256: previous.pinnedInputs.priorP42EvidenceSha256,
  baselineTunedFixturePresent:
    previous.pinnedInputs.baselineTunedFixturePresent,
});
evidence.countCorrection = {
  source: "retained P54.1 interim replay evidence",
  sourceSha256: createHash("sha256").update(interimBytes).digest("hex"),
  gameplayReplayed: false,
};
assert.equal(
  evidence.nativeTrace.pairAccounting.adjacentPairsAndOrderValidated,
  true,
);
assert.equal(
  evidence.nativeTrace.pairAccounting.buildQueueSetDataAtP720.C.rawTraceRows,
  104,
);
assert.equal(
  evidence.nativeTrace.pairAccounting.buildQueueSetDataAtP720.C
    .nativeApiInvocations,
  52,
);
await writeFile(
  evidencePath,
  await prettier.format(JSON.stringify(evidence), { parser: "json" }),
);
console.log(
  JSON.stringify({
    evidencePath,
    interimSha256: evidence.countCorrection.sourceSha256,
    gameplayReplayed: false,
    buildQueueSetDataAtP720:
      evidence.nativeTrace.pairAccounting.buildQueueSetDataAtP720,
  }),
);
