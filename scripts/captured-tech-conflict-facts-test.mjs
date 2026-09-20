import assert from "node:assert/strict";

import { createCapturedTechConflictReader } from "../src/adapters/evolve/progression/research/captured-tech-conflicts.ts";
import { readCapturedBananaProgress } from "../src/adapters/evolve/civic/captured-banana-republic.ts";
import { readCapturedRetirementShortfalls } from "../src/adapters/evolve/progression/prestige/captured-retirement-prep.ts";
import { RETIREMENT_PREP } from "../src/domain/progression/build/building-weighting-rules.ts";

const BASE_SETTINGS = Object.freeze({
  researchIgnore: [],
  prestigeType: "none",
  prestigeWhiteholeSaveGems: false,
  prestigeVaxStrat: "",
  prestigeDemonicBomb: false,
  foreignUnification: true,
  prestigeWhiteholeStabiliseMass: false,
  prestigeWhiteholeStabiliseCooldown: 0,
  userResearchTheology_1: "",
  userResearchTheology_2: "",
  fleetAlienGiftKnowledge: 0,
  achievementGuards: false,
});

function resourceSource(views = {}) {
  return {
    readResources: (ids) =>
      Object.freeze({
        resources: new Map(
          [...ids].map((id) => [
            id,
            {
              unlocked: true,
              amount: 0,
              max: 0,
              rateOfChange: 0,
              storageRatio: 0,
              ...views[id],
            },
          ]),
        ),
      }),
  };
}

function evaluate(root, settings, elementId, views) {
  return createCapturedTechConflictReader({
    rootState: { readRoot: () => root },
    readSettings: () => ({ ...BASE_SETTINGS, ...settings }),
    resources: resourceSource(views),
  }).evaluate({ elementId, cost: {}, generation: 1 });
}

/* ------------------------------------------------------- Banana Republic unification */

/** `l` is the affix for the default universe, which is what `race.universe` omits. */
function bananaStats(complete) {
  const objective = () => ({ l: complete, h: false, a: false, e: false });
  return {
    banana: {
      b1: objective(),
      b2: objective(),
      b3: objective(),
      b4: objective(),
      b5: objective(),
    },
    feat: { banana: complete ? 1 : 0 },
    achieve: {},
  };
}

function bananaRoot(complete) {
  return {
    race: { species: "human", gods: "none", banana: true },
    stats: bananaStats(complete),
    resource: {},
    tech: {},
  };
}

{
  // The progress reader is the authoritative source, and it reads the objectives the game writes.
  const progress = readCapturedBananaProgress(bananaRoot(true));
  assert.deepEqual(progress.objectives, {
    b1: true,
    b2: true,
    b3: true,
    b4: true,
    b5: true,
  });
  assert.equal(progress.smoothie.featStar, 1);
}

{
  // An unfinished banana run still guards unification, which is the behaviour the guard exists for.
  assert.deepEqual(evaluate(bananaRoot(false), {}, "tech-unification2"), {
    status: "conflict",
    conflict: { code: "banana-republic-guard" },
  });
}

{
  // A finished one no longer does. This is the case the old fail-closed rejection could never
  // reach: it returned `unavailable` for every banana run, so unification was permanently refused.
  assert.deepEqual(evaluate(bananaRoot(true), {}, "tech-unification2"), {
    status: "none",
  });
}

{
  // Outside a banana run nothing changes.
  const root = {
    race: { species: "human", gods: "none" },
    stats: { achieve: {} },
    resource: {},
    tech: {},
  };
  assert.deepEqual(evaluate(root, {}, "tech-unification2"), { status: "none" });
}

{
  // A malformed banana ledger still fails closed: the fork is one-way.
  const root = bananaRoot(false);
  root.stats.banana = "not a record";
  assert.deepEqual(evaluate(root, {}, "tech-unification2"), {
    status: "unavailable",
    reason: "banana-republic-progress",
    field: "stats.banana",
  });
}

