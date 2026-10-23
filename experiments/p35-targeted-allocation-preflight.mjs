import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidencePath = path.join(
  root,
  "experiments/p35-targeted-allocation-value-evidence.json",
);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const gatherable = new Set(["Lumber", "Stone"]);
const checkpointPeriods = [500, 1_000, 5_000, 10_000];

async function readEvidence(relativePath) {
  const bytes = await readFile(path.join(root, relativePath));
  return {
    value: JSON.parse(bytes.toString("utf8")),
    sha256: hash(bytes),
  };
}

function rejectionCounts(records) {
  const counts = {};
  for (const record of records) {
    for (const reason of record.shadow?.reasons ?? [])
      counts[reason] = (counts[reason] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function shortageAt(record, resourceId) {
  return Math.max(
    0,
    Number(record.target?.cost?.[resourceId] ?? 0) -
      Number(record.resources?.[resourceId]?.amount ?? 0),
  );
}

function snapshot(record) {
  if (!record) return null;
  const gatherableShortage = Object.fromEntries(
    [...gatherable]
      .filter((resourceId) => record.target?.cost?.[resourceId] !== undefined)
      .map((resourceId) => [resourceId, shortageAt(record, resourceId)]),
  );
  const freeCapacity = Object.fromEntries(
    Object.keys(gatherableShortage).map((resourceId) => [
      resourceId,
      Math.max(
        0,
        Number(record.resources?.[resourceId]?.max ?? 0) -
          Number(record.resources?.[resourceId]?.amount ?? 0),
      ),
    ]),
  );
  const nonGatherableCosts = Object.fromEntries(
    Object.entries(record.target?.cost ?? {})
      .filter(([resourceId]) => !gatherable.has(resourceId))
      .map(([resourceId, price]) => {
        const stock = Number(record.resources?.[resourceId]?.amount ?? 0);
        return [
          resourceId,
          {
            price,
            stock,
            affordable: stock >= price,
          },
        ];
      }),
  );
  return {
    period: record.period,
    gatherableShortage,
    freeCapacity,
    nonGatherableCosts,
    eligible: (record.shadow?.reasons ?? []).length === 0,
    rejectionReasons: [...(record.shadow?.reasons ?? [])],
  };
}

function summarizeGroups(records, constructionInvocations) {
  const groups = new Map();
  for (const record of records) {
    const targetId = record.target?.id ?? null;
    const cost = record.target?.cost ?? null;
    const key = JSON.stringify([targetId, cost]);
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }

  return [...groups.values()].map((items) => {
    items.sort((left, right) => left.period - right.period);
    const firstEligible = items.find(
      (record) => (record.shadow?.reasons ?? []).length === 0,
    );
    const first = items[0];
    const last = items.at(-1);
    const referencePeriod = firstEligible?.period ?? first.period;
    const purchases = new Set(
      constructionInvocations
        .filter((event) => event.period <= referencePeriod)
        .map((event) => `${event.period}|${event.elementId}`),
    );
    const buildingCounts = {
      farm: [...purchases].filter((event) => event.endsWith("|city-farm"))
        .length,
      basic_housing: [...purchases].filter((event) =>
        event.endsWith("|city-basic_housing"),
      ).length,
      shed: [...purchases].filter((event) => event.endsWith("|city-shed"))
        .length,
      rock_quarry: [...purchases].filter((event) =>
        event.endsWith("|city-rock_quarry"),
      ).length,
    };
    return {
      targetId: first.target?.id ?? null,
      cost: first.target?.cost ?? null,
      periodRange: [first.period, last.period],
      observations: items.length,
      eligibleObservations: items.filter(
        (record) => (record.shadow?.reasons ?? []).length === 0,
      ).length,
      firstEligiblePeriod: firstEligible?.period ?? null,
      rejectionReasons: rejectionCounts(items),
      firstObservation: snapshot(first),
      firstEligibleObservation: snapshot(firstEligible),
      lastObservation: snapshot(last),
      ownedBuildingsAtFirstEligible: firstEligible ? buildingCounts : null,
    };
  });
}

function uniqueEvents(events) {
  const seen = new Set();
  return events
    .filter((event) => {
      const key = `${event.period}|${event.elementId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .toSorted(
      (left, right) =>
        left.period - right.period ||
        left.elementId.localeCompare(right.elementId),
    )
    .map(({ period, elementId }) => ({ period, elementId }));
}

function productionCheckpoint(checkpoint) {
  const state = checkpoint.native;
  const resources = state.resources;
  return {
    period: checkpoint.period,
    population: state.population,
    jobs: state.jobs,
    buildings: state.buildings,
    foodProduction: state.foodProduction?.Farmer ?? null,
    foodConsumption: state.foodConsumption?.Human ?? null,
    starved: state.starved,
    deaths: state.deaths,
    resources: Object.fromEntries(
      ["Food", "Lumber", "Stone", "Money", "Knowledge"].map((id) => [
        id,
        resources[id]
          ? {
              amount: resources[id].amount,
              max: resources[id].max,
              diff: resources[id].diff,
            }
          : null,
      ]),
    ),
  };
}

function summarizeTargetClicks(events, targetId) {
  const clicks = events.filter((event) => event.targetId === targetId);
  const byResource = {};
  for (const event of clicks)
    byResource[event.resourceId] =
      (byResource[event.resourceId] ?? 0) + event.clicks;
  return {
    clicks: clicks.reduce((sum, event) => sum + event.clicks, 0),
    byResource,
    firstPeriod: clicks[0]?.period ?? null,
    lastPeriod: clicks.at(-1)?.period ?? null,
  };
}

export async function createP35PreflightEvidence() {
  const sourcePaths = [
    "experiments/p33-p19-live-authority-evidence.json",
    "experiments/p34-allocation-execution-cost-evidence.json",
    "experiments/p19-civilization-bootstrap-evidence.json",
    "experiments/p20-2-construction-handoff-parity-evidence.json",
  ];
  const sources = await Promise.all(sourcePaths.map(readEvidence));
  const [p33, p34, p19, p20] = sources.map(({ value }) => value);
  const p33Records = p33.arms.find(({ arm }) => arm === "C").shadowRecords;
  const p34Records = p34.arms.find(({ arm }) => arm === "C").shadowRecords;
  const signature = (records) =>
    records.map((record) => ({
      period: record.period,
      target: record.target,
      reasons: record.shadow?.reasons ?? [],
    }));
  if (
    JSON.stringify(signature(p33Records)) !==
    JSON.stringify(signature(p34Records))
  )
    throw new Error("P33 and P34 live target eligibility records differ");

  const p19Events = {
    research: uniqueEvents(p19.candidate.researchInvocations),
    construction: uniqueEvents(p19.candidate.constructionInvocations),
  };
  const p19Checkpoints = p19.candidate.checkpoints
    .filter(({ period }) => checkpointPeriods.includes(period))
    .map(productionCheckpoint);
  const p20C = p20.arms.C;
  const p20ShedPurchase = p20C.constructionActions.find(
    ({ elementId }) => elementId === "city-shed",
  );
  const p20QuarryPurchase = p20C.constructionActions.find(
    ({ elementId }) => elementId === "city-rock_quarry",
  );
  const p20ShedClicks = summarizeTargetClicks(
    p20C.allocationClicks,
    "city-shed",
  );
  const p20QuarryClicks = summarizeTargetClicks(
    p20C.allocationClicks,
    "city-rock_quarry",
  );
  const p20TotalAllocationClicks = p20C.allocationClicks.reduce(
    (sum, event) => sum + event.clicks,
    0,
  );
  const p34Groups = summarizeGroups(p34Records, p19Events.construction);
  const shed = p34Groups.find(({ targetId }) => targetId === "city-shed");
  const farm27 = p34Groups.find(
    ({ targetId, cost }) =>
      targetId === "city-farm" && cost?.Lumber === 27 && cost?.Stone === 14,
  );
  const transitions = p33.arms
    .find(({ arm }) => arm === "C")
    .targetTransitions.map((event) => ({
      period: event.period,
      targetId: event.target?.name ?? null,
      cost: event.target?.cost ?? null,
    }));

  return {
    experiment: "P35 target-specific allocation value preflight",
    stage: 1,
    decision: "negative-preflight",
    treatmentRun: false,
    targetSelected: null,
    interventionWindow: null,
    stopReason:
      "No P33-authorized Construction target has a defensible path to meaningful progression within the one-target stop-at-purchase limit.",
    replayInputs: {
      pinnedGame: p34.pinnedGame,
      gameSha256: p34.gameSha256,
      fixture: p34.fixture,
      fixtureSha256: p34.fixtureSha256,
      settingsSha256: p34.settingsSha256,
      seed: p34.seed,
      epoch: p34.epoch,
      p19Periods: p19.candidate.periods,
      shadowPeriods: p34.arms.find(({ arm }) => arm === "C").periods,
      p33Replay: "experiments/p33-p19-live-authority-exact.mjs",
      p34Replay: "experiments/p34-allocation-execution-cost.mjs",
      p19Replay: "experiments/p19-civilization-bootstrap-exact.mjs",
      p20Replay:
        "experiments/p20-standard-human-sustained-allocation-exact.mjs",
      sourceEvidence: sourcePaths.map((file, index) => ({
        file,
        sha256: sources[index].sha256,
      })),
      p33P34LiveEligibilityParity: true,
    },
    liveTargetTransitions: transitions,
    liveTargetGroups: p34Groups,
    baseline: {
      checkpoints: p19Checkpoints,
      researchGrants: p19Events.research,
      constructionPurchases: p19Events.construction,
      firstFarmPurchasePeriod: p19Events.construction.find(
        ({ elementId }) => elementId === "city-farm",
      )?.period,
      sustainableAtP5000AndP10000: p19Checkpoints
        .filter(({ period }) => period >= 5_000)
        .every(
          (checkpoint) =>
            checkpoint.population === 3 &&
            checkpoint.jobs.farmer === 3 &&
            Number.parseFloat(checkpoint.foodProduction) >
              Math.abs(checkpoint.foodConsumption) &&
            checkpoint.starved === 0 &&
            checkpoint.deaths === 0,
        ),
    },
    targetAssessment: {
      secondFarm: {
        targetId: "city-farm",
        firstEligiblePeriod: farm27?.firstEligiblePeriod,
        alreadyOwnedAtFirstEligible:
          farm27?.ownedBuildingsAtFirstEligible?.farm ?? null,
        materialShortageAtFirstEligible:
          farm27?.firstEligibleObservation?.gatherableShortage ?? null,
        decision:
          "Eligible, but P19 already owns one Farm and sustains three Farmers; P20.2 generic allocation bought another Farm and reduced p5000 population and productive Farmers.",
      },
      shed: {
        targetId: "city-shed",
        firstObservedPeriod: transitions.find(
          ({ targetId }) => targetId === "city-shed",
        )?.period,
        firstPreGatherPeriod: shed?.periodRange[0],
        firstMoneyAffordablePeriod: shed?.firstEligiblePeriod,
        cost: shed?.cost,
        materialShortageAtFirstEligible:
          shed?.firstEligibleObservation?.gatherableShortage ?? null,
        obtainableCapacityAtFirstEligible:
          shed?.firstEligibleObservation?.freeCapacity ?? null,
        estimatedMaterialClicksAtP19Stock: Object.values(
          shed?.firstEligibleObservation?.gatherableShortage ?? {},
        ).reduce((sum, amount) => sum + amount, 0),
        perTargetCeiling: 80,
        actualP20TargetClicks: p20ShedClicks,
        p20ShedPurchasePeriod: p20ShedPurchase?.period ?? null,
        nativeEffect: "storage only; +300 Lumber and +300 Stone capacity",
        directProductiveOutput: false,
        downstream: {
          targetId: "city-rock_quarry",
          appearedAfterP20ShedPurchase: true,
          firstP20QuarryGatherPeriod: p20QuarryClicks.firstPeriod,
          p20QuarryClicks,
          quarryPurchased: p20QuarryPurchase !== undefined,
          p20TotalAllocationClicks,
          requiresASecondTargetEpisode: true,
          p19LumberAndStoneProduction: {
            p5000: {
              Lumber: p19Checkpoints.find(({ period }) => period === 5_000)
                ?.resources.Lumber.diff,
              Stone: p19Checkpoints.find(({ period }) => period === 5_000)
                ?.resources.Stone.diff,
            },
            p10000: {
              Lumber: p19Checkpoints.find(({ period }) => period === 10_000)
                ?.resources.Lumber.diff,
              Stone: p19Checkpoints.find(({ period }) => period === 10_000)
                ?.resources.Stone.diff,
            },
          },
        },
        decision:
          "Materials fit within 80 clicks, but Shed adds no job, housing, or Research. The next productive Quarry is not the current saving target and still requires another target-specific material episode; P20.2 spent 48 Quarry clicks without purchasing it.",
      },
      rockQuarry: {
        targetId: "city-rock_quarry",
        productiveInfrastructure: true,
        enablesJob: "quarry_worker",
        currentP33P34SavingTarget: false,
        decision:
          "A later native offer is not current P33/P34 target authority and cannot be selected under the requested contract.",
      },
    },
    p34ReferenceCost: {
      shadowInvocations: p34.measurement.shadowInvocations,
      shadowDirectElapsedMs: p34.measurement.nativeShadowDirectElapsedMs.total,
      hypotheticalFreshPriceProbeCount:
        p34.executionTimeValidation.actionPriceProbeCount,
      actualTreatmentExecutorMeasurement: null,
      cpuTwoPercentGate: "unresolved",
    },
    preRegisteredSuccessCriteriaForAnyFutureTest: {
      preserveP19: {
        population: "at least 3",
        activeFarmers: "at least 3",
        farmerFoodProduction: "at least 4.332",
        foodConsumption: "3",
        starvation: 0,
        deaths: 0,
      },
      meaningfulGain:
        "At least one new productive job, useful productive infrastructure beyond storage, additional housing/population, or additional native Research advancement caused after the first authorized material action.",
      buildingTheSelectedTargetAloneIsInsufficient: true,
    },
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const evidence = await createP35PreflightEvidence();
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(
    `Wrote ${path.relative(root, evidencePath)}: ${evidence.decision}; no target selected`,
  );
}
