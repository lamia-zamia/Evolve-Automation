import assert from "node:assert/strict";
import { planJobs } from "../../../src/domain/civic/jobs.ts";
import {
  createCapturedFullJobsAutomation,
  createCapturedOrdinaryJobsAutomation,
} from "../../../src/adapters/evolve/civic/captured-ordinary-jobs.ts";
import { runJobsAutomation } from "../../../src/application/jobs.ts";
import {
  createCapturedJobCatalogReader,
  readCapturedJobCountSnapshot,
  readCapturedJobStackMultiplier,
  readCapturedMinerReservation,
  readCapturedPopulationResource,
} from "../../../src/adapters/evolve/civic/captured-job-catalog.ts";

const root = {
  civic: {
    d_job: "unemployed",
    unemployed: {
      job: "unemployed",
      assigned: 3,
      workers: 3,
      max: 0,
      display: true,
    },
    farmer: {
      job: "farmer",
      assigned: 0,
      workers: 0,
      max: -1,
      display: true,
    },
  },
  race: { species: "elven" },
  resource: { elven: { amount: 3, max: 10 } },
};
const calls = [];
const controls = {
  capturedElementIds: () => ["civ-unemployed", "civ-farmer"],
  resolve: (elementId) =>
    elementId.startsWith("civ-")
      ? { elementId, generation: 1, methods: ["add", "sub", "setDefault"] }
      : undefined,
  invoke: (handle, method, args = []) => {
    calls.push({ elementId: handle.elementId, method, args });
    if (method === "setDefault") {
      root.civic.d_job = args[0];
    } else {
      const id = handle.elementId.slice("civ-".length);
      root.civic[id].workers += method === "add" ? 1 : -1;
    }
    return { ok: true, value: undefined };
  },
};
// The captured catalog refuses to plan from a blob that has never been through a job settings
// reset, because every absent `job_b*`/`job_p_*`/`job_s_*` would otherwise read as a decision.
// Fixtures that expect a plan declare the reset-written breakpoints once, here.
const resetBreakpoints = Object.freeze({
  job_b1_farmer: -1,
  job_b2_farmer: -1,
  job_b3_farmer: -1,
});

const automation = createCapturedOrdinaryJobsAutomation({
  rootState: { readRoot: () => root },
  controls,
  readSettings: () => ({
    job_unemployed: true,
    job_farmer: true,
    jobSetDefault: true,
    // A blob that has been through a job settings reset, which is what carries breakpoints.
    job_b1_unemployed: 0,
    job_b2_unemployed: 0,
    job_b3_unemployed: 0,
    job_b1_farmer: -1,
    job_b2_farmer: -1,
    job_b3_farmer: -1,
  }),
});

const input = automation.reader.readCycle(false);
assert.equal(input.available, true);
const decision = planJobs(input);
assert.ok(decision);
assert.equal(automation.executor.execute(decision).status, "succeeded");
assert.equal(root.civic.farmer.workers, 3);
assert.equal(root.civic.d_job, "farmer");
assert.equal(
  readCapturedPopulationResource(root)?.amount,
  3,
  "DeadSpace population is read from the current race resource",
);
assert.deepEqual(calls, [
  { elementId: "civ-unemployed", method: "sub", args: [] },
  { elementId: "civ-unemployed", method: "sub", args: [] },
  { elementId: "civ-unemployed", method: "sub", args: [] },
  { elementId: "civ-farmer", method: "add", args: [] },
  { elementId: "civ-farmer", method: "add", args: [] },
  { elementId: "civ-farmer", method: "add", args: [] },
  { elementId: "civ-farmer", method: "setDefault", args: ["farmer"] },
]);

const noOpRoot = structuredClone(root);
noOpRoot.civic.d_job = "unemployed";
noOpRoot.civic.unemployed.workers = 3;
noOpRoot.civic.unemployed.assigned = 3;
noOpRoot.civic.farmer.workers = 0;
noOpRoot.civic.farmer.assigned = 0;
const noOpCalls = [];
const noOpAutomation = createCapturedOrdinaryJobsAutomation({
  rootState: { readRoot: () => noOpRoot },
  controls: {
    ...controls,
    invoke: (handle, method, args = []) => {
      noOpCalls.push({ elementId: handle.elementId, method, args });
      return { ok: true, value: undefined };
    },
  },
  readSettings: () => ({
    ...resetBreakpoints,
    job_unemployed: true,
    job_farmer: true,
    jobSetDefault: true,
  }),
});
const noOpInput = noOpAutomation.reader.readCycle(false);
const noOpDecision = planJobs(noOpInput);
assert.ok(noOpDecision);
const noOpOutcome = noOpAutomation.executor.execute(noOpDecision);
assert.equal(noOpOutcome.status, "rejected");
assert.equal(noOpOutcome.failure.code, "ordinary-jobs-postcondition-failed");
assert.ok(noOpCalls.length > 0, "the native action reports success");
assert.equal(noOpRoot.civic.farmer.workers, 0);
assert.equal(
  noOpRoot.civic.d_job,
  "unemployed",
  "a successful native return without the requested state stays a genuine postcondition failure",
);

const partialSettingsRoot = structuredClone(root);
partialSettingsRoot.civic.farmer.workers = 0;
partialSettingsRoot.civic.unemployed.workers = 3;
const partialSettingsAutomation = createCapturedOrdinaryJobsAutomation({
  rootState: { readRoot: () => partialSettingsRoot },
  controls,
  readSettings: () => ({
    autoJobs: true,
    job_b1_farmer: -1,
    job_b2_farmer: -1,
    job_b3_farmer: -1,
  }),
});
const partialSettingsInput = partialSettingsAutomation.reader.readCycle(false);
assert.equal(
  partialSettingsInput.jobs.find(({ id }) => id === "farmer")?.managed,
  true,
  "an absent per-job switch uses the enabled reset default",
);
assert.deepEqual(
  partialSettingsInput.jobs.find(({ id }) => id === "unemployed")?.breakpoints,
  [3, 3, 3],
  "a job with no configured breakpoints retains its current pool rather than targeting zero",
);

const uninitialisedSkips = [];
const uninitialisedAutomation = createCapturedOrdinaryJobsAutomation({
  rootState: { readRoot: () => partialSettingsRoot },
  controls,
  // `autoJobs` with no job configuration at all: the blob has never been through a job settings
  // reset, so every breakpoint, priority and smart toggle is absent.
  readSettings: () => ({ autoJobs: true }),
  onSkipped: (id, reason) => uninitialisedSkips.push({ id, reason }),
});
assert.equal(
  uninitialisedAutomation.reader.readCycle(false).available,
  false,
  "an uninitialised job settings blob plans nothing rather than reading every absence as a zero target",
);
assert.deepEqual(uninitialisedSkips, [
  {
    id: "civ-jobs",
    reason:
      "no job breakpoints are configured; reset the job settings to populate them",
  },
]);

const authorityAutomation = createCapturedOrdinaryJobsAutomation({
  rootState: { readRoot: () => root },
  controls,
  readSettings: () => ({ authorityManage: true }),
});
assert.equal(
  authorityAutomation.reader.readCycle(false).available,
  false,
  "authority management stays unavailable until its live inputs are captured",
);
const disabledAuthorityAutomation = createCapturedOrdinaryJobsAutomation({
  rootState: { readRoot: () => root },
  controls,
  readSettings: () => ({
    ...resetBreakpoints,
    authorityManage: true,
    generalMinimumAuthority: 0,
    autoJobs: true,
    job_b1_farmer: -1,
    job_b2_farmer: -1,
    job_b3_farmer: -1,
  }),
});
assert.equal(
  disabledAuthorityAutomation.reader.readCycle(false).available,
  true,
  "a zero authority target keeps the upstream authority branch disabled",
);

const authorityRoot = {
  civic: {
    d_job: "unemployed",
    unemployed: {
      job: "unemployed",
      assigned: 2,
      workers: 2,
      max: 0,
      display: true,
    },
    farmer: {
      job: "farmer",
      assigned: 0,
      workers: 0,
      max: -1,
      display: true,
    },
    entertainer: {
      job: "entertainer",
      assigned: 2,
      workers: 2,
      max: -1,
      display: true,
    },
    taxes: { tax_rate: 20, display: true },
    govern: { type: "democracy" },
  },
  resource: {
    Population: { amount: 3, max: 10 },
    Authority: { amount: 120, max: 200, display: true },
  },
  // The game keeps morale in `global.city.morale`; there is no `resource.Morale`.
  city: { morale: { current: 110, cap: 200, potential: 0.5, entertain: 4.8 } },
  race: {},
  tech: { theatre: 2 },
};
const authorityControls = {
  capturedElementIds: () => ["civ-unemployed", "civ-farmer", "civ-entertainer"],
  resolve: (elementId) =>
    elementId.startsWith("civ-")
      ? { elementId, generation: 1, methods: ["add", "sub", "setDefault"] }
      : undefined,
  invoke: () => ({ ok: true, value: undefined }),
};
const capturedAuthority = createCapturedOrdinaryJobsAutomation({
  rootState: { readRoot: () => authorityRoot },
  controls: authorityControls,
  readSettings: () => ({
    ...resetBreakpoints,
    authorityManage: true,
    generalMinimumAuthority: 100,
    job_unemployed: true,
    job_farmer: true,
    job_entertainer: true,
  }),
});
const authorityInput = capturedAuthority.reader.readCycle(false);
assert.equal(authorityInput.available, true);
assert.deepEqual(authorityInput.authority, {
  enabled: true,
  current: 120,
  morale: 110,
  moralePotential: 0.5,
  moraleMaximum: 200,
  moraleCeiling: 132.22222222222223,
  entertainerMorale: 2.4,
  superstarMorale: 0,
  previousCap: null,
  debug: false,
});

