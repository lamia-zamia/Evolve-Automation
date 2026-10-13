import assert from "node:assert/strict";

import {
  readCapturedMadTargetCondition,
  readCapturedTechApplicability,
} from "../../../src/adapters/evolve/progression/research/captured-tech-applicability.ts";

const definition = (actionId, eligibility) => ({ actionId, eligibility });
const definitions = [
  definition("tech-standard", {
    hasNativeCondition: false,
    routeRestrictions: ["standard", "truepath"],
    restrictions: [],
  }),
  definition("tech-flier-excluded", {
    hasNativeCondition: false,
    routeRestrictions: undefined,
    restrictions: [{ kind: "not_trait", values: ["flier"] }],
  }),
  definition("tech-needs-gene", {
    hasNativeCondition: false,
    routeRestrictions: undefined,
    restrictions: [{ kind: "gene", values: ["queue"] }],
  }),
  definition("tech-not-researched", {
    hasNativeCondition: false,
    routeRestrictions: undefined,
    restrictions: [{ kind: "not_tech", values: ["mad"] }],
  }),
  definition("tech-condition", {
    hasNativeCondition: true,
    routeRestrictions: undefined,
    restrictions: [],
  }),
];

const root = {
  race: { iceage: false, truepath: false, flier: true },
  genes: { queue: 3 },
  tech: { mad: 0 },
};
const applicability = readCapturedTechApplicability(root, definitions);
assert.equal(applicability?.get("tech-standard")?.status, "eligible");
assert.equal(applicability?.get("tech-flier-excluded")?.status, "excluded");
assert.equal(applicability?.get("tech-needs-gene")?.status, "eligible");
assert.equal(applicability?.get("tech-not-researched")?.status, "eligible");

{
  const iceage = readCapturedTechApplicability(
    { ...root, race: { iceage: true, truepath: true, flier: false } },
    definitions,
  );
  assert.equal(iceage?.get("tech-standard")?.status, "excluded");
  assert.equal(iceage?.get("tech-condition")?.status, "eligible");
  assert.equal(
    iceage?.get("tech-condition")?.status,
    "eligible",
    "presence of native condition is retained separately and never invoked here",
  );
}

{
  const truepath = readCapturedTechApplicability(
    { ...root, race: { iceage: false, truepath: true, flier: false } },
    definitions,
  );
  assert.equal(truepath?.get("tech-standard")?.status, "eligible");
}

{
  const absentLazyKeys = readCapturedTechApplicability(
    { race: { iceage: false, truepath: false }, genes: {}, tech: {} },
    definitions,
  );
  assert.equal(
    absentLazyKeys?.get("tech-needs-gene")?.status,
    "excluded",
    "native trait/gene checks read absent lazily initialized keys as false",
  );
  assert.equal(absentLazyKeys?.get("tech-not-researched")?.status, "eligible");
}

assert.equal(readCapturedTechApplicability(null, definitions), undefined);
assert.equal(readCapturedTechApplicability(root, undefined), undefined);
assert.equal(
  readCapturedTechApplicability(
    { ...root, genes: { queue: {} } },
    definitions,
  )?.get("tech-needs-gene")?.status,
  "unknown",
);

assert.equal(readCapturedMadTargetCondition(root).status, "eligible");
assert.equal(
  readCapturedMadTargetCondition({
    ...root,
    race: { ...root.race, sludge: true },
  }).status,
  "excluded",
);
assert.equal(
  readCapturedMadTargetCondition({
    ...root,
    race: { ...root.race, truepath: true },
  }).status,
  "excluded",
);
assert.equal(
  readCapturedMadTargetCondition({
    ...root,
    race: { ...root.race, truepath: true },
    tech: { ...root.tech, world_control: 1 },
  }).status,
  "eligible",
);
assert.equal(readCapturedMadTargetCondition(null).status, "unknown");

console.log("captured static Research applicability tests passed");