/* --------------------------------------------------- Isolation Protocol under retirement assist */

function retirementRoot(counts) {
  return {
    race: { species: "human", gods: "none", truepath: true },
    stats: { achieve: {} },
    resource: {},
    tech: {},
    tauceti: {
      fusion_generator: { count: counts.fusionGenerators },
      tau_factory: { count: counts.factories },
      infectious_disease_lab: { count: counts.scienceLabs },
    },
  };
}

const RETIRE_SETTINGS = {
  prestigeType: "retire",
  retirementChallengeAssist: true,
};

{
  // The shortfall reader names every structure the run still owes.
  const shortfalls = readCapturedRetirementShortfalls(
    retirementRoot({ fusionGenerators: 0, factories: 0, scienceLabs: 0 }),
    resourceSource(),
    RETIREMENT_PREP,
  );
  assert.deepEqual(
    shortfalls.map((entry) => entry.name ?? entry.resource),
    [
      "tauceti-fusion_generator",
      "tauceti-tau_factory",
      "tauceti-infectious_disease_lab",
      "Graphene",
    ],
  );
}

{
  // Assist is on and the build-out is incomplete, so Isolation Protocol waits — and the exclusion
  // now says what it is waiting for instead of rejecting the candidate as unreadable.
  const decision = evaluate(
    retirementRoot({ fusionGenerators: 0, factories: 0, scienceLabs: 0 }),
    RETIRE_SETTINGS,
    "tech-isolation_protocol",
  );
  assert.equal(decision.status, "conflict");
  assert.equal(decision.conflict.code, "retirement-preparation");
  assert.ok(decision.conflict.missing.includes("tauceti-fusion_generator"));
}

{
  // The build-out is complete, so the run may isolate. The old code rejected this permanently.
  const decision = evaluate(
    retirementRoot({
      fusionGenerators: RETIREMENT_PREP.fusionGenerators,
      factories: RETIREMENT_PREP.factories,
      scienceLabs: RETIREMENT_PREP.scienceLabs,
    }),
    RETIRE_SETTINGS,
    "tech-isolation_protocol",
    {
      Graphene: {
        amount: RETIREMENT_PREP.graphene,
        max: RETIREMENT_PREP.graphene,
      },
    },
  );
  assert.deepEqual(decision, { status: "none" });
}

{
  // Graphene storage that has not been built yet is a shortfall of its own, not a pass.
  const decision = evaluate(
    retirementRoot({
      fusionGenerators: RETIREMENT_PREP.fusionGenerators,
      factories: RETIREMENT_PREP.factories,
      scienceLabs: RETIREMENT_PREP.scienceLabs,
    }),
    RETIRE_SETTINGS,
    "tech-isolation_protocol",
    { Graphene: { amount: 0, max: 0 } },
  );
  assert.equal(decision.status, "conflict");
  assert.deepEqual(decision.conflict.missing, ["Graphene"]);
}

{
  // Assist off leaves the fork to the ordinary rule.
  const decision = evaluate(
    retirementRoot({ fusionGenerators: 0, factories: 0, scienceLabs: 0 }),
    { prestigeType: "retire", retirementChallengeAssist: false },
    "tech-isolation_protocol",
  );
  assert.deepEqual(decision, { status: "none" });
}

/* ------------------------------------------------- the one fact that is still genuinely absent */

{
  // Stabilizing the blackhole needs script-owned session state (`whiteholeLastStabilise`,
  // `whiteholeResetStarted`) that the captured runtime does not keep. It stays fail-closed.
  const root = {
    race: { species: "human", gods: "none" },
    stats: { achieve: {} },
    resource: {},
    tech: {},
  };
  assert.deepEqual(evaluate(root, {}, "tech-stabilize_blackhole"), {
    status: "unavailable",
    reason: "stabilization-state",
    field: "whiteholeLastStabilise",
  });
}

console.log("captured-tech-conflict-facts ok");
