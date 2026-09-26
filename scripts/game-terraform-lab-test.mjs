import assert from "node:assert/strict";

import { createDeadSpaceTerraformLabFixture } from "./deadspace-lab-fixture.mjs";

const root = { stats: { terraform: 0 } };
let submissions = 0;
const fixture = createDeadSpaceTerraformLabFixture({
  root,
  score: 4,
  onSetPlanet: () => {
    submissions += 1;
  },
});
const snapshot = fixture.port.read();
assert.ok(snapshot);
assert.equal(snapshot.canSubmit, true);
assert.deepEqual(fixture.nativeCalls, []);
assert.deepEqual(fixture.port.submit(snapshot.session), {
  status: "requested",
});
assert.deepEqual(fixture.nativeCalls, ["pEdit", "setPlanet"]);
assert.equal(submissions, 1);
assert.equal(
  root.stats.terraform,
  0,
  "control invocation alone is not reset completion",
);

const invalid = createDeadSpaceTerraformLabFixture({ root, score: -1 });
const invalidSnapshot = invalid.port.read();
assert.equal(
  invalidSnapshot?.canSubmit,
  true,
  "the native submit surface is available; pEdit refreshes game eligibility at invocation",
);
assert.equal(
  invalid.port.submit(invalidSnapshot.session).status,
  "unavailable",
);
assert.deepEqual(invalid.nativeCalls, ["pEdit"]);

// Geology controls change p.geology without refreshing p.pts. Reprice before gating so a stale
// negative display cannot permanently suppress an affordable live planet.
const staleScore = createDeadSpaceTerraformLabFixture({
  root,
  score: -1,
  scoreAfterEdit: 4,
});
const staleSnapshot = staleScore.port.read();
assert.equal(staleScore.port.submit(staleSnapshot.session).status, "requested");
assert.equal(staleScore.planet.pts, 4);
assert.deepEqual(staleScore.nativeCalls, ["pEdit", "setPlanet"]);

const staleAffordableDisplay = createDeadSpaceTerraformLabFixture({
  root,
  score: 4,
  scoreAfterEdit: -1,
});
const affordableSnapshot = staleAffordableDisplay.port.read();
assert.equal(
  staleAffordableDisplay.port.submit(affordableSnapshot.session).status,
  "unavailable",
  "pEdit replaces a stale affordable display with the current native ineligible score",
);
assert.deepEqual(staleAffordableDisplay.nativeCalls, ["pEdit"]);

const rejected = createDeadSpaceTerraformLabFixture({
  root,
  score: 0,
  rejectSubmission: true,
});
const rejectedSnapshot = rejected.port.read();
assert.equal(rejected.port.submit(rejectedSnapshot.session).status, "rejected");
assert.deepEqual(rejected.nativeCalls, ["pEdit", "setPlanet"]);

const stale = createDeadSpaceTerraformLabFixture({ root, score: 0 });
const oldSession = stale.port.read().session;
stale.redraw();
assert.equal(stale.port.submit(oldSession).status, "stale");

console.log("DeadSpace Terraform planet lab contract checks passed");
