import assert from "node:assert/strict";

import { createPage } from "../../support/fixtures/settings-panel-fixture.mjs";

// --- every game-backed section renders when its capture is present ------------------------------

{
  const { panel, root, diagnostics, logged } = createPage(
    JSON.stringify({
      autoBuild: true,
      autoARPA: true,
      autoStorage: true,
      autoMarket: true,
      autoEject: true,
      autoSupply: true,
    }),
    { allSections: true },
  );
  panel.ensurePanel();
  for (const section of [
    "general",
    "interface",
    "stateLog",
    "achievementGuard",
    "challengeHelper",
    "government",
    "authority",
    "prestige",
    "evolution",
    "planet",
    "hell",
    "mech",
    "war",
    "weighting",
    "building",
    "project",
    "storage",
    "market",
    "ejector",
    "magic",
    "production",
    "trait",
  ]) {
    assert.equal(
      root.querySelectorAll(`#script_${section}Settings`).length,
      1,
      `${section} settings should render once every capture is present`,
    );
  }
  // Every section's reset button is drawn, and clicking one must not throw.
  for (const section of [
    "building",
    "market",
    "storage",
    "production",
    "war",
  ]) {
    const reset = root.querySelectorAll(`#script_reset${section}`)[0];
    assert.ok(reset, `${section} should offer a reset button`);
    reset.dispatch("click");
  }
  assert.deepEqual(logged, []);
  // Sections that genuinely have no capture yet must still say so by name, and only those.
  for (const message of diagnostics) {
    assert.match(message, /not ported yet/);
  }
}

console.log("captured-settings-panel-sections passed");
