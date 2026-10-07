import assert from "node:assert/strict";
import { createCapturedSettingsPanel } from "../../../src/bootstrap/captured-settings-panel-control.ts";
import { createSettingsStore } from "../../../src/adapters/browser/settings-store.ts";
import { createCapturedSettingsDefaults } from "../../../src/adapters/evolve/captured-settings-defaults.ts";
import { createCapturedSettingsLifecycle } from "../../../src/application/captured-settings-lifecycle.ts";
import {
  createPage,
  createStorage,
} from "../../support/fixtures/settings-panel-fixture.mjs";

// --- platform and safe mode -----------------------------------------------------------------------

{
  const { panel, root, settings } = createPage(
    JSON.stringify({ autoBuild: false }),
    { platform: "MacIntel" },
  );
  panel.ensurePanel();
  const label = root
    .querySelectorAll("label")
    .map((node) => node.textContent)
    .join(" ");
  assert.match(label, /Alt\+click/, "macOS uses Alt for the override chord");
  const target = root.querySelectorAll(".script_autoBuild")[0];
  target.parentElement.dispatch("click", target, { altKey: true });
  assert.equal(root.querySelectorAll("#script_autoBuildModal").length, 1);
  root
    .querySelectorAll("#script_autoBuild_d")[0]
    .querySelectorAll("a")[0]
    .dispatch("click");
  assert.equal(settings.readRaw().overrides.autoBuild.length, 1);
}

{
  const { panel, root } = createPage(JSON.stringify({}), {
    url: "https://x/#safemode",
  });
  panel.ensurePanel();
  const text = root
    .querySelectorAll("p")
    .map((node) => node.textContent)
    .join(" ");
  assert.match(text, /Safe mode active/);
}

// --- a host with no document has no panel, silently ----------------------------------------------

{
  const logged = [];
  const settings = createSettingsStore({ storage: createStorage("{}") });
  const panel = createCapturedSettingsPanel({
    capturedPanelWindow: {},
    settings,
    settingsLifecycle: createCapturedSettingsLifecycle({
      settings,
      defaults: createCapturedSettingsDefaults({
        rootState: { readRoot: () => ({}) },
        controls: { capturedElementIds: () => [] },
        mechanics: {
          readStructures: () => undefined,
          readStructureIdentities: () => undefined,
        },
      }),
    }),
    logError: (message) => logged.push(message),
  });
  panel.ensurePanel();
  panel.ensurePanel();
  assert.deepEqual(
    logged,
    [],
    "a host with no DOM is an expected shape, not an error to report",
  );
}

console.log("captured-settings-panel-options passed");
