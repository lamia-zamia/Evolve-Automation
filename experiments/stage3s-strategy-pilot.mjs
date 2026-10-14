import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import {
  createChromiumRunner,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";
import { planGoalResourceIntents } from "../src/domain/economy/production/goal-resource-intent.ts";
import { applyVerifiedGoalIntentToSmelter } from "./stage3s-smelter-intent.mjs";
import { planNativeResearchPrerequisites } from "../src/domain/progression/research-prerequisite-planning.ts";
import { classifyMandatoryNativeResearchObligations } from "../src/domain/progression/research-prerequisite-obligations.ts";

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
const bundlePath = path.join(
  root,
  "test-artifacts/benchmark/tmp/stage3s-test.user.js",
);
const outputPath = path.join(
  root,
  "test-artifacts/benchmark/tmp/stage3s-pilot.json",
);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const periodsArgument = process.argv.find((argument) =>
  argument.startsWith("--periods="),
);
const periods =
  periodsArgument === undefined
    ? 4000
    : Number(periodsArgument.slice("--periods=".length));
if (!Number.isSafeInteger(periods) || periods < 1000)
  throw new Error("--periods must be an integer of at least 1000");
const saveText = await readFile(savePath, "utf8");
const settings = {
  ...JSON.parse(await readFile(settingsPath, "utf8")),
  autoResearch: true,
};
const metadata = (
  await readFile(path.join(root, "src/userscript.meta.js"), "utf8")
).trimEnd();
const built = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["src/main.ts"],
  bundle: true,
  write: false,
  banner: {
    js: `${metadata}\n\n// Stage 3S isolated experiment surface.\nwindow.__EA_TEST_HOOKS__ = { ...(window.__EA_TEST_HOOKS__ ?? {}) };`,
  },
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
await writeFile(bundlePath, built.outputFiles[0].contents);

const scenarios = [
  { id: "A-original-smelter-disabled", scenario: "A", settings },
  {
    id: "B-enabled-required",
    scenario: "B",
    settings: { ...settings, autoSmelter: true },
  },
  {
    id: "C-steel-oriented",
    scenario: "C",
    settings: { ...settings, autoSmelter: true, productionSmelting: "steel" },
  },
  {
    id: "D-enabled-required-goal-intent-shadow",
    scenario: "D",
    settings: { ...settings, autoSmelter: true },
  },
];
const requestedScenarios = new Set(process.argv.slice(2));
const selectedScenarios =
  requestedScenarios.size === 0
    ? scenarios
    : scenarios.filter((scenario) => requestedScenarios.has(scenario.scenario));
const runner = await createChromiumRunner({
  game: gamePath,
  upstream: "D:/work/Evolve-DeadSpace",
});
const results = [];
let liveBridge;
try {
  for (const scenario of selectedScenarios) {
    const session = await runner.openSession({
      bundle: bundlePath,
      save: parseSave(saveText),
      settings: scenario.settings,
      seed: 42,
      epoch: "2026-09-21T00:00:00.000Z",
      perf: true,
      forwardPerfSummary: true,
      nativeTrace: true,
      manaTrace: true,
    });
    try {
      await session.evaluate(() => {
        const hooks = window.__EA_TEST_HOOKS__;
        hooks.gatherIntervention = {
          resourceClaimMode: "goal-derived-conjunctive",
        };
        hooks.researchOwnerSelectionEvents = [];
        hooks.smelterObservations = [];
        hooks.observeSmelterPlanForTest = (input, decision, demand) => {
          hooks.smelterObservations.push({ input, decision, demand });
        };
      });
      let elapsed = 0;
      let firstSteelAllocation = null;
      let firstSteelContainers = null;
      let firstIndustrialization = null;
      let previousSteel;
      let firstSteelIncrease = null;
      const samples = [];
      for (let period = 100; period <= periods; period += 100) {
        await session.advance(period - elapsed);
        elapsed = period;
        const [state, diagnostics, capture] = await Promise.all([
          session.readState(),
          session.diagnostics(),
          session.evaluate(() => {
            const hooks = window.__EA_TEST_HOOKS__;
            return {
              catalog: hooks.readCurrentResearchCatalog?.(
                "tech-industrialization",
              ),
              smelter: hooks.smelterObservations?.slice(-30) ?? [],
              selection: hooks.researchOwnerSelectionEvents ?? [],
            };
          }),
        ]);
        const steel = state.resource?.Steel;
        const smelter = state.city?.smelter;
        if (firstSteelAllocation === null && (smelter?.Steel ?? 0) > 0)
          firstSteelAllocation = period;
        if (
          firstSteelIncrease === null &&
          previousSteel !== undefined &&
          (steel?.amount ?? 0) > previousSteel
        )
          firstSteelIncrease = period;
        if (
          firstSteelContainers === null &&
          (state.tech?.steel_container ?? 0) > 0
        )
          firstSteelContainers = period;
        if (
          firstIndustrialization === null &&
          (state.tech?.high_tech ?? 0) >= 3
        )
          firstIndustrialization = period;
        previousSteel = steel?.amount;

        if (
          period === 1000 &&
          (scenario.scenario === "B" || scenario.scenario === "D")
        ) {
          liveBridge = deriveLiveIntent({
            catalog: capture.catalog,
            state,
            smelterObservations: capture.smelter,
            settings: scenario.settings,
          });
          if (scenario.scenario === "D") {
            const observation =
              capture.smelter.findLast(
                (entry) => entry.demand?.isSteelDemanded,
              ) ?? capture.smelter.at(-1);
            liveBridge.shadowApplication =
              observation === undefined
                ? {
                    status: "demand-unknown",
                    reason: "no captured Smelter decision sample",
                  }
                : applyVerifiedGoalIntentToSmelter({
                    input: observation.input,
                    intent: liveBridge.steelIntent,
                    currentFreshness: liveBridge.steelIntent?.freshness,
                    automationEnabled: scenario.settings.autoSmelter === true,
                    competingDemand:
                      observation.demand === undefined
                        ? { evidence: "incomplete", resources: [] }
                        : {
                            evidence: "complete",
                            resources: observation.demand.isSteelDemanded
                              ? ["Steel"]
                              : [],
                          },
                    supportedResources: observation.input.initialised
                      ? ["Iron", "Steel"]
                      : [],
                  });
          }
        }
        if (
          period % 1000 === 0 ||
          firstSteelAllocation === period ||
          firstSteelContainers === period ||
          firstIndustrialization === period
        ) {
          samples.push({
            period,
            holdings: Object.fromEntries(
              ["Iron", "Steel", "Coal", "Titanium", "Knowledge"].map((id) => {
                const resource = state.resource?.[id];
                return [
                  id,
                  resource && {
                    amount: resource.amount,
                    max: resource.max,
                    diff: resource.diff,
                  },
                ];
              }),
            ),
            allocation: { Iron: smelter?.Iron, Steel: smelter?.Steel },
            fuel: {
              Wood: smelter?.Wood,
              Coal: smelter?.Coal,
              Oil: smelter?.Oil,
            },
            smelterCount: smelter?.count,
            tech: {
              high_tech: state.tech?.high_tech,
              explosives: state.tech?.explosives,
              uranium: state.tech?.uranium,
              steel_container: state.tech?.steel_container,
            },
            workTicks: diagnostics.workTicks,
            errors: diagnostics.errors ?? [],
          });
        }
      }
      const finalState = await session.readState();
      const finalDiagnostics = await session.diagnostics();
      results.push({
        scenario: scenario.id,
        settings: {
          autoSmelter: scenario.settings.autoSmelter,
          productionSmelting: scenario.settings.productionSmelting,
        },
        firstSteelAllocation,
        firstSteelIncrease,
        firstSteelContainers,
        firstIndustrialization,
        final: {
          tech: {
            high_tech: finalState.tech?.high_tech,
            explosives: finalState.tech?.explosives,
            uranium: finalState.tech?.uranium,
            steel_container: finalState.tech?.steel_container,
          },
          resources: Object.fromEntries(
            ["Iron", "Steel", "Coal", "Titanium", "Knowledge"].map((id) => {
              const resource = finalState.resource?.[id];
              return [
                id,
                resource && { amount: resource.amount, max: resource.max },
              ];
            }),
          ),
          smelter: finalState.city?.smelter,
          researchInvocations: (finalDiagnostics.nativeInvocations ?? [])
            .filter((entry) => entry.elementId.startsWith("tech-"))
            .map((entry) => entry.elementId),
          workTicks: finalDiagnostics.workTicks,
          errors: finalDiagnostics.errors ?? [],
          pageErrors: finalDiagnostics.pageErrors ?? [],
          rendererTaskMs: finalDiagnostics.rendererTaskMs,
        },
        samples,
      });
    } finally {
      await session.close();
    }
  }
} finally {
  await runner.close();
}

const result = {
  inputs: {
    save: savePath,
    saveSha256: hash(saveText),
    settings: settingsPath,
    settingsSha256: hash(JSON.stringify(settings)),
    seed: 42,
    epoch: "2026-09-21T00:00:00.000Z",
    game: gamePath,
    gameSha256: hash(await readFile(gamePath)),
    testBundleSha256: hash(built.outputFiles[0].contents),
    gatherIntervention: "goal-derived-conjunctive",
    periods,
  },
  liveBridge,
  comparison: compareBaselineD(results),
  results,
};
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      outputPath,
      liveBridge,
      results: results.map(
        ({
          scenario,
          firstSteelAllocation,
          firstSteelIncrease,
          firstSteelContainers,
          firstIndustrialization,
          final,
        }) => ({
          scenario,
          firstSteelAllocation,
          firstSteelIncrease,
          firstSteelContainers,
          firstIndustrialization,
          final,
        }),
      ),
    },
    null,
    2,
  ),
);