const nanMoraleRoot = structuredClone(authorityRoot);
nanMoraleRoot.city.morale.current = Number.NaN;
nanMoraleRoot.city.morale.potential = Number.NaN;
const nanMoraleAutomation = createCapturedOrdinaryJobsAutomation({
  rootState: { readRoot: () => nanMoraleRoot },
  controls: authorityControls,
  readSettings: () => ({
    ...resetBreakpoints,
    authorityManage: true,
    generalMinimumAuthority: 100,
    job_unemployed: true,
    job_farmer: true,
    job_entertainer: true,
  }),
});
const nanMoraleInput = nanMoraleAutomation.reader.readCycle(false);
assert.equal(
  nanMoraleInput.available,
  true,
  "a migrated save's non-finite morale stands authority down instead of disabling every job",
);
assert.equal(nanMoraleInput.authority.enabled, false);

const zeroEntertainerRoot = structuredClone(authorityRoot);
zeroEntertainerRoot.civic.entertainer.assigned = 0;
zeroEntertainerRoot.civic.entertainer.workers = 0;
zeroEntertainerRoot.city.morale.entertain = 0;
const zeroEntertainerAutomation = createCapturedOrdinaryJobsAutomation({
  rootState: { readRoot: () => zeroEntertainerRoot },
  controls: authorityControls,
  readSettings: () => ({
    ...resetBreakpoints,
    job_b1_unemployed: 0,
    job_b2_unemployed: 0,
    job_b3_unemployed: 0,
    job_b1_farmer: 0,
    job_b2_farmer: 0,
    job_b3_farmer: 0,
    authorityManage: true,
    generalMinimumAuthority: 100,
    job_unemployed: true,
    job_farmer: true,
    job_entertainer: true,
    job_s_entertainer: true,
    job_b1_entertainer: 2,
    job_b2_entertainer: 5,
    job_b3_entertainer: -1,
  }),
});
const zeroEntertainerInput = zeroEntertainerAutomation.reader.readCycle(false);
assert.equal(zeroEntertainerInput.available, true);
assert.equal(
  zeroEntertainerInput.authority.entertainerMorale,
  null,
  "zero Entertainers have no observed Authority marginal",
);
for (const previousCap of [null, 0]) {
  const decision = planJobs({
    ...zeroEntertainerInput,
    authority: { ...zeroEntertainerInput.authority, previousCap },
  });
  assert.equal(
    decision?.assignments.find(({ jobToken }) => jobToken === 19)?.workers,
    1,
    "Authority permits exactly one bootstrap worker even with a stale zero cap",
  );
  assert.equal(
    decision?.authorityEntertainerCap,
    null,
    "the synthetic bootstrap cap clears even a stale Authority cap",
  );
}
zeroEntertainerRoot.civic.entertainer.assigned = 1;
zeroEntertainerRoot.civic.entertainer.workers = 1;
zeroEntertainerRoot.city.morale.entertain = 2.4;
const observedAuthorityInput =
  zeroEntertainerAutomation.reader.readCycle(false);
assert.equal(observedAuthorityInput.authority.entertainerMorale, 2.4);
assert.ok(
  planJobs({
    ...observedAuthorityInput,
    authority: { ...observedAuthorityInput.authority, previousCap: 1 },
  }).authorityEntertainerCap > 1,
  "Authority resumes its native marginal calculation after the bootstrap",
);

// Follow the production reader, planner, and successful executor across the first native sample.
// Tax recovery is available throughout, so Authority has no morale ceiling and must not retain
// the synthetic one-worker bootstrap as hysteresis.
const taxBootstrapRoot = structuredClone(authorityRoot);
taxBootstrapRoot.resource.Authority.amount = 50;
taxBootstrapRoot.resource.Population.amount = 6;
taxBootstrapRoot.civic.unemployed.assigned = 6;
taxBootstrapRoot.civic.unemployed.workers = 6;
taxBootstrapRoot.civic.entertainer.assigned = 0;
taxBootstrapRoot.civic.entertainer.workers = 0;
taxBootstrapRoot.city.morale.entertain = 0;
const taxBootstrapControls = {
  capturedElementIds: () => ["civ-unemployed", "civ-farmer", "civ-entertainer"],
  resolve: (elementId) =>
    elementId.startsWith("civ-")
      ? { elementId, generation: 1, methods: ["add", "sub", "setDefault"] }
      : undefined,
  invoke: (handle, method, args = []) => {
    if (method === "setDefault") {
      taxBootstrapRoot.civic.d_job = args[0];
    } else {
      const id = handle.elementId.slice("civ-".length);
      taxBootstrapRoot.civic[id].workers += method === "add" ? 1 : -1;
    }
    return { ok: true, value: undefined };
  },
};
const taxBootstrapAutomation = createCapturedOrdinaryJobsAutomation({
  rootState: { readRoot: () => taxBootstrapRoot },
  controls: taxBootstrapControls,
  readSettings: () => ({
    ...resetBreakpoints,
    autoJobs: true,
    autoTax: true,
    authorityManage: true,
    generalMinimumAuthority: 100,
    job_unemployed: true,
    job_farmer: true,
    job_entertainer: true,
    job_s_entertainer: true,
    job_b1_unemployed: 0,
    job_b2_unemployed: 0,
    job_b3_unemployed: 0,
    job_b1_farmer: 0,
    job_b2_farmer: 0,
    job_b3_farmer: 0,
    job_b1_entertainer: 3,
    job_b2_entertainer: 3,
    job_b3_entertainer: 3,
  }),
});
const taxBootstrapInput = taxBootstrapAutomation.reader.readCycle(false);
assert.equal(taxBootstrapInput.available, true);
assert.equal(taxBootstrapInput.authority.current, 50);
assert.equal(taxBootstrapInput.authority.moraleCeiling, null);
assert.equal(taxBootstrapInput.authority.entertainerMorale, null);
const taxBootstrapDecision = planJobs(taxBootstrapInput);
assert.equal(
  taxBootstrapDecision.assignments.find(({ jobToken }) => jobToken === 19)
    ?.workers,
  1,
);
assert.equal(taxBootstrapDecision.authorityEntertainerCap, null);
assert.equal(
  taxBootstrapAutomation.executor.execute(taxBootstrapDecision).status,
  "succeeded",
);
assert.equal(taxBootstrapRoot.civic.entertainer.workers, 1);
taxBootstrapRoot.city.morale.entertain = 2.4;
const sampledTaxInput = taxBootstrapAutomation.reader.readCycle(false);
assert.equal(sampledTaxInput.authority.previousCap, null);
assert.equal(sampledTaxInput.authority.entertainerMorale, 2.4);
assert.equal(sampledTaxInput.authority.moraleCeiling, null);
const sampledTaxDecision = planJobs(sampledTaxInput);
assert.equal(
  sampledTaxDecision.assignments.find(({ jobToken }) => jobToken === 19)
    ?.workers,
  6,
  "Smart can raise Entertainers above the configured breakpoint after a native sample",
);
assert.equal(sampledTaxDecision.authorityEntertainerCap, null);

const cappedEntertainerRoot = structuredClone(authorityRoot);
cappedEntertainerRoot.civic.unemployed.assigned = 15;
cappedEntertainerRoot.civic.unemployed.workers = 15;
cappedEntertainerRoot.civic.entertainer.assigned = 5;
cappedEntertainerRoot.civic.entertainer.workers = 5;
cappedEntertainerRoot.civic.entertainer.max = 5;
cappedEntertainerRoot.resource.Population.amount = 20;
const cappedEntertainerCalls = [];
const cappedEntertainerAutomation = createCapturedOrdinaryJobsAutomation({
  rootState: { readRoot: () => cappedEntertainerRoot },
  controls: {
    capturedElementIds: () => [
      "civ-unemployed",
      "civ-farmer",
      "civ-entertainer",
    ],
    resolve: (elementId) => ({
      elementId,
      generation: 1,
      methods: ["add", "sub", "setDefault"],
    }),
    invoke: (handle, method, args = []) => {
      cappedEntertainerCalls.push({
        elementId: handle.elementId,
        method,
        args,
      });
      if (method === "setDefault") {
        cappedEntertainerRoot.civic.d_job = args[0];
      } else {
        const job = cappedEntertainerRoot.civic[handle.elementId.slice(4)];
        if (method === "sub" && job.workers > 0) job.workers--;
        if (method === "add" && (job.max === -1 || job.workers < job.max))
          job.workers++;
      }
      return { ok: true, value: undefined };
    },
  },
  readSettings: () => ({
    ...resetBreakpoints,
    job_b1_farmer: 0,
    job_b2_farmer: 0,
    job_b3_farmer: 0,
    job_unemployed: true,
    job_farmer: true,
    job_entertainer: true,
    job_s_entertainer: true,
    job_b1_entertainer: 5,
    job_b2_entertainer: 5,
    job_b3_entertainer: 5,
  }),
});
const cappedInput = cappedEntertainerAutomation.reader.readCycle(false);
assert.equal(cappedInput.available, true);
const cappedDecision = planJobs({
  ...cappedInput,
  jobs: cappedInput.jobs.map((job) =>
    job.kind === "entertainer" ? { ...job, smartMaximum: 10 } : job,
  ),
});
assert.equal(
  cappedDecision.assignments.find(({ jobToken }) => jobToken === 19)?.workers,
  5,
);
assert.equal(
  cappedEntertainerAutomation.executor.execute(cappedDecision).status,
  "succeeded",
);
assert.equal(cappedEntertainerRoot.civic.entertainer.workers, 5);
assert.equal(
  cappedEntertainerCalls.some(
    ({ elementId, method }) =>
      elementId === "civ-entertainer" && method === "add",
  ),
  false,
  "native add would refuse an Entertainer beyond civic.entertainer.max",
);
const nextCappedInput = cappedEntertainerAutomation.reader.readCycle(false);
const nextCappedDecision = planJobs({
  ...nextCappedInput,
  jobs: nextCappedInput.jobs.map((job) =>
    job.kind === "entertainer" ? { ...job, smartMaximum: 10 } : job,
  ),
});
assert.equal(
  nextCappedDecision.assignments.find(({ jobToken }) => jobToken === 19)
    ?.workers,
  5,
);
assert.equal(
  cappedEntertainerAutomation.executor.execute(nextCappedDecision).status,
  "succeeded",
  "a fresh cycle never retries the unreachable Entertainer target",
);

