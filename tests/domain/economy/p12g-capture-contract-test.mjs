import assert from "node:assert/strict";

import {
  validateP12GCapture,
  validateP12GReplayEvidence,
} from "../../../experiments/p12g-capture-contract.mjs";

const exportSave = '{"save":{"marker":"captured"}}';
const observationIdentity = "p12g-smelter-17-export";
const offer = {
  elementId: "tech-anything",
  generation: 4,
  cost: { Knowledge: 10, Alloy: 2 },
  offerSetIdentity: "offer-set",
};
const expectedInputs = {
  pinnedUpstreamCommit: "pinned-commit",
  gameSnapshotSha256: "game-hash",
  startingSaveSha256: "save-hash",
  effectiveSettingsSha256: "settings-hash",
  seed: 42,
  epoch: "epoch",
  testBundleSha256: "bundle-hash",
  testHarnessSha256: "harness-hash",
};
const capture = {
  contractVersion: 1,
  inputs: expectedInputs,
  period: 17,
  capturePeriod: 17,
  exportSave,
  exportSaveSha256:
    "7845b96e9111d8ac933a66d248ffacc79a97fb13d285c6d58596bfdae704d13b",
  saveSha256:
    "7845b96e9111d8ac933a66d248ffacc79a97fb13d285c6d58596bfdae704d13b",
  observationIdentity,
  rootGeneration: 2,
  progressionEpoch: "progression",
  offer,
  currentOfferEvidence: {
    period: 17,
    observationIdentity,
    offer,
    queueEvidence: "empty",
    researchPermission: true,
  },
  currentDemandEvidence: {
    period: 17,
    observationIdentity,
    value: { requestedSteel: 3 },
  },
  metadataEvidence: Object.fromEntries(
    ["root", "progression", "offer"].map((key) => [
      key,
      {
        source: "native-reader",
        validity: "same-observation-boundary",
        period: 17,
        observationIdentity,
      },
    ]),
  ),
  smelterObservation: { period: 17, identity: observationIdentity },
  preAdjustment: { period: 17, exportSave },
};
capture.preAdjustment.demand = capture.currentDemandEvidence.value;

assert.equal(validateP12GCapture(capture, expectedInputs), capture);
assert.throws(
  () =>
    validateP12GCapture(capture, {
      ...expectedInputs,
      effectiveSettingsSha256: "other-settings",
    }),
  /inputs do not match/,
);
assert.throws(
  () =>
    validateP12GCapture(capture, {
      ...expectedInputs,
      gameSnapshotSha256: "other-game",
    }),
  /inputs do not match/,
);
assert.throws(
  () =>
    validateP12GCapture(
      {
        ...capture,
        currentOfferEvidence: {
          ...capture.currentOfferEvidence,
          offer: { ...offer, cost: { Knowledge: 11, Alloy: 2 } },
        },
      },
      expectedInputs,
    ),
  /price disagrees/,
);
assert.throws(
  () =>
    validateP12GCapture(
      {
        ...capture,
        currentOfferEvidence: {
          ...capture.currentOfferEvidence,
          offer: { ...offer, generation: 5 },
        },
      },
      expectedInputs,
    ),
  /generation disagrees/,
);
assert.throws(
  () =>
    validateP12GCapture(
      {
        ...capture,
        currentOfferEvidence: {
          ...capture.currentOfferEvidence,
          offer: { ...offer, offerSetIdentity: "different-set" },
        },
      },
      expectedInputs,
    ),
  /offer set identity disagrees/,
);
assert.throws(
  () =>
    validateP12GCapture(
      { ...capture, exportSave: exportSave + "tampered" },
      expectedInputs,
    ),
  /saved export hash/,
);
assert.throws(
  () =>
    validateP12GCapture(
      {
        ...capture,
        metadataEvidence: {
          ...capture.metadataEvidence,
          offer: {
            ...capture.metadataEvidence.offer,
            period: 18,
          },
        },
      },
      expectedInputs,
    ),
  /offer metadata is from another period/,
);

const restoredEvidence = {
  plan: { input: { initialised: true }, controlAvailable: true },
  demand: {
    requestedSteel: 3,
    isSteelDemanded: true,
    savingTarget: { cost: { Steel: 3 } },
  },
  catalog: {
    current: true,
    rootGeneration: capture.rootGeneration,
    progressionEpoch: capture.progressionEpoch,
    researchPermission: true,
    queueEvidence: "empty",
    offers: [offer],
    targetControl: { generation: offer.generation },
  },
};
assert.equal(
  validateP12GReplayEvidence(capture, restoredEvidence).offer,
  offer,
);
assert.throws(
  () =>
    validateP12GReplayEvidence(capture, {
      ...restoredEvidence,
      catalog: { ...restoredEvidence.catalog, offers: [] },
    }),
  /not currently offered/,
);
assert.throws(
  () =>
    validateP12GReplayEvidence(capture, {
      ...restoredEvidence,
      catalog: { ...restoredEvidence.catalog, current: false },
    }),
  /stale or unavailable/,
);
assert.throws(
  () =>
    validateP12GReplayEvidence(capture, {
      ...restoredEvidence,
      catalog: {
        ...restoredEvidence.catalog,
        offers: [{ ...offer, cost: { Knowledge: 11, Alloy: 2 } }],
      },
    }),
  /price changed/,
);

console.log("P12G capture contract tests passed");
