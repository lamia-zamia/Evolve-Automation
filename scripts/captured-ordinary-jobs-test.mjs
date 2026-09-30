import assert from "node:assert/strict";
import { planJobs } from "../src/domain/civic/jobs.ts";
import {
  createCapturedFullJobsAutomation,
  createCapturedOrdinaryJobsAutomation,
} from "../src/adapters/evolve/civic/captured-ordinary-jobs.ts";
import {
  createCapturedJobCatalogReader,
  readCapturedMinerReservation,
  readCapturedPopulationResource,
} from "../src/adapters/evolve/civic/captured-job-catalog.ts";

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
    authorityManage: true,
    generalMinimumAuthority: 100,
    job_unemployed: true,
    job_farmer: true,
    job_entertainer: true,
  }),
});
const zeroEntertainerInput = zeroEntertainerAutomation.reader.readCycle(false);
assert.equal(zeroEntertainerInput.available, true);
assert.equal(
  zeroEntertainerInput.authority.entertainerMorale,
  0,
  "zero Entertainers keep the authority contribution conservative",
);

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
      assigned: 0,
      workers: 0,
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
    craftsman: { job: "craftsman", workers: 1, max: 2 },
  },
  city: {
    foundry: {
      Plywood: 1,
      Brick: 0,
      crafting: 1,
      cap: 2,
      rcap: {},
    },
  },
  race: {
    servants: {
      jobs: { farmer: 0 },
      sjobs: { Plywood: 1 },
      max: 1,
      used: 0,
      smax: 1,
      sused: 1,
    },
  },
  resource: {
    Population: { amount: 4, max: 10 },
    Food: { amount: 10, max: 100, diff: 0 },
    Plywood: { amount: 100 },
    Brick: { amount: 0 },
    Iron: { amount: 100 },
  },
};
const fullCalls = [];
let fullControlFailure;
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
const fullAutomation = createCapturedFullJobsAutomation({
  rootState: { readRoot: () => fullRoot },
  controls: fullControls,
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
  }),
  costs: {
    read: (id) =>
      id === "Plywood" || id === "Brick" ? new Map([["Iron", 1]]) : undefined,
  },
});
const fullInput = fullAutomation.reader.readCycle(false);
assert.equal(fullInput.available, true);
const fullDecision = planJobs(fullInput);
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
  fullAutomation.executor.execute(fullDecision).status,
  "rejected",
  "a missing later skilled-servant control rejects the whole full decision",
);
assert.deepEqual(
  fullCalls,
  [],
  "preflight must precede every captured mutation",
);
assert.deepEqual(fullRoot, fullStateBeforePreflight);

// The full executor must not commit lastPopulation/lastFarmer history when preflight rejects.
fullRoot.resource.Population.amount = fullDecision.lastPopulationCount + 2;
fullRoot.civic.farmer.workers = fullDecision.lastFarmerCount + 2;
const afterRejectedHistoryInput = fullAutomation.reader.readCycle(false);
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
const retryInput = fullAutomation.reader.readCycle(false);
const retryDecision = planJobs(retryInput);
assert.equal(
  fullAutomation.executor.execute(retryDecision).status,
  "rejected",
  "an existing captured handle without the required method also rejects before mutation",
);
assert.deepEqual(fullCalls, []);
assert.deepEqual(fullRoot, fullStateBeforePreflight);

fullControlFailure = undefined;
const fullOutcome = fullAutomation.executor.execute(
  planJobs(fullAutomation.reader.readCycle(false)),
);
assert.equal(fullOutcome.status, "succeeded");
assert.equal(fullRoot.city.foundry.Brick, 2);
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

const servantsBeforeDisabling = structuredClone(fullRoot.race.servants);
const callsBeforeDisabling = fullCalls.length;
fullManageServants = false;
const servantsDisabledInput = fullAutomation.reader.readCycle(false);
assert.equal(servantsDisabledInput.manageServants, false);
assert.equal(servantsDisabledInput.servantsMaximum, 0);
assert.equal(servantsDisabledInput.skilledServantsMaximum, 0);
const servantsDisabledOutcome = fullAutomation.executor.execute(
  planJobs(servantsDisabledInput),
);
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

console.log("captured-ordinary-jobs ok");
