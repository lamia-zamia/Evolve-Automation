import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
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
const outputPath = path.join(
  root,
  "experiments/p13m-mad-mana-priority-results.json",
);
const bundlePath = path.join(
  root,
  "test-artifacts/benchmark/tmp/p13m-mad-mana-priority.user.js",
);
const seed = 42;
const epoch = "2026-09-21T00:00:00.000Z";
const firstWindow = 200;
const commonHorizon = 1_000;
const arms = [
  { id: "A", policy: "ordinary", expectedActive: [] },
  {
    id: "B",
    policy: "concurrent",
    expectedActive: ["tech-black_powder", "tech-mad_science"],
  },
  {
    id: "C",
    policy: "mad-science-first",
    expectedActive: ["tech-mad_science"],
  },
  {
    id: "D",
    policy: "black-powder-first",
    expectedActive: ["tech-black_powder"],
  },
];

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const revision = (cwd, args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));

const saveText = await readFile(savePath, "utf8");
const originalSettingsText = await readFile(settingsPath, "utf8");
const settings = { ...JSON.parse(originalSettingsText), autoResearch: true };
const effectiveSettingsText = JSON.stringify(settings);
const metadata = (
  await readFile(path.join(root, "src/userscript.meta.js"), "utf8")
).trimEnd();
const build = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["src/main.ts"],
  bundle: true,
  write: false,
  banner: { js: `${metadata}\n\n// P13M test-only Mana priority experiment.` },
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

const sourceDiff = execFileSync(
  "git",
  [
    "diff",
    "--binary",
    "HEAD",
    "--",
    "src/bootstrap/captured-runtime-control.ts",
  ],
  { cwd: root },
);
const toolDiff = execFileSync("git", ["-C", "tools", "diff", "--binary"], {
  cwd: root,
});
const runRecord = {
  protocol: "P13M controlled MAD Mana protection priority experiment",
  status: "running",
  inputs: {
    sourceRevision: revision(root, ["rev-parse", "HEAD"]),
    sourceWorkingDiffSha256: sha256(sourceDiff),
    runnerRevision: revision(root, ["-C", "tools", "rev-parse", "HEAD"]),
    runnerWorkingDiffSha256: sha256(toolDiff),
    gameSnapshot: {
      path: path.relative(root, gamePath).replaceAll("\\", "/"),
      sha256: sha256(await readFile(gamePath)),
      metadata: await readJson(`${gamePath}.json`),
    },
    upstreamPath: process.argv
      .find((value) => value.startsWith("--upstream="))
      ?.slice("--upstream=".length),
    save: {
      path: path.relative(root, savePath).replaceAll("\\", "/"),
      sha256: sha256(saveText),
    },
    settings: {
      path: path.relative(root, settingsPath).replaceAll("\\", "/"),
      originalSha256: sha256(originalSettingsText),
      effective: { ...settings },
      effectiveSha256: sha256(effectiveSettingsText),
    },
    seed,
    epoch,
    testBundle: {
      path: path.relative(root, bundlePath).replaceAll("\\", "/"),
      sha256: sha256(build.outputFiles[0].contents),
    },
    experimentRunnerSha256: sha256(
      await readFile(fileURLToPath(import.meta.url)),
    ),
  },
  preflight: null,
  arms: [],
};

await writeFile(outputPath, `${JSON.stringify(runRecord, null, 2)}\n`);
const runner = await createChromiumRunner({
  game: gamePath,
  upstream: runRecord.inputs.upstreamPath,
});

async function openArm(policy) {
  return runner.openSession({
    bundle: bundlePath,
    save: parseSave(saveText),
    settings,
    seed,
    epoch,
    nativeTrace: true,
    perf: true,
    forwardPerfSummary: true,
    initialTestInterventions: {
      gatherIntervention: {
        resourceClaimMode: "goal-derived-conjunctive",
        priorityPolicy: policy,
      },
    },
  });
}

