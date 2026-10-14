import assert from "node:assert/strict";
import * as esbuild from "esbuild";

const testSurfaceMarkers = [
  "researchSpendingIntervention",
  "experiment-deferred",
  "experiment-stopped",
  "research-experiment-target-unavailable",
  "sampleResearchCatalog",
  "readCurrentResearchCatalog",
  "test-controlled-discovery",
  "gatherIntervention",
  "resourceClaimFreshness",
  "resourceClaimReservations",
  "resourceClaimLedgerObserver",
  "resourceClaimDecisionObserver",
  "resourceClaimLedgerLast",
  "resourceClaimDecisionLast",
  "resourceClaimRefreshCount",
  "resourceClaimGatherReadCount",
  "resourceClaimStatus",
  "resourceClaimUnavailableCount",
  "readLastResearchOwnerOffers",
  "resourceClaimLedgerEvents",
  "resourceClaimDecisionEvents",
  "resourceClaimActionEvents",
  "resourceClaimActionObserver",
  "resourceClaimLifecycleEvents",
  "resourceClaimSelection",
  "resourceClaimSelectionEvents",
  "goal-derived",
  "researchOwnerSelectionLast",
  "researchOwnerSelectionEvents",
  "resource-claim-before-gather",
  "research-owner-observation-unavailable",
  "selected-goal-changed",
  "current-research-grant-completed",
  "test-control-hook",
  "readNativeTechManaCallbackIdentityForTest",
  "nativeResearchObservationGeneration",
];

async function bundle(testSurfaceEnabled) {
  const result = await esbuild.build({
    absWorkingDir: process.cwd(),
    entryPoints: ["src/main.ts"],
    bundle: true,
    write: false,
    platform: "browser",
    target: ["esnext"],
    define: {
      "globalThis.__EA_TEST_SURFACE_ENABLED__": String(testSurfaceEnabled),
      __EA_TEST_SURFACE_ENABLED__: String(testSurfaceEnabled),
    },
    minifySyntax: true,
    treeShaking: true,
  });
  return result.outputFiles[0].text;
}

const productionBundle = await bundle(false);
for (const marker of testSurfaceMarkers)
  assert.equal(
    productionBundle.includes(marker),
    false,
    `production bundle contains test-only Research marker ${marker}`,
  );

const testBundle = await bundle(true);
for (const marker of testSurfaceMarkers)
  assert.equal(
    testBundle.includes(marker),
    true,
    `test bundle omitted Research intervention marker ${marker}`,
  );
