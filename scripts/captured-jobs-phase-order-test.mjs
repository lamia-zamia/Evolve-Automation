import { withControlCaptureAuthority } from "./control-capture-fixture.mjs";
import assert from "node:assert/strict";
import { startCapturedRuntime } from "../src/bootstrap/captured-runtime-control.ts";
import { createTestDocument, element } from "./dom-fixture.mjs";
import { makeCapturedBuildingMechanics } from "./captured-building-test-fixtures.mjs";

function attributes(values) {
  const items = Object.entries(values).map(([name, value]) => ({
    name,
    value: String(value),
  }));
  items.get = (name) => items.find((item) => item.name === name)?.value;
  return items;
}

function buildDocument() {
  const documentRoot = element("div", { id: "runtime-root" });
  const mainColumn = element("div", { id: "mainColumn" });
  const content = element("div");
  content.classList.add("content");
  const civilPanel = element("div", { id: "mTabCivil" });
  const cityPanel = element("div", { id: "city" });
  civilPanel.appendChild(cityPanel);
  content.appendChild(civilPanel);
  mainColumn.appendChild(content);
  documentRoot.appendChild(mainColumn);

  const researchPanel = element("div", { id: "tech" });
  const researchRow = element("div");
  researchRow.classList.add("action");
  Object.defineProperty(researchRow, "id", { value: "tech-polymer-reserve" });
  researchRow.attributes = attributes({
    id: "tech-polymer-reserve",
    class: "action",
  });
  const price = element("button");
  price.attributes = attributes({
    class: "button res-Polymer",
    "data-polymer": 1,
  });
  researchRow.appendChild(price);
  researchPanel.appendChild(researchRow);
  documentRoot.appendChild(researchPanel);
  return { document: createTestDocument(documentRoot), cityPanel };
}

