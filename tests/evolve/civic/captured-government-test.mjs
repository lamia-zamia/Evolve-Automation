import assert from "node:assert/strict";

import {
  createCapturedGovernmentAutomation,
  runCapturedGovernmentAutomation,
} from "../../../src/adapters/evolve/civic/captured-government.ts";

function makeRoot() {
  return {
    tech: { governor: 1, govern: 1, gov_fed: 1 },
    city: { market: { trade: 0 } },
    galaxy: { trade: { cur: 0 } },
    stats: { achieve: {} },
    civic: { govern: { type: "autocracy", rev: 0 } },
    race: {
      universe: "standard",
      governor: {
        candidates: [{ bg: "soldier" }, { bg: "educator" }],
      },
    },
  };
}

function makeControls(invoked, available = true) {
  return {
    resolve: (elementId) =>
      available && elementId === "candidates"
        ? { elementId, generation: 1, methods: ["appoint"] }
        : undefined,
    invoke: (_handle, method, args) => {
      invoked.push({ method, args });
      return { ok: true, value: undefined };
    },
    capturedElementIds: () => (available ? ["candidates"] : []),
  };
}

function makeModal(apply = () => ({ status: "succeeded" })) {
  return { apply, cancel() {}, dispose() {} };
}

// A configured, unappointed governor selects the matching captured candidate.
{
  const root = makeRoot();
  const invoked = [];
  const automation = createCapturedGovernmentAutomation({
    rootState: { readRoot: () => root },
    controls: makeControls(invoked),
    modal: makeModal(),
    readSettings: () => ({ autoGovernment: true, govGovernor: "educator" }),
  });
  const outcome = runCapturedGovernmentAutomation(automation);
  assert.deepEqual(outcome, { status: "succeeded" });
  assert.deepEqual(invoked, [{ method: "appoint", args: [1] }]);
}

// An existing appointment is not replaced.
{
  const root = makeRoot();
  root.race.governor.g = { bg: "soldier" };
  const invoked = [];
  const automation = createCapturedGovernmentAutomation({
    rootState: { readRoot: () => root },
    controls: makeControls(invoked),
    modal: makeModal(),
    readSettings: () => ({ autoGovernment: true, govGovernor: "educator" }),
  });
  assert.deepEqual(runCapturedGovernmentAutomation(automation), {
    status: "succeeded",
  });
  assert.deepEqual(invoked, []);
}

// The command is stale when the mounted candidate control is not available.
{
  const root = makeRoot();
  const automation = createCapturedGovernmentAutomation({
    rootState: { readRoot: () => root },
    controls: makeControls([], false),
    modal: makeModal(),
    readSettings: () => ({ autoGovernment: true, govGovernor: "educator" }),
  });
  const outcome = runCapturedGovernmentAutomation(automation);
  assert.equal(outcome.status, "stale");
  assert.equal(outcome.failure.code, "governor-controls-unavailable");
}

// Government type selection delegates its native modal lifecycle to the modal controller.
{
  const root = makeRoot();
  root.civic.govern.type = "anarchy";
  const modalCalls = [];
  const automation = createCapturedGovernmentAutomation({
    rootState: { readRoot: () => root },
    controls: makeControls([]),
    modal: makeModal((government) => {
      modalCalls.push(government);
      root.civic.govern.type = government;
      return { status: "succeeded" };
    }),
    readSettings: () => ({
      autoGovernment: true,
      govInterim: "democracy",
      govGovernor: "none",
    }),
  });
  assert.deepEqual(runCapturedGovernmentAutomation(automation), {
    status: "succeeded",
  });
  assert.equal(root.civic.govern.type, "democracy");
  assert.deepEqual(modalCalls, ["democracy"]);
}