zeroEntertainerRoot.city.morale.entertain = 0;
const provenZeroInput = zeroEntertainerAutomation.reader.readCycle(false);
assert.equal(provenZeroInput.authority.entertainerMorale, 0);
assert.equal(
  planJobs(provenZeroInput).assignments.find(({ jobToken }) => jobToken === 19)
    ?.workers,
  0,
  "a proven zero contribution does not retain an Entertainer",
);
const strandedDefaultInput = {
  ...provenZeroInput,
  population: 1,
  defaultJobToken: 3,
  minimumDefault: 0,
  setDefault: false,
  jobs: provenZeroInput.jobs.map((job) => ({
    ...job,
    workers: job.token === 3 ? 1 : 0,
    servants: 0,
    smartMaximum: job.token === 3 ? 0 : 0,
    farmerMinimum: job.token === 3 ? 0 : job.farmerMinimum,
  })),
  defaultPreference: [],
};
const strandedDefaultDecision = planJobs(strandedDefaultInput);
assert.equal(
  strandedDefaultDecision.assignments.find(({ jobToken }) => jobToken === 3)
    ?.workers,
  1,
  "the plan retains an unallocatable native worker in the default pool",
);
assert.equal(
  strandedDefaultDecision.assignments.reduce(
    (total, assignment) => total + assignment.workers,
    0,
  ),
  1,
  "a plan cannot discard the only worker when every managed job is capped",
);
const authorityDisabledDecision = planJobs({
  ...provenZeroInput,
  authority: { ...provenZeroInput.authority, enabled: false, previousCap: 1 },
});
assert.equal(authorityDisabledDecision.authorityEntertainerCap, null);
assert.equal(authorityDisabledDecision.clearAuthorityEntertainerCap, true);

const uninitializedEntertainmentRoot = structuredClone(authorityRoot);
delete uninitializedEntertainmentRoot.city.morale.entertain;
const uninitializedEntertainmentAutomation =
  createCapturedOrdinaryJobsAutomation({
    rootState: { readRoot: () => uninitializedEntertainmentRoot },
    controls: authorityControls,
    readSettings: () => ({
      ...resetBreakpoints,
      authorityManage: true,
      generalMinimumAuthority: 100,
      job_unemployed: true,
      job_farmer: true,
      job_entertainer: true,
    }),
  });
assert.equal(
  uninitializedEntertainmentAutomation.reader.readCycle(false).authority
    .enabled,
  false,
  "an uninitialized entertainment field stands down only the authority cap",
);

const taxTaskAuthorityRoot = structuredClone(authorityRoot);
taxTaskAuthorityRoot.resource.Authority.amount = 50;
taxTaskAuthorityRoot.race = { governor: { tasks: { t0: "tax" } } };
const taxTaskAuthority = createCapturedOrdinaryJobsAutomation({
  rootState: { readRoot: () => taxTaskAuthorityRoot },
  controls: authorityControls,
  readSettings: () => ({
    ...resetBreakpoints,
    authorityManage: true,
    generalMinimumAuthority: 100,
  }),
});
assert.equal(
  taxTaskAuthority.reader.readCycle(false).available,
  true,
  "an active Governor tax task supplies the captured Authority tax gate",
);

const malformedTaxTaskAuthorityRoot = structuredClone(taxTaskAuthorityRoot);
malformedTaxTaskAuthorityRoot.race.governor.tasks = { t0: 1 };
const malformedTaxTaskAuthority = createCapturedOrdinaryJobsAutomation({
  rootState: { readRoot: () => malformedTaxTaskAuthorityRoot },
  controls: authorityControls,
  readSettings: () => ({
    ...resetBreakpoints,
    authorityManage: true,
    generalMinimumAuthority: 100,
  }),
});
assert.equal(
  malformedTaxTaskAuthority.reader.readCycle(false).available,
  false,
  "malformed Governor task state remains fail-closed",
);

const nobleAuthorityRoot = structuredClone(authorityRoot);
nobleAuthorityRoot.resource.Authority.amount = 50;
nobleAuthorityRoot.civic.taxes.tax_rate = 15;
nobleAuthorityRoot.race = { noble: 1 };
const nobleAuthority = createCapturedOrdinaryJobsAutomation({
  rootState: { readRoot: () => nobleAuthorityRoot },
  controls: authorityControls,
  readSettings: () => ({
    ...resetBreakpoints,
    authorityManage: true,
    generalMinimumAuthority: 100,
    autoTax: true,
    generalRequestedTaxRate: 25,
  }),
});
assert.equal(
  nobleAuthority.reader.readCycle(false).available,
  true,
  "Noble rank supplies the captured tax minimum and maximum",
);

const terrifyingAuthorityRoot = structuredClone(authorityRoot);
terrifyingAuthorityRoot.resource.Authority.amount = 50;
terrifyingAuthorityRoot.civic.taxes.tax_rate = 45;
terrifyingAuthorityRoot.race = { terrifying: 1 };
const terrifyingAuthority = createCapturedOrdinaryJobsAutomation({
  rootState: { readRoot: () => terrifyingAuthorityRoot },
  controls: authorityControls,
  readSettings: () => ({
    ...resetBreakpoints,
    authorityManage: true,
    generalMinimumAuthority: 100,
    autoTax: true,
    generalRequestedTaxRate: 50,
  }),
});
assert.equal(
  terrifyingAuthority.reader.readCycle(false).available,
  true,
  "Terrifying supplies the captured additional tax capacity",
);

const wishAuthorityRoot = structuredClone(authorityRoot);
wishAuthorityRoot.resource.Authority.amount = 50;
wishAuthorityRoot.civic.taxes.tax_rate = 45;
wishAuthorityRoot.race = { wish: true, wishStats: { tax: 20 } };
const wishAuthority = createCapturedOrdinaryJobsAutomation({
  rootState: { readRoot: () => wishAuthorityRoot },
  controls: authorityControls,
  readSettings: () => ({
    ...resetBreakpoints,
    authorityManage: true,
    generalMinimumAuthority: 100,
    autoTax: true,
    generalRequestedTaxRate: 50,
  }),
});
assert.equal(
  wishAuthority.reader.readCycle(false).available,
  true,
  "Wish tax state supplies the captured additional tax capacity",
);

const oligarchyAuthorityRoot = structuredClone(authorityRoot);
oligarchyAuthorityRoot.resource.Authority.amount = 50;
oligarchyAuthorityRoot.civic.taxes.tax_rate = 30;
oligarchyAuthorityRoot.civic.govern.type = "oligarchy";
const oligarchyAuthority = createCapturedOrdinaryJobsAutomation({
  rootState: { readRoot: () => oligarchyAuthorityRoot },
  controls: authorityControls,
  readSettings: () => ({
    ...resetBreakpoints,
    authorityManage: true,
    generalMinimumAuthority: 100,
    autoTax: true,
    generalRequestedTaxRate: 35,
  }),
});
assert.equal(
  oligarchyAuthority.reader.readCycle(false).available,
  true,
  "Oligarchy supplies the captured government tax capacity",
);

const partialAutomation = createCapturedOrdinaryJobsAutomation({
  rootState: { readRoot: () => root },
  controls: {
    ...controls,
    capturedElementIds: () => ["civ-unemployed"],
    resolve: (elementId) =>
      elementId === "civ-unemployed"
        ? {
            elementId,
            generation: 1,
            methods: ["add", "sub", "setDefault"],
          }
        : undefined,
  },
  readSettings: () => ({ job_unemployed: true, job_farmer: true }),
});
assert.equal(
  partialAutomation.reader.readCycle(false).available,
  false,
  "a partial live job catalog cannot plan against uncaptured workers",
);

