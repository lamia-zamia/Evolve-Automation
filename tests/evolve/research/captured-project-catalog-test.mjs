import assert from "node:assert/strict";
import { priceLookup } from "../../support/action-price.mjs";

import { createCapturedProjectCatalog } from "../../../src/adapters/evolve/progression/research/captured-project-catalog.ts";
import { createCapturedTriggers } from "../../../src/adapters/evolve/progression/build/captured-triggers.ts";

function makeCatalogPage({
  offers = [],
  capture = { kind: "captured" },
  offerReadAvailable = true,
  rootAvailable = true,
} = {}) {
  const root = {
    race: {},
    tech: {},
    city: { mine: { count: 0 }, apartment: { count: 0 } },
    resource: { Money: { amount: 500000, max: 1000000, display: true } },
    arpa: Object.fromEntries(
      offers.map((offer) => [
        offer.projectId,
        { rank: offer.rank, complete: offer.progress },
      ]),
    ),
  };
  let currentOffers = offers;
  const reasons = [];
  const diagnostics = [];
  const calls = { capture: 0, offers: 0 };
  const catalog = createCapturedProjectCatalog({
    rootState: { readRoot: () => (rootAvailable ? root : undefined) },
    mechanics: {
      ensureCaptured() {
        calls.capture++;
        return capture;
      },
      readOffers(sample) {
        calls.offers++;
        if (sample !== root || !offerReadAvailable) return undefined;
        return currentOffers;
      },
      buildPercent() {
        throw new Error("catalog reads do not build projects");
      },
    },
    onUnavailable: (reason) => reasons.push(reason),
    onDiagnostic: (reason) => diagnostics.push(reason),
  });
  return {
    catalog,
    root,
    calls,
    reasons,
    diagnostics,
    setOffers(value) {
      currentOffers = value;
    },
  };
}

{
  const page = makeCatalogPage({
    offers: [
      {
        projectId: "lhc",
        rank: 2,
        progress: 35,
        percentCosts: { Money: 10, Knowledge: 5 },
      },
      {
        projectId: "stock_exchange",
        rank: 1,
        progress: 0,
        percentCosts: { Money: 20 },
      },
    ],
  });
  assert.deepEqual(page.catalog.readProjects(), [
    {
      elementId: "arpalhc",
      projectId: "lhc",
      rank: 2,
      progress: 35,
      cost: { Money: 10, Knowledge: 5 },
    },
    {
      elementId: "arpastock_exchange",
      projectId: "stock_exchange",
      rank: 1,
      progress: 0,
      cost: { Money: 20 },
    },
  ]);
  assert.deepEqual(page.calls, { capture: 1, offers: 1 });
}

{
  const page = makeCatalogPage();
  assert.deepEqual(
    page.catalog.readProjects(),
    [],
    "an empty offer list is authoritative",
  );
}

{
  const page = makeCatalogPage({
    capture: {
      kind: "unavailable",
      reason: "the page realm has no Object.keys",
    },
  });
  assert.equal(page.catalog.readProjects(), undefined);
  assert.deepEqual(page.reasons, [
    "native A.R.P.A. capture failed: the page realm has no Object.keys",
  ]);
  assert.equal(page.calls.offers, 0);
}

{
  const page = makeCatalogPage({ offerReadAvailable: false });
  assert.equal(page.catalog.readProjects(), undefined);
  assert.deepEqual(page.diagnostics, [
    "the offered project catalog is unreadable against the captured registry",
  ]);
}

{
  const page = makeCatalogPage({ rootAvailable: false });
  assert.equal(page.catalog.readProjects(), undefined);
  assert.deepEqual(page.reasons, ["the game root has not been captured yet"]);
  assert.equal(page.calls.offers, 0);
}

{
  const page = makeCatalogPage({
    offers: [
      {
        projectId: "lhc",
        rank: 2,
        progress: 35,
        percentCosts: { Money: 10 },
      },
    ],
  });
  const held = page.catalog.readProjects();
  page.root.arpa.lhc.complete = 40;
  page.setOffers([
    {
      projectId: "lhc",
      rank: 2,
      progress: 40,
      percentCosts: { Money: 10 },
    },
  ]);
  assert.equal(page.catalog.readProjects()[0].progress, 40);
  assert.equal(
    held[0].progress,
    35,
    "a fresh sample does not mutate the held row",
  );
}

// ProjectUnlocked uses the same offered-project catalog as construction saving.
{
  const page = makeCatalogPage({
    offers: [
      {
        projectId: "lhc",
        rank: 0,
        progress: 10,
        percentCosts: { Money: 26250 },
      },
      {
        projectId: "stock_exchange",
        rank: 1,
        progress: 0,
        percentCosts: { Money: 1500 },
      },
    ],
  });
  const buildCosts = {
    "city-apartment": { Money: 875 },
    "city-mine": { Money: 60 },
  };
  const projectTrigger = (requirementId, requirementCount, actionId) => ({
    seq: 0,
    priority: 0,
    requirementType: "ProjectUnlocked",
    requirementId,
    requirementCount,
    actionType: "build",
    actionId,
    actionCount: 1,
  });
  const triggersFor = (rows) =>
    createCapturedTriggers({
      rootState: { readRoot: () => page.root },
      controls: {
        resolve: (elementId) =>
          elementId in buildCosts
            ? { elementId, generation: 1, methods: [] }
            : undefined,
        invoke: () => ({ ok: true, value: undefined }),
        capturedElementIds: () => Object.keys(buildCosts),
      },
      costs: { readCost: priceLookup(buildCosts) },
      readSettings: () => ({ autoTrigger: true, triggers: rows }),
      readOfferedProjects: () => page.catalog.readProjects(),
    });

  assert.deepEqual(
    triggersFor([projectTrigger("arpalhc", 1, "city-apartment")]).read(),
    [
      {
        actionId: "city-apartment",
        actionType: "build",
        cost: buildCosts["city-apartment"],
      },
    ],
  );
  assert.deepEqual(
    triggersFor([projectTrigger("arpamonument", 1, "city-mine")]).read(),
    [],
  );
  assert.deepEqual(
    triggersFor([projectTrigger("arpamonument", 0, "city-mine")]).read(),
    [
      {
        actionId: "city-mine",
        actionType: "build",
        cost: buildCosts["city-mine"],
      },
    ],
  );
}

console.log("captured-project-catalog ok");
