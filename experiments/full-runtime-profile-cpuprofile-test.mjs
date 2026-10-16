import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeProfiles } from "./full-runtime-profile-cpuprofile.mjs";

// Three samples have deliberately unequal deltas. The leaf alternates between native and JS
// frames so the fixture checks exact self, inclusive, owner, and total attribution.
const profile = {
  nodes: [
    {
      id: 1,
      callFrame: {
        functionName: "(root)",
        url: "",
        lineNumber: 0,
        columnNumber: 0,
      },
      children: [2],
    },
    {
      id: 2,
      callFrame: {
        functionName: "automationFn",
        url: "http://localhost/automation.user.js",
        lineNumber: 0,
        columnNumber: 0,
      },
      children: [3, 4],
    },
    {
      id: 3,
      callFrame: {
        functionName: "nativeLeaf",
        url: "",
        lineNumber: 0,
        columnNumber: 0,
      },
    },
    {
      id: 4,
      callFrame: {
        functionName: "innerAutomation",
        url: "http://localhost/automation.user.js",
        lineNumber: 1,
        columnNumber: 0,
      },
    },
  ],
  samples: [3, 4, 3],
  timeDeltas: [10, 30, 100],
};

const directory = await mkdtemp(join(tmpdir(), "ea-cpuprofile-test-"));
try {
  const path = join(directory, "synthetic.cpuprofile");
  await writeFile(path, JSON.stringify(profile));
  const emptyIndexes = {
    automation: { lines: [], starts: [] },
    game: { lines: [], starts: [] },
  };
  const result = await analyzeProfiles([path], { sourceIndexes: emptyIndexes });

  assert.equal(result.totalSampledMs, 0.14);
  assert.deepEqual(result.selfByOwner, {
    "native<-automation": 0.11,
    automation: 0.03,
  });
  assert.deepEqual(
    result.topSelf
      .slice(0, 2)
      .map(({ name, selfMs, inclMs }) => ({ name, selfMs, inclMs })),
    [
      { name: "nativeLeaf", selfMs: 0.11, inclMs: 0.11 },
      { name: "innerAutomation", selfMs: 0.03, inclMs: 0.03 },
    ],
  );
  assert.equal(result.topInclusiveAutomation[0].name, "automationFn");
  assert.equal(result.topInclusiveAutomation[0].inclMs, 0.14);
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log("V8 CPU-profile sample attribution fixture passed");