const fullRoot = {
  civic: {
    d_job: "unemployed",
    unemployed: {
      job: "unemployed",
      assigned: 4,
      workers: 4,
      max: 0,
      display: true,
    },
    farmer: {
      job: "farmer",
      assigned: 1,
      workers: 1,
      max: -1,
      display: true,
    },
    // Unlocked but switched off, so the catalog carries it and the planner input does not. The
    // full-jobs executor finds the first crafting job by the ordinary command list's length, so a
    // command list built from the catalog rather than the input would misaddress every craft job.
    lumberjack: {
      job: "lumberjack",
      assigned: 0,
      workers: 0,
      max: -1,
      display: true,
    },
    // DeadSpace keeps Craftsman in civic state but exposes its worker control through #foundry.
    craftsman: { job: "craftsman", workers: 0, max: 2 },
  },
  city: {
    foundry: {
      Plywood: 0,
      Brick: 0,
      crafting: 0,
      cap: 2,
      rcap: {},
    },
  },
  race: {
    servants: {
      jobs: { farmer: 0 },
      sjobs: { Plywood: 0 },
      max: 1,
      used: 0,
      smax: 1,
      sused: 0,
    },
  },
  resource: {
    Population: { amount: 5, max: 10 },
    Food: { amount: 10, max: 100, diff: 0 },
    Plywood: { amount: 100 },
    Brick: { amount: 0 },
    Iron: { amount: 100 },
  },
};
const fullCalls = [];
let fullControlFailure;
let fullIgnoreControls = false;
const fullControls = {
  capturedElementIds: () => [
    "civ-unemployed",
    "civ-farmer",
    "civ-lumberjack",
    "servant-farmer",
    "foundry",
    "skilledServants",
  ],
  resolve: (elementId) => {
    if (
      fullControlFailure?.elementId === elementId &&
      fullControlFailure.missingControl
    ) {
      return undefined;
    }
    if (
      elementId !== "foundry" &&
      !elementId.startsWith("civ-") &&
      elementId !== "skilledServants" &&
      !elementId.startsWith("servant-")
    ) {
      return undefined;
    }
    let methods =
      elementId === "foundry" ||
      elementId === "skilledServants" ||
      elementId.startsWith("servant-")
        ? ["add", "sub"]
        : ["add", "sub", "setDefault"];
    if (fullControlFailure?.elementId === elementId) {
      methods = methods.filter(
        (method) => method !== fullControlFailure.missingMethod,
      );
    }
    return { elementId, generation: 1, methods };
  },
  invoke: (handle, method, args = []) => {
    fullCalls.push({ elementId: handle.elementId, method, args });
    if (fullIgnoreControls) return { ok: true, value: undefined };
    if (handle.elementId === "skilledServants") {
      const id = args[0];
      fullRoot.race.servants.sjobs[id] =
        (fullRoot.race.servants.sjobs[id] ?? 0) + (method === "add" ? 1 : -1);
      fullRoot.race.servants.sused += method === "add" ? 1 : -1;
    } else if (handle.elementId.startsWith("servant-")) {
      const id = handle.elementId.slice("servant-".length);
      fullRoot.race.servants.jobs[id] =
        (fullRoot.race.servants.jobs[id] ?? 0) + (method === "add" ? 1 : -1);
      fullRoot.race.servants.used += method === "add" ? 1 : -1;
    } else if (handle.elementId === "foundry") {
      const id = args[0];
      fullRoot.city.foundry[id] += method === "add" ? 1 : -1;
      fullRoot.city.foundry.crafting += method === "add" ? 1 : -1;
      fullRoot.civic.craftsman.workers += method === "add" ? 1 : -1;
      const defaultJob = fullRoot.civic[fullRoot.civic.d_job];
      defaultJob.workers += method === "add" ? -1 : 1;
    } else if (method === "setDefault") {
      fullRoot.civic.d_job = args[0];
    } else {
      const id = handle.elementId.slice("civ-".length);
      fullRoot.civic[id].workers += method === "add" ? 1 : -1;
    }
    return { ok: true, value: undefined };
  },
};
let fullManageServants = true;
let fullBuildingWeighting = false;
let fullMultiplierLatch = false;
let fullRootIdentity;
let fullBuildTargetReads = 0;
let fullBuildCostReads = 0;
const fullPerfCounts = new Map();
const fullPerfPhases = new Map();
let fullDemandReads = 0;
let fullCraftCostReads = 0;
const fullDiagnostics = {
  readPerformanceEnabled: () => true,
  nowMs: () => performance.now(),
  recordPerformance: (phase, duration) =>
    fullPerfPhases.set(phase, (fullPerfPhases.get(phase) ?? 0) + duration),
  recordCount: (name, amount) =>
    fullPerfCounts.set(name, (fullPerfCounts.get(name) ?? 0) + amount),
  flushPerformance: () => {},
};
const fullAutomation = createCapturedFullJobsAutomation({
  rootState: { readRoot: () => fullRootIdentity ?? fullRoot },
  controls: fullControls,
  keyState: { readMultiplierLatch: () => fullMultiplierLatch },
  readSettings: () => ({
    ...resetBreakpoints,
    job_unemployed: true,
    job_farmer: true,
    job_lumberjack: false,
    job_s_farmer: true,
    jobSetDefault: true,
    productionCraftsmen: "always",
    jobManageServants: fullManageServants,
    craftPlywood: true,
    job_Plywood: true,
    foundry_w_Plywood: 1,
    craftBrick: true,
    job_Brick: true,
    foundry_w_Brick: 1,
    productionFoundryWeighting: fullBuildingWeighting
      ? "buildings"
      : "demanded",
  }),
  costs: {
    read: (id) => {
      fullCraftCostReads++;
      return id === "Plywood" || id === "Brick"
        ? new Map([["Iron", 1]])
        : undefined;
    },
  },
  readDemand: () => {
    fullDemandReads++;
    return {
      isDemanded: () => true,
      storageRequired: () => 100,
    };
  },
  readBuildTargets: () => {
    fullBuildTargetReads++;
    return [{ key: "housing", elementId: "city-housing", weighting: 1 }];
  },
  buildCosts: {
    readCost: () => {
      fullBuildCostReads++;
      return { cost: { Plywood: 1 }, pool: undefined };
    },
  },
  diagnostics: fullDiagnostics,
});
const fullPrepared = fullAutomation.prepare();
assert.equal(fullPrepared.status, "ready");
assert.equal(fullPerfCounts.get("jobs.full.readFullCycleCalls"), 1);
assert.equal(fullPerfCounts.get("jobs.full.jobCatalogReads"), 1);
assert.equal(fullPerfCounts.get("jobs.full.craftsmenCycleReads"), 1);
assert.equal(fullPerfCounts.get("jobs.full.demandReads"), 1);
assert.equal(fullPerfCounts.get("jobs.full.planCalls"), 1);
assert.equal(
  fullDemandReads,
  1,
  "ordinary jobs and Foundry share the exact demand sample",
);
assert.equal(
  fullCraftCostReads,
  2,
  "each present product captures its recipe cost once",
);
assert.equal(fullPerfCounts.get("jobs.full.buildTargetReads") ?? 0, 0);
assert.equal(fullPerfCounts.get("jobs.full.buildCostReads") ?? 0, 0);
assert.ok(fullPerfPhases.has("jobs.full.read"));
assert.ok(fullPerfPhases.has("jobs.full.craftsmen"));
assert.deepEqual(
  planJobs(fullPrepared.input),
  fullPrepared.execution.decision,
  "the prepared decision is the planner result for its authoritative snapshot",
);
fullBuildingWeighting = true;
const readsBeforeBuildings = fullBuildTargetReads;
const costsBeforeBuildings = fullBuildCostReads;
const weightedPrepared = fullAutomation.prepare();
assert.equal(weightedPrepared.status, "ready");
assert.equal(fullBuildTargetReads, readsBeforeBuildings + 1);
assert.equal(fullBuildCostReads, costsBeforeBuildings + 1);
assert.equal(fullPerfCounts.get("jobs.full.buildTargetReads"), 1);
assert.equal(fullPerfCounts.get("jobs.full.buildCostReads"), 1);
fullBuildingWeighting = false;
const fullInput = fullPrepared.input;
assert.equal(fullInput.available, true);
const fullDecision = fullPrepared.execution.decision;
assert.ok(fullDecision);
assert.equal(
  fullDecision.assignments.some(
    ({ jobToken, workers }) => jobToken >= 2 && workers > 0,
  ),
  true,
);
const fullStateBeforePreflight = structuredClone(fullRoot);
fullControlFailure = {
  elementId: "skilledServants",
  missingControl: true,
};
assert.equal(
  weightedPrepared.execution.execute().status,
  "deferred",
  "a missing later skilled-servant control defers the whole full decision",
);
assert.deepEqual(
  fullCalls,
  [],
  "preflight must precede every captured mutation",
);
assert.deepEqual(fullRoot, fullStateBeforePreflight);

// The full executor must not commit lastPopulation/lastFarmer history when preflight defers.
fullRoot.resource.Population.amount = fullDecision.lastPopulationCount + 2;
fullRoot.civic.farmer.workers = fullDecision.lastFarmerCount + 2;
const afterRejectedHistoryPrepared = fullAutomation.prepare();
assert.equal(afterRejectedHistoryPrepared.status, "ready");
const afterRejectedHistoryInput = afterRejectedHistoryPrepared.input;
assert.equal(afterRejectedHistoryInput.available, true);
assert.equal(
  afterRejectedHistoryInput.jobs.find(({ id }) => id === "farmer")
    ?.smartMaximum,
  fullDecision.lastFarmerCount + 2,
  "without accepted history, the captured low-food fallback retains the current Farmer count",
);
for (const key of Object.keys(fullRoot)) delete fullRoot[key];
Object.assign(fullRoot, structuredClone(fullStateBeforePreflight));

fullControlFailure = {
  elementId: "skilledServants",
  missingMethod: "add",
};
const retryPrepared = fullAutomation.prepare();
assert.equal(retryPrepared.status, "ready");
assert.equal(
  retryPrepared.execution.execute().status,
  "deferred",
  "an existing captured handle without the required method also defers before mutation",
);
assert.deepEqual(fullCalls, []);
assert.deepEqual(fullRoot, fullStateBeforePreflight);

