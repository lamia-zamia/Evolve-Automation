import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  extractSnapshotBlock,
  extractSnapshotFunction,
} from "./snapshot-function-fixture.mjs";

const snapshotPath = new URL(
  "../test-artifacts/game/evolve-deadspace.js",
  import.meta.url,
);
const snapshot = readFileSync(snapshotPath, "utf8");
const sidecar = JSON.parse(
  readFileSync(new URL(`${snapshotPath.href}.json`), "utf8"),
);
const normalize = (source) => source.replace(/\s+/g, " ").trim();
const authority = extractSnapshotBlock(
  snapshot,
  'if (global.race.universe === "evil" && global.tech["primitive"] && global.tech.primitive >= 3) {',
);
assert.equal(
  normalize(extractSnapshotBlock(authority, 'if (global.civic["garrison"]) {')),
  normalize(`
  if (global.civic["garrison"]) {
    let adjust = 0.7;
    if (global.tech["evil"]) { adjust += 0.1 * global.tech.evil; }
    if (global.portal["fortress"]) {
      garrison += global.portal.fortress.garrison - global.portal.fortress.patrols * global.portal.fortress.patrol_size;
    }
    let gain = highPopAdjust(garrison) * adjust;
    if (global.race["grenadier"]) { gain *= 1.75; }
    if (global.civic.govern.type === "autocracy") { gain *= 1.08; }
    else if (global.civic.govern.type === "dictator") { gain *= 1.12; }
    global.resource.Authority.amount += gain;
  }
`),
  `main.js garrison Authority changed in ${sidecar.commit}; reverify the marginal loss contract`,
);
assert.ok(
  normalize(authority).endsWith(
    normalize(`
  global.resource.Authority.amount *= geneBonus("despot");
  global.resource.Authority.amount = Math.floor(global.resource.Authority.amount);
  if (global.resource.Authority.amount < 0) { global.resource.Authority.amount = 0; }
}`),
  ),
  "Despot must scale the completed standing before the final floor",
);

const declarations = {
  geneBonus: `function geneBonus(gene, idx, reduce) {
    reduce = reduce || false;
    let rank = geneRank(gene);
    if (rank <= 0 || !traits[gene]) { return 1; }
    let vars = geneVars(gene);
    return reduce ? (1 - vars[idx || 0] / 100) ** rank : 1 + vars[idx || 0] * rank / 100;
  }`,
  geneVars: `function geneVars(gene) {
    if (!traits[gene] || !traits[gene].vars) { return [0]; }
    return traits[gene].vars(geneWeak(gene) ? 0.5 : 1);
  }`,
  syncGenes: `function syncGenes() {
    bumpGeneCache();
    syncGenusEmergent();
    geneRoster().forEach(function(t) {
      if (!genes.gene_specials.includes(t)) { delete global.race[t]; }
    });
    geneSlots().forEach(function(slot) {
      if (slot && slot.g && slot.r && geneLike(slot.g)) { global.race[slot.g] = slot.r; }
    });
    geneEmergentList().forEach(function(t) {
      let rank = geneEmergentRank(t);
      if (rank > 0) { global.race[t] = rank; } else { delete global.race[t]; }
    });
  }`,
};
for (const [name, expected] of Object.entries(declarations)) {
  assert.equal(
    normalize(extractSnapshotFunction(snapshot, name)),
    normalize(expected),
    `${name} changed in ${sidecar.commit}; reverify the Despot upper bound`,
  );
}
const despot = extractSnapshotBlock(snapshot, "despot: {");
assert.equal(
  normalize(extractSnapshotBlock(despot, "vars(r = 1) {")),
  "vars(r = 1) { return [2 * r]; }",
);
assert.ok(normalize(despot).includes('type: "minor", base: "A",'));

console.log(
  `Authority snapshot compatibility tests passed (${sidecar.commit})`,
);
