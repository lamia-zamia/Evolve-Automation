import assert from "node:assert/strict";

import { createQueuePanels } from "../src/ui/queue-panels.ts";

function createDom() {
  const trace = [];
  const handlers = new Map();
  const lengths = new Map();
  const rendered = new Map();

  function node(selector) {
    const target = {
      before(content) {
        trace.push(`before:${selector}`);
        rendered.set(`before:${selector}`, content);
        return target;
      },
      css(property, value) {
        trace.push(`css:${selector}:${property}=${value}`);
        return target;
      },
      hide() {
        trace.push(`hide:${selector}`);
        return target;
      },
      html(content) {
        trace.push(`html:${selector}`);
        rendered.set(selector, content);
        return target;
      },
      on(events, handler) {
        handlers.set(`${selector}:${events}`, handler);
        return target;
      },
      outerHeight() {
        return 40;
      },
      remove() {
        trace.push(`remove:${selector}`);
        return target;
      },
      show() {
        trace.push(`show:${selector}`);
        return target;
      },
      toggle(state) {
        trace.push(`toggle:${selector}:${state}`);
        return target;
      },
    };
    Object.defineProperty(target, "length", {
      get: () => lengths.get(selector) ?? 1,
    });
    Object.defineProperty(target, "0", { value: `${selector}[0]` });
    return target;
  }

  const $ = (selector) => node(selector);
  $.isEmptyObject = (value) => Object.keys(value).length === 0;

  return { $, trace, handlers, lengths, rendered };
}

function createPanels(overrides = {}) {
  const dom = createDom();
  const observed = [];
  const saved = [];
  const settingsRaw = {
    buildPlannerCollapsed: false,
    ...overrides.settingsRaw,
  };
  const state = { plannerStats: null };
  const dependencies = {
    getJQuery: () => dom.$,
    getGame: () => ({
      global: {
        resource: { Knowledge: { max: 1000 } },
        race: overrides.race ?? {},
      },
    }),
    getResources: () => ({
      Money: {
        name: "Money",
        title: "Money",
        currentQuantity: 100,
        maxQuantity: 10000,
        income: 10,
      },
      Knowledge: {
        name: "Knowledge",
        title: "Knowledge",
        currentQuantity: 50,
        // The wrapper mirrors the game's own cap, which is what the readout compares against.
        maxQuantity: 1000,
        income: 5,
      },
      Stone: {
        name: "Stone",
        title: "Stone",
        currentQuantity: 5,
        maxQuantity: 10,
        income: 0,
      },
      Soul_Gem: {
        name: "Soul_Gem",
        title: "Soul Gem",
        currentQuantity: 0,
        maxQuantity: 100,
        income: 1,
      },
    }),
    getPoly: () => ({ timeFormat: (seconds) => `T${Math.round(seconds)}` }),
    getSettingsRaw: () => settingsRaw,
    getState: () => state,
    getMultiSegmentedTimeLeft: () => ({ timeLeft: "T99", resource: "Money" }),
    isProject: (target) => target.kind === "project",
    isTechnology: (target) => target.kind === "technology",
    getResizeObserver: () =>
      overrides.resizeObserver === undefined
        ? class {
            constructor(callback) {
              this.callback = callback;
            }
            observe(element) {
              observed.push(element);
              this.callback([{ borderBoxSize: [{ blockSize: 60 }] }]);
            }
          }
        : overrides.resizeObserver,
    updateSettingsFromState: () => dom.trace.push("persist"),
    makePlannerStats: () => overrides.plannerStats ?? null,
    savePlannerStats: (stats) => {
      saved.push(stats);
      return true;
    },
  };
  return {
    dom,
    observed,
    saved,
    settingsRaw,
    state,
    panels: createQueuePanels(dependencies),
  };
}

function renderOne(target, type, overrides) {
  const fixture = createPanels(overrides);
  fixture.panels.updateActiveTargetsUI([target], type);
  const rows = fixture.dom.rendered.get(
    `#active_targets ul.active_targets-list.${type}`,
  );
  assert.equal(rows.length, 1);
  return { html: rows[0], fixture };
}