fullControlFailure = undefined;
const readsBeforeSuccessfulPrepare = fullPerfCounts.get(
  "jobs.full.readFullCycleCalls",
);
const successfulPrepared = fullAutomation.prepare();
assert.equal(successfulPrepared.status, "ready");
const fullOutcome = successfulPrepared.execution.execute();
assert.equal(fullOutcome.status, "succeeded", JSON.stringify(fullOutcome));
assert.equal(fullRoot.city.foundry.Brick, 2);
assert.equal(
  fullRoot.civic.unemployed.workers,
  fullDecision.assignments.find(({ jobToken }) => jobToken === 0)?.workers,
  "Foundry's worker transfer is included in the default-job target",
);
assert.equal(
  fullCalls.filter(
    ({ elementId, method }) => elementId === "foundry" && method === "add",
  ).length,
  2,
  "the Foundry gain transfers both workers through the default job before its own delta",
);
assert.equal(
  fullPerfCounts.get("jobs.full.readFullCycleCalls"),
  readsBeforeSuccessfulPrepare + 1,
  "one read per explicit prepare; execute and postcondition do not resample",
);
assert.equal(
  fullCalls.some(({ elementId }) => elementId === "foundry"),
  true,
);
assert.equal(
  fullCalls.some(({ elementId }) => elementId === "skilledServants"),
  true,
);
assert.equal(
  fullCalls.some(({ elementId }) => elementId === "servant-farmer"),
  true,
);
assert.equal(
  fullCalls.some(({ elementId }) => elementId === "civ-lumberjack"),
  false,
  "a switched-off job is left alone rather than commanded",
);
assert.equal(fullRoot.civic.lumberjack.workers, 0);
const fullPostSuccessState = structuredClone(fullRoot);
const successfulMethods = [
  ...new Map(
    fullCalls.map(({ elementId, method }) => [method, { elementId, method }]),
  ).values(),
];
for (const method of ["add", "sub", "setDefault"]) {
  const requirement = successfulMethods.find(
    (entry) => entry.method === method,
  );
  assert.ok(requirement, `the combined fixture exercises ${method}`);
  for (const key of Object.keys(fullRoot)) delete fullRoot[key];
  Object.assign(fullRoot, structuredClone(fullStateBeforePreflight));
  fullControlFailure = undefined;
  const missingPrepared = fullAutomation.prepare();
  assert.equal(missingPrepared.status, "ready");
  fullControlFailure = {
    elementId: requirement.elementId,
    missingMethod: requirement.method,
  };
  const callsBeforeMissingCapability = fullCalls.length;
  assert.equal(
    missingPrepared.execution.execute().status,
    "deferred",
    `missing ${method} must defer before the first mutation`,
  );
  assert.equal(fullCalls.length, callsBeforeMissingCapability);
  assert.deepEqual(fullRoot, fullStateBeforePreflight);
}
fullControlFailure = undefined;
fullIgnoreControls = true;
for (const key of Object.keys(fullRoot)) delete fullRoot[key];
Object.assign(fullRoot, structuredClone(fullStateBeforePreflight));
const ignoredMutationPrepared = fullAutomation.prepare();
assert.equal(ignoredMutationPrepared.status, "ready");
assert.equal(
  ignoredMutationPrepared.execution.execute().failure?.code,
  "full-jobs-postcondition-failed",
  "successful native return values do not replace the live assignment postcondition",
);
assert.deepEqual(fullRoot, fullStateBeforePreflight);
fullIgnoreControls = false;
for (const key of Object.keys(fullRoot)) delete fullRoot[key];
Object.assign(fullRoot, fullPostSuccessState);

const callsBeforeNoop = fullCalls.length;
const postconditionsBeforeNoop = fullPerfPhases.get("jobs.full.postcondition");
const noopPrepared = fullAutomation.prepare();
assert.equal(noopPrepared.status, "ready");
assert.equal(noopPrepared.execution.execute().status, "succeeded");
assert.equal(
  fullCalls.length,
  callsBeforeNoop,
  "a no-op plan invokes no controls",
);
assert.equal(
  fullPerfPhases.get("jobs.full.postcondition"),
  postconditionsBeforeNoop,
  "a no-op plan does not resample a postcondition",
);
assert.equal(
  noopPrepared.execution.execute().failure?.code,
  "full-jobs-session-consumed",
  "a prepared session is one-shot",
);

const callsBeforeSuperseded = fullCalls.length;
const supersededPrepared = fullAutomation.prepare();
assert.equal(supersededPrepared.status, "ready");
const currentPrepared = fullAutomation.prepare();
assert.equal(currentPrepared.status, "ready");
assert.equal(
  supersededPrepared.execution.execute().failure?.code,
  "full-jobs-session-superseded",
  "a newer prepare invalidates every older prepared session",
);
assert.equal(fullCalls.length, callsBeforeSuperseded);

const callsBeforeStale = fullCalls.length;
const staleRootPrepared = fullAutomation.prepare();
assert.equal(staleRootPrepared.status, "ready");
fullRootIdentity = structuredClone(fullRoot);
assert.equal(
  staleRootPrepared.execution.execute().failure?.code,
  "full-jobs-root-changed",
);
fullRootIdentity = undefined;
assert.equal(
  fullCalls.length,
  callsBeforeStale,
  "root replacement rejects before mutation",
);

const staleWorkerPrepared = fullAutomation.prepare();
assert.equal(staleWorkerPrepared.status, "ready");
fullRoot.civic.farmer.workers++;
assert.equal(
  staleWorkerPrepared.execution.execute().failure?.code,
  "full-jobs-state-changed",
);
fullRoot.civic.farmer.workers--;
assert.equal(
  fullCalls.length,
  callsBeforeStale,
  "changed ordinary workers reject before mutation",
);

const staleFoundryPrepared = fullAutomation.prepare();
assert.equal(staleFoundryPrepared.status, "ready");
fullRoot.city.foundry.Plywood++;
assert.equal(
  staleFoundryPrepared.execution.execute().failure?.code,
  "full-jobs-state-changed",
);
fullRoot.city.foundry.Plywood--;
assert.equal(
  fullCalls.length,
  callsBeforeStale,
  "changed Foundry workers reject before mutation",
);

const staleServantPrepared = fullAutomation.prepare();
assert.equal(staleServantPrepared.status, "ready");
fullRoot.race.servants.jobs.farmer++;
assert.equal(
  staleServantPrepared.execution.execute().failure?.code,
  "full-jobs-state-changed",
);
fullRoot.race.servants.jobs.farmer--;
assert.equal(
  fullCalls.length,
  callsBeforeStale,
  "changed servants reject before mutation",
);

const staleSkilledPrepared = fullAutomation.prepare();
assert.equal(staleSkilledPrepared.status, "ready");
fullRoot.race.servants.sjobs.Plywood++;
assert.equal(
  staleSkilledPrepared.execution.execute().failure?.code,
  "full-jobs-state-changed",
);
fullRoot.race.servants.sjobs.Plywood--;
assert.equal(
  fullCalls.length,
  callsBeforeStale,
  "changed skilled servants reject before mutation",
);

const servantsBeforeDisabling = structuredClone(fullRoot.race.servants);
const callsBeforeDisabling = fullCalls.length;
fullManageServants = false;
const servantsDisabledPrepared = fullAutomation.prepare();
assert.equal(servantsDisabledPrepared.status, "ready");
const servantsDisabledInput = servantsDisabledPrepared.input;
assert.equal(servantsDisabledInput.manageServants, false);
assert.equal(servantsDisabledInput.servantsMaximum, 0);
assert.equal(servantsDisabledInput.skilledServantsMaximum, 0);
const servantsDisabledOutcome = servantsDisabledPrepared.execution.execute();
assert.equal(servantsDisabledOutcome.status, "succeeded");
assert.equal(
  fullCalls
    .slice(callsBeforeDisabling)
    .some(
      ({ elementId }) =>
        elementId.startsWith("servant-") || elementId === "skilledServants",
    ),
  false,
  "the combined executor obeys the sampled jobManageServants authority",
);
assert.deepEqual(fullRoot.race.servants, servantsBeforeDisabling);

// Miner reservation reuses the planner's single-Miner rule, while captured inputs reproduce the
// two legacy resource ratios from their real root fields and demand sample.
function minerRoot(race, population = { amount: 5, max: 10 }) {
  return {
    civic: {
      d_job: "unemployed",
      unemployed: {
        job: "unemployed",
        assigned: 5,
        workers: 3,
        max: 0,
        display: true,
      },
      miner: {
        job: "miner",
        assigned: 2,
        workers: 2,
        max: -1,
        display: true,
      },
    },
    race: { species: "Population", ...race },
    resource: {
      Population: population,
      Horseshoe: { amount: 5, max: 100 },
      Copper: { amount: 0, max: 100 },
    },
  };
}
const minerControlIds = ["civ-unemployed", "civ-miner"];
const minerControls = {
  capturedElementIds: () => minerControlIds,
  resolve: (elementId) =>
    minerControlIds.includes(elementId)
      ? {
          elementId,
          generation: 1,
          methods: ["add", "sub", "setDefault"],
        }
      : undefined,
  invoke: () => ({ ok: true, value: undefined }),
};
const minerSettings = {
  autoJobs: true,
  job_unemployed: true,
  job_miner: true,
  job_s_miner: true,
  job_b1_unemployed: 0,
  job_b2_unemployed: 0,
  job_b3_unemployed: 0,
  job_b1_miner: 0,
  job_b2_miner: 0,
  job_b3_miner: 0,
};
const horseshoeDemand = (storageRequired) => () => ({
  isDemanded: () => false,
  storageRequired: (id) => (id === "Horseshoe" ? storageRequired : 0),
  requestedQuantity: () => 0,
});
const hoovedMinerRoot = minerRoot({ hooved: true });
const hoovedMinerAutomation = createCapturedOrdinaryJobsAutomation({
  rootState: { readRoot: () => hoovedMinerRoot },
  controls: minerControls,
  readSettings: () => minerSettings,
  readDemand: horseshoeDemand(10),
});
const hoovedMinerInput = hoovedMinerAutomation.reader.readCycle(false);
assert.equal(hoovedMinerInput.reserveMiner, true);
const hoovedMinerDecision = planJobs(hoovedMinerInput);
assert.equal(
  hoovedMinerDecision.assignments.find(
    ({ jobToken }) =>
      hoovedMinerInput.jobs.find((job) => job.token === jobToken)?.id ===
      "miner",
  )?.workers,
  1,
  "a Hooved Miner stays assigned when Horseshoe is below its useful-storage ratio",
);
assert.equal(
  readCapturedMinerReservation(
    minerRoot({ hooved: true }),
    minerSettings,
    horseshoeDemand(5),
  ),
  false,
  "usefulness is amount / min(maximum, committed storage), not amount / maximum",
);
assert.equal(
  readCapturedMinerReservation(minerRoot({ artifical: true }), minerSettings),
  true,
  "Artificial races reserve a Miner while Population storage is below capacity",
);
assert.equal(
  readCapturedMinerReservation(
    minerRoot({ artifical: true, deconstructor: true }),
    minerSettings,
  ),
  false,
  "Deconstructors skip the Artificial population reserve",
);
assert.equal(
  readCapturedMinerReservation(
    {
      ...minerRoot({ hooved: true }),
      galaxy: { starbase: { count: 1 } },
    },
    { ...minerSettings, jobDisableMiners: true },
    horseshoeDemand(10),
  ),
  false,
  "the Gateway Starbase miner-disable gate suppresses the reserve",
);
assert.equal(
  readCapturedMinerReservation(
    {
      ...minerRoot({ hooved: true, sappy: true, smoldering: true }),
      galaxy: { starbase: { count: 1 } },
    },
    { ...minerSettings, jobDisableMiners: true },
    horseshoeDemand(10),
  ),
  true,
  "Sappy plus Smoldering keeps the old miner-disable exception",
);
assert.equal(
  readCapturedMinerReservation(minerRoot({ artifical: true }), minerSettings),
  true,
  "an uninitialized Gateway Starbase count is treated as zero",
);

