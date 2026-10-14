import assert from "node:assert/strict";

import { attestResearchManaDebit } from "../../../src/domain/progression/research-mana-attestation.ts";

const requirements = [
  "upstream-runtime-identity",
  "native-action-binding",
  "offer-control-binding",
  "mana-callback-identity",
  "cost-adjustment-chain",
  "debit-evaluation-stability",
  "current-route-and-progression",
  "observed-debit",
];
const evidence = (status = "verified") =>
  requirements.map((requirement) => ({
    requirement,
    status,
  }));

assert.deepEqual(attestResearchManaDebit(evidence()), {
  status: "verified",
  reasons: [],
});
assert.deepEqual(
  attestResearchManaDebit(
    evidence().map((item) =>
      item.requirement === "mana-callback-identity"
        ? {
            ...item,
            status: "source-inferred",
            reason: "matching function text does not bind the runtime callback",
          }
        : item,
    ),
  ),
  {
    status: "source-inferred",
    reasons: [
      "mana-callback-identity: matching function text does not bind the runtime callback",
    ],
  },
  "source code or callback text cannot become a verified runtime binding",
);
assert.equal(
  attestResearchManaDebit(
    evidence().map((item) =>
      item.requirement === "observed-debit"
        ? { ...item, status: "observed", reason: "stock delta only" }
        : item,
    ),
  ).status,
  "observed",
);
assert.deepEqual(
  attestResearchManaDebit(
    evidence().filter((item) => item.requirement !== "cost-adjustment-chain"),
  ),
  {
    status: "unavailable",
    reasons: ["cost-adjustment-chain: required evidence was not supplied"],
  },
  "every missing prerequisite names why attestation is unavailable",
);
assert.equal(
  attestResearchManaDebit(
    evidence().map((item) =>
      item.requirement === "offer-control-binding"
        ? {
            ...item,
            status: "conflicting",
            reason: "native offer was replaced",
          }
        : item,
    ),
  ).status,
  "conflicting",
);
assert.equal(
  attestResearchManaDebit([
    ...evidence(),
    {
      requirement: "mana-callback-identity",
      status: "verified",
    },
  ]).status,
  "conflicting",
  "duplicate evidence cannot overwrite an earlier attestation input",
);
