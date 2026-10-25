import assert from "node:assert/strict";
import {
  accountRendererWindow,
  hostCpuBusyPercent,
  medianRaw,
  summarize,
} from "../../experiments/p46-renderer-cpu-readiness.mjs";

const before = [
  { type: "browser", id: 100, cpuSec: 1 },
  { type: "renderer", id: 200, cpuSec: 2 },
  { type: "utility", id: 300, cpuSec: 0.5 },
];
const after = [
  { type: "browser", id: 100, cpuSec: 1.1 },
  { type: "renderer", id: 200, cpuSec: 3 },
  { type: "utility", id: 300, cpuSec: 0.5 },
];

const stable = accountRendererWindow(before, after, 100);
assert.equal(stable.identityVerified, true);
assert.equal(stable.activeRendererId, 200);
assert.equal(stable.activeRendererCpuSec, 1);
assert.equal(stable.browserPidObserved, true);

const churned = accountRendererWindow(
  before,
  [
    ...after.filter((row) => row.type !== "renderer"),
    { type: "renderer", id: 201, cpuSec: 3 },
  ],
  100,
);
assert.equal(churned.idSetStable, false);
assert.equal(churned.identityVerified, false);
assert.equal(churned.activeRendererCpuSec, null);

const ambiguous = accountRendererWindow(
  [
    { type: "renderer", id: 200, cpuSec: 1 },
    { type: "renderer", id: 201, cpuSec: 1 },
  ],
  [
    { type: "renderer", id: 200, cpuSec: 2 },
    { type: "renderer", id: 201, cpuSec: 2.1 },
  ],
  100,
);
assert.equal(ambiguous.identityVerified, false);

const zeroWorkWithKnownRenderer = accountRendererWindow(
  [{ type: "renderer", id: 200, cpuSec: 1 }],
  [{ type: "renderer", id: 200, cpuSec: 1 }],
  100,
  200,
);
assert.equal(zeroWorkWithKnownRenderer.identityVerified, true);
assert.equal(zeroWorkWithKnownRenderer.activeRendererCpuSec, 0);

assert.equal(summarize([1, 2, 3]).mean, 2);
assert.deepEqual(summarize([4, 4]).ci95Mean, [4, 4]);
assert.equal(medianRaw([1.46e-9, 1.48e-9, 1.44e-9]), 1.46e-9);
assert.equal(
  hostCpuBusyPercent(
    [
      { times: { user: 100, system: 0, idle: 900, nice: 0, irq: 0 } },
      { times: { user: 200, system: 0, idle: 800, nice: 0, irq: 0 } },
    ],
    [
      { times: { user: 200, system: 0, idle: 1800, nice: 0, irq: 0 } },
      { times: { user: 300, system: 0, idle: 1700, nice: 0, irq: 0 } },
    ],
  ),
  10,
);

console.log(
  "P46 process attribution, churn, ambiguity, calibration precision, and summary checks passed",
);