function deriveLiveIntent({
  catalog,
  state,
  smelterObservations,
  settings: currentSettings,
}) {
  if (catalog?.current !== true || catalog.source !== "shared-current-cycle")
    return {
      evidence: "unavailable",
      reasons: ["current native Research catalog identity is unavailable"],
    };
  const offers = catalog.offers;
  const definitions = catalog.definitions;
  const applicabilityByActionId = new Map(catalog.applicability ?? []);
  const offersById = new Map(offers.map((offer) => [offer.elementId, offer]));
  const offerGenerations = new Map(
    offers.map((offer) => [offer.elementId, offer.generation]),
  );
  const nativeDefinitions = definitions?.map((definition) => ({
    actionId: definition.actionId,
    grantTechnology: definition.grantTechnology,
    grantLevel: definition.grantLevel,
    prerequisites: definition.prerequisites,
    hasNativeCondition: definition.eligibility.hasNativeCondition,
    routeRestrictions: definition.eligibility.routeRestrictions,
    restrictions: definition.eligibility.restrictions,
  }));
  const graph = planNativeResearchPrerequisites({
    targetActionId: "tech-industrialization",
    definitions: nativeDefinitions,
    grantLevels: new Map(catalog.grantLevels ?? []),
    offeredActionIds: new Set(offers.map((offer) => offer.elementId)),
    offerGenerations,
    cycle: 0,
    progressionEpoch: catalog.progressionEpoch,
    rootGeneration: catalog.rootGeneration,
    maxDepth: 16,
    maxActions: 128,
    applicabilityByActionId,
  });
  const targetRouteEligibility =
    applicabilityByActionId.get("tech-industrialization")?.status ===
    "eligible";
  const obligations = classifyMandatoryNativeResearchObligations(graph, {
    targetCurrentlyEligible: targetRouteEligibility,
    definitions: nativeDefinitions,
    grantLevels: new Map(catalog.grantLevels ?? []),
    applicabilityByActionId,
    offeredActionIds: new Set(offers.map((offer) => offer.elementId)),
  });
  const mandatoryActionIds = obligations.mandatoryActionIds;
  const mandatoryOffers = mandatoryActionIds
    .map((actionId) => offersById.get(actionId))
    .filter(Boolean);
  const relevantObservation =
    smelterObservations.findLast((entry) => entry.demand?.isSteelDemanded) ??
    smelterObservations.at(-1);
  const steelOffer = mandatoryOffers.find((offer) =>
    Object.hasOwn(offer.cost, "Steel"),
  );
  if (mandatoryOffers.length === 0 || steelOffer === undefined) {
    return {
      evidence: obligations.status,
      graphEvidence: graph.dependencyEvidence,
      targetCurrentlyEligible: targetRouteEligibility,
      targetEligibility: catalog.targetEligibility,
      rootGeneration: catalog.rootGeneration,
      progressionEpoch: catalog.progressionEpoch,
      targetDefinition: definitions.find(
        (definition) => definition.actionId === "tech-industrialization",
      ),
      offeredActionDefinition: definitions.find(
        (definition) => definition.actionId === "tech-steel_containers",
      ),
      mandatoryActionIds,
      actionableFrontier: graph.actionableFrontier,
      steelContainersOffer: offersById.get("tech-steel_containers"),
      offerSetIdentity: offersById.get("tech-steel_containers")
        ?.offerSetIdentity,
      steelContainersGrant: catalog.grantLevels?.find?.(
        ([id]) => id === "steel_container",
      )?.[1],
      holdings: Object.fromEntries(
        ["Steel", "Knowledge", "Iron", "Coal"].map((id) => {
          const resource = state.resource?.[id];
          return [
            id,
            resource && {
              amount: resource.amount,
              max: resource.max,
              diff: resource.diff,
            },
          ];
        }),
      ),
      smelterDemand: relevantObservation?.demand,
      smelterInput: relevantObservation?.input,
      explicitAutomationPermission: currentSettings.autoSmelter === true,
      nativeActionInvocationsDuringSampling: 0,
      reasons: [
        ...obligations.reasons,
        "no locally verified offered prerequisite with a Smelter-produced resource",
      ],
    };
  }
  const price = Object.entries(steelOffer.cost).map(([resourceId, amount]) => ({
    resourceId,
    amount,
  }));
  const resources = price.map(({ resourceId }) => [
    resourceId,
    state.resource?.[resourceId],
  ]);
  const observation = relevantObservation;
  const demand = observation?.demand;
  const commitments =
    demand === undefined
      ? []
      : price
          .map(({ resourceId }) => ({
            resourceId,
            amount: resourceId === "Steel" ? demand.requestedSteel : 0,
          }))
          .filter(({ amount }) => amount > 0);
  const smelterInput = observation?.input;
  const controlAvailable =
    smelterObservations.length > 0 && smelterInput?.initialised === true;
  const intentFreshness = Object.freeze({
    rootGeneration: catalog.rootGeneration,
    progressionEpoch: catalog.progressionEpoch,
    offerIdentity: `${steelOffer.elementId}:${steelOffer.generation}`,
    offerGeneration: steelOffer.generation,
    price,
    settingsFingerprint: JSON.stringify({
      autoSmelter: currentSettings.autoSmelter,
      productionSmelting: currentSettings.productionSmelting,
    }),
    productionFingerprint: JSON.stringify({
      initialised: smelterInput?.initialised,
      iron: smelterInput?.ironCount,
      steel: smelterInput?.steelCount,
      fuel: smelterInput?.fuels?.map(({ id, currentFuelCount }) => [
        id,
        currentFuelCount,
      ]),
    }),
  });
  const plan = planGoalResourceIntents({
    selectedGoal: "prestige:mad",
    frontier: {
      evidence: graph.dependencyEvidence,
      mandatoryEvidence:
        obligations.status === "verified" ? "complete" : "unavailable",
      mandatoryActionIds,
      alternatives: obligations.alternativeGroups.map((group) => ({
        groupId: group.requirementId,
        actionIds: group.actionIds,
      })),
      reasons: [
        ...graph.unavailableFacts,
        ...graph.limits,
        ...obligations.reasons,
      ],
    },
    offers: mandatoryOffers.map((offer) => ({
      actionId: offer.elementId,
      price: Object.entries(offer.cost).map(([resourceId, amount]) => ({
        resourceId,
        amount,
      })),
    })),
    holdings: resources.map(([resourceId, resource]) => ({
      resourceId,
      amount: resource?.amount ?? null,
      capacity: resource?.max ?? null,
    })),
    commitments,
    production: [
      {
        resourceId: "Steel",
        ownerId: "Smelter",
        available:
          controlAvailable &&
          smelterObservations.some(
            (entry) =>
              entry.input.initialised &&
              entry.decision.smeltAdjustments !== undefined,
          ),
        unavailableReason: controlAvailable
          ? null
          : "captured Smelter input/control unavailable",
        automationEnabled: currentSettings.autoSmelter === true,
      },
    ],
  });
  const plannedSteelIntent = plan.mandatory.find(
    (entry) =>
      entry.resourceId === "Steel" && entry.actionId === steelOffer.elementId,
  );
  const steelIntent =
    plannedSteelIntent === undefined
      ? undefined
      : Object.freeze({ ...plannedSteelIntent, freshness: intentFreshness });
  return {
    evidence: obligations.status,
    graphEvidence: graph.dependencyEvidence,
    nativeTargetAction: "tech-industrialization",
    nativeTargetEligibility: catalog.targetEligibility,
    current: catalog.current,
    rootGeneration: catalog.rootGeneration,
    progressionEpoch: catalog.progressionEpoch,
    targetDefinition: definitions.find(
      (definition) => definition.actionId === "tech-industrialization",
    ),
    mandatoryActionIds,
    mandatoryOffers,
    frontier: graph.actionableFrontier,
    nativeOffer: steelOffer,
    holdings: Object.fromEntries(
      resources.map(([id, resource]) => [
        id,
        resource && {
          amount: resource.amount,
          max: resource.max,
          diff: resource.diff,
        },
      ]),
    ),
    commitments,
    smelterDemand: demand,
    smelterInput,
    explicitAutomationPermission: currentSettings.autoSmelter === true,
    nativeActionInvocationsDuringSampling: 0,
    intentPlan: plan,
    steelIntent,
    reasons: plan.reasons,
  };
}

function compareBaselineD(scenarios) {
  const baseline = scenarios.find((scenario) => scenario.scenario === "B");
  const candidate = scenarios.find((scenario) => scenario.scenario === "D");
  if (baseline === undefined || candidate === undefined)
    return { available: false, reason: "both B and D timelines are required" };
  const comparable = (scenario) => ({
    firstSteelAllocation: scenario.firstSteelAllocation,
    firstSteelIncrease: scenario.firstSteelIncrease,
    firstSteelContainers: scenario.firstSteelContainers,
    firstIndustrialization: scenario.firstIndustrialization,
    final: scenario.final,
  });
  const baselineValue = comparable(baseline);
  const candidateValue = comparable(candidate);
  return {
    available: true,
    bAndDOutcomeIdentical:
      JSON.stringify(baselineValue) === JSON.stringify(candidateValue),
    nativeActionParity:
      JSON.stringify(baseline.final.researchInvocations) ===
      JSON.stringify(candidate.final.researchInvocations),
    sameWorkTicks: baseline.final.workTicks === candidate.final.workTicks,
    explanation:
      "D is a test-surface shadow. It did not change the native planner input because the live prerequisite proof was unavailable; the captured native Build demand already requested Steel at the same allocation decision.",
  };
}
