import assert from "node:assert/strict";

import {
  CAPTURED_MAD_CONTROL,
  createCapturedMadPrestige,
  readCapturedMadBranch,
} from "../src/adapters/evolve/progression/prestige/captured-mad.ts";
import { runPrestige } from "../src/application/prestige.ts";

function buildRoot(overrides = {}) {
  return {
    civic: {
      mad: { display: true, armed: true },
      garrison: { workers: 12, max: 20, crew: 2 },
    },
    tech: { mad: 1 },
    resource: { Population: { amount: 30, max: 30 } },
    ...overrides,
  };
}

const settings = {
  prestigeMADWait: true,
  prestigeMADPopulation: 28,
};

// The captured values are the exact root fields DeadSpace's MAD gate reads through the
// compatibility WarManager/resource wrappers: garrison workers minus crew, and Population amount
// and max. No numeric cap or private reset calculation is reconstructed here.
{
  const root = buildRoot();
  const branch = readCapturedMadBranch(root, settings);
  assert.deepEqual(branch, {
    type: "mad",
    eligible: true,
    armed: true,
    waitForPopulation: true,
    currentSoldiers: 10,
    maxSoldiers: 18,
    currentPopulation: 30,
    maxPopulation: 30,
    requiredPopulation: 28,
  });
  assert.equal(Object.isFrozen(branch), true);
}

// MAD stays unavailable until both the display flag and the captured grant exist.
{
  const root = buildRoot({
    civic: { mad: { display: true, armed: true } },
    tech: {},
  });
  assert.equal(readCapturedMadBranch(root, settings).eligible, false);
}

// Missing count bags preserve the game's arithmetic NaN, which keeps the wait gate closed rather
// than inventing a population-ready reset from an old or partially initialized save.
{
  const branch = readCapturedMadBranch(
    buildRoot({ civic: { mad: { display: true, armed: true } } }),
    {},
  );
  assert.equal(Number.isNaN(branch.currentSoldiers), true);
  assert.equal(Number.isNaN(branch.maxSoldiers), true);
  assert.equal(branch.waitForPopulation, true);
  assert.equal(branch.requiredPopulation, 1);
}

// The reader sees live root changes on the next sample; it does not retain a numeric snapshot.
{
  const root = buildRoot();
  assert.equal(readCapturedMadBranch(root, settings).currentPopulation, 30);
  root.resource.Population.amount = 12;
  assert.equal(readCapturedMadBranch(root, settings).currentPopulation, 12);
}

// The captured reader exposes only MAD; other selected prestige types remain inert.
{
  const trace = [];
  let goal = "Normal";
  let root = buildRoot({
    civic: {
      mad: { display: true, armed: true },
      garrison: { workers: 20, max: 20, crew: 2 },
    },
  });
  const controls = {
    resolve(id) {
      return id === CAPTURED_MAD_CONTROL
        ? { elementId: id, generation: 1, methods: ["arm", "launch"] }
        : undefined;
    },
    invoke(handle, method) {
      assert.equal(handle.elementId, CAPTURED_MAD_CONTROL);
      trace.push(method);
      if (method === "arm") root.civic.mad.armed = false;
      if (method === "launch") root = buildRoot();
      return { ok: true, value: undefined };
    },
    capturedElementIds() {
      return [CAPTURED_MAD_CONTROL];
    },
  };
  const prestige = createCapturedMadPrestige({
    rootState: { readRoot: () => root },
    controls,
    readSettings: () => ({ ...settings, prestigeType: "mad" }),
    readGoal: () => goal,
    setGoal: (next) => {
      goal = next;
      trace.push(["goal", next]);
    },
    onActivity: (activityEntry) => trace.push(activityEntry.message),
  });

  runPrestige(prestige);
  assert.deepEqual(trace, [["goal", "Reset"]]);

  goal = "Reset";
  root.civic.mad.armed = true;
  runPrestige(prestige);
  assert.deepEqual(trace, [
    ["goal", "Reset"],
    "arm",
    ["goal", "GameOverMan"],
    "launch",
    "Prestiged",
  ]);
}

{
  const root = buildRoot();
  let currentRoot = root;
  const controls = {
    resolve: () => ({
      elementId: CAPTURED_MAD_CONTROL,
      generation: 1,
      methods: ["arm", "launch"],
    }),
    invoke: () => ({ ok: true, value: undefined }),
    capturedElementIds: () => [CAPTURED_MAD_CONTROL],
  };
  const prestige = createCapturedMadPrestige({
    rootState: { readRoot: () => currentRoot },
    controls,
    readSettings: () => ({ ...settings, prestigeType: "mad" }),
    readGoal: () => "Reset",
    setGoal: () => {},
  });
  prestige.reader.samplePrestige();
  currentRoot = buildRoot();
  assert.throws(
    () => prestige.executor.execute({ kind: "launch-mad" }),
    /root changed/,
  );
}

console.log("Captured MAD prestige tests passed");
