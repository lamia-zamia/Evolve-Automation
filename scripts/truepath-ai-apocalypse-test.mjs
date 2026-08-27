import assert from "node:assert/strict";
import {
  isTruepathAiResourceResearch,
  planTruepathAiApocalypse,
  readTruepathAiProgress,
} from "../src/domain/progression/truepath/ai-apocalypse.ts";

const base = {
  enabled: true,
  aiCoreLevel: 3,
  decoderCount: 4,
  decoderOnCount: 4,
  colonistCount: 0,
  colonistOnCount: 0,
  trooperOnCount: 13,
  tankOnCount: 7,
};

assert.equal(readTruepathAiProgress(base), 40);
assert.deepEqual(planTruepathAiApocalypse(base), {
  progress: 40,
  target: "TitanAIColonist",
  targetColonistCount: 43,
  additionalColonistPower: 430,
});

// Live building prices make the controller choose the cheaper progress path:
// the next Decoder removes more future Colonists than its price adds.
assert.equal(
  planTruepathAiApocalypse({
    ...base,
    decoderMoneyCost: 33_000_000,
    colonistMoneyCost: 112_000_000,
    trooperMoneyCost: 59_000_000,
    tankMoneyCost: 477_000_000,
  }).target,
  "TitanDecoder",
);

assert.deepEqual(planTruepathAiApocalypse({ ...base, colonistOnCount: 43 }), {
  progress: 100,
  target: null,
  targetColonistCount: 0,
  additionalColonistPower: 0,
});
assert.deepEqual(planTruepathAiApocalypse({ ...base, decoderOnCount: 0 }), {
  progress: 40,
  target: null,
  targetColonistCount: 0,
  additionalColonistPower: 0,
});
assert.deepEqual(
  planTruepathAiApocalypse({ ...base, decoderCount: 0, decoderOnCount: 0 }),
  {
    progress: 40,
    target: "TitanDecoder",
    targetColonistCount: 0,
    additionalColonistPower: 0,
  },
);
assert.deepEqual(
  planTruepathAiApocalypse({ ...base, colonistCount: 43, colonistOnCount: 0 }),
  {
    progress: 40,
    target: null,
    targetColonistCount: 43,
    additionalColonistPower: 0,
  },
);
assert.deepEqual(planTruepathAiApocalypse({ ...base, aiCoreLevel: 2 }), {
  progress: 40,
  target: null,
  targetColonistCount: 0,
  additionalColonistPower: 0,
});
assert.deepEqual(planTruepathAiApocalypse({ ...base, enabled: false }), {
  progress: 40,
  target: null,
  targetColonistCount: 0,
  additionalColonistPower: 0,
});

assert.equal(isTruepathAiResourceResearch("tech-ai_optimizations"), true);
assert.equal(isTruepathAiResourceResearch("tech-synthetic_life"), true);
assert.equal(isTruepathAiResourceResearch("tech-protocol66"), true);
assert.equal(isTruepathAiResourceResearch("tech-protocol66a"), true);
assert.equal(isTruepathAiResourceResearch("tech-unrelated"), false);
assert.equal(isTruepathAiResourceResearch(null), false);

console.log("True Path AI apocalypse policy tests passed");
