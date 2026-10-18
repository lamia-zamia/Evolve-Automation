import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createChromiumRunner,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const replayPath = path.join(
  root,
  "test-artifacts/benchmark/tmp/p12h-reviewed-replay.json",
);
const gamePath = path.join(root, "test-artifacts/game/evolve-deadspace.js");
const settingsPath = path.join(
  root,
  "test-artifacts/benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json",
);
const bundlePath = path.join(
  root,
  "test-artifacts/benchmark/tmp/p12g-test.user.js",
);
const upstream = "D:/work/Evolve-DeadSpace";
const outputPath = path.join(
  root,
  "test-artifacts/benchmark/tmp/p12h-mixed-time-diagnostic.json",
);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const replay = JSON.parse(await readFile(replayPath, "utf8"));
const capture = replay.reachableCapture;
assert.equal(capture?.contractVersion, 1, "verified P12G capture is required");
assert.equal(
  sha256(await readFile(bundlePath)),
  replay.inputs.testBundleSha256,
  "test bundle differs from verified P12G replay",
);
const actionId =
  capture.currentOfferEvidence?.offer?.actionId ??
  capture.currentOfferEvidence?.offer?.elementId ??
  capture.offer?.elementId;
const settings = {
  ...JSON.parse(await readFile(settingsPath, "utf8")),
  autoResearch: true,
  autoSmelter: true,
  productionSmelting:
    replay.counterfactuals.nativeBaseline.settings.productionSmelting,
};
assert.equal(
  sha256(JSON.stringify(settings)),
  capture.inputs.effectiveSettingsSha256,
  "diagnostic settings differ from verified P12G replay",
);
const runner = await createChromiumRunner({ game: gamePath, upstream });
const session = await runner.openSession({
  bundle: bundlePath,
  save: parseSave(capture.exportSave),
  settings,
  seed: replay.inputs.seed,
  epoch: replay.inputs.epoch,
  nativeTrace: true,
  perf: true,
});

