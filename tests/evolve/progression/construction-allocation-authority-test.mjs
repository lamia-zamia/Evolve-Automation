import assert from "node:assert/strict";
import { readConstructionAllocationAuthority } from "../../../src/bootstrap/construction-allocation-authority.ts";
import {
  allocationClickBudget,
  allocationDenialReason,
} from "../../../experiments/p20-allocation-budget.mjs";
import { planGatherResources } from "../../../src/domain/economy/resources/gather-resources.ts";

globalThis.__EA_TEST_SURFACE_ENABLED__ = true;
const { createCapturedGatherResourcesAdapter } =
  await import("../../../src/adapters/evolve/economy/resources/captured-gather-resources.ts");

const valid = () => ({
  publicationCurrent: true,
  targetId: "city-rock_quarry",
  request: {
    name: "city-rock_quarry",
    pool: "anywhere",
    cost: { Lumber: 50, Stone: 10 },
  },
  publication: {
    name: "city-rock_quarry",
    pool: "anywhere",
    cost: { Stone: 10, Lumber: 50 },
  },
  native: { pool: undefined, cost: { Lumber: 50, Stone: 10 } },
  resources: {
    Lumber: { amount: 31, max: 500 },
    Stone: { amount: 0, max: 500 },
  },
});

assert.deepEqual(
  readConstructionAllocationAuthority(valid()),
  {
    targetId: "city-rock_quarry",
    cost: { Lumber: 50, Stone: 10 },
    pool: "anywhere",
    stock: { Lumber: 31, Stone: 0 },
  },
  "current Construction request, publication and native catalog form one exact authority",
);

for (const [name, change] of [
  ["catalog price differs", (input) => (input.native.cost.Lumber = 51)],
  ["publication price differs", (input) => (input.publication.cost.Stone = 11)],
  ["request action differs", (input) => (input.request.name = "city-shed")],
  [
    "publication action differs",
    (input) => (input.publication.name = "city-university"),
  ],
  [
    "resource name differs",
    (input) => {
      input.request.cost.Wood = input.request.cost.Lumber;
      delete input.request.cost.Lumber;
    },
  ],
  [
    "request pool is incompatible with Gather scope",
    (input) => (input.request.pool = "region-1"),
  ],
  ["pool differs", (input) => (input.publication.pool = "region-1")],
  ["pool authority is empty", (input) => (input.request.pool = "")],
  ["catalog pool differs", (input) => (input.native.pool = "region-1")],
  ["price field is missing", (input) => delete input.native.cost.Stone],
  ["price quantity is negative", (input) => (input.native.cost.Stone = -1)],
  [
    "price quantity is infinite",
    (input) => (input.request.cost.Lumber = Infinity),
  ],
  ["resource observation is missing", (input) => delete input.resources.Stone],
  [
    "resource amount is invalid",
    (input) => (input.resources.Stone.amount = NaN),
  ],
  [
    "non-material shortage",
    (input) => {
      input.request.cost.Money = 100;
      input.publication.cost.Money = 100;
      input.native.cost.Money = 100;
      input.resources.Money = { amount: 99, max: 1000 };
    },
  ],
  [
    "publication is from another work cycle",
    (input) => (input.publicationCurrent = false),
  ],
]) {
  const input = valid();
  change(input);
  assert.equal(
    readConstructionAllocationAuthority(input),
    undefined,
    `${name} prevents Construction allocation authorization`,
  );
}

function constructContract(input) {
  const authority = readConstructionAllocationAuthority(input);
  if (authority === undefined) return undefined;
  return {
    actionId: authority.targetId,
    cost: authority.cost,
    clickBudget: allocationClickBudget({
      episodeClicks: 0,
      totalClicks: 0,
      maxEpisodeClicks: 80,
      maxTotalClicks: 140,
    }),
    resourceClickBudget: 5,
    controlGeneration: 1,
    isCurrent: () => readConstructionAllocationAuthority(input) !== undefined,
    resourceControlGenerations: { lumber: 1, stone: 1 },
  };
}