function runOrderedCapturedCycle({ activeTrigger }) {
  const events = [];
  const errors = [];
  const { document, cityPanel } = buildDocument();
  const root = {
    race: {},
    tech: { "polymer-reserve": 0 },
    settings: {
      civTabs: 1,
      spaceTabs: 0,
      showCity: true,
      showResearch: true,
    },
    civic: {
      d_job: "unemployed",
      unemployed: {
        job: "unemployed",
        assigned: 4,
        workers: 4,
        max: 0,
        display: true,
      },
      farmer: {
        job: "farmer",
        assigned: 0,
        workers: 0,
        max: -1,
        display: true,
      },
      craftsman: { workers: 0, max: 0, display: false },
    },
    city: {
      foundry: {
        count: 0,
        Plywood: 0,
        Brick: 0,
        crafting: 0,
        rcap: { Plywood: 2, Brick: 2 },
      },
      factory: {
        count: 1,
        on: 0,
        Lux: 1,
        Furs: 0,
        Alloy: 0,
        Polymer: 0,
        Nano: 0,
        Stanene: 0,
      },
    },
    queue: { display: true, pause: false, queue: [] },
    resource: {
      Population: { amount: 4, max: 10, display: true },
      Knowledge: { amount: 100, max: 1000, display: true, diff: 10 },
      Money: { amount: 1000, max: 10000, display: true, diff: 10 },
      Polymer: { amount: 100, max: 1000, display: true, diff: 1 },
      Plywood: { amount: 100, max: 1000, display: true, diff: 0 },
      Brick: { amount: 0, max: 1000, display: true, diff: 0 },
      Iron: { amount: 100, max: 1000, display: true, diff: 0 },
      Furs: { amount: 100, max: 1000, display: true, diff: 0 },
      Alloy: { amount: 100, max: 1000, display: true, diff: 0 },
      Nano_Tube: { amount: 100, max: 1000, display: true, diff: 0 },
      Stanene: { amount: 100, max: 1000, display: true, diff: 0 },
      Lumber: { amount: 100, max: 1000, display: true, diff: 0 },
      Oil: { amount: 100, max: 1000, display: true, diff: 0 },
      Copper: { amount: 100, max: 1000, display: true, diff: 0 },
      Aluminium: { amount: 100, max: 1000, display: true, diff: 0 },
      Coal: { amount: 100, max: 1000, display: true, diff: 0 },
      Neutronium: { amount: 100, max: 1000, display: true, diff: 0 },
    },
  };
  const handles = new Map();
  const methods = {
    buildQueue: ["setData"],
    "#mainColumn div.content": ["swapTab"],
    mTabCivil: ["swapTab"],
    "tech-polymer-reserve": ["action"],
    "city-foundry": ["action"],
    iFactory: ["addItem", "subItem"],
    "civ-unemployed": ["add", "sub", "setDefault"],
    "civ-farmer": ["add", "sub", "setDefault"],
    foundry: ["add", "sub"],
    resPlywood: ["craftCost"],
    resBrick: ["craftCost"],
  };
  for (const [elementId, controlMethods] of Object.entries(methods)) {
    handles.set(elementId, {
      elementId,
      generation: 1,
      methods: controlMethods,
      ...(elementId === "city-foundry"
        ? { data: { act: root.city.foundry } }
        : {}),
    });
  }

  function unlockFoundryOffer() {
    if (root.tech["polymer-reserve"] !== 1) return;
    if (cityPanel.querySelectorAll("#city-foundry").length > 0) return;
    const row = element("div", { id: "city-foundry" });
    row.classList.add("action");
    cityPanel.appendChild(row);
  }

  const controls = withControlCaptureAuthority({
    resolve: (elementId) => handles.get(elementId),
    capturedElementIds: () => [...handles.keys()],
    invoke(handle, method, args = []) {
      if (handle.elementId === "buildQueue" && method === "setData") {
        const entry = root.queue.queue[args[0]];
        if (entry?.id === "tech-polymer-reserve") {
          return { ok: true, value: { "data-Polymer": 1 } };
        }
        return { ok: true, value: { "data-Money": 10 } };
      }
      if (
        handle.elementId === "resPlywood" ||
        handle.elementId === "resBrick"
      ) {
        return { ok: true, value: "<div>Iron 1</div>" };
      }
      if (handle.elementId === "#mainColumn div.content") {
        root.settings.civTabs = args[0];
      } else if (handle.elementId === "mTabCivil") {
        root.settings.spaceTabs = args[0];
      } else if (handle.elementId === "tech-polymer-reserve") {
        events.push("research");
        root.tech["polymer-reserve"] = 1;
        unlockFoundryOffer();
      } else if (handle.elementId === "city-foundry") {
        events.push(activeTrigger ? "trigger" : "build");
        if (!activeTrigger) {
          assert.equal(
            root.tech["polymer-reserve"],
            1,
            "the build offer must depend on the earlier research mutation",
          );
        }
        root.city.foundry.count += 1;
        root.city.foundry.cap = 2;
        root.civic.craftsman.max = 2;
        root.civic.craftsman.display = true;
      } else if (handle.elementId === "iFactory") {
        events.push("factory");
        root.city.factory[args[0]] += method === "addItem" ? 1 : -1;
      } else if (handle.elementId === "foundry") {
        events.push("jobs");
        assert.equal(
          root.city.factory.Lux,
          0,
          "Jobs must sample after Factory",
        );
        assert.equal(
          root.city.foundry.count,
          1,
          "Jobs must sample the built foundry",
        );
        const id = args[0];
        root.city.foundry[id] += method === "add" ? 1 : -1;
        root.city.foundry.crafting += method === "add" ? 1 : -1;
        root.civic.craftsman.workers += method === "add" ? 1 : -1;
        root.civic.unemployed.workers += method === "add" ? -1 : 1;
      } else if (handle.elementId.startsWith("civ-")) {
        events.push("jobs");
        if (method === "setDefault") root.civic.d_job = args[0];
        else {
          const job = handle.elementId.slice("civ-".length);
          root.civic[job].workers += method === "add" ? 1 : -1;
        }
      }
      return { ok: true, value: undefined };
    },
  });

  let cycle;
  const stop = startCapturedRuntime({
    pageCapture: {
      isComplete: () => true,
      mechanics: makeCapturedBuildingMechanics(root, {
        availability: (liveRoot, binding) => ({
          kind: "value",
          value:
            binding === "city-foundry" &&
            liveRoot.tech["polymer-reserve"] === 1,
        }),
      }),
      rootState: {
        readRoot: () => root,
        isReactivitySuppressed: () => false,
        subscribeRootReplaced: () => () => {},
      },
      controls,
      controlUsage: { readUsage: () => [] },
      periods: {
        subscribe(next) {
          cycle = next;
          return () => {};
        },
      },
      mountSuppression: {
        available: true,
        withoutMounting: (draw) => draw(),
        withMountingEnabled: (draw) => draw(),
      },
      uninstall: () => {},
    },
    document,
    mouseEvent: class {},
    storage: {
      getItem: () =>
        JSON.stringify({
          masterScriptToggle: true,
          tickRate: 1,
          autoTrigger: true,
          autoResearch: true,
          autoBuild: true,
          autoFactory: true,
          autoJobs: true,
          autoCraftsmen: true,
          jobManageServants: true,
          job_unemployed: true,
          job_farmer: true,
          job_b1_unemployed: 0,
          job_b2_unemployed: 0,
          job_b3_unemployed: 0,
          job_b1_farmer: -1,
          job_b2_farmer: -1,
          job_b3_farmer: -1,
          productionCraftsmen: "always",
          craftPlywood: true,
          job_Plywood: true,
          foundry_w_Plywood: 1,
          craftBrick: true,
          job_Brick: true,
          foundry_w_Brick: 1,
          "batcity-foundry": true,
          "bld_w_city-foundry": 100,
          triggers: [
            {
              priority: 0,
              requirementType: "BuildingCount",
              requirementId: "city-foundry",
              requirementCount: activeTrigger ? 0 : 1,
              actionType: "build",
              actionId: "city-foundry",
              actionCount: 1,
            },
          ],
        }),
      setItem: () => {},
    },
    logError: (message) => errors.push(message),
  });

  cycle({ periods: 1 });
  stop();
  return { events, errors, root };
}

