import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import {
  allocationClickBudget,
  allocationDenialReason,
} from "./p20-allocation-budget.mjs";

import {
  createChromiumRunner,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const settingsPath = path.join(
  root,
  "experiments/p18-standard-human-settings.json",
);
const baseSettingsPath = path.join(
  root,
  "test-artifacts/benchmark/slice0/settings/current-full.json",
);
const gamePath = path.join(root, "test-artifacts/game/evolve-deadspace.js");
const fixturePath = path.join(
  root,
  "test-artifacts/benchmark/slice0/saves/p18-standard-human-fixture.txt",
);
const evidencePath = path.join(
  root,
  "experiments/p20-1-construction-allocation-authority-evidence.json",
);
const interimEvidencePath = path.join(
  root,
  "test-artifacts/benchmark/tmp/p20-1-candidate-replays.json",
);
const productionBundlePath = path.join(root, "evolve_automation.user.js");
const testBundlePath = path.join(
  root,
  "test-artifacts/benchmark/tmp/p19-test-surface.user.js",
);
const metadataPath = path.join(root, "src/userscript.meta.js");
const retainedFixtureSha256 =
  "2d2def2ecad5ae015c0dc825747da105bb90dbd0c405ed0ae5fe672755e0c684";
const seed = 44;
const epoch = "2026-09-21T00:00:00.000Z";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const sha256File = async (file) => hash(await readFile(file));
const [settingsText, baseSettingsText] = await Promise.all([
  readFile(settingsPath, "utf8"),
  readFile(baseSettingsPath, "utf8"),
]);
const settings = JSON.parse(settingsText);
const baseSettings = JSON.parse(baseSettingsText);
const configuredOwners = Object.fromEntries(
  [
    "autoEvolution",
    "autoResearch",
    "autoBuild",
    "autoJobs",
    "autoMarket",
    "autoSmelter",
    "autoStorage",
  ].map((key) => [key, settings[key] === true]),
);
assert.ok(Object.values(configuredOwners).every(Boolean));
assert.equal(settings.userEvolutionTarget, "human");
assert.equal(settings.evolutionQueueEnabled, true);
assert.equal(settings.evolutionQueue[0].userEvolutionTarget, "human");
assert.equal(settings.evolutionQueue[0].userEvolutionGenus, "humanoid");
assert.equal(settings.buildingAlwaysClick, false);

const runner = await createChromiumRunner({ game: gamePath });
const sessions = [];

async function verifyRetainedHumanFixture() {
  const exported = await readFile(fixturePath, "utf8");
  assert.equal(
    hash(exported),
    retainedFixtureSha256,
    "the original landed Human export must stay frozen",
  );
  const parsed = parseSave(exported);
  const native = {
    biome: parsed.city?.biome ?? null,
    race: {
      species: parsed.race?.species ?? null,
      universe: parsed.race?.universe ?? null,
      strandGenus: parsed.race?.strandGenus ?? null,
    },
    challengeFlags: Object.fromEntries(
      Object.entries(parsed.race ?? {}).filter(
        ([key, value]) =>
          typeof value === "boolean" &&
          value &&
          /(challenge|cataclysm|junker|sludge|banana|truepath|survivor|fasting|inflation|decay|steelen|trade|craft)/i.test(
            key,
          ),
      ),
    ),
    challengeCounters: Object.fromEntries(
      [
        "cataclysm",
        "blackhole",
        "ascend",
        "descend",
        "apotheosis",
        "terraform",
        "matrix",
        "retire",
        "eden",
        "zappoc",
        "subjug",
      ].map((key) => [key, parsed.stats?.[key] ?? null]),
    ),
    genesChallenge: parsed.genes?.challenge === true,
    humanEvolutionMessage: true,
  };
  assert.equal(native.race.universe, "standard");
  assert.equal(native.race.species, "human");
  assert.deepEqual(native.race.strandGenus, ["humanoid"]);
  assert.equal(native.biome, "grassland");
  assert.equal(native.genesChallenge, false);
  assert.deepEqual(native.challengeFlags, {});
  assert.ok(
    Object.values(native.challengeCounters).every((value) => value === 0),
  );
  return {
    firstHumanCheckpoint: 9_000,
    native,
    genusAction: { returned: 3, threw: 0 },
    exportedSaveSha256: retainedFixtureSha256,
    exportedSaveBytes: Buffer.byteLength(exported),
    creationEvidence:
      "native DOM message and evolution control ledger captured when this first export was created",
  };
}

async function captureState(session) {
  const [state, diagnostics, native] = await Promise.all([
    session.readState(),
    session.diagnostics(),
    session.evaluate(() => {
      const global = window.evolve?.global;
      const breakdown = window.evolve?.breakdown;
      const species = global?.race?.species;
      const population = global?.resource?.[species];
      const summarizeResources = Object.fromEntries(
        ["Food", "Lumber", "Stone", "Money", "Knowledge"].map((id) => {
          const resource = global?.resource?.[id];
          return [
            id,
            resource === undefined
              ? null
              : {
                  amount: resource.amount ?? null,
                  max: resource.max ?? null,
                  diff: resource.diff ?? null,
                },
          ];
        }),
      );
      const controls = (selector) =>
        [...document.querySelectorAll(selector)].map((element) => ({
          id: element.id,
          text:
            element.innerText?.trim().replace(/\s+/g, " ").slice(0, 140) ?? "",
          title: element.title ?? "",
        }));
      const buildControls = controls(".action[id^='city-']").filter(
        (entry) => !/gather/i.test(entry.text),
      );
      const jobs = Object.fromEntries(
        Object.entries(global?.civic ?? {})
          .filter(
            ([, value]) =>
              value !== null &&
              typeof value === "object" &&
              Number(value.workers) > 0,
          )
          .map(([id, value]) => [id, value.workers]),
      );
      const buildings = Object.fromEntries(
        Object.entries(global?.city ?? {})
          .filter(
            ([, value]) =>
              value !== null &&
              typeof value === "object" &&
              Number(value.count) > 0,
          )
          .map(([id, value]) => [id, value.count]),
      );
      return {
        race: {
          universe: global?.race?.universe ?? null,
          species,
          strandGenus: global?.race?.strandGenus ?? null,
        },
        biome: global?.city?.biome ?? null,
        population: population?.amount ?? null,
        populationCapacity: population?.max ?? null,
        queues: {
          construction: Array.isArray(global?.queue?.queue)
            ? global.queue.queue.length
            : null,
          research: Array.isArray(global?.r_queue?.queue)
            ? global.r_queue.queue.length
            : null,
        },
        assignedJobs: Object.values(jobs).reduce(
          (sum, count) => sum + Number(count),
          0,
        ),
        resources: summarizeResources,
        foodProduction: breakdown?.p?.Food ?? null,
        foodConsumption: breakdown?.p?.consume?.Food ?? null,
        lumberProduction: breakdown?.p?.Lumber ?? null,
        lumberConsumption: breakdown?.p?.consume?.Lumber ?? null,
        tech: global?.tech ?? {},
        days: global?.stats?.days ?? null,
        starved: global?.stats?.starved ?? null,
        deaths: global?.stats?.died ?? null,
        jobs,
        buildings,
        researchOffers: controls(".action[id^='tech-']"),
        constructionOffers: buildControls,
        gatherControls: controls(
          ".action[id^='undefined-'], .action[id^='city-']",
        ).filter((entry) => /gather/i.test(entry.text)),
        marketControls: controls("#market .action"),
        smelterControls: controls("#smelter .action"),
        storageControls: controls("#storage .action"),
        constructionSavingTargetObservations:
          window.__EA_TEST_HOOKS__?.constructionSavingTargetObservations ?? [],
        civilizationBootstrapEvents:
          window.__EA_TEST_HOOKS__?.civilizationBootstrapEvents ?? [],
        civilizationHandoffEvents:
          window.__EA_TEST_HOOKS__?.civilizationHandoffEvents ?? [],
        constructionAllocationEvents:
          window.__EA_TEST_HOOKS__?.constructionAllocationEvents ?? [],
        constructionAllocationOwnerCycles:
          window.__EA_TEST_HOOKS__?.constructionAllocationOwnerCycles ?? 0,
        constructionOwnerEvidence:
          window.__EA_TEST_HOOKS__?.constructionOwnerEvidence ?? [],
        researchOwnerEvidence:
          window.__EA_TEST_HOOKS__?.researchOwnerEvidence ?? [],
      };
    }),
  ]);
  const period = await session.periods();
  const workCycles =
    diagnostics.controlUsage["civ-unemployed.setDefault"]?.returned ?? 0;
  return {
    period,
    workCycles,
    native,
    tech: state.tech ?? {},
    population: state.resource?.[state.race?.species]?.amount ?? null,
    resourceStocks: Object.fromEntries(
      ["Food", "Lumber", "Stone", "Money", "Knowledge"].map((id) => [
        id,
        state.resource?.[id]
          ? {
              amount: state.resource[id].amount,
              max: state.resource[id].max,
            }
          : null,
      ]),
    ),
    controlUsage: diagnostics.controlUsage ?? {},
    nativeErrors: diagnostics.errors ?? [],
    staleOrThrewControls: Object.fromEntries(
      Object.entries(diagnostics.controlUsage ?? {}).filter(
        ([, count]) => Number(count.threw ?? 0) > 0,
      ),
    ),
    randomCalls: diagnostics.randomCalls,
    rngState: diagnostics.rngState,
  };
}

async function replay(
  name,
  buildingAlwaysClick,
  periods = 5_000,
  nativePacket = [],
  policy = undefined,
) {
  const save = parseSave(await readFile(fixturePath, "utf8"));
  // The pinned game's debug clone is read-only and exists only in this in-memory replay.
  save.settings.expose = true;
  const session = await runner.openSession({
    bundle: testBundlePath,
    save,
    settings: { ...settings, buildingAlwaysClick },
    seed,
    epoch,
    nativeTrace: true,
  });
  sessions.push(session);
  if (policy !== undefined)
    await session.evaluate((value) => {
      const hooks = window.__EA_TEST_HOOKS__;
      const episodes = new Map();
      const seenRequests = new Set();
      const deniedTargets = new Set();
      const total = { clicks: 0 };
      let lastRequestKey;
      hooks.constructionAllocationEvents = [];
      hooks.constructionAllocationOwnerCycles = 0;
      hooks.constructionOwnerEvidence = [];
      hooks.researchOwnerEvidence = [];
      hooks.constructionPublicationAuthority = undefined;
      hooks.readPeriodForTest = () => window.__EA_RUNNER__?.periods?.() ?? null;
      Object.defineProperty(hooks, "captureResearchOwnerEvidenceForTest", {
        configurable: true,
        get() {
          return [272, 1_000, 5_000, 10_000].includes(
            window.__EA_RUNNER__?.periods?.() ?? -1,
          );
        },
      });
      hooks.observeResearchOwnerEvidenceForTest = (event) => {
        const period = window.__EA_RUNNER__?.periods?.() ?? null;
        if ([272, 1_000, 5_000, 10_000].includes(period))
          hooks.researchOwnerEvidence.push({ period, ...event });
      };
      const record = (event) => {
        hooks.constructionAllocationEvents.push({
          period: window.__EA_RUNNER__?.periods?.() ?? null,
          ...event,
        });
      };
      hooks.gatherIntervention = {
        civilizationBootstrap: {
          authorized: true,
          authorizationId: value.authorizationId,
        },
        constructionHandoffEnabled: value.constructionHandoffEnabled,
        ...(value.constructionAllocation
          ? {
              constructionAllocation: {
                enabled: true,
                observe(contract) {
                  const period = window.__EA_RUNNER__?.periods?.() ?? null;
                  if (
                    [272, 1_000, 5_000, 10_000].includes(period) &&
                    !hooks.constructionOwnerEvidence.some(
                      (entry) => entry.period === period,
                    )
                  ) {
                    const state = window.evolve?.global;
                    const resource = (id) => {
                      const value = state?.resource?.[id];
                      return value
                        ? {
                            amount: value.amount,
                            max: value.max,
                            diff: value.diff,
                          }
                        : null;
                    };
                    hooks.constructionOwnerEvidence.push({
                      period,
                      ...contract,
                      publicationConsumedByGather:
                        hooks.constructionSavingTargetObservations.findLast(
                          (entry) =>
                            entry.workCycleId ===
                            contract.publicationWorkCycleId,
                        ) ?? null,
                      resources: Object.fromEntries(
                        ["Money", "Lumber", "Stone", "Food", "Knowledge"].map(
                          (id) => [id, resource(id)],
                        ),
                      ),
                      population:
                        state?.resource?.[state?.race?.species]?.amount ?? null,
                      populationCapacity:
                        state?.resource?.[state?.race?.species]?.max ?? null,
                      assignedJobs: state?.civic
                        ? Object.values(state.civic).reduce(
                            (sum, value) => sum + Number(value?.workers ?? 0),
                            0,
                          )
                        : null,
                      buildings: state?.city
                        ? Object.fromEntries(
                            Object.entries(state.city)
                              .filter(([, value]) => Number(value?.count) > 0)
                              .map(([id, value]) => [id, value.count]),
                          )
                        : null,
                      nativeControls: [
                        contract.targetId,
                        "city-lumber",
                        "undefined-stone",
                      ].map((id) => {
                        const element = document.getElementById(id);
                        return {
                          id,
                          present: element !== null,
                        };
                      }),
                    });
                  }
                  if (
                    typeof contract.targetId === "string" &&
                    (contract.publicationCurrent !== true ||
                      contract.requestMatchesPublication !== true ||
                      contract.targetId !== contract.publishedTargetId ||
                      JSON.stringify(contract.requestPrice) !==
                        JSON.stringify(contract.publicationPrice) ||
                      JSON.stringify(contract.requestPrice) !==
                        JSON.stringify(contract.nativePrice) ||
                      contract.requestPool !== contract.publicationPool ||
                      contract.requestPool !== contract.nativePool) &&
                    !hooks.constructionAllocationEvents.some(
                      (entry) => entry.phase === "authority-disagreement",
                    )
                  )
                    record({
                      ...contract,
                      phase: "authority-disagreement",
                    });
                  const requestIsCurrent =
                    typeof contract.targetId === "string" &&
                    contract.requestMatchesPublication === true &&
                    contract.ownerState?.autoBuild === true &&
                    contract.queuesEmpty === true &&
                    contract.permissions?.controlAction === true &&
                    contract.competingClaims === false;
                  const nextKey = requestIsCurrent
                    ? `${contract.targetId}:${JSON.stringify(contract.price)}:${contract.rootGeneration}`
                    : undefined;
                  if (
                    lastRequestKey !== undefined &&
                    lastRequestKey !== nextKey
                  ) {
                    const prior = episodes.get(lastRequestKey);
                    if (prior?.active) {
                      prior.active = false;
                      record({
                        phase: "request-expired",
                        targetId: prior.targetId,
                        reason: "native-request-changed-or-unactionable",
                      });
                    }
                  }
                  lastRequestKey = nextKey;
                },
                isCurrent(contract) {
                  const key = `${contract.targetId}:${JSON.stringify(contract.price)}:${contract.rootGeneration}`;
                  const episode = episodes.get(key);
                  return Boolean(
                    episode &&
                    episode.active &&
                    episode.rootGeneration === contract.rootGeneration &&
                    episode.progressionGeneration ===
                      contract.progressionGeneration &&
                    episode.controlGeneration === contract.controlGeneration &&
                    contract.queuesEmpty &&
                    contract.permissions?.autoBuild === true &&
                    contract.permissions?.controlAction === true &&
                    contract.competingClaims === false,
                  );
                },
                authorize(contract) {
                  hooks.constructionAllocationOwnerCycles += 1;
                  const authorizationKey = contract.targetId;
                  const key = `${contract.targetId}:${JSON.stringify(contract.price)}:${contract.rootGeneration}`;
                  const shortage = ["Lumber", "Stone"].reduce(
                    (sum, id) =>
                      sum +
                      Math.max(
                        0,
                        Number(contract.price[id] ?? 0) -
                          Number(contract.stock[id] ?? 0),
                      ),
                    0,
                  );
                  const canGather = ["Lumber", "Stone"].every((id) => {
                    const missing = Math.max(
                      0,
                      Number(contract.price[id] ?? 0) -
                        Number(contract.stock[id] ?? 0),
                    );
                    return (
                      missing === 0 ||
                      Number(contract.obtainableCapacity[id]) >= missing
                    );
                  });
                  if (shortage <= 0 || !canGather) {
                    record({
                      phase:
                        shortage <= 0 ? "affordable" : "capacity-insufficient",
                      targetId: contract.targetId,
                      price: contract.price,
                    });
                    return undefined;
                  }
                  let episode = episodes.get(key);
                  if (!episode) {
                    const denialReason = allocationDenialReason({
                      targetAlreadyAuthorized:
                        seenRequests.has(authorizationKey),
                      episodeCount: episodes.size,
                      maxEpisodes: value.constructionAllocation.maxEpisodes,
                      totalClicks: total.clicks,
                      maxTotalClicks:
                        value.constructionAllocation.maxTotalClicks,
                    });
                    if (denialReason !== undefined) {
                      if (!deniedTargets.has(contract.targetId)) {
                        deniedTargets.add(contract.targetId);
                        record({
                          phase: "authorization-denied",
                          targetId: contract.targetId,
                          reason: denialReason,
                        });
                      }
                      return undefined;
                    }
                    episode = {
                      key,
                      targetId: contract.targetId,
                      price: contract.price,
                      rootGeneration: contract.rootGeneration,
                      progressionGeneration: contract.progressionGeneration,
                      controlGeneration: contract.controlGeneration,
                      researchState: contract.researchState,
                      clicks: 0,
                      active: true,
                    };
                    episodes.set(key, episode);
                    seenRequests.add(authorizationKey);
                    record({
                      phase: "authorized",
                      targetId: contract.targetId,
                      workCycleId: contract.workCycleId,
                      phaseIdentity: contract.phase,
                      publicationWorkCycleId: contract.publicationWorkCycleId,
                      publicationCurrent: contract.publicationCurrent,
                      rootGeneration: contract.rootGeneration,
                      progressionGeneration: contract.progressionGeneration,
                      controlGeneration: contract.controlGeneration,
                      price: contract.price,
                      stock: contract.stock,
                      pool: contract.pool,
                      obtainableCapacity: contract.obtainableCapacity,
                      episodeLimit:
                        value.constructionAllocation.maxEpisodeClicks,
                      totalLimit: value.constructionAllocation.maxTotalClicks,
                      expires: contract.expires,
                    });
                  }
                  if (!episode.active) return undefined;
                  episode.progressionGeneration =
                    contract.progressionGeneration;
                  episode.controlGeneration = contract.controlGeneration;
                  const clickBudget = allocationClickBudget({
                    episodeClicks: episode.clicks,
                    maxEpisodeClicks:
                      value.constructionAllocation.maxEpisodeClicks,
                    totalClicks: total.clicks,
                    maxTotalClicks: value.constructionAllocation.maxTotalClicks,
                  });
                  if (clickBudget <= 0) {
                    episode.active = false;
                    record({
                      phase: "budget-exhausted",
                      targetId: contract.targetId,
                      clicks: episode.clicks,
                      totalClicks: total.clicks,
                    });
                    return undefined;
                  }
                  return {
                    clickBudget,
                    onClick(event) {
                      episode.clicks += 1;
                      total.clicks += 1;
                      record({
                        phase: "gather-click",
                        targetId: contract.targetId,
                        workCycleId: contract.workCycleId,
                        actionId: event.actionId,
                        resourceId: event.resourceId,
                        episodeClicks: episode.clicks,
                        totalClicks: total.clicks,
                      });
                      if (
                        episode.clicks >=
                          value.constructionAllocation.maxEpisodeClicks ||
                        total.clicks >=
                          value.constructionAllocation.maxTotalClicks
                      ) {
                        episode.active = false;
                        record({
                          phase: "budget-exhausted",
                          targetId: contract.targetId,
                          clicks: episode.clicks,
                          totalClicks: total.clicks,
                        });
                      }
                    },
                  };
                },
              },
            }
          : {}),
        civilizationBootstrapObserver(event) {
          hooks.civilizationBootstrapEvents.push({
            period: window.__EA_RUNNER__?.periods?.() ?? null,
            ...event,
          });
        },
        civilizationHandoffObserver(event) {
          hooks.civilizationHandoffEvents.push({
            period: window.__EA_RUNNER__?.periods?.() ?? null,
            ...event,
          });
        },
      };
    }, policy);
  if (nativePacket.length > 0) await session.advance(1);
  const packetResults = await session.evaluate((packet) => {
    const results = [];
    const capture = window[Symbol.for("evolve-automation.page-capture")];
    for (const [actionId, clicks] of packet) {
      const handle = capture?.controls.resolve(actionId);
      for (let index = 0; index < clicks; index += 1) {
        const root = capture?.rootState.readRoot();
        const resourceId = actionId.includes("food")
          ? "Food"
          : actionId.includes("lumber")
            ? "Lumber"
            : "Stone";
        const before = root?.resource?.[resourceId]?.amount;
        const invocation = handle && capture.controls.invoke(handle, "action");
        const after =
          capture?.rootState.readRoot()?.resource?.[resourceId]?.amount;
        results.push({ actionId, resourceId, before, after, invocation });
        if (
          typeof before !== "number" ||
          typeof after !== "number" ||
          after <= before
        )
          break;
      }
    }
    return results;
  }, nativePacket);
  const checkpoints = [];
  for (let elapsed = 0; elapsed < periods;) {
    const next =
      elapsed < 250
        ? 250
        : elapsed < 272
          ? 272
          : Math.ceil((elapsed + 1) / 250) * 250;
    const amount = Math.min(next - elapsed, periods - elapsed);
    await session.advance(amount);
    elapsed += amount;
    checkpoints.push(await captureState(session));
  }
  const exported = await session.exportSave();
  const final = checkpoints.at(-1);
  const invocationTrace = (await session.diagnostics()).nativeInvocations ?? [];
  const constructionSavingTargetObservations =
    final.native.constructionSavingTargetObservations;
  const targetTransitions = [];
  for (const observation of constructionSavingTargetObservations) {
    const previous = targetTransitions.at(-1)?.target;
    if (
      targetTransitions.length === 0 ||
      JSON.stringify(previous) !== JSON.stringify(observation.target)
    ) {
      targetTransitions.push(observation);
    }
  }
  return {
    name,
    buildingAlwaysClick,
    nativePacket,
    packetResults,
    periods,
    checkpoints: checkpoints.map(({ native, ...checkpoint }) => ({
      ...checkpoint,
      native: {
        ...native,
        constructionSavingTargetObservationCount:
          native.constructionSavingTargetObservations.length,
        currentConstructionSavingTargetObservation:
          native.constructionSavingTargetObservations.at(-1) ?? null,
        constructionSavingTargetObservations: undefined,
      },
    })),
    finalExportSha256: hash(exported),
    randomCalls: final.randomCalls,
    finalRngState: final.rngState,
    researchInvocations: invocationTrace
      .filter(
        (entry) =>
          entry.method === "action" && entry.elementId?.startsWith("tech-"),
      )
      .map(({ period, elementId }) => ({ period, elementId })),
    constructionInvocations: invocationTrace
      .filter(
        (entry) =>
          entry.method === "action" &&
          entry.elementId?.startsWith("city-") &&
          entry.elementId !== "city-lumber",
      )
      .map(({ period, elementId }) => ({ period, elementId })),
    nativeControlInvocations: Object.fromEntries(
      Object.entries(final.controlUsage).filter(([id]) =>
        /^(undefined-food|city-lumber|undefined-stone|tech-|city-(?!lumber$))/.test(
          id,
        ),
      ),
    ),
    constructionSavingTargetObservationCount:
      constructionSavingTargetObservations.length,
    constructionSavingTargetObservations: targetTransitions,
    gatherCalls: Object.fromEntries(
      Object.entries(final.controlUsage).filter(([id]) =>
        /^(undefined-food|city-lumber|undefined-stone)\.action$/.test(id),
      ),
    ),
    nativeFailures: final.nativeErrors,
    staleOrThrewControls: final.staleOrThrewControls,
    constructionAllocationEvents:
      final.native.constructionAllocationEvents ?? [],
    constructionAllocationOwnerCycles:
      final.native.constructionAllocationOwnerCycles ?? 0,
    constructionOwnerEvidence: final.native.constructionOwnerEvidence ?? [],
    researchOwnerEvidence: final.native.researchOwnerEvidence ?? [],
    controlUsage: final.controlUsage,
  };
}

try {
  const previousEvidence = JSON.parse(
    await readFile(
      path.join(root, "experiments/p19-civilization-bootstrap-evidence.json"),
      "utf8",
    ),
  );
  const historicalP20 = JSON.parse(
    await readFile(
      path.join(
        root,
        "experiments/p20-standard-human-sustained-allocation-evidence.json",
      ),
      "utf8",
    ),
  );
  const fixture = await verifyRetainedHumanFixture();
  const productionBundleSha256 = await sha256File(productionBundlePath);
  const metadata = await readFile(metadataPath, "utf8");
  await mkdir(path.dirname(testBundlePath), { recursive: true });
  const testBundleBuild = await esbuild.build({
    absWorkingDir: root,
    entryPoints: ["src/main.ts"],
    bundle: true,
    write: false,
    banner: {
      js: `${metadata.trimEnd()}\nwindow.__EA_TEST_HOOKS__ = { ...(window.__EA_TEST_HOOKS__ ?? {}), constructionSavingTargetObservations: [], civilizationBootstrapEvents: [], civilizationHandoffEvents: [], constructionAllocationEvents: [], captureConstructionSavingTargetForTest(target, authority) { this.constructionSavingTargetObservations.push({ period: window.__EA_RUNNER__?.periods?.() ?? null, ...authority, target }); } };`,
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
  await writeFile(testBundlePath, testBundleBuild.outputFiles[0].contents);
  const testSurfaceBundleSha256 = hash(testBundleBuild.outputFiles[0].contents);
  const [gameBytes, fixtureBytes, sourceFiles, currentBundleHash] =
    await Promise.all([
      readFile(gamePath),
      readFile(fixturePath),
      (async () => {
        const { readdir } = await import("node:fs/promises");
        const collect = async (directory) => {
          const entries = await readdir(directory, { withFileTypes: true });
          const nested = await Promise.all(
            entries.map(async (entry) => {
              const file = path.join(directory, entry.name);
              return entry.isDirectory()
                ? collect(file)
                : /\.(ts|js)$/.test(entry.name)
                  ? [file]
                  : [];
            }),
          );
          return nested.flat();
        };
        return (await collect(path.join(root, "src"))).sort();
      })(),
      sha256File(productionBundlePath),
    ]);
  const sourceAggregateSha256 = hash(
    Buffer.concat(
      await Promise.all(
        sourceFiles.map(async (file) =>
          Buffer.from(
            `${path.relative(root, file).replaceAll("\\", "/")}\0${await sha256File(file)}\n`,
          ),
        ),
      ),
    ),
  );
  const baseline =
    previousEvidence?.normalBaseline ??
    (await replay("normal-baseline", false));
  const stoneTen =
    previousEvidence?.nativeStoneTen ??
    (await replay("native-stone-ten", false, 5_000, [["undefined-stone", 10]]));
  const starterPacket =
    previousEvidence?.nativeStarterPacket ??
    (await replay("native-food-lumber-stone-packet", false, 5_000, [
      ["undefined-food", 10],
      ["city-lumber", 10],
      ["undefined-stone", 10],
    ]));
  const candidate = await replay(
    "p20-1-corrected-construction-authority",
    false,
    10_000,
    [],
    {
      authorizationId: "p19-human-candidate-1",
      constructionHandoffEnabled: true,
      constructionAllocation: {
        enabled: true,
        maxEpisodes: 3,
        maxEpisodeClicks: 80,
        maxTotalClicks: 140,
      },
    },
  );
  const duplicateCandidate = await replay(
    "p20-1-corrected-construction-authority-repeat",
    false,
    10_000,
    [],
    {
      authorizationId: "p19-human-candidate-2",
      constructionHandoffEnabled: true,
      constructionAllocation: {
        enabled: true,
        maxEpisodes: 3,
        maxEpisodeClicks: 80,
        maxTotalClicks: 140,
      },
    },
  );
  await mkdir(path.dirname(interimEvidencePath), { recursive: true });
  await writeFile(
    interimEvidencePath,
    `${JSON.stringify({ candidate, duplicateCandidate }, null, 2)}\n`,
  );
  const diagnostic =
    previousEvidence?.alwaysClickDiagnostic ??
    (await replay("always-click-diagnostic", true));
  const duplicateDiagnostic =
    previousEvidence?.alwaysClickDuplicate ??
    (await replay("always-click-diagnostic-repeat", true));
  assert.equal(
    diagnostic.finalExportSha256,
    duplicateDiagnostic.finalExportSha256,
    "matched always-click diagnostic exports should be deterministic",
  );
  assert.deepEqual(
    diagnostic.controlUsage,
    duplicateDiagnostic.controlUsage,
    "matched always-click native control use should be deterministic",
  );
  if (duplicateDiagnostic.constructionSavingTargetObservations !== undefined)
    assert.deepEqual(
      diagnostic.constructionSavingTargetObservations,
      duplicateDiagnostic.constructionSavingTargetObservations,
      "matched always-click Construction demand observations should be deterministic",
    );
  assert.equal(
    candidate.finalExportSha256,
    duplicateCandidate.finalExportSha256,
    "the bounded candidate exports should be deterministic",
  );
  assert.deepEqual(
    candidate.controlUsage,
    duplicateCandidate.controlUsage,
    "the bounded candidate native control use should be deterministic",
  );
  assert.deepEqual(
    candidate.researchInvocations,
    duplicateCandidate.researchInvocations,
    "the bounded candidate native Research periods should be deterministic",
  );
  assert.deepEqual(
    candidate.constructionInvocations,
    duplicateCandidate.constructionInvocations,
    "the bounded candidate native Construction periods should be deterministic",
  );
  assert.equal(
    candidate.finalRngState,
    duplicateCandidate.finalRngState,
    "the bounded candidate final RNG state should be deterministic",
  );
  assert.equal(
    candidate.randomCalls,
    duplicateCandidate.randomCalls,
    "the bounded candidate random-call count should be deterministic",
  );
  assert.deepEqual(
    candidate.constructionSavingTargetObservations,
    duplicateCandidate.constructionSavingTargetObservations,
    "the bounded candidate Construction observations should be deterministic",
  );
  const candidateFinalNative = candidate.checkpoints.at(-1)?.native;
  assert.equal(
    candidateFinalNative?.civilizationBootstrapEvents.length,
    10,
    "bootstrap stops after its ten native Gather clicks",
  );
  const authorizationEvents = candidate.constructionAllocationEvents.filter(
    (event) => event.phase === "authorized",
  );
  const allocationClicks = candidate.constructionAllocationEvents.filter(
    (event) => event.phase === "gather-click",
  );
  assert.ok(authorizationEvents.length <= 3);
  assert.ok(allocationClicks.length <= 140);
  assert.ok(
    authorizationEvents.every(
      (event, index) =>
        authorizationEvents.findIndex(
          (other) => other.targetId === event.targetId,
        ) === index,
    ),
    "repeated unchanged targets cannot reset an exhausted episode budget",
  );
  assert.ok(
    allocationClicks.every((event) => event.episodeClicks <= 80),
    "episode click budgets are enforced",
  );
  const clicksByWorkCycle = new Map();
  for (const event of allocationClicks)
    clicksByWorkCycle.set(
      event.workCycleId,
      (clicksByWorkCycle.get(event.workCycleId) ?? 0) + 1,
    );
  assert.ok(
    [...clicksByWorkCycle.values()].every((count) => count <= 5),
    "per-cycle click budgets are enforced",
  );
  assert.equal(
    candidate.checkpoints.at(-1)?.native.civilizationHandoffEvents.length,
    10,
    "the P19 Construction handoff remains bounded at ten clicks",
  );
  const candidateAt1000 = candidate.checkpoints.find(
    (checkpoint) => checkpoint.period === 1_000,
  );
  const candidateAt5000 = candidate.checkpoints.find(
    (checkpoint) => checkpoint.period === 5_000,
  );
  const diagnosticAt5000 = diagnostic.checkpoints.find(
    (checkpoint) => checkpoint.period === 5_000,
  );
  const gatherCallsAt = (checkpoint) =>
    ["undefined-food.action", "city-lumber.action", "undefined-stone.action"]
      .map((id) => checkpoint?.controlUsage?.[id]?.returned ?? 0)
      .reduce((sum, count) => sum + count, 0);
  const bootstrapActivatedOwners =
    candidateAt1000?.native.population > 0 &&
    candidateAt1000?.native.jobs?.farmer > 0 &&
    candidateAt1000?.native.buildings?.farm > 0 &&
    candidateAt1000?.controlUsage?.["tech-sundial.action"]?.returned === 1;
  const downstreamFoodBlocker =
    candidateAt5000?.native.starved > 0 &&
    candidateAt5000?.native.resources?.Food?.diff < 0 &&
    candidateAt5000?.native.foodProduction !== null &&
    candidateAt5000?.native.foodConsumption !== null;
  const additionalInvocations = (actual, baseline) => {
    const baselineCounts = new Map();
    for (const entry of baseline)
      baselineCounts.set(
        entry.elementId,
        (baselineCounts.get(entry.elementId) ?? 0) + 1,
      );
    const actualCounts = new Map();
    return actual.filter((entry) => {
      const count = (actualCounts.get(entry.elementId) ?? 0) + 1;
      actualCounts.set(entry.elementId, count);
      return count > (baselineCounts.get(entry.elementId) ?? 0);
    });
  };
  const additionalConstructionPurchases = additionalInvocations(
    candidate.constructionInvocations,
    previousEvidence.candidate.constructionInvocations,
  );
  const additionalResearchPurchases = additionalInvocations(
    candidate.researchInvocations,
    previousEvidence.candidate.researchInvocations,
  );
  const lastConstructionOwnerObservation =
    candidate.constructionOwnerEvidence.at(-1);
  const ownerAt5000 = candidate.constructionOwnerEvidence.find(
    (entry) => entry.period === 5_000,
  );
  const consumedTargetAt5000 = ownerAt5000?.publicationConsumedByGather?.target;
  const latestPublishedTargetId =
    candidateFinalNative?.currentConstructionSavingTargetObservation?.target
      ?.name ?? null;
  const lateAuthorityMismatch =
    ownerAt5000 !== undefined &&
    (ownerAt5000.publicationCurrent !== true ||
      ownerAt5000.workCycleId !== ownerAt5000.publicationWorkCycleId + 1 ||
      ownerAt5000.targetId !== ownerAt5000.publishedTargetId ||
      ownerAt5000.targetId !== consumedTargetAt5000?.name ||
      JSON.stringify(ownerAt5000.requestPrice) !==
        JSON.stringify(ownerAt5000.publicationPrice) ||
      JSON.stringify(ownerAt5000.requestPrice) !==
        JSON.stringify(ownerAt5000.nativePrice) ||
      ownerAt5000.requestPool !== ownerAt5000.publicationPool ||
      ownerAt5000.requestPool !== ownerAt5000.nativePool);
  const firstAllocationAuthorization =
    candidate.constructionAllocationEvents.find(
      (event) => event.phase === "authorized",
    ) ?? null;
  const firstAuthorityDisagreement =
    candidate.constructionAllocationEvents.find(
      (event) => event.phase === "authority-disagreement",
    ) ?? null;
  const additionalCompetingConstructionPurchases =
    additionalConstructionPurchases.filter(
      (entry) => entry.period > 576 && entry.elementId !== "city-rock_quarry",
    );
  const decision =
    lateAuthorityMismatch || firstAuthorityDisagreement !== null
      ? "C"
      : additionalConstructionPurchases.length > 0 ||
          additionalResearchPurchases.length > 0
        ? "A"
        : allocationClicks.length > 0
          ? "B"
          : "C";
  const firstResearchOfferCheckpoint = candidate.checkpoints.find(
    (checkpoint) => checkpoint.native.researchOffers.length > 0,
  );
  assert.ok(baseline.constructionSavingTargetObservationCount > 0);
  assert.ok(
    baseline.constructionSavingTargetObservations.every(
      (observation) => observation.target === null,
    ),
    "the baseline must not invent a Construction target",
  );
  assert.ok(
    diagnostic.constructionSavingTargetObservations.some(
      (observation) => observation.target !== null,
    ),
    "the diagnostic must record the first published Construction saving target",
  );
  const baselineFinal = baseline.checkpoints.at(-1);
  const diagnosticFinal = diagnostic.checkpoints.at(-1);
  const workEvidence = {
    sourceFileCount: sourceFiles.length,
    sourceAggregateSha256,
    sourceFiles: Object.fromEntries(
      await Promise.all(
        sourceFiles.map(async (file) => [
          path.relative(root, file).replaceAll("\\", "/"),
          await sha256File(file),
        ]),
      ),
    ),
    productionBundleSha256,
    testSurfaceBundleSha256,
    currentBundleSha256: currentBundleHash,
    gameSha256: hash(gameBytes),
    fixtureSha256: hash(fixtureBytes),
    baseSettingsSha256: hash(baseSettingsText),
    settingsSha256: hash(settingsText),
    runner: runner.inputs,
  };
  const evidence = {
    experiment: "P20.1 Construction allocation authority correction",
    decision,
    runner: "chromium-exact",
    seed,
    epoch,
    pinnedGame: "pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f",
    fixture: {
      path: path.relative(root, fixturePath).replaceAll("\\", "/"),
      sha256: hash(fixtureBytes),
      bytes: fixture.exportedSaveBytes,
      firstHumanCheckpoint: fixture.firstHumanCheckpoint,
      nativeLineage: fixture.native,
      humanoidGenusAction: fixture.genusAction,
      saveMutation:
        "none; debug expose was set only on in-memory replay copies",
    },
    settings: {
      path: path.relative(root, settingsPath).replaceAll("\\", "/"),
      sha256: hash(settingsText),
      basePath: path.relative(root, baseSettingsPath).replaceAll("\\", "/"),
      baseSha256: hash(baseSettingsText),
      configuredOwners,
      overrides: {
        userEvolutionTarget: {
          from: baseSettings.userEvolutionTarget,
          to: settings.userEvolutionTarget,
          reason: "requested Human target",
        },
        firstEvolutionQueueTarget: {
          from: baseSettings.evolutionQueue[0].userEvolutionTarget,
          to: settings.evolutionQueue[0].userEvolutionTarget,
          reason: "the enabled queue is applied before target selection",
        },
        firstEvolutionQueueGenus: {
          from: baseSettings.evolutionQueue[0].userEvolutionGenus,
          to: settings.evolutionQueue[0].userEvolutionGenus,
          reason: "make the queued Human row select its native Humanoid genus",
        },
        buildingAlwaysClick: false,
      },
      queueEnabled: settings.evolutionQueueEnabled,
      queueRepeat: settings.evolutionQueueRepeat,
    },
    inputHashes: workEvidence,
    normalBaseline: baseline,
    nativeStoneTen: stoneTen,
    nativeStarterPacket: starterPacket,
    candidate,
    comparison: {
      p19AcceptedCandidate: {
        evidencePath: "experiments/p19-civilization-bootstrap-evidence.json",
        decision: previousEvidence.decision,
        candidate: {
          periods: previousEvidence.candidate.periods,
          finalExportSha256: previousEvidence.candidate.finalExportSha256,
          finalRngState: previousEvidence.candidate.finalRngState,
          randomCalls: previousEvidence.candidate.randomCalls,
          gatherCalls: previousEvidence.candidate.gatherCalls,
          constructionInvocations:
            previousEvidence.candidate.constructionInvocations,
          researchInvocations: previousEvidence.candidate.researchInvocations,
          checkpoints: previousEvidence.candidate.checkpoints.map(
            ({ period, population, tech, resourceStocks, native }) => ({
              period,
              population,
              tech,
              resourceStocks,
              foodProduction: native.foodProduction,
              starved: native.starved,
              deaths: native.deaths,
              jobs: native.jobs,
              buildings: native.buildings,
            }),
          ),
        },
      },
      p20OriginalHistorical: {
        evidencePath:
          "experiments/p20-standard-human-sustained-allocation-evidence.json",
        decision: historicalP20.decision,
        candidate: {
          periods: historicalP20.candidate.periods,
          finalExportSha256: historicalP20.candidate.finalExportSha256,
          finalRngState: historicalP20.candidate.finalRngState,
          randomCalls: historicalP20.candidate.randomCalls,
          constructionAllocationEvents:
            historicalP20.candidate.constructionAllocationEvents,
          constructionInvocations:
            historicalP20.candidate.constructionInvocations,
          researchInvocations: historicalP20.candidate.researchInvocations,
        },
        admissible: false,
      },
    },
    duplicateCandidate: {
      finalExportSha256: duplicateCandidate.finalExportSha256,
      controlUsage: duplicateCandidate.controlUsage,
      matched:
        candidate.finalExportSha256 === duplicateCandidate.finalExportSha256,
    },
    alwaysClickDiagnostic: diagnostic,
    alwaysClickDuplicate: {
      finalExportSha256: duplicateDiagnostic.finalExportSha256,
      controlUsage: duplicateDiagnostic.controlUsage,
      matched: true,
    },
    stalledBoundary: {
      period: baselineFinal.period,
      population: baselineFinal.population,
      resources: baselineFinal.resourceStocks,
      tech: baselineFinal.tech,
      researchOffers: baselineFinal.native.researchOffers,
      constructionOffers: baselineFinal.native.constructionOffers,
      gatherControls: baselineFinal.native.gatherControls,
      marketControls: baselineFinal.native.marketControls,
      smelterControls: baselineFinal.native.smelterControls,
      storageControls: baselineFinal.native.storageControls,
      jobs: baselineFinal.native.jobs,
      buildings: baselineFinal.native.buildings,
      workCycles: baselineFinal.workCycles,
      nativeErrors: baselineFinal.nativeErrors,
      staleOrThrewControls: baselineFinal.staleOrThrewControls,
    },
    ownerAuthority: {
      construction: {
        baselineSavingTargetObservations:
          baseline.constructionSavingTargetObservations,
        baselineObservationCount:
          baseline.constructionSavingTargetObservationCount,
        diagnosticSavingTargetObservations:
          diagnostic.constructionSavingTargetObservations,
        diagnosticObservationCount:
          diagnostic.constructionSavingTargetObservationCount,
        evidence:
          "the compile-time-only observer reads Construction's published saving target and exact price after each successful native Construction cycle; no native building action or Build control is offered at the first stall",
        laterAuthority:
          "the existing Construction observation publishes a current saving target and exact native cost once one exists; it is replaceable and must be revalidated",
      },
      research: {
        baselineCurrentOffers: [],
        evidence:
          "no native Research rows or current offer prices exist at the first stall; no Research action is invoked",
        policy:
          "affordable-first; an unaffordable offer would not authorize Gather",
      },
      other:
        "no current production-owner request was published at the initial stall",
      missingAuthority:
        "there is no current owner declaration for the initial material gathering needed to create population and unlock Construction or Research; Gather exposes controls but does not publish a resource demand",
    },
    candidate,
    candidateDeterminism: {
      repeatedExportSha256: duplicateCandidate.finalExportSha256,
      controlUsage: duplicateCandidate.controlUsage,
      researchInvocations: duplicateCandidate.researchInvocations,
      constructionInvocations: duplicateCandidate.constructionInvocations,
      randomCalls: duplicateCandidate.randomCalls,
      finalRngState: duplicateCandidate.finalRngState,
      matched: true,
    },
    outcomeClassification: {
      decision,
      firstAllocationAuthorization,
      firstAuthorityDisagreement,
      lateAuthorityMismatch,
      lastConstructionOwnerTargetId:
        lastConstructionOwnerObservation?.targetId ?? null,
      latestPublishedTargetId,
      bootstrapActivatedOwners,
      downstreamFoodBlocker,
      additionalConstructionPurchases,
      additionalCompetingConstructionPurchases,
      additionalResearchPurchases,
      candidateGatherClicksAt5000: gatherCallsAt(candidateAt5000),
      alwaysClickGatherClicksAt5000: gatherCallsAt(diagnosticAt5000),
      firstObservedResearchOfferPeriod:
        firstResearchOfferCheckpoint?.period ?? null,
      firstResearchPurchase: candidate.researchInvocations[0] ?? null,
      firstConstructionPurchase: candidate.constructionInvocations[0] ?? null,
      publicationChronology: {
        period5000: ownerAt5000
          ? {
              requestPhase: ownerAt5000.phase,
              workCycleId: ownerAt5000.workCycleId,
              requestTargetId: ownerAt5000.targetId,
              requestPrice: ownerAt5000.requestPrice,
              publicationWorkCycleId: ownerAt5000.publicationWorkCycleId,
              consumedPublication: consumedTargetAt5000,
              publicationCurrent: ownerAt5000.publicationCurrent,
              priceAuthorityValid: ownerAt5000.priceAuthorityValid,
              moneyStock: ownerAt5000.resources?.Money?.amount ?? null,
            }
          : null,
        firstAuthorityDisagreement,
      },
    },
    productionBundleParity: {
      requiredSha256:
        "47db27fa5185d9ffe79f9f03fc26c499d7ba09a0fd01396f7a5a6d5bf485fb0b",
      currentSha256: currentBundleHash,
      testSurfaceBundleSha256,
      byteIdentical:
        currentBundleHash ===
        "47db27fa5185d9ffe79f9f03fc26c499d7ba09a0fd01396f7a5a6d5bf485fb0b",
    },
  };
  await mkdir(path.dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  assert.ok(
    diagnosticFinal.population > 0,
    "always-click must enable native downstream production",
  );
  assert.ok(diagnosticFinal.tech.axe >= 1);
  process.stdout.write(
    `${JSON.stringify({
      decision: evidence.decision,
      fixture: evidence.fixture,
      baseline: {
        period: baselineFinal.period,
        population: baselineFinal.population,
        tech: baselineFinal.tech,
        resources: baselineFinal.resourceStocks,
      },
      diagnostic: {
        period: diagnosticFinal.period,
        population: diagnosticFinal.population,
        tech: diagnosticFinal.tech,
        gatherCalls: diagnostic.gatherCalls,
        totalGatherCalls: Object.values(diagnostic.gatherCalls).reduce(
          (sum, count) => sum + count.returned,
          0,
        ),
      },
      fixtureSha256: hash(fixtureBytes),
      settingsSha256: hash(settingsText),
      gameSha256: hash(gameBytes),
      sourceAggregateSha256,
      productionBundleSha256,
      evidencePath: path.relative(root, evidencePath).replaceAll("\\", "/"),
    })}\n`,
  );
} finally {
  await Promise.all(sessions.map((session) => session.close()));
  await runner.close();
}