function executeGather(contract, onGather) {
  const root = {
    resource: {
      Food: { amount: 0, max: 100 },
      Lumber: { amount: 0, max: 100 },
      Stone: { amount: 0, max: 100 },
      Mana: { amount: 0, max: 100 },
      Furs: { amount: 0, max: 100 },
      Population: { amount: 0, max: 100 },
    },
    race: { species: "Human" },
    tech: { primitive: 1 },
    genes: {},
    queue: { queue: [] },
    r_queue: { queue: [] },
    city: {},
  };
  const handles = new Map([
    [
      "city-rock_quarry",
      { elementId: "city-rock_quarry", generation: 1, methods: ["action"] },
    ],
    [
      "city-lumber",
      { elementId: "city-lumber", generation: 1, methods: ["action"] },
    ],
    [
      "undefined-stone",
      { elementId: "undefined-stone", generation: 1, methods: ["action"] },
    ],
  ]);
  const adapter = createCapturedGatherResourcesAdapter({
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls: {
      resolve: (id) => handles.get(id),
      invoke(handle, method) {
        assert.equal(method, "action");
        const resourceId =
          handle.elementId === "city-lumber" ? "Lumber" : "Stone";
        root.resource[resourceId].amount += 1;
        onGather?.(resourceId, root);
        return { ok: true, value: true };
      },
      capturedElementIds: () => [...handles.keys()],
    },
    readSettings: () => ({ buildingAlwaysClick: false }),
    readTestIntervention: () => ({
      civilizationBootstrap: {
        authorized: true,
        authorizationId: "construction-authority-test",
        state: {
          root,
          phase: "handoff",
          handoffClicks: 0,
          handoffLimit: 0,
          isCurrent: () => true,
        },
      },
      constructionAllocation: { enabled: true },
      standardConstructionTarget: contract,
    }),
  });
  const plan = planGatherResources(adapter.reader.read());
  return {
    result:
      plan === null
        ? { status: "stale", failure: { code: "gather-plan-unavailable" } }
        : adapter.executor.execute(plan),
    root,
    plan,
  };
}

for (const [name, change] of [
  [
    "request and publication agree but catalog differs",
    (input) => (input.native.cost.Stone = 11),
  ],
  [
    "request and catalog agree but publication differs",
    (input) => (input.publication.cost.Stone = 11),
  ],
]) {
  const input = valid();
  change(input);
  const contract = constructContract(input);
  let clicks = 0;
  if (contract?.isCurrent()) clicks += contract.clickBudget;
  assert.equal(clicks, 0, `${name} yields no Gather clicks`);
}

const currentInput = valid();
const currentContract = constructContract(currentInput);
assert.equal(currentContract?.actionId, "city-rock_quarry");
assert.equal(currentContract?.clickBudget, 5);
const validGather = executeGather(currentContract);
assert.equal(validGather.result.status, "succeeded");
assert.equal(
  validGather.root.resource.Lumber.amount +
    validGather.root.resource.Stone.amount,
  5,
  "the production Gather adapter respects the bounded allocation click budget",
);
currentInput.native.cost.Stone = 11;
const repricedBeforeExecution = executeGather(currentContract);
assert.equal(repricedBeforeExecution.result.status, "stale");
assert.equal(
  repricedBeforeExecution.root.resource.Stone.amount,
  0,
  "the production Gather adapter rejects a reprice before the first click",
);

const midOperationInput = valid();
const midOperationContract = constructContract(midOperationInput);
let midOperationClicks = 0;
const midOperation = executeGather(midOperationContract, () => {
  midOperationClicks += 1;
  if (midOperationClicks === 1) midOperationInput.native.cost.Lumber = 51;
});
assert.equal(
  midOperationClicks,
  1,
  "native reprice during a multi-click operation prevents every later click",
);
assert.equal(midOperation.result.status, "stale");
assert.equal(
  midOperation.root.resource.Lumber.amount +
    midOperation.root.resource.Stone.amount,
  1,
);

assert.equal(
  allocationDenialReason({
    targetAlreadyAuthorized: true,
    episodeCount: 1,
    totalClicks: 80,
    maxEpisodes: 3,
    maxTotalClicks: 140,
  }),
  "same-target-already-authorized",
);

console.log("construction allocation authority ok");