// Full jobs preflights every worker, servant, skilled-servant, and default control before its first
// mutation. DeadSpace captures the skilled servant methods from one #skilledServants component.

const fullConsumedResourceRoot = {
  civic: {
    d_job: "lumberjack",
    lumberjack: {
      job: "lumberjack",
      assigned: 1,
      workers: 1,
      max: -1,
      display: true,
    },
  },
  resource: {
    Population: { amount: 1, max: 10 },
    Lumber: { amount: 100, max: 100, diff: -2 },
  },
  race: {},
};
const fullConsumedResourceCatalog = createCapturedJobCatalogReader({
  rootState: { readRoot: () => fullConsumedResourceRoot },
  controls: {
    capturedElementIds: () => ["civ-lumberjack"],
    resolve: (elementId) =>
      elementId === "civ-lumberjack"
        ? {
            elementId,
            generation: 1,
            methods: ["add", "sub", "setDefault"],
          }
        : undefined,
    invoke: () => ({ ok: false, reason: "unknown-control" }),
  },
  readSettings: () => ({
    job_s_lumberjack: true,
    job_lumberjack: true,
    job_b1_lumberjack: -1,
    job_b2_lumberjack: -1,
    job_b3_lumberjack: -1,
  }),
});
assert.equal(
  fullConsumedResourceCatalog()?.jobs[0]?.smartMaximum,
  Number.MAX_SAFE_INTEGER,
  "a full resource with a negative live rate remains useful to its smart worker",
);

const idleFullResourceRoot = structuredClone(fullConsumedResourceRoot);
idleFullResourceRoot.resource.Lumber.diff = 0;
const idleFullResourceCatalog = createCapturedJobCatalogReader({
  rootState: { readRoot: () => idleFullResourceRoot },
  controls: {
    capturedElementIds: () => ["civ-lumberjack"],
    resolve: (elementId) =>
      elementId === "civ-lumberjack"
        ? {
            elementId,
            generation: 1,
            methods: ["add", "sub", "setDefault"],
          }
        : undefined,
    invoke: () => ({ ok: false, reason: "unknown-control" }),
  },
  readSettings: () => ({
    job_s_lumberjack: true,
    job_lumberjack: true,
    job_b1_lumberjack: -1,
    job_b2_lumberjack: -1,
    job_b3_lumberjack: -1,
  }),
});
assert.equal(
  idleFullResourceCatalog()?.jobs[0]?.smartMaximum,
  1,
  "a resource the capture cannot prove useless retains its current pool instead of taking the whole catalog down",
);

const servantlessRoot = structuredClone(root);
servantlessRoot.civic.unemployed.workers = 3;
servantlessRoot.civic.farmer.workers = 0;
const servantlessAutomation = createCapturedOrdinaryJobsAutomation({
  rootState: { readRoot: () => servantlessRoot },
  controls,
  readSettings: () => ({
    ...resetBreakpoints,
    autoJobs: true,
    jobManageServants: true,
  }),
});
const servantlessInput = servantlessAutomation.reader.readCycle(false);
assert.equal(
  servantlessInput.available,
  true,
  "a race without servants keeps the ordinary cycle available while jobManageServants is on",
);
assert.equal(servantlessInput.servantsMaximum, 0);

const countRoot = structuredClone(fullRoot);
countRoot.civic.d_job = "unemployed";
countRoot.civic.miner = {
  job: "miner",
  assigned: 2,
  workers: 2,
  max: -1,
  display: true,
};
countRoot.civic.farmer.workers = 4;
countRoot.civic.hunter = {
  job: "hunter",
  assigned: 3,
  workers: 3,
  max: -1,
  display: true,
};
countRoot.race.high_pop = 1;
countRoot.race.servants.jobs = { farmer: 2, hunter: 1 };
countRoot.race.servants.max = 3;
countRoot.race.servants.used = 3;
const countIds = ["miner", "farmer", "hunter", "archaeologist"];
const countControls = {
  capturedElementIds: () => [
    "civ-unemployed",
    "civ-farmer",
    "civ-lumberjack",
    "civ-miner",
    "civ-hunter",
  ],
  resolve: (elementId) => ({
    elementId,
    generation: 1,
    methods: ["add", "sub", "setDefault"],
  }),
};
const fullCountCatalog = createCapturedJobCatalogReader({
  rootState: { readRoot: () => countRoot },
  controls: countControls,
  readSettings: () => ({ autoJobs: false }),
});
const sameCounts = () => {
  const snapshot = readCapturedJobCountSnapshot(countRoot, countIds);
  const catalog = fullCountCatalog();
  assert.ok(snapshot);
  assert.ok(catalog);
  assert.deepEqual(
    countIds.slice(0, 3).map((id) => snapshot.readCount(id)),
    countIds
      .slice(0, 3)
      .map((id) => catalog.jobs.find((job) => job.id === id)?.count),
  );
  return snapshot;
};
const initialCounts = sameCounts();
assert.deepEqual(
  countIds.map((id) => initialCounts.readCount(id)),
  [2, 12, 7, 0],
);
const readLocallyMalformedCatalog = (field, value) => {
  const malformedRoot = structuredClone(countRoot);
  malformedRoot.civic.miner[field] = value;
  const skipped = [];
  const read = createCapturedJobCatalogReader({
    rootState: { readRoot: () => malformedRoot },
    controls: countControls,
    readSettings: () => ({ ...resetBreakpoints, autoJobs: false }),
    onSkipped: (controlId, reason) => skipped.push({ controlId, reason }),
  });
  const catalog = read();
  assert.ok(catalog, `malformed Miner ${field} must not remove the catalog`);
  assert.equal(
    catalog.jobs.some((job) => job.id === "miner"),
    false,
  );
  assert.equal(
    catalog.jobs.some((job) => job.id === "farmer"),
    true,
  );
  return { malformedRoot, skipped };
};
const malformedWorkers = readLocallyMalformedCatalog("workers", Number.NaN);
assert.deepEqual(malformedWorkers.skipped, [
  { controlId: "civ-miner", reason: "ordinary job worker count is not finite" },
]);
assert.equal(
  readCapturedJobCountSnapshot(malformedWorkers.malformedRoot, ["miner"]),
  undefined,
);
for (const [field, value, reason] of [
  ["max", Number.NaN, "ordinary job maximum is not finite"],
  ["display", "bad", "ordinary job visibility is not boolean"],
]) {
  const malformed = readLocallyMalformedCatalog(field, value);
  assert.deepEqual(malformed.skipped, [{ controlId: "civ-miner", reason }]);
  // Local validation precedes servant processing even if this skipped job has bad servants.
  malformed.malformedRoot.race.servants.jobs.miner = "bad";
  const skipped = [];
  const catalog = createCapturedJobCatalogReader({
    rootState: { readRoot: () => malformed.malformedRoot },
    controls: countControls,
    readSettings: () => ({ ...resetBreakpoints, autoJobs: false }),
    onSkipped: (controlId, skipReason) =>
      skipped.push({ controlId, reason: skipReason }),
  })();
  assert.ok(catalog);
  assert.equal(
    catalog.jobs.some((job) => job.id === "farmer"),
    true,
  );
  assert.deepEqual(skipped, [{ controlId: "civ-miner", reason }]);
}
const malformedServantsRoot = structuredClone(countRoot);
malformedServantsRoot.race.servants.jobs.farmer = "bad";
assert.equal(
  readCapturedJobCountSnapshot(malformedServantsRoot, ["farmer"]),
  undefined,
);
const servantSkips = [];
assert.equal(
  createCapturedJobCatalogReader({
    rootState: { readRoot: () => malformedServantsRoot },
    controls: countControls,
    readSettings: () => ({ ...resetBreakpoints, autoJobs: false }),
    onSkipped: (controlId, reason) => servantSkips.push({ controlId, reason }),
  })(),
  undefined,
);
assert.deepEqual(servantSkips, [
  {
    controlId: "civ-farmer",
    reason: "ordinary job servant count is not finite",
  },
]);
const badSplitCatalog = createCapturedJobCatalogReader({
  rootState: { readRoot: () => countRoot },
  controls: countControls,
  readSettings: () => ({ autoJobs: false, jobLumberWeighting: "malformed" }),
});
assert.equal(
  badSplitCatalog(),
  undefined,
  "the full Jobs catalog rejects malformed split policy",
);
assert.equal(
  readCapturedJobCountSnapshot(countRoot, countIds)?.readCount("miner"),
  2,
);
const noDefaultCatalog = createCapturedJobCatalogReader({
  rootState: { readRoot: () => countRoot },
  controls: {
    ...countControls,
    capturedElementIds: () => ["civ-miner", "civ-farmer"],
  },
  readSettings: () => ({ autoJobs: false }),
});
assert.equal(
  noDefaultCatalog(),
  undefined,
  "the full Jobs catalog requires its default control",
);
assert.equal(
  readCapturedJobCountSnapshot(countRoot, countIds)?.readCount("farmer"),
  12,
);
countRoot.civic.miner.workers = 8;
assert.equal(
  initialCounts.readCount("miner"),
  2,
  "count snapshot does not lazily reread root",
);
assert.equal(sameCounts().readCount("miner"), 8);
countRoot.civic.miner.workers = 2;
countRoot.race.high_pop = 2;
assert.deepEqual(
  [
    readCapturedJobStackMultiplier(countRoot),
    sameCounts().readCount("farmer"),
    sameCounts().readCount("hunter"),
  ],
  [7, 18, 10],
);
delete countRoot.race.servants.jobs.hunter;
assert.equal(
  sameCounts().readCount("hunter"),
  3,
  "absent servant assignment is zero",
);
delete countRoot.race.servants;
assert.deepEqual(
  [sameCounts().readCount("farmer"), sameCounts().readCount("hunter")],
  [4, 3],
  "a species without servants uses workers only",
);
countRoot.civic.miner.workers = Number.NaN;
assert.equal(readCapturedJobCountSnapshot(countRoot, countIds), undefined);
countRoot.civic.miner.workers = 2;
countRoot.race.servants = { jobs: { farmer: "bad" } };
assert.equal(readCapturedJobCountSnapshot(countRoot, countIds), undefined);

