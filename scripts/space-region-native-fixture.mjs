/** Test-only extraction of the running game's region closures from the pinned snapshot. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { extractSnapshotBlock } from "./snapshot-function-fixture.mjs";

export const nativeSpaceRegionIds = Object.freeze([
  "spc_moon",
  "spc_red",
  "spc_gas",
  "spc_gas_moon",
  "spc_belt",
  "spc_titan",
  "spc_enceladus",
  "spc_triton",
  "spc_makemake",
  "spc_eris",
]);

export const nativeSpaceSnapshotUrl = new URL(
  "../test-artifacts/game/evolve-deadspace.js",
  import.meta.url,
);
export const nativeSpaceSnapshotSource = readFileSync(
  nativeSpaceSnapshotUrl,
  "utf8",
);

const nativeSpaceProjectSource = extractSnapshotBlock(
  nativeSpaceSnapshotSource,
  "var spaceProjects = {",
);
const nativeOuterTruthSource = extractSnapshotBlock(
  nativeSpaceSnapshotSource,
  "var outerTruth = {",
);

/** Resolve the actual entry topology, including spaceProjects' outerTruthTech references. */
export function nativeSpaceRegionMethodSources(region) {
  assert.ok(nativeSpaceRegionIds.includes(region));
  let entry;
  if (nativeSpaceProjectSource.includes(`${region}: {`)) {
    entry = extractSnapshotBlock(nativeSpaceProjectSource, `${region}: {`);
  } else {
    assert.ok(
      nativeSpaceProjectSource.includes(
        `${region}: outerTruthTech().${region},`,
      ),
      `${region} must remain a spaceProjects entry referencing outerTruthTech`,
    );
    entry = extractSnapshotBlock(nativeOuterTruthSource, `${region}: {`);
  }
  const info = extractSnapshotBlock(entry, "info: {");
  return {
    nav: extractSnapshotBlock(info, "nav() {"),
    syndicate: extractSnapshotBlock(info, "syndicate() {"),
  };
}

/**
 * Evaluate only the snapshot's native nav/syndicate methods in a page realm. The methods retain
 * the supplied live root; changing it between reads exercises the game's closure, with no formula
 * supplied by a production stub. Use pageObject.keys(projects) during a protected test draw.
 */
export function createNativeSpaceRegionFixture(root) {
  const context = vm.createContext({ global: root });
  const entries = nativeSpaceRegionIds.map((region) => {
    const methods = nativeSpaceRegionMethodSources(region);
    return `${JSON.stringify(region)}: { info: { ${methods.nav}, ${methods.syndicate} } }`;
  });
  const projects = vm.runInContext(`({ ${entries.join(",")} })`, context);
  return {
    projects,
    pageObject: vm.runInContext("Object", context),
    read(region) {
      const info = projects[region].info;
      return {
        reachable: Boolean(Reflect.apply(info.nav, info, [])),
        syndicateEnabled: Boolean(Reflect.apply(info.syndicate, info, [])),
      };
    },
  };
}
