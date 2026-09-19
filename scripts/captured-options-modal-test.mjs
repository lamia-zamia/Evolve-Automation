/**
 * The secondary-option surfaces the game's own panels carry.
 *
 * Each `+` button opens the same captured read model the ordinary settings section draws, under a
 * `c_` prefix. This asserts all four are drawn by the captured panel and that opening each one
 * renders real controls rather than reporting an unported section.
 */

import assert from "node:assert/strict";

import { getOptionsModalButtonDefinitions } from "../src/domain/options-modal.ts";
import { createCapturedSettingsPage } from "./captured-settings-page.mjs";
import { element } from "./dom-fixture.mjs";

/**
 * The game panels the option buttons attach to. `#garrison div h2` and the rest are the selectors
 * `getOptionsModalButtonDefinitions` names, so the fixture builds exactly those shapes.
 */
function addHostPanels(page) {
  const add = (hostId, childTag, className) => {
    const host = element("div", { id: hostId });
    const wrapper = element("div");
    if (className !== undefined) wrapper.classList.add(className);
    const heading = element(childTag);
    wrapper.appendChild(heading);
    host.appendChild(wrapper);
    page.root.appendChild(host);
    return host;
  };
  add("garrison", "h2");
  add("c_garrison", "h2");
  add("gFort", "h3");
  add("prtl_fortress", "h3");
  const government = element("div", { id: "government" });
  const tabs = element("div");
  tabs.classList.add("tabs");
  const list = element("ul");
  tabs.appendChild(list);
  government.appendChild(tabs);
  page.root.appendChild(government);
  const fleet = element("div", { id: "hfleet" });
  fleet.appendChild(element("h3"));
  page.root.appendChild(fleet);
}

const EXPECTED_CONTROLS = {
  war: "foreignPacifist",
  hell: "hellHomeGarrison",
  government: "generalRequestedTaxRate",
  fleet: "fleetOuterCrew",
};

{
  const page = createCapturedSettingsPage();
  addHostPanels(page);
  // The buttons are added on a redraw, once the game has drawn the panels they attach to.
  page.panel.ensurePanel();

  for (const definition of getOptionsModalButtonDefinitions()) {
    assert.equal(
      page.root.querySelectorAll(`#${definition.id}`).length,
      1,
      `${definition.id} should be drawn once`,
    );
  }

  const opened = new Set();
  for (const definition of getOptionsModalButtonDefinitions()) {
    if (opened.has(definition.builder)) continue;
    opened.add(definition.builder);
    page.root.querySelectorAll(`#${definition.id}`)[0].dispatch("click");
    const expected = EXPECTED_CONTROLS[definition.builder];
    assert.equal(
      page.root.querySelectorAll(`#scriptModalBody .script_${expected}`).length,
      1,
      `${definition.builder} options should render ${expected}`,
    );
  }

  assert.deepEqual(
    page.diagnostics,
    [],
    "no secondary surface may report itself unported",
  );
  assert.deepEqual(page.logged, []);
}

console.log("captured secondary options checks passed");
