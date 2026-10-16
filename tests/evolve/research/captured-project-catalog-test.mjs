import assert from "node:assert/strict";
import { priceLookup } from "../../support/action-price.mjs";

import { createCapturedProjectCatalog } from "../../../src/adapters/evolve/progression/research/captured-project-catalog.ts";
import { createCapturedTriggers } from "../../../src/adapters/evolve/progression/build/captured-triggers.ts";

function makeCatalogPage({
  offers = [],
  capture = { kind: "captured" },
  offerReadAvailable = true,
  rootAvailable = true,
  gameTechHighTech = 7,
  omitHighTech = false,
} = {}) {
  const root = {
    race: {},
    tech: omitHighTech ? {} : { high_tech: gameTechHighTech },
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
  let currentRoot = root;
  const catalog = createCapturedProjectCatalog({
    rootState: { readRoot: () => (rootAvailable ? currentRoot : undefined) },
    mechanics: {
      ensureCaptured() {
        calls.capture++;
        return capture;
      },
      readOffers(sample) {
        calls.offers++;
        if (sample !== currentRoot || !offerReadAvailable) return undefined;
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
    setRoot(value) {
      currentRoot = value;
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

for (const highTech of [0, 5]) {
  const page = makeCatalogPage({
    gameTechHighTech: highTech,
    capture: {
      kind: "unavailable",
      reason: "must not be attempted while locked",
    },
  });
  const projects = page.catalog.readProjects();
  assert.deepEqual(projects, [], `High Tech ${highTech} is locked`);
  assert.ok(Object.isFrozen(projects));
  assert.deepEqual(page.calls, { capture: 0, offers: 0 });
  assert.deepEqual(page.reasons, []);
}

{
  const page = makeCatalogPage({ omitHighTech: true });
  const projects = page.catalog.readProjects();
  assert.deepEqual(projects, [], "missing High Tech is definitely locked");
  assert.ok(Object.isFrozen(projects));
  assert.deepEqual(page.calls, { capture: 0, offers: 0 });
}

for (const highTech of [6, 7]) {
  const page = makeCatalogPage({
    gameTechHighTech: highTech,
    offers: [
      {
        projectId: "lhc",
        rank: 1,
        progress: 15,
        percentCosts: { Money: 12 },
      },
    ],
  });
  assert.deepEqual(
    page.catalog.readProjects().map((project) => project.projectId),
    ["lhc"],
  );
  assert.deepEqual(page.calls, { capture: 1, offers: 1 });
}

for (const malformed of ["5", NaN, Infinity, null]) {
  const page = makeCatalogPage({ gameTechHighTech: malformed });
  assert.equal(page.catalog.readProjects(), undefined);
  assert.deepEqual(page.calls, { capture: 0, offers: 0 });
  assert.deepEqual(page.reasons, ["the native High Tech level is malformed"]);
}

{
  const page = makeCatalogPage({ gameTechHighTech: 5 });
  assert.deepEqual(page.catalog.readProjects(), []);
  const replacement = { ...page.root, tech: { high_tech: 6 } };
  page.setRoot(replacement);
  assert.deepEqual(page.catalog.readProjects(), []);
  assert.deepEqual(page.calls, { capture: 1, offers: 1 });
}

{
  const page = makeCatalogPage({ gameTechHighTech: 5 });
  assert.deepEqual(page.catalog.readProjects(), []);
  page.root.tech.high_tech = 6;
  assert.deepEqual(page.catalog.readProjects(), []);
  assert.deepEqual(page.calls, { capture: 1, offers: 1 });
}

{
  const page = makeCatalogPage({ gameTechHighTech: 6 });
  page.root.tech = null;
  assert.equal(page.catalog.readProjects(), undefined);
  assert.deepEqual(page.calls, { capture: 0, offers: 0 });
  assert.deepEqual(page.reasons, [
    "the native technology state is unavailable",
  ]);
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
