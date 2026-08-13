import assert from "node:assert/strict";

import { createRuntimeTestSurface } from "../src/adapters/evolve/runtime-test-surface.js";

const surface = createRuntimeTestSurface();
const firstContext = { value: 1 };
surface.addContext("settings", { settings: "adapter" });
surface.setContext("settings", firstContext);
surface.add({ extra: true });

assert.equal(surface.getContext("settings"), firstContext);
const published = surface.finish();
assert.equal(published.settings, "adapter");
assert.equal(published.extra, true);
const viaSetter = { value: 2 };
published.setSettingsTestContext(viaSetter);
assert.equal(surface.getContext("settings"), viaSetter);

const replacement = { value: 2 };
surface.setContext("settings", replacement);
assert.equal(surface.getContext("settings"), replacement);

console.log("Runtime test surface tests passed");
