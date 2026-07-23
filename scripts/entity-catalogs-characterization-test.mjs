import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
const sandbox = {
  __EA_TEST_HOOKS__: hooks,
  cloneInto: (value) => value,
  console,
  localStorage: { getItem: () => null },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  unsafeWindow: {},
  $: () => ({ ready() {} }),
};
sandbox.window = sandbox;
sandbox.window.location = "https://pmotschmann.github.io/Evolve/";

vm.runInNewContext(source, sandbox, {
  filename: "evolve_automation.user.js",
  timeout: 10_000,
});

const catalogs = hooks.entityCatalogs;
assert.ok(catalogs, "entity catalogs hook missing");
const classes = hooks.entityClasses;
assert.ok(classes, "entity classes hook missing");
assert.deepEqual(Array.from(Object.keys(catalogs)), [
  "resources",
  "jobs",
  "crafter",
  "buildings",
  "linkedBuildings",
  "projects",
]);

assert.equal(catalogs.resources.Money instanceof classes.Resource, true);
assert.equal(catalogs.jobs.Farmer instanceof classes.BasicJob, true);
assert.equal(catalogs.crafter.Plywood instanceof classes.CraftingJob, true);
assert.equal(catalogs.buildings.Farm instanceof classes.Action, true);
assert.equal(catalogs.projects.LaunchFacility instanceof classes.Project, true);
assert.equal(catalogs.linkedBuildings.length, 2);
assert.equal(catalogs.linkedBuildings[0][0], catalogs.buildings.LakeTransport);
assert.equal(catalogs.linkedBuildings[0][1], catalogs.buildings.LakeBireme);
assert.equal(catalogs.linkedBuildings[1][0], catalogs.buildings.SpirePort);
assert.equal(catalogs.linkedBuildings[1][1], catalogs.buildings.SpireBaseCamp);

function descriptorFingerprint(root) {
  const seen = new WeakMap();
  let nextId = 1;
  function visit(value) {
    if (typeof value === "function") {
      return ["function", value.name.replace(/\d+$/, ""), value.length];
    }
    if (value === null || typeof value !== "object") {
      if (typeof value === "number" && Number.isNaN(value)) return ["NaN"];
      return [typeof value, value];
    }
    if (seen.has(value)) return ["reference", seen.get(value)];
    const id = nextId++;
    seen.set(value, id);
    const descriptors = Reflect.ownKeys(value).map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      const name =
        typeof key === "symbol" ? "symbol:" + (key.description ?? "") : key;
      if ("value" in descriptor) {
        return [
          name,
          descriptor.enumerable,
          descriptor.writable,
          visit(descriptor.value),
        ];
      }
      return [
        name,
        descriptor.enumerable,
        ["get", descriptor.get?.name ?? "", descriptor.get?.length ?? -1],
        ["set", descriptor.set?.name ?? "", descriptor.set?.length ?? -1],
      ];
    });
    return [
      id,
      (value.constructor?.name ?? "").replace(/\d+$/, ""),
      descriptors,
    ];
  }
  return visit(root);
}

const fingerprint = descriptorFingerprint(catalogs);
const catalogHash = createHash("sha256")
  .update(JSON.stringify(fingerprint))
  .digest("hex");
assert.deepEqual(
  {
    resources: Object.keys(catalogs.resources).length,
    jobs: Object.keys(catalogs.jobs).length,
    crafter: Object.keys(catalogs.crafter).length,
    buildings: Object.keys(catalogs.buildings).length,
    projects: Object.keys(catalogs.projects).length,
  },
  { resources: 100, jobs: 27, crafter: 9, buildings: 429, projects: 9 },
);
assert.equal(
  catalogHash,
  "ddbe26eed9c0dc4c1e751d225a82f37b889a0e17d1fd77fe867c88a7e215e313",
);
console.log("Entity catalogs bundled characterization tests passed");
