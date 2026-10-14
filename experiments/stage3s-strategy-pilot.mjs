import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import {
  createChromiumRunner,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";
import { planGoalResourceIntents } from "../src/domain/economy/production/goal-resource-intent.ts";
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
    js: `${metadata}\n\n// Stage 3T isolated experiment surface.\nwindow.__EA_TEST_HOOKS__ = { ...(window.__EA_TEST_HOOKS__ ?? {}) };\nwindow.__EA_TEST_HOOKS__.selectGoalResourceCandidate = (${selectGoalResourceCandidate.toString()});`,
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
    id: "D-enabled-required-goal-candidate-execution",
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
    const scenarioStarted = performance.now();
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
      await session.evaluate(
        ({ scenarioId, scenarioSettings }) => {
          const hooks = window.__EA_TEST_HOOKS__;
          hooks.gatherIntervention = {
            resourceClaimMode: "goal-derived-conjunctive",
          };
          hooks.researchOwnerSelectionEvents = [];
          hooks.smelterObservations = [];
          hooks.strategyApplications = [];
          hooks.strategyEvidence = [];
          hooks.observeSmelterGoalDemandEvidenceForTest = (entry) => {
            hooks.strategyEvidence.push(entry);
          };
          hooks.observeSmelterPlanForTest = (input, decision, demand) => {
            hooks.smelterObservations.push({ input, decision, demand });
          };
          if (scenarioId === "D")
            hooks.prepareSmelterGoalDemandForTest = (input, demand) => {
              const result = hooks.selectGoalResourceCandidate({
                hooks,
                input,
                demand,
                settings: scenarioSettings,
                goalActionId: "tech-industrialization",
              });
              hooks.strategyApplications.push(result);
              return result.apply === true;
            };
          hooks.strategySetup = {
            scenarioId,
            candidateSelector: typeof hooks.selectGoalResourceCandidate,
            preparationHook: typeof hooks.prepareSmelterGoalDemandForTest,
            autoSmelter: scenarioSettings.autoSmelter,
          };
          return hooks.strategySetup;
        },
        { scenarioId: scenario.scenario, scenarioSettings: scenario.settings },
      );
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
              strategyApplications:
                hooks.strategyApplications?.slice(-30) ?? [],
              strategyEvidence: hooks.strategyEvidence?.slice(-30) ?? [],
              strategySetup: hooks.strategySetup,
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
          if (scenario.scenario === "D")
            liveBridge.executingCandidateEvents = capture.strategyApplications;
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
            ...(period === 1000
              ? {
                  steelContainerGrantEvidence: capture.catalog
                    ? readSteelContainerGrantEvidence(capture.catalog)
                    : { status: "unavailable" },
                  executingCandidateEvents: capture.strategyApplications,
                  strategyDemandEvidence: capture.strategyEvidence,
                  strategySetup: capture.strategySetup,
                }
              : {}),
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
            .map((entry) => ({ ...entry })),
          strategyApplications: await session.evaluate(
            () => window.__EA_TEST_HOOKS__.strategyApplications ?? [],
          ),
          workTicks: finalDiagnostics.workTicks,
          errors: finalDiagnostics.errors ?? [],
          pageErrors: finalDiagnostics.pageErrors ?? [],
          strategyDemandEvidenceCount: await session.evaluate(
            () => window.__EA_TEST_HOOKS__.strategyEvidence?.length ?? 0,
          ),
          runnerTimings: session.timings,
          elapsedWallMs: performance.now() - scenarioStarted,
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

function readSteelContainerGrantEvidence(catalog) {
  const definitions = catalog.definitions ?? [];
  const applicability = new Map(catalog.applicability ?? []);
  const levels = new Map(catalog.grantLevels ?? []);
  const actions = definitions
    .filter((definition) => definition.grantTechnology === "steel_container")
    .map((definition) => {
      const computed = (definition.computedRequirements ?? []).find(
        (observation) =>
          observation.status === "observed" &&
          observation.complete === true &&
          observation.validation === "valid" &&
          observation.rootGeneration === catalog.rootGeneration &&
          observation.progressionEpoch === catalog.progressionEpoch,
      );
      const prerequisites =
        computed?.requirements !== undefined
          ? { kind: "declared", requirements: computed.requirements }
          : definition.prerequisites;
      const selfRequirement =
        prerequisites.kind === "declared"
          ? prerequisites.requirements.find(
              ({ technologyId }) => technologyId === "steel_container",
            )
          : undefined;
      const offered = catalog.offers?.find(
        (offer) => offer.elementId === definition.actionId,
      );
      const route = applicability.get(definition.actionId)?.status ?? "unknown";
      const independent =
        offered !== undefined
          ? "yes-current-native-offer"
          : prerequisites.kind !== "declared" || route === "unknown"
            ? "unknown"
            : route === "excluded"
              ? "no-route-excluded"
              : selfRequirement !== undefined &&
                  selfRequirement.requiredLevel >= 1
                ? "no-self-prerequisite"
                : definition.eligibility.hasNativeCondition
                  ? "unknown-native-condition"
                  : "potential-independent-route";
      return {
        actionId: definition.actionId,
        grantLevel: definition.grantLevel,
        declaredPrerequisites: definition.prerequisites,
        computedRequirements: definition.computedRequirements ?? [],
        effectivePrerequisites: prerequisites,
        computedStatus: computed?.status ?? "not-observed-fresh-and-complete",
        routeApplicability: route,
        nativeCondition: definition.eligibility.hasNativeCondition
          ? offered === undefined
            ? "unknown-not-offered"
            : "passed-by-current-offer"
          : "none",
        currentlyOffered: offered !== undefined,
        currentSteelContainerLevel: levels.get("steel_container"),
        selfDependencyLevel: selfRequirement?.requiredLevel ?? null,
        couldGrantMissingLevelWithoutIt: independent,
      };
    })
    .sort((left, right) => left.grantLevel - right.grantLevel);
  const forklift = definitions.find(
    (definition) => definition.actionId === "tech-forklift",
  );
  return {
    status: catalog.current === true ? "current-catalog" : "stale-catalog",
    steelContainerLevel: levels.get("steel_container"),
    grantActions: actions,
    nonGrantMetadataAction: forklift
      ? {
          actionId: forklift.actionId,
          declaredGrant: [forklift.grantTechnology, forklift.grantLevel],
          prerequisites: forklift.prerequisites,
          computedRequirements: forklift.computedRequirements ?? [],
          routeApplicability:
            applicability.get(forklift.actionId)?.status ?? "unknown",
          sourceAuditedSideEffect:
            "pinned tech.js action body assigns steel_container = 2",
          independentFromLevelZero: "no; declared prerequisite is level 1",
        }
      : "not-in-retained-native-registry",
  };
}

function selectGoalResourceCandidate({
  hooks,
  input,
  demand,
  settings: currentSettings,
  goalActionId,
}) {
  const unavailable = (reason) => ({ apply: false, status: "unknown", reason });
  if (currentSettings.autoSmelter !== true || input.initialised !== true)
    return {
      ...unavailable("explicit Smelter permission or producer is absent"),
      status: "permission-disabled",
    };
  const catalog = hooks.readCurrentResearchCatalog?.(goalActionId);
  if (
    catalog?.current !== true ||
    catalog.source !== "shared-current-cycle" ||
    !Array.isArray(catalog.offers) ||
    !Array.isArray(catalog.definitions) ||
    !Array.isArray(catalog.grantLevels) ||
    !Array.isArray(catalog.applicability)
  )
    return unavailable("current native goal/offer evidence is incomplete");
  const goal = catalog.definitions.find(
    (definition) => definition.actionId === goalActionId,
  );
  const goalApplicability = new Map(catalog.applicability).get(goalActionId);
  if (
    goal?.prerequisites?.kind !== "declared" ||
    goalApplicability?.status !== "eligible" ||
    goal.eligibility.hasNativeCondition
  )
    return unavailable("the selected goal route is not fully established");
  const levels = new Map(catalog.grantLevels);
  const missingRequirements = goal.prerequisites.requirements.filter(
    ({ technologyId, requiredLevel }) =>
      (levels.get(technologyId) ?? 0) < requiredLevel,
  );
  const candidate = missingRequirements
    .flatMap((requirement) =>
      catalog.offers
        .filter(
          (offer) =>
            offer.grantTechnology === requirement.technologyId &&
            offer.grantLevel >= requirement.requiredLevel,
        )
        .map((offer) => ({ requirement, offer })),
    )
    .find(({ offer }) =>
      ["Iron", "Steel"].some((resourceId) =>
        Object.hasOwn(offer.cost, resourceId),
      ),
    );
  if (candidate === undefined)
    return unavailable(
      "no current offered action advances a missing goal requirement",
    );
  const resourceId = Object.hasOwn(candidate.offer.cost, "Steel")
    ? "Steel"
    : "Iron";
  const currentQuantity =
    input[resourceId === "Steel" ? "steelCount" : "ironCount"];
  const requestedQuantity = demand.requestedQuantity(resourceId);
  const price = candidate.offer.cost[resourceId];
  const shortfall = Math.max(0, price - currentQuantity);
  if (
    !Number.isFinite(currentQuantity) ||
    !Number.isFinite(requestedQuantity) ||
    !Number.isFinite(price) ||
    shortfall <= 0
  )
    return unavailable("candidate price, holding, or shortfall is unavailable");
  const freshness = {
    rootGeneration: catalog.rootGeneration,
    progressionEpoch: catalog.progressionEpoch,
    offerIdentity: `${candidate.offer.elementId}:${candidate.offer.generation}`,
    offerGeneration: candidate.offer.generation,
    price: Object.entries(candidate.offer.cost).map(([id, amount]) => ({
      resourceId: id,
      amount,
    })),
    settingsFingerprint: JSON.stringify({
      autoSmelter: currentSettings.autoSmelter,
      productionSmelting: currentSettings.productionSmelting,
    }),
    productionFingerprint: JSON.stringify(input),
  };
  if (
    catalog.current !== true ||
    catalog.rootGeneration !== freshness.rootGeneration ||
    catalog.progressionEpoch !== freshness.progressionEpoch ||
    candidate.offer.generation !== freshness.offerGeneration ||
    candidate.offer.cost[resourceId] !== price ||
    JSON.stringify(input) !== freshness.productionFingerprint ||
    JSON.stringify({
      autoSmelter: currentSettings.autoSmelter,
      productionSmelting: currentSettings.productionSmelting,
    }) !== freshness.settingsFingerprint
  )
    return unavailable(
      "candidate failed same-call root, offer, price, settings, or production revalidation",
    );
  const uncoveredDemand = Math.max(0, requestedQuantity - currentQuantity);
  if (uncoveredDemand >= shortfall)
    return {
      apply: false,
      selection: "candidate",
      mandatory: false,
      status: "already-demanded",
      reason: "exact competing demand covers the goal shortfall",
      route: `${goalActionId} -> ${candidate.requirement.technologyId}:${candidate.requirement.requiredLevel}`,
      actionId: candidate.offer.elementId,
      resourceId,
      shortfall,
      requestedQuantity,
      currentQuantity,
    };
  const alreadyDemanded =
    input[resourceId === "Steel" ? "steelDemanded" : "ironDemanded"];
  if (alreadyDemanded)
    return {
      apply: false,
      selection: "candidate",
      mandatory: false,
      status: "demand-insufficient",
      reason:
        "the native Smelter input already sees demand and cannot express a larger quantity",
      route: `${goalActionId} -> ${candidate.requirement.technologyId}:${candidate.requirement.requiredLevel}`,
      actionId: candidate.offer.elementId,
      resourceId,
      shortfall,
      requestedQuantity,
      currentQuantity,
    };
  return {
    apply: true,
    selection: "candidate",
    mandatory: false,
    status: "intent-applied",
    reason: null,
    route: `${goalActionId} -> ${candidate.requirement.technologyId}:${candidate.requirement.requiredLevel}`,
    actionId: candidate.offer.elementId,
    resourceId,
    shortfall,
    requestedQuantity,
    currentQuantity,
    freshness,
    boundedRisk:
      "one native demand bit; no reservation, allocation, stock, or technology mutation",
  };
}

function effectiveCurrentPrerequisites(definition, catalog) {
  const observation = (definition.computedRequirements ?? []).find(
    (entry) =>
      entry.status === "observed" &&
      entry.complete === true &&
      entry.validation === "valid" &&
      entry.rootGeneration === catalog.rootGeneration &&
      entry.progressionEpoch === catalog.progressionEpoch,
  );
  return observation?.requirements === undefined
    ? definition.prerequisites
    : { kind: "declared", requirements: observation.requirements };
}

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
    prerequisites: effectiveCurrentPrerequisites(definition, catalog),
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
  const baseline = scenarios.find((scenario) =>
    scenario.scenario.startsWith("B-"),
  );
  const candidate = scenarios.find((scenario) =>
    scenario.scenario.startsWith("D-"),
  );
  if (baseline === undefined || candidate === undefined)
    return { available: false, reason: "both B and D timelines are required" };
  const comparable = (scenario) => ({
    firstSteelAllocation: scenario.firstSteelAllocation,
    firstSteelIncrease: scenario.firstSteelIncrease,
    firstSteelContainers: scenario.firstSteelContainers,
    firstIndustrialization: scenario.firstIndustrialization,
    final: {
      tech: scenario.final.tech,
      resources: scenario.final.resources,
      smelter: scenario.final.smelter,
    },
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
    executingCandidateApplications: candidate.final.strategyApplications.filter(
      (event) => event.apply,
    ).length,
    candidateOutcomeDiffers:
      JSON.stringify(baselineValue) !== JSON.stringify(candidateValue),
    explanation:
      "D lets a current native goal candidate set the Smelter demand input before planSmelter; planSmelter and iSmelter remain the executor, with exact current demand and owner constraints retained.",
  };
}