try {
  await session.evaluate(() => {
    window.__EA_TEST_HOOKS__.readPeriodForTest = () =>
      window.__EA_RUNNER__.periods();
  });
  await session.evaluate(
    (targetActionId) =>
      window.__EA_TEST_HOOKS__.readCurrentResearchCatalog?.(
        targetActionId,
        false,
      ),
    actionId,
  );
  let before;
  for (let period = 10; period <= 70; period += 10) {
    await session.advance(10);
    before = await session.evaluate((targetActionId) => {
      const hooks = window.__EA_TEST_HOOKS__;
      const cached = hooks.readCurrentResearchCatalog?.(targetActionId, false);
      const resourceSamples = hooks.readCurrentResearchResourceSamples?.();
      return {
        period: window.__EA_RUNNER__.periods(),
        cached,
        resourceSamples,
        diagnostics: window.__EA_RUNNER__.diagnostics(),
      };
    }, actionId);
    assert.equal(before.period, period);
  }
  const beforeMetrics = await session.metrics();
  const beforeSave = await session.exportSave();
  assert.equal(before.period, 70);
  assert.equal(before.cached?.source, "shared-current-cycle");
  assert.equal(before.cached?.current, true);
  const beforeOffer = before.cached.offers.find(
    (offer) => offer.elementId === actionId,
  );
  assert.ok(beforeOffer, "cached Research offer was not available");

  const after = await session.evaluate((targetActionId) => {
    const hooks = window.__EA_TEST_HOOKS__;
    const fresh = hooks.readCurrentResearchCatalog?.(targetActionId, true);
    const resourceSamples = hooks.readCurrentResearchResourceSamples?.();
    return {
      period: window.__EA_RUNNER__.periods(),
      fresh,
      resourceSamples,
      diagnostics: window.__EA_RUNNER__.diagnostics(),
    };
  }, actionId);
  const afterSave = await session.exportSave();
  const afterMetrics = await session.metrics();
  const afterOffer = after.fresh?.offers.find(
    (offer) => offer.elementId === actionId,
  );
  const afterOffersById = new Map(
    after.fresh?.offers.map((offer) => [offer.elementId, offer]) ?? [],
  );
  const changedOfferBindings = before.cached.offers
    .filter(
      (offer) =>
        afterOffersById.get(offer.elementId)?.generation !== offer.generation,
    )
    .map((offer) => ({
      elementId: offer.elementId,
      before: offer.generation,
      after: afterOffersById.get(offer.elementId)?.generation,
    }));
  assert.equal(after.period, before.period);
  assert.equal(after.fresh?.source, "protected-fresh-draw");
  assert.ok(afterOffer, "fresh Research offer was not available");
  assert.equal(
    afterOffer.offerObservationId,
    `research-offers-${Number(beforeOffer.offerObservationId.split("-").at(-1)) + 1}`,
  );
  assert.deepEqual(
    before.cached.resourceSamples,
    after.fresh.resourceSamples,
    "Research draw changed sampled resource holdings",
  );

  const result = {
    pinnedGameCommit: replay.inputs.pinnedUpstreamCommit,
    gameSnapshotSha256: replay.inputs.gameSnapshotSha256,
    testBundleSha256: replay.inputs.testBundleSha256,
    captureExportSha256: capture.exportSaveSha256,
    startingSaveSha256: capture.inputs.startingSaveSha256,
    effectiveSettingsSha256: capture.inputs.effectiveSettingsSha256,
    seed: replay.inputs.seed,
    epoch: replay.inputs.epoch,
    replayPath: path.relative(root, replayPath).replaceAll("\\", "/"),
    actionId,
    protectedFreshDrawCount: 1,
    nativeOfferObservationCount: after.fresh.offers.length,
    reboundOfferControlCount: changedOfferBindings.length,
    changedOfferBindings,
    drawBoundaryPeriod: before.period,
    before: {
      source: before.cached.source,
      current: before.cached.current,
      rootGeneration: before.cached.rootGeneration,
      progressionEpoch: before.cached.progressionEpoch,
      offer: beforeOffer,
      targetControl: before.cached.targetControl,
      resourceSamples: before.cached.resourceSamples,
      explicitResourceSamples: before.resourceSamples,
      drawCounts: before.diagnostics.counts,
      savedStateSha256: sha256(beforeSave),
      metrics: beforeMetrics,
    },
    after: {
      source: after.fresh.source,
      current: after.fresh.current,
      rootGeneration: after.fresh.rootGeneration,
      progressionEpoch: after.fresh.progressionEpoch,
      offer: afterOffer,
      targetControl: after.fresh.targetControl,
      resourceSamples: after.fresh.resourceSamples,
      explicitResourceSamples: after.resourceSamples,
      drawCounts: after.diagnostics.counts,
      savedStateSha256: sha256(afterSave),
      metrics: afterMetrics,
    },
    saveUnchanged: sha256(beforeSave) === sha256(afterSave),
    resourceSamplesUnchanged:
      JSON.stringify(before.cached.resourceSamples) ===
      JSON.stringify(after.fresh.resourceSamples),
    controlUsageBefore: before.diagnostics.controlUsage,
    controlUsageAfter: after.diagnostics.controlUsage,
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        outputPath,
        actionId,
        drawBoundaryPeriod: result.drawBoundaryPeriod,
        cachedAffordable: beforeOffer.nativeAffordable,
        freshAffordable: afterOffer.nativeAffordable,
        cachedOfferGeneration: beforeOffer.generation,
        freshOfferGeneration: afterOffer.generation,
        cachedControlGeneration: before.cached.targetControl?.generation,
        freshControlGeneration: after.fresh.targetControl?.generation,
        savedStateUnchanged: result.saveUnchanged,
        researchDrawCountsBefore: before.diagnostics.counts,
        researchDrawCountsAfter: after.diagnostics.counts,
        rendererTaskDelta:
          afterMetrics.TaskDuration - beforeMetrics.TaskDuration,
        rendererScriptDelta:
          afterMetrics.ScriptDuration - beforeMetrics.ScriptDuration,
      },
      null,
      2,
    ),
  );
} finally {
  await session.close();
  await runner.close();
}