async function armObservation(session) {
  const state = await session.readState();
  const observed = await session.evaluate(() => {
    const hooks = window.__EA_TEST_HOOKS__;
    return {
      intervention: hooks?.gatherIntervention,
      startup: hooks?.initialTestInterventionBootstrap,
      selectionEvents: hooks?.resourceClaimSelectionEvents ?? [],
      claimStatus: hooks?.resourceClaimStatus,
      lifecycleEvents: hooks?.resourceClaimLifecycleEvents ?? [],
      ledgerEvents: hooks?.resourceClaimLedgerEvents ?? [],
      claimDecisions: hooks?.resourceClaimDecisionEvents ?? [],
      gatherActionEvents: hooks?.resourceClaimActionEvents ?? [],
      priorityEvents: hooks?.p13mPriorityProtectionEvents ?? [],
      classifierWorkEvents: hooks?.p13mMandatoryClassifierWorkEvents ?? [],
      researchOwnerEvents: hooks?.researchOwnerSelectionEvents ?? [],
    };
  });
  const diagnostics = await session.diagnostics();
  const mana = state.resource?.Mana;
  const usage = diagnostics.controlUsage ?? {};
  const controlCalls = Object.values(usage).reduce(
    (total, entry) => total + entry.returned + entry.threw,
    0,
  );
  const nativeInvocations = diagnostics.nativeInvocations ?? [];
  const researchDrawCounts = {};
  for (const summary of diagnostics.perfSummaries ?? []) {
    for (const counters of summary) {
      if (
        counters === null ||
        typeof counters !== "object" ||
        Array.isArray(counters)
      )
        continue;
      for (const [name, value] of Object.entries(counters)) {
        if (
          name.startsWith("research.draw.") &&
          typeof value?.count === "number"
        )
          researchDrawCounts[name] =
            (researchDrawCounts[name] ?? 0) + value.count;
      }
    }
  }
  return {
    period: await session.periods(),
    exportSha256: sha256(await session.exportSave()),
    progress: {
      blackPowderGrant: state.tech?.explosives ?? 0,
      madScienceGrant: state.tech?.high_tech ?? 0,
      madResearchGrant: state.tech?.mad ?? 0,
      mana: {
        stock: mana?.amount,
        capacity: mana?.max,
        currentRate: mana?.rate,
      },
      madResetCount: state.stats?.mad,
      days: state.stats?.days,
    },
    observed,
    diagnostics: {
      counts: diagnostics.counts,
      workTicks: diagnostics.workTicks,
      controlCalls,
      controlUsage: usage,
      nativeInvocationCount: nativeInvocations.length,
      researchNativeInvocations: nativeInvocations.filter((entry) =>
        /research|tech/i.test(JSON.stringify(entry)),
      ).length,
      researchDrawCounts,
      perfSummaryCount: diagnostics.perfSummaries?.length ?? 0,
      errors: {
        error: diagnostics.counts?.error ?? 0,
        pageerror: diagnostics.counts?.pageerror ?? 0,
        rejection: diagnostics.counts?.rejection ?? 0,
        dialogs: diagnostics.dialogs?.length ?? 0,
      },
    },
  };
}

function compactSelection(event) {
  return {
    cycle: event.cycle,
    status: event.status,
    reason: event.reason,
    candidates: event.candidates,
    claims: event.claims,
    mandatoryActionIds: event.mandatoryActionIds,
    nativeOfferControlIdentities: event.nativeOfferControlIdentities,
    claimReasons: event.claimReasons,
    mandatoryPlan: event.mandatoryPlan
      ? {
          status: event.mandatoryPlan.status,
          work: event.mandatoryPlan.work,
        }
      : undefined,
  };
}

function compact(result) {
  const observed = result.observed;
  return {
    period: result.period,
    exportSha256: result.exportSha256,
    progress: result.progress,
    startup: observed.startup,
    interventionMode: observed.intervention?.resourceClaimMode,
    priorityPolicy: observed.intervention?.priorityPolicy,
    finalActiveProtectionActionIds: (
      observed.intervention?.resourceClaims ?? []
    ).map((claim) => claim.nativeActionId),
    claimStatus: observed.claimStatus,
    selectionEvents: observed.selectionEvents.map(compactSelection),
    lifecycleEvents: observed.lifecycleEvents.map((event) => ({
      cycle: event.cycle,
      state: event.state,
      reason: event.reason,
      nativeActionIds: event.nativeActionIds,
      activeProtectionActionIds: event.activeProtectionActionIds,
      completedActionIds: event.completedActionIds,
      releasedActionIds: event.releasedActionIds,
      blockedActionIds: event.blockedActionIds,
    })),
    ledgerEvents: observed.ledgerEvents,
    gatherActionEvents: observed.gatherActionEvents,
    priorityEvents: observed.priorityEvents,
    classifierWorkEvents: observed.classifierWorkEvents,
    researchOwnerEvents: observed.researchOwnerEvents.map((event) => {
      const offer = event.observed?.find(
        (entry) => entry.actionId === event.actionId,
      );
      return {
        cycle: event.cycle,
        period: event.period,
        actionId: event.actionId,
        grantTechnology: event.grantTechnology,
        grantLevel: event.grantLevel,
        grantBefore: event.grantBefore,
        disposition: event.disposition,
        grantAfter: event.grantAfter,
        manaBefore: event.manaBefore,
        manaAfter: event.manaAfter,
        manaSpent: event.manaSpent,
        offer: offer
          ? {
              offerGeneration: offer.offerGeneration,
              cost: offer.cost,
              affordable: offer.affordable,
              nativeAffordable: offer.nativeAffordable,
            }
          : undefined,
      };
    }),
    diagnostics: result.diagnostics,
  };
}