function widths(html) {
  return [...html.matchAll(/width: ([^%]+)%/g)].map((match) => match[1]);
}

// An empty list hides its box and renders nothing.
{
  const fixture = createPanels();
  fixture.panels.updateActiveTargetsUI([], "research");
  assert.deepEqual(fixture.dom.trace, [
    "hide:#active_targets .target-type-box.research",
  ]);
  assert.equal(fixture.dom.rendered.size, 0);
}

// A plain building owes its listed cost once, and its unaffordable rows carry the time to afford.
{
  const { html } = renderOne(
    {
      kind: "building",
      name: "Mine",
      id: "mine",
      _tab: "city",
      count: 2,
      cost: { Money: 200, Stone: 8 },
    },
    "buildings",
  );
  assert.match(html, /Mine #3 /);
  assert.match(html, /data-queueid="city-mine"/);
  // Money: short by 100 at 10/s. Stone: no income, so the whole target reads Never.
  assert.match(
    html,
    /has-text-danger'>Money<[\s\S]*active_targets-time-left">T10</,
  );
  assert.match(
    html,
    /has-text-danger'>Stone<[\s\S]*active_targets-time-left">Never</,
  );
  assert.deepEqual(widths(html), ["50", "62.5"]);
}

// A tabless building keys its removal control by id alone.
{
  const { html } = renderOne(
    { kind: "building", name: "Ruins", id: "ruins", cost: { Money: 10 } },
    "buildings",
  );
  assert.match(html, /data-queueid="ruins"/);
}

// A cost naming a resource the script has no wrapper for contributes no row.
{
  const { html } = renderOne(
    {
      kind: "building",
      name: "Shrine",
      id: "shrine",
      _tab: "city",
      cost: { Money: 10, Chrysotile: 5 },
    },
    "buildings",
  );
  assert.match(html, /Money</);
  assert.doesNotMatch(html, /Chrysotile/);
  assert.equal(widths(html).length, 1);
}

// A multi-segmented building scales its cost by the segments it still owes.
{
  const { html } = renderOne(
    {
      kind: "building",
      name: "Space Elevator",
      id: "elevator",
      _tab: "space",
      count: 4,
      gameMax: 100,
      is: { multiSegmented: true },
      cost: { Money: 10 },
    },
    "buildings",
  );
  // 96 segments remain, so the row costs 960 rather than 10, and the count is not a #suffix.
  assert.match(html, /Space Elevator </);
  assert.match(html, /active-target-segments has-text-special">\(4 \/ 100\)/);
  assert.match(html, /time">T99 <span/);
  assert.deepEqual(widths(html), [String((100 / 960) * 100)]);
}

// A project scales its cost by the percentage it still owes and shows its progress.
{
  const { html } = renderOne(
    {
      kind: "project",
      name: "Launch Facility",
      id: "launch",
      _tab: "arpa",
      progress: 60,
      currentStep: 2,
      cost: { Money: 50 },
    },
    "arpa",
  );
  assert.match(html, /Launch Facility \(60%\)/);
  assert.match(html, /data-queueid="arpalaunch"/);
  // (100 - 60) / 2 = 20 steps of 50.
  assert.deepEqual(widths(html), [String((100 / 1000) * 100)]);
}

// A target that claims segments without declaring them owes its listed cost once.
{
  const { html } = renderOne(
    {
      kind: "building",
      name: "Unstepped",
      id: "unstepped",
      is: { multiSegmented: true },
      cost: { Money: 200 },
    },
    "buildings",
  );
  assert.deepEqual(widths(html), ["50"]);
}

// A technology waits on its prerequisite, on Knowledge storage, or on the slowest cost.
{
  const waiting = renderOne(
    { kind: "technology", name: "Theology", id: "theology", cost: {} },
    "research",
  );
  assert.match(waiting.html, /time">Waiting on prerequisite /);

  // A cost above the Knowledge cap is also a cost above the resource's own cap, so the cost loop
  // always replaces "Not enough Knowledge" with "Never". The label is unreachable today.
  const capped = renderOne(
    {
      kind: "technology",
      name: "Wisdom",
      id: "wisdom",
      cost: { Knowledge: 1001 },
    },
    "research",
  );
  assert.match(capped.html, /time">Never /);

  const timed = renderOne(
    {
      kind: "technology",
      name: "Mining",
      id: "mining",
      cost: { Knowledge: 100, Money: 150 },
    },
    "research",
  );
  // Knowledge needs 10s and Money 5s, so the target reads the slowest of them.
  assert.match(timed.html, /time">T10 /);
  assert.match(timed.html, /data-queueid="mining"/);
}

// Soul Gem income is an estimate, so its row is marked as one.
{
  const { html } = renderOne(
    { kind: "building", name: "Soul Well", id: "well", cost: { Soul_Gem: 2 } },
    "buildings",
  );
  assert.match(html, /active_targets-time-left">~T2</);
}

// The resource being replicated is marked on its progress bar.
{
  const { html } = renderOne(
    { kind: "building", name: "Mine", id: "mine", cost: { Money: 200 } },
    "buildings",
    { race: { replicator: { res: "Money" } } },
  );
  assert.match(html, /progress-bar-wrapper is-replicating/);
}

// The active-targets panel observes its own size and sizes the message queue against it.
{
  const fixture = createPanels();
  fixture.panels.buildActiveTargetsUI();
  assert.match(
    fixture.dom.rendered.get("before:#buildQueue"),
    /id="active_targets-wrapper"/,
  );
  assert.deepEqual(fixture.observed, ["#active_targets-wrapper[0]"]);
  assert.ok(
    fixture.dom.trace.includes(
      "css:#msgQueue:max-height=calc((100vh - 100px) - 6rem)",
    ),
  );

  fixture.panels.removeActiveTargetsUI();
  assert.ok(fixture.dom.trace.includes("remove:#active_targets-wrapper"));
}

// Without a ResizeObserver the panel still renders.
{
  const fixture = createPanels({ resizeObserver: null });
  fixture.panels.buildActiveTargetsUI();
  assert.deepEqual(fixture.observed, []);
}

// The build planner needs the game's own queue to attach to.
{
  const fixture = createPanels();
  fixture.dom.lengths.set("#buildQueue", 0);
  fixture.panels.buildBuildPlannerUI();
  assert.deepEqual(fixture.dom.trace, []);
}

// Collapsing the planner persists the setting; resetting stores and saves the new stats.
{
  const fixture = createPanels({ plannerStats: { Money: 1 } });
  fixture.panels.buildBuildPlannerUI();
  assert.ok(fixture.dom.trace.includes("toggle:#script_planner:true"));

  fixture.dom.handlers.get("#script_planner-header:click")();
  assert.equal(fixture.settingsRaw.buildPlannerCollapsed, true);
  assert.ok(fixture.dom.trace.includes("toggle:#script_planner:false"));
  assert.ok(fixture.dom.trace.includes("persist"));

  fixture.dom.handlers.get("#script_planner-reset:click")();
  assert.deepEqual(fixture.state.plannerStats, { Money: 1 });
  assert.deepEqual(fixture.saved, [{ Money: 1 }]);

  fixture.panels.removeBuildPlannerUI();
  assert.ok(fixture.dom.trace.includes("remove:#script_planner-wrapper"));
}

// Stats the planner cannot make are stored as absent and never saved.
{
  const fixture = createPanels();
  fixture.panels.buildBuildPlannerUI();
  fixture.dom.handlers.get("#script_planner-reset:click")();
  assert.equal(fixture.state.plannerStats, null);
  assert.deepEqual(fixture.saved, []);
}

console.log("queue panels tests passed");