const noCivicControls = createCapturedOrdinaryJobsAutomation({
  rootState: { readRoot: () => countRoot },
  controls: {
    capturedElementIds: () => {
      throw new Error("Jobs controls must not be read");
    },
    resolve: () => undefined,
  },
  readSettings: () => {
    throw new Error("Jobs settings must not be read");
  },
  readDemand: () => {
    throw new Error("Jobs demand must not be read");
  },
});
countRoot.race.servants = { jobs: { farmer: 2, hunter: 1 } };
assert.deepEqual(
  countIds.map((id) =>
    noCivicControls.readJobCounts(countRoot, countIds)?.readCount(id),
  ),
  [2, 18, 10, 0],
  "root counts survive missing controls, incomplete servant pools and bad split settings",
);

const multiplierRoot = structuredClone(noOpRoot);
multiplierRoot.settings = { mKeys: true };
let ordinaryMultiplierLatch;
const ordinaryMultiplierCalls = [];
const ordinaryMultiplierControls = {
  capturedElementIds: () => controls.capturedElementIds(),
  resolve: (elementId) => controls.resolve(elementId),
  invoke: (handle, method, args = []) => {
    ordinaryMultiplierCalls.push({ elementId: handle.elementId, method, args });
    if (method === "setDefault") {
      multiplierRoot.civic.d_job = args[0];
    } else {
      const id = handle.elementId.slice("civ-".length);
      multiplierRoot.civic[id].workers += method === "add" ? 1 : -1;
    }
    return { ok: true, value: undefined };
  },
};
const ordinaryMultiplierAutomation = createCapturedOrdinaryJobsAutomation({
  rootState: { readRoot: () => multiplierRoot },
  controls: ordinaryMultiplierControls,
  keyState: { readMultiplierLatch: () => ordinaryMultiplierLatch },
  readSettings: () => ({
    ...resetBreakpoints,
    job_b1_unemployed: 0,
    job_b2_unemployed: 0,
    job_b3_unemployed: 0,
    job_unemployed: true,
    job_farmer: true,
    jobSetDefault: true,
  }),
});
const ordinaryUnknownPrepared =
  ordinaryMultiplierAutomation.reader.readCycle(false);
const ordinaryUnknownDecision = planJobs(ordinaryUnknownPrepared);
assert.ok(
  ordinaryUnknownDecision?.assignments.some(
    (assignment) =>
      assignment.workers !==
      ordinaryUnknownPrepared.jobs.find(
        (job) => job.token === assignment.jobToken,
      )?.workers,
  ),
  `unknown-latch fixture requires a real worker assignment: ${JSON.stringify({ available: ordinaryUnknownPrepared.available, assignments: ordinaryUnknownDecision?.assignments, jobs: ordinaryUnknownPrepared.jobs })}`,
);
assert.equal(
  ordinaryMultiplierAutomation.executor.execute(ordinaryUnknownDecision).status,
  "deferred",
  "ordinary Jobs fails closed on an unknown multiplier latch",
);
assert.deepEqual(ordinaryMultiplierCalls, []);
ordinaryMultiplierLatch = true;
const ordinaryActivePrepared =
  ordinaryMultiplierAutomation.reader.readCycle(false);
const ordinaryActiveDecision = planJobs(ordinaryActivePrepared);
assert.equal(
  ordinaryMultiplierAutomation.executor.execute(ordinaryActiveDecision).status,
  "deferred",
  "ordinary Jobs fails closed on a known active multiplier latch",
);
assert.deepEqual(ordinaryMultiplierCalls, []);
ordinaryMultiplierLatch = false;
const ordinaryClearPrepared =
  ordinaryMultiplierAutomation.reader.readCycle(false);
const ordinaryClearDecision = planJobs(ordinaryClearPrepared);
assert.equal(
  ordinaryMultiplierAutomation.executor.execute(ordinaryClearDecision).status,
  "succeeded",
  "ordinary Jobs runs after the latch is known clear",
);
assert.ok(ordinaryMultiplierCalls.length > 0);

fullManageServants = true;
fullBuildingWeighting = false;
fullControlFailure = undefined;
fullIgnoreControls = false;
fullRootIdentity = undefined;
fullCalls.length = 0;
for (const key of Object.keys(fullRoot)) delete fullRoot[key];
Object.assign(fullRoot, structuredClone(fullStateBeforePreflight));
fullRoot.settings = { mKeys: true };
fullMultiplierLatch = undefined;
const fullUnknownLatch = fullAutomation.prepare();
assert.equal(fullUnknownLatch.status, "ready");
assert.ok(
  fullUnknownLatch.execution.decision?.assignments.some(
    (assignment) =>
      assignment.workers !==
      fullUnknownLatch.input.jobs.find(
        (job) => job.token === assignment.jobToken,
      )?.workers,
  ),
  "full unknown-latch fixture requires a real worker assignment",
);
const fullLatchRootBefore = structuredClone(fullRoot);
assert.equal(
  fullUnknownLatch.execution.execute().status,
  "deferred",
  "full Jobs fails closed on an unknown multiplier latch",
);
assert.deepEqual(fullCalls, []);
assert.deepEqual(fullRoot, fullLatchRootBefore);
fullMultiplierLatch = true;
const fullActiveLatch = fullAutomation.prepare();
assert.equal(fullActiveLatch.status, "ready");
assert.equal(
  fullActiveLatch.execution.execute().status,
  "deferred",
  "full Jobs fails closed on a known active multiplier latch",
);
assert.deepEqual(fullCalls, []);
assert.deepEqual(fullRoot, fullLatchRootBefore);
fullMultiplierLatch = false;
const fullClearLatch = fullAutomation.prepare();
assert.equal(fullClearLatch.status, "ready");
assert.equal(
  fullClearLatch.execution.execute().status,
  "succeeded",
  "full Jobs runs after the latch is known clear",
);
assert.ok(fullCalls.length > 0);

const previousTestSurfaceFlag = globalThis.__EA_TEST_SURFACE_ENABLED__;
globalThis.__EA_TEST_SURFACE_ENABLED__ = true;
let allocationDiagnosticRequest;
let allocationDiagnosticRequestReads = 0;
const allocationDiagnosticEvents = [];
const makeAllocationDiagnosticAutomation = () =>
  createCapturedFullJobsAutomation({
    rootState: { readRoot: () => fullRootIdentity ?? fullRoot },
    controls: fullControls,
    keyState: { readMultiplierLatch: () => fullMultiplierLatch },
    readSettings: () => ({
      ...resetBreakpoints,
      job_unemployed: true,
      job_farmer: true,
      job_lumberjack: false,
      job_s_farmer: true,
      jobSetDefault: true,
      productionCraftsmen: "always",
      jobManageServants: fullManageServants,
      craftPlywood: true,
      job_Plywood: true,
      foundry_w_Plywood: 1,
      craftBrick: true,
      job_Brick: true,
      foundry_w_Brick: 1,
      productionFoundryWeighting: "demanded",
    }),
    costs: {
      read: (id) => {
        fullCraftCostReads++;
        return id === "Plywood" || id === "Brick"
          ? new Map([["Iron", 1]])
          : undefined;
      },
    },
    readDemand: () => {
      fullDemandReads++;
      return {
        isDemanded: () => true,
        storageRequired: () => 100,
      };
    },
    readBuildTargets: () => {
      fullBuildTargetReads++;
      return [{ key: "housing", elementId: "city-housing", weighting: 1 }];
    },
    buildCosts: {
      readCost: () => {
        fullBuildCostReads++;
        return { cost: { Plywood: 1 }, pool: undefined };
      },
    },
    diagnostics: fullDiagnostics,
    readTestAllocationDiagnosticRequest: () => {
      allocationDiagnosticRequestReads++;
      return allocationDiagnosticRequest;
    },
    readTestWorkCycleIdentity: () => 900,
    nowTestMs: () => performance.now(),
    onTestAllocationDiagnosticAdmission: (event) =>
      allocationDiagnosticEvents.push(event),
  });

