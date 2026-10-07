import assert from "node:assert/strict";

import { createCapturedPlanningPanels } from "../../../src/adapters/browser/captured-planning-panels.ts";
import {
  createTestDocument,
  element,
} from "../../support/fixtures/dom-fixture.mjs";

function makeTarget(key, overrides = {}) {
  return Object.freeze({
    key,
    family: "buildings",
    actionId: key,
    weighting: 100,
    cost: Object.freeze({ Money: 10 }),
    queued: false,
    blocker: "ready",
    ...overrides,
  });
}

function makeModel(overrides = {}) {
  return Object.freeze({
    construction: Object.freeze({
      cycleId: 1,
      detailLevel: "planner",
      targets: Object.freeze([makeTarget("city-house")]),
    }),
    freshness: "fresh",
    queues: Object.freeze({
      build: Object.freeze([]),
      research: Object.freeze([]),
    }),
    triggers: Object.freeze([]),
    stats: Object.freeze({
      startDay: 3,
      day: 4,
      reset: 2,
      samples: Object.freeze({ ready: 2 }),
      total: 2,
    }),
    collapsed: false,
    ...overrides,
  });
}

function panelNames(root) {
  return ["ea-active-targets", "ea-script-planner"].filter(
    (id) => root.querySelectorAll(`#${id}`).length === 1,
  );
}

function textOf(node) {
  return `${node.textContent}${node.children.map(textOf).join("")}`;
}

// Disabled startup creates no script panels and performs no queue or game actions.
{
  const root = element("main");
  root.appendChild(element("div", { id: "buildQueue" }));
  const document = createTestDocument(root);
  const panels = createCapturedPlanningPanels({
    getDocument: () => document,
    readSettings: () => ({}),
    onResetPlannerStats: () => assert.fail("disabled UI cannot reset stats"),
    onCollapsedChange: () => assert.fail("disabled UI cannot persist collapse"),
  });
  panels.syncActiveTargetsUI(false);
  panels.syncBuildPlannerUI(false);
  panels.update(makeModel());
  assert.deepEqual(panelNames(root), []);
}

// Startup settings wait for a late game queue anchor; the next ordinary runtime wake mounts one
// copy, and settings changes mount and unmount the matching panels immediately.
{
  const root = element("main");
  const document = createTestDocument(root);
  const panels = createCapturedPlanningPanels({
    getDocument: () => document,
    readSettings: () => ({}),
    onResetPlannerStats: () => {},
    onCollapsedChange: () => {},
  });
  panels.syncBuildPlannerUI(true);
  panels.update(makeModel());
  assert.deepEqual(panelNames(root), []);

  root.appendChild(element("div", { id: "buildQueue" }));
  panels.syncBuildPlannerUI(true);
  assert.deepEqual(panelNames(root), ["ea-script-planner"]);
  panels.syncBuildPlannerUI(true);
  panels.update(makeModel());
  assert.equal(root.querySelectorAll("#ea-script-planner").length, 1);

  panels.syncActiveTargetsUI(true);
  assert.deepEqual(panelNames(root), [
    "ea-active-targets",
    "ea-script-planner",
  ]);
  panels.syncBuildPlannerUI(false);
  assert.deepEqual(panelNames(root), ["ea-active-targets"]);
  panels.syncActiveTargetsUI(false);
  assert.deepEqual(panelNames(root), []);
}

// The planner preserves the captured merged order, displays only the top five and annotates
// blockers, queue membership, and trigger relationships from the supplied immutable model.
{
  const root = element("main");
  const anchor = element("div", { id: "buildQueue" });
  root.appendChild(anchor);
  const document = createTestDocument(root);
  const settings = { buildPlannerCollapsed: false };
  const persisted = [];
  let resetCount = 0;
  const targets = Object.freeze([
    makeTarget("city-top", {
      weighting: 700,
      queued: true,
      blocker: "income",
      resourceId: "Money",
      timeSeconds: 120,
    }),
    makeTarget("city-storage", {
      weighting: 600,
      blocker: "storage",
      resourceId: "Food",
    }),
    makeTarget("arpa-locked", {
      family: "arpa",
      projectId: "siphon",
      weighting: 500,
      blocker: "locked",
      resourceId: "Crystal",
    }),
    makeTarget("city-stalled", {
      weighting: 400,
      blocker: "stalled",
      resourceId: "Stone",
    }),
    makeTarget("city-unavailable", { weighting: 300, blocker: "unavailable" }),
    makeTarget("city-sixth", { weighting: 200 }),
  ]);
  const panels = createCapturedPlanningPanels({
    getDocument: () => document,
    readSettings: () => settings,
    onResetPlannerStats: () => resetCount++,
    onCollapsedChange: (collapsed) => {
      settings.buildPlannerCollapsed = collapsed;
      persisted.push(collapsed);
    },
  });
  panels.syncBuildPlannerUI(true);
  panels.update(
    makeModel({
      construction: Object.freeze({
        cycleId: 8,
        detailLevel: "planner",
        targets,
      }),
      triggers: Object.freeze([
        Object.freeze({ id: "city-top", kind: "build" }),
        Object.freeze({
          id: "siphon-action",
          kind: "arpa",
          projectId: "siphon",
        }),
      ]),
    }),
  );

  const planner = root.querySelectorAll("#ea-script-planner")[0];
  const rows = planner
    .querySelectorAll("ol")[0]
    .children.map((row) => textOf(row));
  assert.equal(rows.length, 5);
  assert.match(
    rows[0],
    /city-top · weight 700 · Income · ETA 2m \(Money\) · queued · trigger target/,
  );
  assert.match(rows[1], /Storage \(Food\)/);
  assert.match(
    rows[2],
    /A\.R\.P\.A\. · arpa-locked · weight 500 · Locked \(Crystal\) · trigger target/,
  );
  assert.match(rows[3], /Stalled \(Stone\)/);
  assert.match(rows[4], /Unavailable/);
  assert.equal(
    rows.some((row) => row.includes("city-sixth")),
    false,
  );

  const collapseButton = planner.querySelectorAll("button")[0];
  collapseButton.dispatch("click");
  assert.deepEqual(persisted, [true]);
  assert.equal(planner.querySelectorAll("ol").length, 0);
  assert.equal(
    planner.querySelectorAll("button")[0].getAttribute("aria-expanded"),
    "false",
  );
  planner.querySelectorAll("button")[0].dispatch("click");
  assert.deepEqual(persisted, [true, false]);
  planner.querySelectorAll("button").at(-1).dispatch("click");
  assert.equal(resetCount, 1);
}

