import assert from "node:assert/strict";

import { decideResourceClaimLifecycle } from "../../../src/domain/economy/resources/resource-claim-lifecycle.ts";

const current = {
  goal: "active",
  permission: "enabled",
  queues: "empty",
  root: "current",
  progression: "current",
  obligation: "mandatory",
  grant: "incomplete",
  offer: "current",
  price: "current",
  binding: "current",
  nonMana: "affordable",
};

const decision = (overrides = {}) =>
  decideResourceClaimLifecycle({ ...current, ...overrides });

assert.deepEqual(
  [
    decision({ grant: "complete" }).state,
    decision({ nonMana: "affordable" }).state,
  ],
  ["completed", "active"],
  "completing Mad Science removes only that claim while an affordable Black Powder obligation can remain protected",
);
assert.deepEqual(
  [
    decision({ grant: "complete" }).state,
    decision({ grant: "complete" }).state,
  ],
  ["completed", "completed"],
  "both completed obligations leave the active protection set",
);
assert.deepEqual(decision(), {
  state: "active",
  reason: "current-mandatory-offer",
  retainClaim: true,
});
assert.equal(
  decision({ grant: "complete" }).state,
  "completed",
  "a completed member is removed while other obligations remain independently evaluated",
);
assert.equal(decision({ grant: "complete" }).retainClaim, false);
assert.equal(decision({ grant: "complete" }).state, "completed");
assert.equal(decision({ grant: "complete" }).reason, "grant-completed");
assert.equal(decision({ grant: "incomplete" }).state, "active");
assert.equal(
  decision({ grant: "complete", nonMana: "insufficient" }).state,
  "completed",
  "completion removes its own claim even while an independent obligation is blocked",
);
assert.equal(
  decision({ nonMana: "insufficient" }).reason,
  "verified-non-mana-shortage",
  "known non-Mana insufficiency releases only the claim budget, not the graph obligation",
);
assert.equal(decision({ offer: "absent" }).retainClaim, false);
assert.equal(
  decision({ offer: "absent" }).state,
  "released",
  "a fresh offer set that omits an obligation releases only its current claim",
);
assert.equal(
  decision({ offer: "current", price: "changed", nonMana: "affordable" }).state,
  "suspended",
  "a changed price must be freshly admitted before spending protection resumes",
);
assert.equal(
  decision({ offer: "current", price: "current", nonMana: "affordable" }).state,
  "active",
  "an obligation can be readmitted when fresh resources and offer evidence recover",
);
assert.equal(decision({ nonMana: "unknown" }).retainClaim, true);
assert.equal(
  decision({ nonMana: "unknown" }).reason,
  "evidence-unavailable",
  "missing resource data is not treated as a verified shortage",
);
assert.equal(decision({ offer: "unknown" }).state, "suspended");
assert.equal(decision({ root: "replaced" }).state, "invalidated");
assert.equal(decision({ progression: "changed" }).state, "suspended");
assert.equal(decision({ price: "changed" }).state, "suspended");
assert.equal(decision({ binding: "changed" }).state, "suspended");
assert.equal(decision({ queues: "unknown" }).retainClaim, true);
assert.equal(decision({ permission: "disabled" }).retainClaim, false);
assert.equal(decision({ queues: "player-committed" }).retainClaim, false);
assert.equal(decision({ obligation: "not-mandatory" }).state, "invalidated");
assert.equal(decision({ goal: "cancelled" }).retainClaim, false);
assert.equal(decision({ goal: "unknown" }).retainClaim, true);
assert.equal(
  decision({ offer: "unknown", nonMana: "insufficient" }).state,
  "suspended",
  "missing offer evidence cannot turn a previous resource shortage into verified release",
);
assert.equal(
  decision({ price: "changed", nonMana: "insufficient" }).state,
  "released",
  "a changed current Mana price does not hide a verified current non-Mana blocker",
);

console.log("resource-claim-lifecycle ok");