async function flush() {
  await writeFile(outputPath, `${JSON.stringify(runRecord, null, 2)}\n`);
}

let preflight;
try {
  const session = await openArm("concurrent");
  try {
    await session.evaluate(() => {
      const hooks = window.__EA_TEST_HOOKS__;
      hooks.captureResearchOwnerEvidenceForTest = true;
      hooks.readPeriodForTest = () => window.__EA_RUNNER__.periods();
    });
    const startup = await session.evaluate(() => ({
      mode: window.__EA_TEST_HOOKS__?.gatherIntervention?.resourceClaimMode,
      policy: window.__EA_TEST_HOOKS__?.gatherIntervention?.priorityPolicy,
      bootstrap: window.__EA_TEST_HOOKS__?.initialTestInterventionBootstrap,
    }));
    assert.equal(startup.mode, "goal-derived-conjunctive");
    assert.equal(startup.policy, "concurrent");
    let selected = [];
    let periods = 0;
    while (periods < 16 && selected.length === 0) {
      await session.advance(1);
      periods += 1;
      selected = await session.evaluate(
        () => window.__EA_TEST_HOOKS__?.resourceClaimSelectionEvents ?? [],
      );
    }
    const firstSelection = selected.find(
      (entry) => entry.status === "selected",
    );
    const result = await armObservation(session);
    const admitted = new Set(
      firstSelection?.claims?.map((claim) => claim.nativeActionId) ?? [],
    );
    const bothAdmitted =
      admitted.has("tech-black_powder") && admitted.has("tech-mad_science");
    const offers = firstSelection?.nativeOfferControlIdentities ?? [];
    const offerByAction = new Map(
      offers.map((entry) => [entry.actionId, entry]),
    );
    const blackPowderOffer = offerByAction.get("tech-black_powder");
    const madScienceOffer = offerByAction.get("tech-mad_science");
    const claimByAction = new Map(
      (firstSelection?.claims ?? []).map((entry) => [
        entry.nativeActionId,
        entry,
      ]),
    );
    const claimsValid =
      claimByAction.get("tech-black_powder")?.requiredQuantity === 100 &&
      claimByAction.get("tech-mad_science")?.requiredQuantity === 50 &&
      blackPowderOffer?.cost?.Mana === 100 &&
      madScienceOffer?.cost?.Mana === 50 &&
      blackPowderOffer?.offerGeneration ===
        blackPowderOffer?.controlGeneration &&
      madScienceOffer?.offerGeneration === madScienceOffer?.controlGeneration &&
      blackPowderOffer?.ownerEligibility === "eligible" &&
      madScienceOffer?.ownerEligibility === "eligible";
    const classifierVerified =
      firstSelection?.mandatoryPlan?.status === "verified" &&
      firstSelection?.mandatoryPlan?.work !== undefined;
    runRecord.preflight = {
      status:
        startup.bootstrap?.status === "installed" &&
        firstSelection?.status === "selected" &&
        bothAdmitted &&
        claimsValid &&
        classifierVerified
          ? "passed"
          : "failed",
      startup,
      periodsAdvanced: periods,
      selection:
        firstSelection === undefined
          ? undefined
          : compactSelection(firstSelection),
      observed: compact(result),
      bothClaimsIndependentlyAdmitted: bothAdmitted,
      claimPricesAndBindingsVerified: claimsValid,
      classifierWorkVerified: classifierVerified,
    };
    if (runRecord.preflight.status !== "passed") {
      runRecord.status = "invalid-preflight";
      await flush();
      process.exitCode = 2;
      process.stdout.write(`${JSON.stringify({ status: runRecord.status })}\n`);
    }
  } finally {
    await session.close();
  }

  if (runRecord.preflight.status === "passed") {
    const sessions = [];
    try {
      for (const arm of arms) {
        const session = await openArm(arm.policy);
        sessions.push({ arm, session });
        await session.evaluate(() => {
          const hooks = window.__EA_TEST_HOOKS__;
          hooks.captureResearchOwnerEvidenceForTest = true;
          hooks.readPeriodForTest = () => window.__EA_RUNNER__.periods();
        });
      }
      const initialHashes = [];
      for (const { session } of sessions) {
        initialHashes.push(sha256(await session.exportSave()));
        await session.advance(firstWindow);
      }
      const firstWindowResults = [];
      for (const { arm, session } of sessions) {
        const result = await armObservation(session);
        const priorityEvent = result.observed.priorityEvents[0];
        const policyActiveIds = priorityEvent?.activeProtectionActionIds ?? [];
        const interventionValid =
          result.observed.intervention?.resourceClaimMode ===
            "goal-derived-conjunctive" &&
          priorityEvent?.bothObligationsAdmitted === true &&
          JSON.stringify([...policyActiveIds].sort()) ===
            JSON.stringify([...arm.expectedActive].sort());
        firstWindowResults.push({
          id: arm.id,
          policy: arm.policy,
          valid: interventionValid,
          initialExportSha256:
            initialHashes[
              sessions.findIndex((entry) => entry.arm.id === arm.id)
            ],
          evidence: compact(result),
        });
      }
      const sameStartingState = new Set(initialHashes).size === 1;
      const protocolValid =
        sameStartingState && firstWindowResults.every((entry) => entry.valid);
      runRecord.firstWindow = {
        horizonPeriods: firstWindow,
        sameStartingState,
        protocolValid,
        arms: firstWindowResults,
      };
      await flush();
      if (!protocolValid) {
        runRecord.status = "invalid-first-window";
        await flush();
        process.exitCode = 3;
      } else {
        const finalResults = [];
        for (const { arm, session } of sessions) {
          await session.advance(commonHorizon - firstWindow);
          finalResults.push({
            arm,
            evidence: compact(await armObservation(session)),
          });
        }
        runRecord.finalWindow = {
          horizonPeriods: commonHorizon,
          arms: finalResults.map(({ arm, evidence }) => ({
            id: arm.id,
            policy: arm.policy,
            evidence,
          })),
        };
        const bothGrantPeriod = (evidence) => {
          const periods = new Map();
          for (const actionId of ["tech-black_powder", "tech-mad_science"]) {
            const grant = evidence.researchOwnerEvents.find(
              (event) =>
                event.actionId === actionId &&
                event.disposition === "researched" &&
                event.grantAfter >= 1,
            );
            if (grant === undefined) return undefined;
            periods.set(actionId, grant.period);
          }
          return Math.max(...periods.values());
        };
        const completionPeriods = finalResults.map(({ arm, evidence }) => ({
          id: arm.id,
          period: bothGrantPeriod(evidence),
        }));
        const finiteCompletionPeriods = completionPeriods
          .map((entry) => entry.period)
          .filter(Number.isFinite);
        const bestPeriod =
          finiteCompletionPeriods.length === 0
            ? undefined
            : Math.min(...finiteCompletionPeriods);
        const hasApparentWinner =
          bestPeriod !== undefined &&
          completionPeriods.some(
            (entry) => entry.period !== undefined && entry.period > bestPeriod,
          );
        const repeatIds = hasApparentWinner
          ? completionPeriods
              .filter((entry) => entry.period === bestPeriod)
              .map((entry) => entry.id)
          : [];
        const repeatArms = [];
        for (const { arm, evidence } of finalResults) {
          if (!repeatIds.includes(arm.id)) continue;
          const repeat = await openArm(arm.policy);
          try {
            await repeat.evaluate(() => {
              const hooks = window.__EA_TEST_HOOKS__;
              hooks.captureResearchOwnerEvidenceForTest = true;
              hooks.readPeriodForTest = () => window.__EA_RUNNER__.periods();
            });
            await repeat.advance(commonHorizon);
            const repeated = compact(await armObservation(repeat));
            repeatArms.push({
              id: arm.id,
              policy: arm.policy,
              exportSha256: repeated.exportSha256,
              sameArmDeterministic:
                repeated.exportSha256 === evidence.exportSha256 &&
                repeated.progress.blackPowderGrant ===
                  evidence.progress.blackPowderGrant &&
                repeated.progress.madScienceGrant ===
                  evidence.progress.madScienceGrant,
              evidence: repeated,
            });
          } finally {
            await repeat.close();
          }
        }
        runRecord.sameArmRepeats = repeatArms;
        runRecord.status = protocolValid ? "completed" : "invalid";
        await flush();
      }
    } finally {
      for (const { session } of sessions) await session.close();
    }
  }
} catch (error) {
  runRecord.status = "failed";
  runRecord.error =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  await flush();
  throw error;
} finally {
  runRecord.runner = runner.inputs;
  runRecord.browser = runner.browser;
  await flush();
  await runner.close();
}

process.stdout.write(
  `${JSON.stringify({ status: runRecord.status, output: outputPath })}\n`,
);
