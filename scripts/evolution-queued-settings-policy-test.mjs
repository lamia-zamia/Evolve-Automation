import assert from "node:assert/strict";

import { planQueuedSettings } from "../src/domain/progression/evolution/queued-settings.ts";

const first = Object.freeze({ enabled: false, count: "wrong", unknown: true });
const settingsRaw = Object.freeze({ enabled: true, count: 3 });
const plan = planQueuedSettings({
  enabled: true,
  repeat: false,
  settingsRaw,
  queuedSettings: first,
  hasQueuedSettings: true,
});

assert.deepEqual(plan.commands, [
  { kind: "consume-first" },
  { kind: "write-setting", settingName: "enabled", value: false },
  {
    kind: "type-mismatch",
    settingName: "count",
    currentValue: 3,
    queuedValue: "wrong",
  },
  {
    kind: "type-mismatch",
    settingName: "unknown",
    currentValue: undefined,
    queuedValue: true,
  },
]);
assert.deepEqual(settingsRaw, { enabled: true, count: 3 });

const repeated = planQueuedSettings({
  enabled: true,
  repeat: true,
  settingsRaw,
  queuedSettings: first,
  hasQueuedSettings: true,
});
assert.equal(repeated.commands.at(-1).kind, "repeat-first");
assert.equal(repeated.commands[0].kind, "consume-first");
assert.equal(
  planQueuedSettings({
    enabled: false,
    repeat: true,
    settingsRaw,
    queuedSettings: first,
    hasQueuedSettings: true,
  }),
  undefined,
);
assert.equal(
  planQueuedSettings({
    enabled: true,
    repeat: true,
    settingsRaw,
    queuedSettings: first,
    hasQueuedSettings: false,
  }),
  undefined,
);

console.log("Evolution queued settings policy tests passed");