// Detailed Queue renders captured categories, omits empty categories, and does not mutate them.
{
  const root = element("main");
  root.appendChild(element("div", { id: "buildQueue" }));
  const document = createTestDocument(root);
  const queues = Object.freeze({
    build: Object.freeze([Object.freeze({ id: "city-farm", label: "Farm" })]),
    research: Object.freeze([
      Object.freeze({ id: "tech-metallurgy", label: "Metallurgy" }),
    ]),
  });
  const panels = createCapturedPlanningPanels({
    getDocument: () => document,
    readSettings: () => ({}),
    onResetPlannerStats: () => {},
    onCollapsedChange: () => {},
  });
  panels.syncActiveTargetsUI(true);
  panels.update(
    makeModel({
      construction: Object.freeze({
        cycleId: 2,
        detailLevel: "planner",
        targets: Object.freeze([
          makeTarget("project-catalyst", {
            family: "arpa",
            projectId: "catalyst",
            weighting: 90,
          }),
        ]),
      }),
      queues,
      triggers: Object.freeze([
        Object.freeze({ id: "city-farm", kind: "build" }),
      ]),
    }),
  );
  const active = root.querySelectorAll("#ea-active-targets")[0];
  const categoryText = active
    .querySelectorAll("section")
    .map((section) => textOf(section));
  assert.deepEqual(categoryText, [
    "Triggerscity-farm · build",
    "Build queueFarm",
    "Research queueMetallurgy",
    "A.R.P.A. project targetsproject-catalyst",
  ]);
  assert.deepEqual(
    queues.build.map((entry) => entry.id),
    ["city-farm"],
  );
  assert.deepEqual(
    queues.research.map((entry) => entry.id),
    ["tech-metallurgy"],
  );

  panels.update(makeModel());
  assert.equal(active.querySelectorAll("section").length, 0);
}

// A hidden page receives no DOM writes. The retained model is rendered on the next visible wake.
{
  const root = element("main");
  root.appendChild(element("div", { id: "buildQueue" }));
  const document = createTestDocument(root);
  const panels = createCapturedPlanningPanels({
    getDocument: () => document,
    readSettings: () => ({}),
    onResetPlannerStats: () => {},
    onCollapsedChange: () => {},
  });
  panels.syncBuildPlannerUI(true);
  panels.update(makeModel());
  const planner = root.querySelectorAll("#ea-script-planner")[0];
  const originalChildren = [...planner.children];

  document.hidden = true;
  panels.update(
    makeModel({
      construction: Object.freeze({
        cycleId: 2,
        detailLevel: "planner",
        targets: Object.freeze([makeTarget("new-target")]),
      }),
    }),
  );
  assert.deepEqual(planner.children, originalChildren);

  document.hidden = false;
  panels.update(
    makeModel({
      construction: Object.freeze({
        cycleId: 2,
        detailLevel: "planner",
        targets: Object.freeze([makeTarget("new-target")]),
      }),
    }),
  );
  assert.match(textOf(planner), /new-target/);
}

{
  const root = element("main");
  root.appendChild(element("div", { id: "buildQueue" }));
  const document = createTestDocument(root);
  const panels = createCapturedPlanningPanels({
    getDocument: () => document,
    readSettings: () => ({}),
    onResetPlannerStats: () => {},
    onCollapsedChange: () => {},
  });
  panels.syncBuildPlannerUI(true);
  panels.update(
    makeModel({
      construction: Object.freeze({
        cycleId: 5,
        detailLevel: "targets",
        targets: Object.freeze([
          makeTarget("city-candidate", { blocker: "unavailable" }),
        ]),
      }),
    }),
  );
  const planner = root.querySelectorAll("#ea-script-planner")[0];
  assert.match(
    textOf(planner),
    /Awaiting a planner-enabled construction cycle/,
  );
  assert.doesNotMatch(textOf(planner), /Fresh construction cycle 5/);

  panels.update(
    makeModel({
      construction: Object.freeze({
        cycleId: 6,
        detailLevel: "planner",
        targets: Object.freeze([makeTarget("city-candidate")]),
      }),
    }),
  );
  assert.match(textOf(planner), /Fresh construction cycle 6/);
}

console.log("Captured planning panel tests passed");