{
  const result = runOrderedCapturedCycle({ activeTrigger: false });
  assert.deepEqual(result.errors, []);
  assert.equal(result.root.tech["polymer-reserve"], 1);
  assert.equal(result.root.city.foundry.count, 1);
  assert.equal(result.root.civic.craftsman.max, 2);
  assert.equal(result.root.city.factory.Lux, 0);
  const first = (name) => result.events.indexOf(name);
  assert.ok(first("research") >= 0, JSON.stringify(result.events));
  assert.ok(first("build") > first("research"), JSON.stringify(result.events));
  assert.ok(first("factory") > first("build"), JSON.stringify(result.events));
  assert.ok(first("jobs") > first("factory"), JSON.stringify(result.events));
}

{
  const result = runOrderedCapturedCycle({ activeTrigger: true });
  assert.equal(result.root.tech["polymer-reserve"], 0);
  assert.equal(result.events[0], "trigger", JSON.stringify(result.events));
  assert.equal(result.events[1], "factory", JSON.stringify(result.events));
  assert.ok(
    result.events.slice(2).length > 0 &&
      result.events.slice(2).every((event) => event === "jobs"),
    JSON.stringify(result.events),
  );
  assert.equal(result.root.city.foundry.count, 1);
  assert.equal(result.root.city.factory.Lux, 0);
  assert.deepEqual(result.errors, []);
}

console.log("captured-jobs-phase-order ok");
