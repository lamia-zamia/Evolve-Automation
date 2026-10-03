import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OUTER_FLEET_REGIONS } from "../src/domain/combat/outer-fleet-regions.ts";
import {
  createNativeSpaceRegionFixture,
  nativeSpaceRegionIds,
  nativeSpaceRegionMethodSources,
  nativeSpaceSnapshotSource,
  nativeSpaceSnapshotUrl,
} from "./space-region-native-fixture.mjs";
import {
  extractSnapshotBlock,
  extractSnapshotFunction,
} from "./snapshot-function-fixture.mjs";

const snapshotRegionNormalize = (source) => source.replace(/\s+/g, " ").trim();
assert.deepEqual(OUTER_FLEET_REGIONS, nativeSpaceRegionIds);
const snapshotRegionCommit = JSON.parse(
  readFileSync(new URL(`${nativeSpaceSnapshotUrl.href}.json`), "utf8"),
).commit;

assert.equal(
  snapshotRegionNormalize(
    extractSnapshotFunction(nativeSpaceSnapshotSource, "spaceTech"),
  ),
  snapshotRegionNormalize(`function spaceTech(r, k) {
    if (r && k) { return spaceProjects[r][k]; }
    return spaceProjects;
  }`),
  "spaceTech must return the private metadata authority without cloning",
);
assert.equal(
  snapshotRegionNormalize(
    extractSnapshotFunction(nativeSpaceSnapshotSource, "outerTruthTech"),
  ),
  "function outerTruthTech() { return outerTruth; }",
);
assert.equal(
  snapshotRegionNormalize(
    extractSnapshotFunction(nativeSpaceSnapshotSource, "regionReachable"),
  ),
  snapshotRegionNormalize(`function regionReachable(region) {
    const info = (spaceTech()[region] || tauCetiModules[region] || {}).info;
    if (!info || typeof info.nav !== "function" || !info.nav()) { return false; }
    if (global.race["orbit_decayed"] && region === "spc_moon") { return false; }
    return true;
  }`),
  "regionReachable changed; reverify the sole orbit_decayed compatibility edge",
);

const snapshotRegionExpectedNav = {
  spc_moon: `nav() { return global.race["orbit_decayed"] || global.race["tidal_decay"] || global.tech["resettle"] && global.tech.resettle < 7 ? false : true; }`,
  spc_titan: `nav() { return global.settings.space.titan && !global.tech["resettle"] || global.tech?.resettle >= 12 ? true : false; }`,
  spc_enceladus: `nav() { return !global.tech["resettle"] || global.tech.resettle >= 12 ? true : false; }`,
  spc_triton: `nav() { return global.tech["resettle"] || !global.settings.space.triton ? false : true; }`,
  spc_makemake: `nav() { return global.tech["resettle"] || !global.settings.space.makemake ? false : true; }`,
  spc_eris: `nav() { return global.tech["resettle"] || !global.settings.space.eris ? false : true; }`,
};
for (const [region, expected] of Object.entries(snapshotRegionExpectedNav)) {
  assert.equal(
    snapshotRegionNormalize(nativeSpaceRegionMethodSources(region).nav),
    snapshotRegionNormalize(expected),
    `${region} native navigation changed in ${snapshotRegionCommit}`,
  );
}
for (const region of ["spc_titan", "spc_enceladus"]) {
  assert.equal(
    snapshotRegionNormalize(nativeSpaceRegionMethodSources(region).syndicate),
    snapshotRegionNormalize(`syndicate() {
      if (global.tech["resettle"]) { return false; }
      return global.tech["titan"] && global.tech.titan >= 3 && global.tech["enceladus"] && global.tech.enceladus >= 2 ? true : false;
    }`),
    `${region} participation remains game owned`,
  );
}

const snapshotRegionRoot = {
  race: {},
  tech: { titan: 3, enceladus: 2, triton: 2, makemake: 1, eris: 1 },
  settings: {
    space: { titan: true, triton: true, makemake: true, eris: true },
  },
};
const snapshotRegionFixture =
  createNativeSpaceRegionFixture(snapshotRegionRoot);
assert.deepEqual(
  Object.keys(snapshotRegionFixture.projects),
  nativeSpaceRegionIds,
);
for (const region of nativeSpaceRegionIds) {
  const info = snapshotRegionFixture.projects[region].info;
  assert.equal(typeof info.nav, "function");
  assert.equal(typeof info.syndicate, "function");
  assert.equal(snapshotRegionFixture.read(region).reachable, true);
  assert.equal(snapshotRegionFixture.read(region).syndicateEnabled, true);
}
assert.notEqual(snapshotRegionFixture.pageObject, Object);

snapshotRegionRoot.race.tidal_decay = 1;
assert.equal(snapshotRegionFixture.read("spc_moon").reachable, false);
delete snapshotRegionRoot.race.tidal_decay;
snapshotRegionRoot.race.orbit_decayed = 1;
assert.equal(snapshotRegionFixture.read("spc_moon").reachable, false);
delete snapshotRegionRoot.race.orbit_decayed;
for (const region of ["titan", "triton", "makemake", "eris"]) {
  snapshotRegionRoot.settings.space[region] = false;
  assert.equal(snapshotRegionFixture.read(`spc_${region}`).reachable, false);
  snapshotRegionRoot.settings.space[region] = true;
  assert.equal(snapshotRegionFixture.read(`spc_${region}`).reachable, true);
}
snapshotRegionRoot.tech.enceladus = 1;
for (const region of ["spc_titan", "spc_enceladus"]) {
  assert.equal(snapshotRegionFixture.read(region).reachable, true);
  assert.equal(snapshotRegionFixture.read(region).syndicateEnabled, false);
}
snapshotRegionRoot.tech.enceladus = 2;
snapshotRegionRoot.tech.resettle = 11;
assert.equal(snapshotRegionFixture.read("spc_titan").reachable, false);
assert.equal(snapshotRegionFixture.read("spc_enceladus").reachable, false);
snapshotRegionRoot.tech.resettle = 12;
assert.equal(snapshotRegionFixture.read("spc_titan").reachable, true);
assert.equal(snapshotRegionFixture.read("spc_enceladus").reachable, true);
assert.equal(snapshotRegionFixture.read("spc_titan").syndicateEnabled, false);
assert.equal(
  snapshotRegionFixture.read("spc_enceladus").syndicateEnabled,
  false,
);

// Eris stage 1 is the survey policy stage, independently of native reachability/participation.
assert.equal(
  snapshotRegionNormalize(
    extractSnapshotBlock(
      nativeSpaceSnapshotSource,
      'if (global.tech.hasOwnProperty("eris_scan") && global.tech.hasOwnProperty("eris") && global.tech.eris === 1 && eScan > 50) {',
    ),
  ),
  snapshotRegionNormalize(`if (global.tech.hasOwnProperty("eris_scan") && global.tech.hasOwnProperty("eris") && global.tech.eris === 1 && eScan > 50) {
    global.tech.eris_scan += eScan - 50;
    if (global.tech.eris_scan >= 100) {
      global.tech.eris_scan = 100;
      global.tech.eris = 2;
      messageQueue(loc("space_eris_scan", [planetName().eris]), "info", false, ["progress"]);
      renderSpace();
    }
  }`),
);

console.log(
  `Native Space region snapshot tests passed (${snapshotRegionCommit})`,
);
