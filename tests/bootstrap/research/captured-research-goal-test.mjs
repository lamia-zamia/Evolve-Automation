import assert from "node:assert/strict";

import { planResearch } from "../../../src/domain/progression/research/research.ts";
import { createCapturedResearchAdapter } from "../../../src/adapters/evolve/progression/research/captured-research.ts";

// Every root, setting, offer, resource sample, and control below is constructed synthetic input.
const authorizedSettings = Object.freeze({
  prestigeType: "mad",
  autoResearch: true,
  autoPrestige: true,
});

const ordinaryOffer = Object.freeze({
  elementId: "tech-theology",
  grantTechnology: "theology",
  grantLevel: 1,
  cost: Object.freeze({ Knowledge: 10 }),
  nativeAffordable: true,
  generation: 1,
});
const madOffer = Object.freeze({
  elementId: "tech-mad",
  grantTechnology: "mad",
  grantLevel: 1,
  cost: Object.freeze({ Knowledge: 100 }),
  nativeAffordable: true,
  generation: 1,
});
const laterOffer = Object.freeze({
  elementId: "tech-mining",
  grantTechnology: "mining",
  grantLevel: 1,
  cost: Object.freeze({ Knowledge: 20 }),
  nativeAffordable: true,
  generation: 1,
});

function makeAdapter(options = {}) {
  const currentRoot = options.currentRoot ?? { tech: { mad: 0 } };
  const liveRoot = options.liveRoot ?? currentRoot;
  const offers = options.offers ?? [ordinaryOffer, madOffer, laterOffer];
  const resourceAmounts = options.resourceAmounts ?? [];
  const resourceReads = [];
  const reservationChecks = [];
  const exclusionChecks = [];
  const adapter = createCapturedResearchAdapter({
    rootState: {
      readRoot: () => liveRoot,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    currentRoot,
    currentRootGeneration: options.currentRootGeneration ?? 1,
    readRootGeneration: () =>
      options.liveRootGeneration ?? options.currentRootGeneration ?? 1,
    readSettings: () => options.settings ?? authorizedSettings,
    isMutationUncertain: options.isMutationUncertain,
    offered: offers,
    resources: {
      readResources(ids) {
        const requested = [...ids];
        resourceReads.push(requested);
        const amount =
          resourceAmounts[resourceReads.length - 1] ??
          options.resourceAmount ??
          1000;
        return {
          resources: new Map(
            requested.map((id) => [
              id,
              {
                present: true,
                unlocked: true,
                amount,
                max: 1000,
                rateOfChange: 0,
                storageRatio: 0,
              },
            ]),
          ),
        };
      },
    },
    conflicts: {
      evaluate(cost) {
        reservationChecks.push(cost);
        return options.reservationDecision?.(cost) ?? { status: "none" };
      },
    },
    techConflicts: {
      evaluate(tech) {
        exclusionChecks.push(tech.elementId);
        return options.exclusionDecision?.(tech) ?? { status: "none" };
      },
    },
    controls: {
      resolve(elementId) {
        const offer = offers.find(
          (candidate) => candidate.elementId === elementId,
        );
        if (offer === undefined) return undefined;
        return {
          elementId,
          generation:
            options.controlGenerations?.[elementId] ?? offer.generation,
          methods: options.missingAction === elementId ? [] : ["action"],
        };
      },
      invoke: () => ({ ok: true, value: undefined }),
      capturedElementIds: () => offers.map((offer) => offer.elementId),
      checkpoint: () => ({}),
      rejectChanges: () => {},
    },
  });
  return { ...adapter, resourceReads, reservationChecks, exclusionChecks };
}

function selected(input, candidate) {
  return planResearch({
    ...input,
    ...(candidate === undefined ? {} : { madGoalCandidate: candidate }),
  });
}

// Exact lookup reuses the prepared offers and checks only MAD, even when that offer is later.
{
  const adapter = makeAdapter();
  const input = adapter.reader.read(0);
  const candidate = adapter.reader.readMadGoalCandidate();
  assert.deepEqual(
    adapter.resourceReads,
    [["Knowledge"], ["Knowledge"]],
    "one ordinary candidate and the exact MAD candidate were checked",
  );
  assert.deepEqual(
    adapter.reservationChecks.map((cost) => Object.values(cost)[0]),
    [10, 100],
  );
  assert.deepEqual(adapter.exclusionChecks, ["tech-theology", "tech-mad"]);
  assert.deepEqual(selected(input, candidate), {
    index: 1,
    techId: "tech-mad",
  });
}

// A changed root, nonzero or missing tech.mad, or any missing setting closes the preference.
for (const options of [
  { liveRoot: { tech: { mad: 0 } } },
  { currentRoot: { tech: {} } },
  { currentRoot: { tech: { mad: 1 } } },
  { currentRootGeneration: 1, liveRootGeneration: 2 },
  { settings: { ...authorizedSettings, prestigeType: "bioseed" } },
  { settings: { ...authorizedSettings, autoResearch: false } },
  { settings: { ...authorizedSettings, autoPrestige: false } },
  { offers: [ordinaryOffer, laterOffer] },
]) {
  const adapter = makeAdapter(options);
  const candidate = adapter.reader.readMadGoalCandidate();
  assert.equal(candidate, undefined);
}

// A missing or mismatched native action control generation leaves ordinary selection untouched.
for (const options of [
  { controlGenerations: { "tech-mad": 2 } },
  {
    offers: [ordinaryOffer, { ...madOffer, generation: 2 }, laterOffer],
    controlGenerations: { "tech-mad": 1 },
  },
  { missingAction: "tech-mad" },
]) {
  const adapter = makeAdapter(options);
  assert.equal(adapter.reader.readMadGoalCandidate(), undefined);
}

// Incomplete reservations, incomplete exclusions, and insufficient resources cannot elevate MAD.
{
  const adapter = makeAdapter({
    reservationDecision: (cost) =>
      cost.Knowledge === 100 ? { status: "unavailable" } : { status: "none" },
  });
  const input = adapter.reader.read(0);
  const candidate = adapter.reader.readMadGoalCandidate();
  assert.equal(candidate.hasCostConflict, true);
  assert.deepEqual(selected(input, candidate), {
    index: 0,
    techId: "tech-theology",
  });
}
{
  const adapter = makeAdapter({
    exclusionDecision: (tech) =>
      tech.elementId === "tech-mad"
        ? { status: "unavailable", reason: "invalid-settings" }
        : { status: "none" },
  });
  const input = adapter.reader.read(0);
  const candidate = adapter.reader.readMadGoalCandidate();
  assert.equal(candidate.hasTechConflict, true);
  assert.deepEqual(selected(input, candidate), {
    index: 0,
    techId: "tech-theology",
  });
}
{
  const adapter = makeAdapter({ resourceAmounts: [1000, 50, 1000] });
  const input = adapter.reader.read(0);
  const candidate = adapter.reader.readMadGoalCandidate();
  assert.equal(candidate.affordable, false);
  assert.equal(adapter.resourceReads.length, 2, "later offers are not scanned");
  assert.deepEqual(selected(input, candidate), {
    index: 0,
    techId: "tech-theology",
  });
}

// Native affordability is a hard input to the targeted view, even with ample current resources.
{
  const adapter = makeAdapter({
    offers: [ordinaryOffer, { ...madOffer, nativeAffordable: false }],
  });
  const input = adapter.reader.read(0);
  const candidate = adapter.reader.readMadGoalCandidate();
  assert.equal(candidate.affordable, false);
  assert.deepEqual(
    adapter.resourceReads,
    [["Knowledge"]],
    "native rejection prevents a second resource affordability read",
  );
  assert.deepEqual(selected(input, candidate), {
    index: 0,
    techId: "tech-theology",
  });
}

console.log("captured research goal authority ok (synthetic inputs)");