const resetAllocationDiagnosticRoot = () => {
  fullRootIdentity = undefined;
  fullMultiplierLatch = false;
  fullCalls.length = 0;
  for (const key of Object.keys(fullRoot)) delete fullRoot[key];
  Object.assign(fullRoot, structuredClone(fullStateBeforePreflight));
};
const runAllocationDiagnosticArm = (request) => {
  resetAllocationDiagnosticRoot();
  allocationDiagnosticRequest = request;
  allocationDiagnosticEvents.length = 0;
  allocationDiagnosticRequestReads = 0;
  const automation = makeAllocationDiagnosticAutomation();
  const prepared = automation.prepare();
  assert.equal(prepared.status, "ready");
  assert.notEqual(prepared.execution.decision, null);
  const sourceReadsBeforeExecution = [
    fullDemandReads,
    fullCraftCostReads,
    fullBuildTargetReads,
    fullBuildCostReads,
  ];
  assert.equal(prepared.execution.execute().status, "succeeded");
  assert.deepEqual(
    [
      fullDemandReads,
      fullCraftCostReads,
      fullBuildTargetReads,
      fullBuildCostReads,
    ],
    sourceReadsBeforeExecution,
    "observation does not recapture demand, prices, targets, or costs during execution",
  );
  assert.equal(allocationDiagnosticRequestReads, 1);
  assert.equal(allocationDiagnosticEvents.length, 1);
  return {
    calls: structuredClone(fullCalls),
    state: structuredClone(fullRoot),
    observation: allocationDiagnosticEvents[0],
  };
};

const allocationDiagnosticBaseline = runAllocationDiagnosticArm(undefined);
const diagnosticOnlyRequest = {
  requestId: "fixture:p48:food-stone:1",
  origin: "test-only",
  objectiveId: "maintain-food-buffer-and-useful-stone-production",
  requestedScope: "food-sustainability-and-useful-stone-replenishment",
  generation: 1,
  active: true,
  authorityClassification: "observation-only",
};
const allocationDiagnosticB = runAllocationDiagnosticArm(diagnosticOnlyRequest);
const allocationDiagnosticBRepeat = runAllocationDiagnosticArm(
  diagnosticOnlyRequest,
);
assert.deepEqual(
  allocationDiagnosticBaseline.calls,
  allocationDiagnosticB.calls,
);
assert.deepEqual(
  allocationDiagnosticB.calls,
  allocationDiagnosticBRepeat.calls,
);
assert.deepEqual(
  allocationDiagnosticBaseline.state,
  allocationDiagnosticB.state,
);
assert.deepEqual(
  allocationDiagnosticB.state,
  allocationDiagnosticBRepeat.state,
);
assert.equal(
  allocationDiagnosticBaseline.observation.admission.status,
  "inactive",
);
assert.equal(allocationDiagnosticBaseline.observation.admissionEvaluations, 0);
assert.equal(
  allocationDiagnosticBaseline.observation
    .controlResolutionReadsDuringObservation,
  0,
);
assert.equal(
  allocationDiagnosticBaseline.observation.settingsReadsDuringObservation,
  0,
);
assert.equal(
  allocationDiagnosticB.observation.admission.status,
  "admitted-for-observation",
);
assert.equal(
  allocationDiagnosticB.observation.controlResolutionReadsDuringObservation,
  0,
);
assert.equal(
  allocationDiagnosticB.observation.settingsReadsDuringObservation,
  0,
);
assert.equal(
  allocationDiagnosticB.observation.admission.executionAuthority,
  "none",
);
assert.equal(allocationDiagnosticB.observation.nativeRootExposed, false);

const makeOrdinaryOnlyAllocationDiagnosticRun = (request) => {
  const state = {
    civic: {
      d_job: "unemployed",
      unemployed: {
        job: "unemployed",
        assigned: 1,
        workers: 1,
        max: 0,
        display: true,
      },
      farmer: {
        job: "farmer",
        assigned: 0,
        workers: 0,
        max: -1,
        display: true,
      },
    },
    race: { species: "elven" },
    resource: { elven: { amount: 1, max: 4 } },
  };
  const nativeCalls = [];
  const events = [];
  let readerCalls = 0;
  let plannedInput;
  const automation = createCapturedOrdinaryJobsAutomation({
    rootState: { readRoot: () => state },
    controls: {
      capturedElementIds: () => ["civ-unemployed", "civ-farmer"],
      resolve: (elementId) =>
        elementId.startsWith("civ-")
          ? {
              elementId,
              generation: 1,
              methods: ["add", "sub", "setDefault"],
            }
          : undefined,
      invoke: (handle, method, args = []) => {
        nativeCalls.push({ elementId: handle.elementId, method, args });
        if (method === "setDefault") {
          state.civic.d_job = args[0];
        } else {
          const job = state.civic[handle.elementId.slice("civ-".length)];
          job.workers += method === "add" ? 1 : -1;
          job.assigned = job.workers;
        }
        return { ok: true, value: undefined };
      },
    },
    readSettings: () => ({
      job_unemployed: true,
      job_farmer: true,
      jobSetDefault: true,
      ...resetBreakpoints,
    }),
    readTestAllocationDiagnosticRequest: () => request,
    readTestWorkCycleIdentity: () => 901,
    nowTestMs: () => performance.now(),
    onTestAllocationDiagnosticAdmission: (event) => events.push(event),
  });
  const reader = {
    readCycle(craftOnly) {
      readerCalls += 1;
      plannedInput = automation.reader.readCycle(craftOnly);
      return plannedInput;
    },
  };
  const outcome = runJobsAutomation(
    { reader, executor: automation.executor },
    false,
  );
  return { state, nativeCalls, events, readerCalls, plannedInput, outcome };
};
const ordinaryOnlyRequest = {
  ...diagnosticOnlyRequest,
  requestId: "fixture:p49:ordinary-jobs:1",
};
const ordinaryOnlyA = makeOrdinaryOnlyAllocationDiagnosticRun(undefined);
const ordinaryOnlyB =
  makeOrdinaryOnlyAllocationDiagnosticRun(ordinaryOnlyRequest);
const ordinaryOnlyBRepeat =
  makeOrdinaryOnlyAllocationDiagnosticRun(ordinaryOnlyRequest);
for (const run of [ordinaryOnlyA, ordinaryOnlyB, ordinaryOnlyBRepeat]) {
  assert.equal(
    run.readerCalls,
    1,
    "ordinary owner sampling remains single-read",
  );
  assert.equal(
    run.events.length,
    1,
    "one observation belongs to the owner cycle",
  );
  assert.equal(run.outcome.status, "succeeded");
}
assert.deepEqual(ordinaryOnlyB.nativeCalls, ordinaryOnlyA.nativeCalls);
assert.deepEqual(ordinaryOnlyBRepeat.nativeCalls, ordinaryOnlyA.nativeCalls);
assert.deepEqual(ordinaryOnlyB.state, ordinaryOnlyA.state);
assert.deepEqual(ordinaryOnlyBRepeat.state, ordinaryOnlyA.state);
assert.equal(ordinaryOnlyA.events[0].admission.status, "inactive");
assert.equal(ordinaryOnlyA.events[0].admissionEvaluations, 0);
assert.equal("evidence" in ordinaryOnlyA.events[0], false);
for (const run of [ordinaryOnlyB, ordinaryOnlyBRepeat]) {
  assert.equal(run.events[0].admission.status, "admitted-for-observation");
  assert.equal(run.events[0].evidence.ownerScope, "ordinary-jobs-only");
  assert.equal(run.events[0].evidence.jobsFoundryFreshness, "unavailable");
  assert.equal(run.events[0].evidence.foundryJobs, null);
  assert.equal(run.events[0].evidence.foundryCrafts, null);
  assert.equal(run.events[0].evidence.foundryWorkerPool, null);
  assert.equal(run.events[0].evidence.population, run.plannedInput.population);
  assert.equal(run.events[0].evidence.executionAuthority, "none");
  assert.equal(run.events[0].controlResolutionReadsDuringObservation, 0);
  assert.equal(run.events[0].settingsReadsDuringObservation, 0);
  assert.equal(run.events[0].catalogReadsDuringObservation, 0);
  assert.equal(run.events[0].demandReadsDuringObservation, 0);
  assert.equal(run.events[0].nativeRootReadsDuringObservation, 0);
  assert.equal(run.events[0].nativeRootExposed, false);
}
assert.deepEqual(
  ordinaryOnlyB.events[0].evidence,
  ordinaryOnlyBRepeat.events[0].evidence,
);

allocationDiagnosticEvents.length = 0;
const allocationDiagnosticLifecycle = makeAllocationDiagnosticAutomation();
const supersededAllocationDiagnostic = allocationDiagnosticLifecycle.prepare();
const currentAllocationDiagnostic = allocationDiagnosticLifecycle.prepare();
assert.equal(
  supersededAllocationDiagnostic.execution.execute().failure?.code,
  "full-jobs-session-superseded",
);
assert.equal(allocationDiagnosticEvents.length, 0);
assert.equal(
  currentAllocationDiagnostic.execution.execute().status,
  "succeeded",
);
assert.equal(allocationDiagnosticEvents.length, 1);

allocationDiagnosticEvents.length = 0;
const staleAllocationDiagnosticRoot = allocationDiagnosticLifecycle.prepare();
fullRootIdentity = structuredClone(fullRoot);
assert.equal(
  staleAllocationDiagnosticRoot.execution.execute().failure?.code,
  "full-jobs-root-changed",
);
assert.equal(allocationDiagnosticEvents.length, 0);
fullRootIdentity = undefined;

const staleAllocationDiagnosticFoundry =
  allocationDiagnosticLifecycle.prepare();
fullRoot.city.foundry.Plywood++;
assert.equal(
  staleAllocationDiagnosticFoundry.execution.execute().failure?.code,
  "full-jobs-state-changed",
);
assert.equal(allocationDiagnosticEvents.length, 0);
fullRoot.city.foundry.Plywood--;
if (previousTestSurfaceFlag === undefined)
  delete globalThis.__EA_TEST_SURFACE_ENABLED__;
else globalThis.__EA_TEST_SURFACE_ENABLED__ = previousTestSurfaceFlag;

console.log("captured-ordinary-jobs ok");