// The legacy achievement guard temporarily selects Federation once both native route counters
// meet the achievement thresholds, even when a configured government is also eligible.
for (const [label, change, expected] of [
  ["ready", () => {}, "federation"],
  [
    "city routes below threshold",
    (root) => (root.city.market.trade = 749),
    "democracy",
  ],
  [
    "galaxy routes below threshold",
    (root) => (root.galaxy.trade.cur = 49),
    "democracy",
  ],
  [
    "achievement already earned",
    (root) => (root.stats.achieve.trade = { l: 1 }),
    "democracy",
  ],
  ["master achievement guard override", null, "democracy"],
  ["Trade Federation guard override", null, "democracy"],
  [
    "Federation technology locked",
    (root) => (root.tech.gov_fed = 0),
    "democracy",
  ],
  ["warlord locks Federation", (root) => (root.race.warlord = true), null],
]) {
  const root = makeRoot();
  root.city.market.trade = 750;
  root.galaxy.trade.cur = 50;
  if (change !== null) change(root);
  const modalCalls = [];
  const settings = {
    autoGovernment: true,
    govInterim: "democracy",
    govGovernor: "none",
  };
  if (label === "master achievement guard override") {
    settings.achievementGuards = false;
  }
  if (label === "Trade Federation guard override") {
    settings.guardTradeFederation = false;
  }
  const automation = createCapturedGovernmentAutomation({
    rootState: { readRoot: () => root },
    controls: makeControls([]),
    modal: makeModal((government) => {
      modalCalls.push(government);
      return { status: "succeeded" };
    }),
    readSettings: () => settings,
  });
  assert.equal(
    automation.reader.read().tradeFederationReady,
    expected === "federation",
    label,
  );
  runCapturedGovernmentAutomation(automation);
  assert.deepEqual(modalCalls, expected === null ? [] : [expected], label);
}

// A pending revolution rejects an otherwise ready Federation command before opening the modal.
{
  const root = makeRoot();
  root.city.market.trade = 750;
  root.galaxy.trade.cur = 50;
  root.civic.govern.rev = 10;
  const modalCalls = [];
  const automation = createCapturedGovernmentAutomation({
    rootState: { readRoot: () => root },
    controls: makeControls([]),
    modal: makeModal((target) => {
      modalCalls.push(target);
      return { status: "succeeded" };
    }),
    readSettings: () => ({
      autoGovernment: true,
      govInterim: "democracy",
      govGovernor: "none",
    }),
  });
  const outcome = runCapturedGovernmentAutomation(automation);
  assert.equal(automation.reader.read().tradeFederationReady, true);
  assert.equal(outcome.status, "stale");
  assert.equal(outcome.failure.code, "government-revolution-pending");
  assert.deepEqual(modalCalls, []);
}

// An already selected Federation is left alone; the achievement path does not reopen its modal.
{
  const root = makeRoot();
  root.city.market.trade = 750;
  root.galaxy.trade.cur = 50;
  root.civic.govern.type = "federation";
  const modalCalls = [];
  const automation = createCapturedGovernmentAutomation({
    rootState: { readRoot: () => root },
    controls: makeControls([]),
    modal: makeModal((target) => {
      modalCalls.push(target);
      return { status: "succeeded" };
    }),
    readSettings: () => ({
      autoGovernment: true,
      govInterim: "democracy",
      govGovernor: "none",
    }),
  });
  assert.deepEqual(runCapturedGovernmentAutomation(automation), {
    status: "succeeded",
  });
  assert.deepEqual(modalCalls, []);
}

// A pending revolution and a locked configured target never open the native modal.
for (const [government, revision] of [
  ["democracy", 10],
  ["republic", 0],
]) {
  const root = makeRoot();
  root.civic.govern.type = "anarchy";
  root.civic.govern.rev = revision;
  const modalCalls = [];
  const automation = createCapturedGovernmentAutomation({
    rootState: { readRoot: () => root },
    controls: makeControls([]),
    modal: makeModal((target) => {
      modalCalls.push(target);
      return { status: "succeeded" };
    }),
    readSettings: () => ({
      autoGovernment: true,
      govInterim: government,
      govGovernor: "none",
    }),
  });
  const outcome = runCapturedGovernmentAutomation(automation);
  if (revision > 0) assert.equal(outcome.status, "stale");
  assert.deepEqual(modalCalls, []);
}

// A removed planner target and an explicit runtime disable cancel existing modal work.
{
  const root = makeRoot();
  root.tech.govern = 1;
  root.civic = { govern: { type: "anarchy", rev: 0 } };
  const calls = [];
  let settings = {
    autoGovernment: true,
    govInterim: "democracy",
    govGovernor: "none",
  };
  const automation = createCapturedGovernmentAutomation({
    rootState: { readRoot: () => root },
    controls: makeControls([]),
    modal: {
      apply: (government) => {
        calls.push(["apply", government]);
        return { status: "succeeded" };
      },
      cancel: () => calls.push(["cancel"]),
      dispose() {},
    },
    readSettings: () => settings,
  });
  runCapturedGovernmentAutomation(automation);
  settings = { ...settings, govInterim: "none" };
  runCapturedGovernmentAutomation(automation);
  automation.cancelPending();
  assert.deepEqual(calls, [["apply", "democracy"], ["cancel"], ["cancel"]]);
}

console.log("Captured government adapter tests passed");
