import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

import {
  createChromiumRunner,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const savePath = path.join(
  root,
  "test-artifacts/benchmark/slice0/saves/stage2f-fixed-progression-export.json",
);
const settingsPath = path.join(
  root,
  "test-artifacts/benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json",
);
const gamePath = path.join(root, "test-artifacts/game/evolve-deadspace.js");
const upstreamPath =
  process.argv.find((value) => value.startsWith("--upstream="))?.slice(11) ??
  process.env.EVOLVE_UPSTREAM_SOURCE;
const bundlePath = path.join(
  root,
  "test-artifacts/benchmark/tmp/p13l1-stage3i-positive-control.user.js",
);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const metadata = (
  await readFile(path.join(root, "src/userscript.meta.js"), "utf8")
).trimEnd();
const build = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["src/main.ts"],
  bundle: true,
  write: false,
  banner: { js: `${metadata}\n\n// P13L.1 bounded positive-control bundle.` },
  platform: "browser",
  target: ["esnext"],
  define: {
    "globalThis.__EA_TEST_SURFACE_ENABLED__": "true",
    __EA_TEST_SURFACE_ENABLED__: "true",
  },
  minifySyntax: true,
  treeShaking: true,
});
await mkdir(path.dirname(bundlePath), { recursive: true });
await writeFile(bundlePath, build.outputFiles[0].contents);

const saveText = await readFile(savePath, "utf8");
const originalSettingsText = await readFile(settingsPath, "utf8");
const settings = { ...JSON.parse(originalSettingsText), autoResearch: true };
const effectiveSettingsText = JSON.stringify(settings);
const runner = await createChromiumRunner({
  game: gamePath,
  upstream: upstreamPath,
});
try {
  const session = await runner.openSession({
    bundle: bundlePath,
    save: parseSave(saveText),
    settings,
    seed: 42,
    epoch: "2026-09-21T00:00:00.000Z",
    nativeTrace: true,
    initialTestInterventions: {
      gatherIntervention: { resourceClaimMode: "goal-derived-conjunctive" },
    },
  });
  try {
    const startup = await session.evaluate(() => {
      const hooks = window.__EA_TEST_HOOKS__;
      const trace = Object.getOwnPropertyDescriptor(
        hooks,
        "onControlInvocation",
      );
      return {
        mode: hooks.gatherIntervention?.resourceClaimMode ?? "unset",
        bootstrap: hooks.initialTestInterventionBootstrap,
        hookContainerFrozen: Object.isFrozen(hooks),
        traceCallbackPresent: typeof trace?.value === "function",
        traceCallbackWritable: trace?.writable,
        traceCallbackConfigurable: trace?.configurable,
      };
    });
    if (
      startup.mode !== "goal-derived-conjunctive" ||
      startup.bootstrap?.status !== "installed" ||
      startup.traceCallbackPresent !== true ||
      startup.traceCallbackWritable !== false
    )
      throw new Error(
        `runner did not install the configured test hooks: ${JSON.stringify(startup)}`,
      );
    const startingPeriod = await session.periods();
    let periodsAdvanced = 0;
    let firstSelection = [];
    while (periodsAdvanced < 16 && firstSelection.length === 0) {
      await session.advance(1);
      periodsAdvanced += 1;
      firstSelection = await session.evaluate(
        () => window.__EA_TEST_HOOKS__?.resourceClaimSelectionEvents ?? [],
      );
    }
    const observation = await session.evaluate(() => {
      const hooks = window.__EA_TEST_HOOKS__;
      const catalog = hooks.readCurrentResearchCatalog("tech-mad");
      return {
        interventionMode:
          hooks.gatherIntervention?.resourceClaimMode ?? "unset",
        bootstrap: hooks.initialTestInterventionBootstrap,
        selection: hooks.resourceClaimSelection,
        selectionEvents: hooks.resourceClaimSelectionEvents ?? [],
        lifecycleStatus: hooks.resourceClaimStatus,
        lifecycleEvents: hooks.resourceClaimLifecycleEvents ?? [],
        claims: hooks.gatherIntervention?.resourceClaims ?? [],
        researchOwnerEvents: hooks.researchOwnerSelectionEvents ?? [],
        catalog: catalog
          ? {
              current: catalog.current,
              selectedPrestige: catalog.selectedPrestige,
              researchPermission: catalog.researchPermission,
              queueEvidence: catalog.queueEvidence,
              targetEligibility: catalog.targetEligibility,
              rootGeneration: catalog.rootGeneration,
              progressionEpoch: catalog.progressionEpoch,
              offerSetIdentity: catalog.offers?.[0]?.offerSetIdentity,
              offerObservationId: catalog.offers?.[0]?.offerObservationId,
              offers: (catalog.offers ?? [])
                .filter((offer) =>
                  [
                    "tech-mad",
                    "tech-black_powder",
                    "tech-mad_science",
                  ].includes(offer.elementId),
                )
                .map((offer) => ({
                  actionId: offer.elementId,
                  grantTechnology: offer.grantTechnology,
                  grantLevel: offer.grantLevel,
                  generation: offer.generation,
                  cost: offer.cost,
                  nativeAffordable: offer.nativeAffordable,
                })),
            }
          : null,
      };
    });
    process.stdout.write(
      `${JSON.stringify(
        {
          protocol: "P13L.1 bounded Stage 3I D positive-control replay",
          inputs: {
            upstreamCommit: runner.inputs.upstream?.commit,
            gameSnapshot: runner.inputs.gameSnapshot,
            saveSha256: sha256(saveText),
            originalSettingsSha256: sha256(originalSettingsText),
            effectiveSettingsSha256: sha256(effectiveSettingsText),
            testBundle: {
              path: bundlePath,
              sha256: sha256(build.outputFiles[0].contents),
            },
            runner: runner.inputs.runner,
          },
          seed: 42,
          epoch: "2026-09-21T00:00:00.000Z",
          startingPeriod,
          endingPeriod: await session.periods(),
          periodsAdvanced,
          startup,
          observation,
          finalState: await session.readState(),
          diagnostics: await session.diagnostics(),
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await session.close();
  }
} finally {
  await runner.close();
}
