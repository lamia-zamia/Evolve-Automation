import assert from "node:assert/strict";
import { CAPTURED_GRANT_ACTIONS } from "../src/adapters/evolve/progression/build/captured-grant-actions.generated.ts";
import { createCapturedBuildSource } from "../src/adapters/evolve/progression/build/captured-build.ts";
import { createCapturedBuildPolicyReader } from "../src/adapters/evolve/progression/build/captured-build-policy.ts";

assert.ok(Object.keys(CAPTURED_GRANT_ACTIONS).length > 40);
for (const [id, technology, level] of [
  ["space-test_launch", "space", 2],
  ["space-moon_mission", "space", 3],
  ["space-red_mission", "space", 4],
  ["space-hell_mission", "hell", 1],
  ["space-sun_mission", "solar", 1],
  ["space-gas_mission", "space", 5],
  ["space-gas_moon_mission", "space", 6],
  ["space-belt_mission", "asteroid", 1],
  ["space-dwarf_mission", "dwarf", 1],
  ["interstellar-jump_ship", "stargate", 2],
  ["interstellar-sirius_b", "ascension", 4],
  ["galaxy-gateway_mission", "gateway", 2],
]) {
  assert.deepEqual(CAPTURED_GRANT_ACTIONS[id], {
    technology,
    completedAtLevel: level,
  });
}
for (const id of [
  "space-salvage_ship",
  "space-salvage_hell",
  "space-salvage_dwarf",
  "galaxy-alien2_mission",
  "galaxy-chthonian_mission",
]) {
  assert.equal(CAPTURED_GRANT_ACTIONS[id].legacyUnmanaged, true);
  const { reader } = harness(id, { tech: {}, space: {} });
  assert.deepEqual(
    reader().buildings,
    [],
    `${id} is outside legacy Auto Build ownership`,
  );
}

function harness(id, root, invokeAction = () => {}, offered = true) {
  let currentlyOffered = offered;
  let actionCalls = 0;
  const handle = {
    elementId: id,
    generation: 1,
    methods: ["action"],
    data: { title: id },
  };
  const controls = {
    resolve: (elementId) => (elementId === id ? handle : undefined),
    invoke: (selected, method) => {
      if (selected !== handle || method !== "action")
        return { ok: false, reason: "unknown-method" };
      actionCalls++;
      invokeAction();
      return { ok: true, value: true };
    },
    // Vue capture retains an ID after the upstream panel stops drawing it.
    capturedElementIds: () => [id],
  };
  const rootState = {
    readRoot: () => root,
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  };
  const reader = createCapturedBuildPolicyReader({
    rootState,
    controls,
    readCurrentOffers: () => ({
      regions: new Set([id.split("-")[0]]),
      unlocked: new Set(currentlyOffered ? [id] : []),
      states: new Map(),
    }),
    getSettings: () => ({ autoBuild: true }),
    readKnowledge: () => ({
      knowledgeRequiredByTechs: 0,
      levels: {
        cheapestTechKnowledge: 0,
        knowledgeRequiredByBuildTargets: 0,
        knowledgeCapacity: 0,
      },
    }),
  });
  const build = createCapturedBuildSource({
    rootState,
    controls,
    costs: { readCost: () => ({ cost: { Money: 1 } }) },
    readTargets: () => reader().buildings,
  });
  return {
    reader,
    build,
    setOffered: (value) => (currentlyOffered = value),
    actionCalls: () => actionCalls,
  };
}

{
  const root = { tech: { space: 3 }, space: {} };
  const { reader, build, setOffered, actionCalls } = harness(
    "space-red_mission",
    root,
  );
  assert.deepEqual(
    reader().buildings.map(({ key }) => key),
    ["space-red_mission"],
  );
  root.tech = {};
  setOffered(false);
  assert.deepEqual(
    reader().buildings,
    [],
    "a stale captured Mars control is unavailable after the game's fresh draw omits it",
  );
  assert.deepEqual(build.beginCycle(), []);
  assert.equal(build.execute("space-red_mission").clicked, false);
  assert.equal(actionCalls(), 0);
}

for (const [id, tech, before, complete] of [
  ["space-test_launch", "space", 1, 2],
  ["space-moon_mission", "space", 2, 3],
  ["space-red_mission", "space", 3, 4],
  ["space-hell_mission", "hell", undefined, 1],
  ["space-sun_mission", "solar", undefined, 1],
  ["space-belt_mission", "asteroid", undefined, 1],
  ["space-dwarf_mission", "dwarf", undefined, 1],
  ["interstellar-jump_ship", "stargate", 1, 2],
  ["galaxy-gateway_mission", "gateway", 1, 2],
]) {
  const root = { tech: {}, space: {} };
  if (before !== undefined) root.tech[tech] = before;
  const { reader, build } = harness(id, root, () => {
    root.tech[tech] = complete;
  });
  assert.deepEqual(
    reader().buildings.map((target) => target.key),
    [id],
  );
  assert.equal(reader().buildings[0].maximum, 1);
  assert.deepEqual(
    build.beginCycle().map((candidate) => candidate.key),
    [id],
  );
  const result = build.execute(id);
  assert.equal(result.disposition, "verified-success", id);
  assert.equal(result.clicked, true, id);
  assert.equal(result.mission, true, `${id} is an upstream grant action`);
  assert.deepEqual(reader().buildings, [], `${id} disappears when complete`);
}

{
  const root = {
    tech: { space: 1 },
    space: {},
    queue: { display: true, queue: [] },
  };
  const { build } = harness("space-test_launch", root, () => {
    root.queue.queue.push({ id: "space-test_launch" });
  });
  build.beginCycle();
  const result = build.execute("space-test_launch");
  assert.equal(result.clicked, false);
  assert.equal(result.mission, false);
  assert.equal(result.disposition, "invoked-but-unverified");
}

for (const tech of [undefined, null, { hell: "broken" }, { hell: NaN }]) {
  const root = { tech, space: {} };
  const { reader, build } = harness("space-hell_mission", root);
  assert.deepEqual(reader().buildings, []);
  assert.deepEqual(build.beginCycle(), []);
}

{
  const root = { tech: {}, space: { satellite: { count: 0 } } };
  const { reader, build } = harness("space-satellite", root, () => {
    root.space.satellite.count++;
  });
  assert.deepEqual(
    reader().buildings.map((target) => target.key),
    ["space-satellite"],
  );
  build.beginCycle();
  const result = build.execute("space-satellite");
  assert.equal(result.disposition, "verified-success");
  assert.equal(result.mission, false);
  assert.equal(root.space.satellite.count, 1);
}

{
  const { reader, build } = harness("space-unknown_action", {
    tech: {},
    space: {},
  });
  assert.deepEqual(reader().buildings, []);
  assert.deepEqual(build.beginCycle(), []);
}

console.log("captured-grant-action ok");
