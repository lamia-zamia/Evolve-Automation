import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const P12G_CAPTURE_CONTRACT_VERSION = 1;
export const P12G_PINNED_COMMIT = "db38e2af831907d49aeb5348d678d8d8745d6c3f";

export function validateP12GCapture(capture, expectedInputs) {
  assert.equal(
    capture?.contractVersion,
    P12G_CAPTURE_CONTRACT_VERSION,
    "unsupported or missing P12G capture contract",
  );
  assert.deepEqual(
    capture.inputs,
    expectedInputs,
    "P12G capture inputs do not match this experiment",
  );
  assert.ok(
    Number.isInteger(capture.period) && capture.period >= 0,
    "capture period is invalid",
  );
  assert.equal(
    capture.capturePeriod,
    capture.period,
    "capture period does not match its contract",
  );
  const exportHash = createHash("sha256")
    .update(capture.exportSave)
    .digest("hex");
  assert.equal(
    capture.exportSaveSha256,
    exportHash,
    "saved export hash does not match its bytes",
  );
  assert.equal(
    capture.saveSha256,
    capture.exportSaveSha256,
    "legacy save hash does not match the captured export",
  );
  assert.equal(
    capture.preAdjustment?.period,
    capture.period,
    "Smelter observation is from another period",
  );
  assert.equal(
    capture.preAdjustment?.exportSave,
    capture.exportSave,
    "Smelter observation and saved export are from different boundaries",
  );
  assert.equal(
    capture.smelterObservation?.period,
    capture.period,
    "Smelter observation identity is from another period",
  );
  assert.equal(
    capture.smelterObservation?.identity,
    capture.observationIdentity,
    "Smelter observation identity is inconsistent",
  );
  assert.ok(
    capture.observationIdentity,
    "Smelter observation identity is missing",
  );
  assert.equal(
    capture.offer?.elementId,
    capture.currentOfferEvidence?.offer?.elementId,
    "current offer evidence is missing or mismatched",
  );
  assert.deepEqual(
    capture.offer?.cost,
    capture.currentOfferEvidence?.offer?.cost,
    "current offer price disagrees with the captured offer",
  );
  assert.equal(
    capture.offer?.generation,
    capture.currentOfferEvidence?.offer?.generation,
    "current offer generation disagrees with the captured offer",
  );
  assert.equal(
    capture.offer?.offerSetIdentity,
    capture.currentOfferEvidence?.offer?.offerSetIdentity,
    "current offer set identity disagrees with the captured offer",
  );
  assert.equal(
    capture.currentOfferEvidence?.period,
    capture.period,
    "offer was observed in another period",
  );
  assert.equal(
    capture.currentOfferEvidence?.observationIdentity,
    capture.observationIdentity,
    "offer metadata is from another observation",
  );
  assert.equal(
    capture.currentDemandEvidence?.period,
    capture.period,
    "demand was observed in another period",
  );
  assert.equal(
    capture.currentDemandEvidence?.observationIdentity,
    capture.observationIdentity,
    "demand metadata is from another observation",
  );
  assert.deepEqual(
    capture.currentDemandEvidence?.value,
    capture.preAdjustment?.demand,
    "demand metadata does not match the Smelter observation",
  );
  for (const key of ["root", "progression", "offer"]) {
    const evidence = capture.metadataEvidence?.[key];
    assert.ok(
      evidence?.source && evidence?.validity,
      key + " metadata provenance is missing",
    );
    assert.equal(
      evidence.period,
      capture.period,
      key + " metadata is from another period",
    );
    assert.equal(
      evidence.observationIdentity,
      capture.observationIdentity,
      key + " metadata is from another observation",
    );
    assert.equal(
      evidence.validity,
      "same-observation-boundary",
      key + " metadata validity is not established",
    );
  }
  return capture;
}

export function validateP12GReplayEvidence(capture, evidence) {
  const observed = evidence?.catalog;
  assert.equal(
    observed?.current,
    true,
    "restored Research offer snapshot is stale or unavailable",
  );
  assert.equal(
    observed.rootGeneration,
    capture.rootGeneration,
    "restored root generation differs from the capture",
  );
  assert.equal(
    observed.progressionEpoch,
    capture.progressionEpoch,
    "restored progression epoch differs from the capture",
  );
  assert.equal(
    observed.researchPermission,
    true,
    "Research permission is not enabled in the restored state",
  );
  assert.equal(
    observed.queueEvidence,
    capture.currentOfferEvidence.queueEvidence,
    "Research queue evidence differs from the capture",
  );
  const offer = observed.offers?.find(
    ({ elementId }) => elementId === capture.offer.elementId,
  );
  assert.ok(
    offer,
    "captured Research action is not currently offered after restore",
  );
  assert.deepEqual(
    offer.cost,
    capture.offer.cost,
    "Research offer price changed after restore",
  );
  if (capture.offer.offerSetIdentity !== undefined)
    assert.equal(
      offer.offerSetIdentity,
      capture.offer.offerSetIdentity,
      "Research offer set changed after restore",
    );
  assert.equal(
    observed.targetControl?.generation,
    offer.generation,
    "restored Research control generation is stale",
  );
  assert.ok(
    Number.isFinite(evidence.demand?.requestedSteel),
    "restored Smelter demand is unavailable",
  );
  assert.equal(
    evidence.demand.isSteelDemanded,
    evidence.demand.requestedSteel > 0,
    "restored Smelter demand status is inconsistent",
  );
  assert.ok(
    Number.isFinite(evidence.demand.savingTarget?.cost?.Steel) &&
      evidence.demand.requestedSteel <= evidence.demand.savingTarget.cost.Steel,
    "restored Smelter demand does not match its native saving target",
  );
  assert.equal(
    evidence.plan?.input?.initialised,
    true,
    "Smelter is not initialized after restore",
  );
  assert.equal(
    evidence.plan?.controlAvailable,
    true,
    "Smelter control is unavailable after restore",
  );
  return { offer, catalog: observed };
}
