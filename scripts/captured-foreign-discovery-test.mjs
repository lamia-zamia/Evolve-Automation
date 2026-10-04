/**
 * The Foreign panel's own discovery, against a faithful transcription of the game's Government draw.
 *
 * The defect this reproduces is that `#foreign` is unreachable off-tab. `defineGovernment()` creates
 * `#government` and binds a `b-tabs` component to it, but `#r_govern0` is that component's *render*,
 * not markup: `government()`, the compact `#c_garrison`, `foreignGov()` and its
 * `vBind({el:'#foreign'})` all append into `#r_govern0`, so with every mount suppressed they append
 * into a detached element, `vBind` resolves nothing, and the capture never sees the Foreign methods.
 * Measured on the 1.5.0 page as 460 periods of production Auto Fight with `govTabs: 7` capturing
 * `govType` and `garrison` and no `foreign` at all.
 *
 * Everything under test is the real thing: `installVueCapture`, `createCapturedTabDiscovery`,
 * `createGamePanelWorkspace`, and `planForeignPanelDraw`. Only the game is transcribed, from
 * `index.js` and `civics.js` at the recorded `DeadSpace` tip.
 */
import assert from "node:assert/strict";

import { createGamePanelWorkspace } from "../src/adapters/browser/game-panel-workspace.ts";
import { createCapturedTabDiscovery } from "../src/adapters/evolve/captured-tab-discovery.ts";
import {
  capturedForeignEstablished,
  capturedForeignGarrisonEstablished,
  CAPTURED_FOREIGN_GARRISON_REQUIRED_METHODS,
  CAPTURED_FOREIGN_REQUIRED_METHODS,
} from "../src/adapters/evolve/combat/captured-foreign-state.ts";
import {
  FOREIGN_PANEL_DRAW_KEY,
  planForeignPanelDraw,
} from "../src/adapters/evolve/combat/foreign-panel-draw.ts";
import {
  planGovernmentPanelDraw,
  governmentPanelControlEstablished,
} from "../src/adapters/evolve/civic/government-panel-draw.ts";
import {
  DISPOSABLE_APP_MARKER,
  installVueCapture,
} from "../src/adapters/evolve/vue-capture.ts";
import {
  createTestDocument,
  element,
  parseTestMarkup,
} from "./dom-fixture.mjs";

/** Enough Vue 3 to run the one component whose render the Government draw appends into. */
function makeVue(page) {
  return {
    reactive: (target) => target,
    toRaw: (value) => value,
    createApp(options) {
      const app = {
        options,
        rendered: [],
        effects: [],
        unmounted: false,
        use: () => app,
        mount(target) {
          page.reallyMounted.push({
            el: options.el,
            targetId: target?.id ?? null,
          });
          // A `b-tabs` template's `b-tab-item`s are the document the rest of the draw appends into.
          // Vue 3 renders them from `app.mount()`, which is exactly what a suppressed scope takes
          // away: with no render there is no `#r_govern0` for anything to append into.
          for (const [, id] of String(options.template ?? "").matchAll(
            /<b-tab-item id="([\w-]+)"/g,
          )) {
            const tab = page.document.createElement("div");
            tab.id = id;
            target.append(tab);
            app.rendered.push(tab);
          }
          // A real mount leaves a reactive effect behind; only `unmount` stops it.
          app.effects.push({ stopped: false });
          page.effects.push(app.effects[0]);
          return { $forceUpdate: () => {} };
        },
        unmount: () => {
          app.unmounted = true;
          for (const effect of app.effects) effect.stopped = true;
          for (const node of app.rendered) node.remove();
          app.rendered = [];
        },
      };
      page.apps.push(app);
      page.creates.push({ el: options.el, disposable: false });
      return app;
    },
  };
}

/**
 * A jQuery of the size this draw uses: create from markup, find by id, append, and a `length` the
 * game's own `if ($('#foreign').length === 0)` guards read.
 */
function makeJquery(page) {
  const resolve = (input) => {
    if (input !== null && typeof input === "object") {
      return input.__element ?? null;
    }
    if (typeof input !== "string") return null;
    if (input.startsWith("<")) return parseTestMarkup(input)[0] ?? null;
    return page.document.querySelector(input);
  };
  const wrap = (found) => {
    const set = {
      __element: found,
      0: found,
      length: found === null ? 0 : 1,
      append(...nodes) {
        for (const node of nodes) {
          const target = resolve(node);
          if (found !== null && target !== null) found.append(target);
        }
        return set;
      },
      addClass: () => set,
      removeClass: () => set,
    };
    return set;
  };
  return (input) => wrap(resolve(input));
}

/** The main-tab panels the game's own `b-tabs` renders, so the workspace can name them. */
const MAIN_TAB_PANELS = [
  "mTabCivil",
  "mTabCivic",
  "mTabResearch",
  "mTabResource",
  "mTabArpa",
  "mTabStats",
];

function makePage() {
  const body = element("div", { id: "page" });
  const document = createTestDocument(body);
  const page = {
    document,
    apps: [],
    creates: [],
    bindings: [],
    reallyMounted: [],
    effects: [],
    trace: [],
  };
  const content = element("div", { id: "content" });
  const column = element("div", { id: "mainColumn" });
  column.append(content);
  body.append(column);
  for (const id of MAIN_TAB_PANELS) {
    const panel = element("div", { id });
    content.append(panel);
  }
  page.$ = makeJquery(page);
  page.Vue = makeVue(page);
  return page;
}

/**
 * The game's own Civic draw, transcribed from `index.js` (`loadTab`'s civic case and `mTabCivic`'s
 * `swapTab`) and `civics.js` (`defineGovernment`, `government`, `taxRates`, `defineGarrison`,
 * `buildGarrison`, `foreignGov`). Only the parts the Foreign path depends on are kept; everything
 * else in the real functions draws panels this test never reads.
 */
function installCivicsGame(page, root) {
  const $ = page.$;
  const Vue = page.Vue;
  const settings = root.settings;

  /** `functions.js:vBind` — `bindEl` resolves the selector, and a null target binds nothing. */
  function vBind(bind, action = "create") {
    const target = page.document.querySelector(bind.el);
    if (action === "destroy") {
      if (target?.__vue_app__ !== undefined) target.__vue_app__.unmount();
      return;
    }
    if (target === null) {
      page.trace.push({ kind: "bind-skipped", el: bind.el });
      return;
    }
    page.trace.push({ kind: "bind", el: bind.el });
    const app = Vue.createApp({ ...bind });
    app.use({ name: "Buefy" }).mount(target);
    target.__vue_app__ = app;
    // The capture hands `vBind` a disposable app while a scope suppresses mounts, so `createApp` is
    // never reached for it. Recording what came back is how a test sees the difference.
    page.bindings.push({
      el: bind.el,
      disposable: app[DISPOSABLE_APP_MARKER] === true,
      mounted: target.__vue_app__ === app && app.unmounted === false,
    });
  }

  /** `functions.js:clearElement` */
  function clearElement(node) {
    if (node !== null) node.replaceChildren();
  }

  /** `functions.js:clearTabPanels` with `animated` off, which is what a discovery pass sets. */
  function clearTabPanels(panels, incoming) {
    for (const selector of Object.keys(panels)) {
      if (selector === incoming) continue;
      clearElement(page.document.querySelector(selector));
    }
  }

  /** `civics.js:spyActive` */
  function spyActive() {
    if (root.race.cataclysm || root.tech.isolation) return false;
    if (!root.tech.world_control) return true;
    return root.race.truepath === true && (root.tech.shadow ?? 0) < 3;
  }

  /** `civics.js:buildGarrison` — one component, `full` only deciding which element it binds. */
  function buildGarrison(garrison, full) {
    clearElement(garrison.__element ?? null);
    vBind({
      el: full ? "#garrison" : "#c_garrison",
      methods: {
        campaign(g) {
          root.civic.foreign[`gov${g}`].mil -= 1;
        },
        next() {},
        last() {},
        aNext() {},
        aLast() {},
        rating(value) {
          return value;
        },
        hell() {
          return root.civic.garrison.cityGarrison;
        },
        s_max() {
          return root.civic.garrison.maxCityGarrison;
        },
      },
    });
  }

  /** `civics.js:commisionGarrison` — the garrison record itself, no markup. */
  function commisionGarrison() {
    root.civic.garrison.display = true;
  }

  /** `civics.js:government` — the panel's own component, bound inside `#r_govern0`. */
  function government(govern) {
    const gov = $('<div id="govType" class="govType" v-show="vis()"></div>');
    govern.append(gov);
    vBind({
      el: "#govType",
      methods: {
        vis: () => true,
        govern: () => "Democracy",
        trigModal: () => {},
      },
    });
  }

  /** `civics.js:taxRates` */
  function taxRates(govern) {
    const rates = $(
      '<div id="tax_rates" v-show="display" class="taxRate"></div>',
    );
    govern.append(rates);
    vBind({
      el: "#tax_rates",
      methods: { display: () => true, add: () => {}, sub: () => {} },
    });
  }

  /** `governor.js:defineGovernor` binds candidate appointment in `#r_govern1`. */
  function defineGovernor() {
    if (!root.genes.governor || !root.tech.governor) return;
    if (
      Object.hasOwn(root.race, "governor") &&
      (!Object.hasOwn(root.race.governor, "candidates") ||
        root.race.governor.candidates.length === 0)
    )
      return;
    const candidates = $(
      '<div id="candidates" class="governor candidates"></div>',
    );
    $("#r_govern1").append(candidates);
    vBind({ el: "#candidates", methods: { appoint: () => {} } });
  }

  /** `civics.js:defineGarrison` — the full panel, gated on the *military* sub-tab. */
  function defineGarrison() {
    commisionGarrison();
    if (
      !settings.tabLoad &&
      (settings.civTabs !== 2 || settings.govTabs !== 3)
    ) {
      return;
    }
    const garrison = $(
      '<div id="garrison" v-show="vis()" class="garrison tile is-child"></div>',
    );
    $("#military").append(garrison);
    $("#military").append($('<div id="fortress"></div>'));
    buildGarrison(garrison, true);
  }

  /** `civics.js:defineGovernment` — the panel, its Buefy tab template, and what fills it. */
  function defineGovernment(define) {
    if (!root.civic.taxes) {
      root.civic.taxes = { tax_rate: 20, display: false };
    }
    if (define) return;
    if (
      !settings.tabLoad &&
      (settings.civTabs !== 2 || settings.govTabs !== 0)
    ) {
      return;
    }
    const govern = $('<div id="government" class="government is-child"></div>');
    $("#r_civics").append(govern);
    vBind({
      el: "#government",
      data: { t: root.civic.taxes, s: settings },
      template: `<b-tabs class="resTabs govTabs2" v-show="vis()" v-model="s.govTabs2" :animated="s.animated">
            <b-tab-item id="r_govern0" :label="govLabel"></b-tab-item>
            <b-tab-item id="r_govern1" :visible="s.showGovernor" :label="governorLabel"></b-tab-item>
        </b-tabs>`,
      methods: { vis: () => (root.tech.govern ? true : false) },
      computed: {
        govLabel: () => "Government",
        governorLabel: () => "Governor",
      },
    });
    government($("#r_govern0"));
    taxRates($("#r_govern0"));
    const civGarrison = $(
      '<div id="c_garrison" v-show="g.display" class="garrison tile is-child"></div>',
    );
    $("#r_govern0").append(civGarrison);
    defineGovernor();
  }

  /** `civics.js:foreignGov` — the Foreign component, appended into `#r_govern0` and bound. */
  function foreignGov() {
    if ($("#foreign").length !== 0 || !spyActive()) return;
    const foreign = $(
      '<div id="foreign" v-show="vis()" class="government is-child"></div>',
    );
    foreign.append($('<div class="header"><h2>Foreign</h2></div>'));
    $("#r_govern0").append(foreign);
    const govEnd = root.race.truepath ? 5 : 3;
    for (let i = 0; i < govEnd; i += 1) {
      const gov = $(
        `<div id="gov${i}" class="foreign"><span>{{ gov('${i}') }}</span></div>`,
      );
      foreign.append(gov);
    }
    const bindData = {
      f0: root.civic.foreign.gov0,
      f1: root.civic.foreign.gov1,
      f2: root.civic.foreign.gov2,
      t: root.tech,
    };
    vBind({
      el: "#foreign",
      data: bindData,
      methods: {
        vis: () => root.civic.garrison.display && spyActive(),
        gvis: (g) => root.civic.foreign[`gov${g}`] !== undefined,
        spy_disabled: (g) => root.civic.foreign[`gov${g}`].trn > 0,
        spy: (g) => {
          root.civic.foreign[`gov${g}`].trn = 300;
        },
        trigModal: (g) => {
          page.trace.push({ kind: "trigModal", gov: g });
        },
        gov: (g) => `Government ${g}`,
        military: (m) => String(m),
        relation: (r) => String(r),
        eco: (e) => String(e),
        discontent: (r) => String(r),
        sab: (act) => String(act),
        campaign: () => {
          root.stats.attacks += 1;
        },
        battleAssessment: (g) => `Government ${g}`,
        spyDesc: (g) => `Government ${g}`,
        espDesc: () => "Espionage",
      },
    });
  }

  /**
   * `index.js` runs this same civic block twice per Government draw: once from `loadTab`'s civic
   * case, once from `mTabCivic`'s `swapTab(0)`. Only the sub-tab call clears the sub-panels first,
   * and only `loadTab`'s asks for the full `defineGarrison()` — whose own gate is the *military*
   * sub-tab, so it builds nothing during a Government draw.
   */
  function drawCivicPanel(fromSubTab) {
    if (fromSubTab) {
      clearTabPanels(
        {
          "#civic": [],
          "#industry": [],
          "#powerGrid": [],
          "#military": [],
          "#mechLab": [],
          "#dwarfShipYard": [],
          "#perkUnderground": [],
          "#psychicPowers": [],
          "#supernatural": [],
        },
        "#civic",
      );
    }
    $("#civic").append($('<div id="civics" class="tile is-parent"></div>'));
    $("#civics").append(
      $('<div id="r_civics" class="tile is-vertical is-parent civics"></div>'),
    );
    defineGovernment();
    if (root.race.species !== "protoplasm" && !root.race.start_cataclysm) {
      if (fromSubTab) {
        commisionGarrison();
      } else {
        defineGarrison();
      }
      buildGarrison($("#c_garrison"), false);
      foreignGov();
    }
  }

  /** The remaining Civic sub-tabs this test never reads. */
  function drawCivicSubTab(tab) {
    switch (tab) {
      case 0:
        drawCivicPanel(true);
        break;
      case 3: {
        if (root.race.species !== "protoplasm" && !root.race.start_cataclysm) {
          defineGarrison();
        }
        break;
      }
      default:
        break;
    }
  }

  /** `index.js:loadTab`'s civic case: the panel's own `b-tabs`, then its selected sub-tab. */
  function loadTab(tab) {
    clearTabPanels(
      {
        "#mTabCivil": [],
        "#mTabCivic": [],
        "#mTabResearch": [],
        "#mTabResource": [],
        "#mTabArpa": [],
        "#mTabStats": [],
      },
      "#mTabCivic",
    );
    if (tab !== 2) return;
    $("#mTabCivic").append(
      `<b-tabs class="resTabs" v-model="s.govTabs" :animated="s.animated" @update:model-value="swapTab(s.govTabs)">
            <b-tab-item id="civic" :label="label('tab_gov')"></b-tab-item>
            <b-tab-item id="industry" :visible="s.showIndustry" :label="label('tab_industry')"></b-tab-item>
        </b-tabs>`,
    );
    vBind({
      el: "#mTabCivic",
      data: { s: settings },
      methods: {
        swapTab(next) {
          settings.govTabs = next;
          drawCivicSubTab(next);
          return next;
        },
        label(text) {
          return text;
        },
      },
    });
    drawCivicPanel(false);
  }

  return { loadTab, foreignGov, defineGovernment, vBind };
}

function makeRoot(overrides = {}) {
  const government = (index) => ({
    mil: 60,
    spy: 1,
    trn: 0,
    sab: 0,
    act: "none",
    hstl: 20,
    unrest: 60,
    eco: 1,
    occ: false,
    anx: false,
    buy: false,
    ...overrides.government,
    id: index,
  });
  return {
    tech: { govern: 1, spy: 2, unify: 0, shadow: 0, ...overrides.tech },
    genes: { ...overrides.genes },
    race: { species: "human", truepath: false, ...overrides.race },
    stats: { attacks: 0, achieve: {} },
    city: { morale: { current: 250 } },
    resource: { Money: { amount: 100_000, max: 100_000, display: true } },
    civic: {
      taxes: { tax_rate: 20, display: true },
      garrison: {
        display: true,
        mercs: false,
        workers: 20,
        max: 20,
        crew: 0,
        wounded: 0,
        raid: 0,
        tactic: 0,
        cityGarrison: 20,
        maxCityGarrison: 20,
        ...overrides.garrison,
      },
      foreign: {
        gov0: government(0),
        gov1: government(1),
        gov2: government(2),
      },
    },
    settings: {
      civTabs: 3,
      govTabs: 7,
      govTabs2: 1,
      animated: true,
      ...overrides.settings,
    },
  };
}

/**
 * A page with the capture installed and the game's own main-tab component bound for real, exactly
 * as the game binds it at startup.
 */
function makeHarness(rootOverrides = {}) {
  const page = makePage();
  const root = makeRoot(rootOverrides);
  const capture = installVueCapture(page);
  // The game's own `makeReactive(global)` is the capture's only route to the root, so the harness
  // goes through the game's own call rather than handing the capture a root directly.
  page.Vue.reactive(root);
  const game = installCivicsGame(page, root);
  // The main tab component is bound at startup, outside any discovery scope, so its `swapTab` is a
  // captured control the way every discovery path's first step needs.
  capture.mountSuppression.withMountingEnabled(() =>
    page.Vue.createApp({
      el: "#mainColumn div.content",
      data: { s: root.settings },
      methods: { swapTab: (tab) => game.loadTab(tab) },
    })
      .use({ name: "Buefy" })
      .mount(page.document.querySelector("#mainColumn div.content")),
  );
  page.creates.length = 0;
  page.bindings.length = 0;
  page.reallyMounted.length = 0;
  page.apps.length = 0;
  page.effects.length = 0;
  page.trace.length = 0;
  const workspace = createGamePanelWorkspace({
    getDocument: () => page.document,
  });
  const discovery = createCapturedTabDiscovery({
    rootState: capture.rootState,
    controls: capture.controls,
    mountSuppression: capture.mountSuppression,
    panels: workspace,
  });
  return { page, root, capture, game, discovery, workspace };
}

// --- the plan: eligibility, and exactly what the draw asks for ------------------

{
  const { root, capture, discovery } = makeHarness({
    race: { species: "protoplasm" },
  });
  assert.equal(planForeignPanelDraw(root, capture.controls), undefined);
  const draw = planGovernmentPanelDraw(root, capture.controls, "tax");
  assert.notEqual(draw, undefined);
  assert.deepEqual([...draw.options.mount], ["#government"]);
  assert.equal(
    discovery.discover(draw.path, draw.options).outcome.status,
    "succeeded",
  );
  assert.equal(
    governmentPanelControlEstablished(capture.controls, "tax"),
    true,
  );
}

{
  const { root, capture, discovery } = makeHarness({
    garrison: { display: false },
    tech: { governor: 1 },
    genes: { governor: 1 },
  });
  assert.equal(planForeignPanelDraw(root, capture.controls), undefined);
  const type = planGovernmentPanelDraw(root, capture.controls, "type");
  assert.notEqual(type, undefined);
  assert.equal(
    discovery.discover(type.path, type.options).outcome.status,
    "succeeded",
  );
  assert.equal(
    governmentPanelControlEstablished(capture.controls, "type"),
    true,
  );
  const candidates = planGovernmentPanelDraw(
    root,
    capture.controls,
    "candidates",
  );
  assert.notEqual(candidates, undefined);
  assert.equal(
    discovery.discover(candidates.path, candidates.options).outcome.status,
    "succeeded",
  );
  assert.equal(
    governmentPanelControlEstablished(capture.controls, "candidates"),
    true,
  );
}

{
  const { root, capture } = makeHarness({
    tech: { govern: 0, governor: 0 },
    settings: { showGovernor: false },
  });
  root.civic.taxes.display = false;
  assert.equal(
    planGovernmentPanelDraw(root, capture.controls, "tax"),
    undefined,
  );
  assert.equal(
    planGovernmentPanelDraw(root, capture.controls, "type"),
    undefined,
  );
  assert.equal(
    planGovernmentPanelDraw(root, capture.controls, "candidates"),
    undefined,
  );
}

{
  const { root, capture } = makeHarness({
    genes: { governor: 1 },
    tech: { governor: 1 },
    race: { governor: { candidates: [] } },
  });
  assert.equal(
    planGovernmentPanelDraw(root, capture.controls, "candidates"),
    undefined,
  );
}

{
  const { root, capture } = makeHarness();
  const draw = planForeignPanelDraw(root, capture.controls);
  assert.notEqual(draw, undefined);
  // Main tab Civic, then the Civic sub-tab Government — the two gates `defineGovernment()` has.
  assert.deepEqual(
    draw.path.map((step) => [step.setting, step.index]),
    [
      ["civTabs", 2],
      ["govTabs", 0],
    ],
  );
  assert.equal(draw.path[0].control, "#mainColumn div.content");
  assert.equal(draw.path[1].control, "mTabCivic");
  // Only the Government panel may really mount; everything else the draw binds stays suppressed.
  assert.deepEqual([...draw.options.mount], ["#government"]);
  // The observed fast path is answered from the captured authority, not the tab settings.
  assert.equal(draw.options.isPanelDrawn(), false);
}

{
  // Upstream never reaches `foreignGov()` for these, so the draw must not be spent at all.
  const cases = [
    ["protoplasm", { race: { species: "protoplasm" } }],
    ["start cataclysm", { race: { start_cataclysm: true } }],
    ["cataclysm race", { race: { cataclysm: true } }],
    ["isolation", { tech: { isolation: true } }],
    ["garrison not displayed", { garrison: { display: false } }],
    [
      "truepath rival collapsed",
      { race: { truepath: true, tech: { world_control: 1, shadow: 3 } } },
    ],
  ];
  for (const [label, overrides] of cases) {
    // `tech` belongs to the root, not to `race`, so a case that names both is assembled here.
    const { root, capture } = makeHarness({
      ...overrides,
      tech: { ...(overrides.tech ?? {}), ...(overrides.race?.tech ?? {}) },
    });
    assert.equal(
      planForeignPanelDraw(root, capture.controls),
      undefined,
      `${label} must not plan a Government draw`,
    );
  }
  // World Control on the standard path closes the panel the same way `spyActive()` does.
  const standard = makeHarness({ tech: { world_control: 1 } });
  assert.equal(
    planForeignPanelDraw(standard.root, standard.capture.controls),
    undefined,
  );
  // ... and on a True Path run before the rival collapses it is still there.
  const truepath = makeHarness({
    tech: { world_control: 1 },
    race: { truepath: true },
  });
  assert.notEqual(
    planForeignPanelDraw(truepath.root, truepath.capture.controls),
    undefined,
  );
}

{
  // No captured main-tab component, so the pass could not draw its first step anyway.
  const { root, capture } = makeHarness();
  const withoutMainTab = {
    resolve: (id) =>
      id === "#mainColumn div.content"
        ? undefined
        : capture.controls.resolve(id),
    invoke: capture.controls.invoke,
    capturedElementIds: capture.controls.capturedElementIds,
  };
  assert.equal(planForeignPanelDraw(root, withoutMainTab), undefined);
}

// --- the defect: a fully suppressed Government draw cannot capture Foreign -------

{
  const { page, root, capture, discovery } = makeHarness();
  // The pass the Civic helpers actually use: both steps, nothing declared, every mount suppressed.
  const suppressed = discovery.discover([
    { setting: "civTabs", control: "#mainColumn div.content", index: 2 },
    { setting: "govTabs", control: "mTabCivic", index: 0 },
  ]);
  assert.equal(
    page.reallyMounted.length > 0,
    false,
    "nothing may really mount",
  );
  // `#r_govern0` is the tab component's render, so a suppressed pass never produces it...
  assert.equal(page.document.querySelector("#r_govern0"), null);
  // ...and `foreignGov()`'s own `vBind({el:'#foreign'})` therefore resolves nothing.
  assert.equal(
    page.creates.some((create) => create.el === "#foreign"),
    false,
    JSON.stringify(page.trace),
  );
  assert.equal(
    page.trace.some(
      (entry) => entry.kind === "bind-skipped" && entry.el === "#foreign",
    ),
    true,
    "the draw reached vBind('#foreign') with a detached element",
  );
  // The Civic draw itself succeeded and captured the Civic sub-tab component — and nothing that
  // lives inside `#r_govern0`, which is where both the government panel and Foreign belong.
  assert.equal(
    suppressed.outcome.status,
    "succeeded",
    JSON.stringify(suppressed.outcome),
  );
  assert.notEqual(capture.controls.resolve("mTabCivic"), undefined);
  assert.equal(capture.controls.resolve("govType"), undefined);
  assert.equal(capture.controls.resolve("tax_rates"), undefined);
  assert.equal(capture.controls.resolve("foreign"), undefined);
  assert.equal(capture.controls.resolve("c_garrison"), undefined);
  assert.equal(capturedForeignEstablished(capture.controls), false);
  assert.equal(capturedForeignGarrisonEstablished(capture.controls), false);
  // And the player is where they started, whatever the draw did.
  assert.equal(root.settings.civTabs, 3);
  assert.equal(root.settings.govTabs, 7);
  assert.equal(root.settings.animated, true);
}

// --- the owner: one real #government mount captures Foreign and compact Garrison ----

{
  const { page, root, capture, discovery } = makeHarness();
  const draw = planForeignPanelDraw(root, capture.controls);
  // What the draw produced is only inspectable while it is drawn: the scope unmounts the temporary
  // app and the workspace drops the scratch before `discover()` returns.
  let drawn;
  const result = discovery.discover(draw.path, {
    ...draw.options,
    whileDrawn: () => {
      drawn = {
        govern0: page.document.querySelector("#r_govern0"),
        foreign: page.document.querySelector("#foreign"),
        compactGarrison: page.document.querySelector("#c_garrison"),
        govType: page.document.querySelector("#govType"),
        reallyMounted: [...page.reallyMounted],
      };
    },
  });
  assert.equal(
    result.outcome.status,
    "succeeded",
    JSON.stringify(result.outcome),
  );
  // `#government` is the only app deliberately mounted, and it really did render. Upstream builds it
  // twice per draw — once from `loadTab`, once from `swapTab(0)` — so only the selectors are
  // asserted, not how many times.
  assert.deepEqual(
    [...new Set(drawn.reallyMounted.map((mount) => mount.el))],
    ["#government"],
  );
  assert.equal(drawn.reallyMounted[0].targetId, "government");
  // Its Buefy tab template is what materialised the container the game's own code appends into.
  assert.notEqual(
    drawn.govern0,
    null,
    "the Government tab item must exist after the mount",
  );
  assert.notEqual(drawn.foreign, null, "foreignGov() must reach the document");
  assert.notEqual(drawn.compactGarrison, null);
  assert.notEqual(drawn.govType, null);
  // `foreignGov()` reached `vBind('#foreign')` and the capture recorded it. The Foreign component
  // itself was not mounted: the capture recorded its methods and nothing rendered it.
  const foreignBinding = page.bindings.find(
    (binding) => binding.el === "#foreign",
  );
  assert.notEqual(foreignBinding, undefined, JSON.stringify(page.bindings));
  assert.equal(
    foreignBinding.disposable,
    true,
    "the Foreign component stays suppressed",
  );
  assert.equal(
    page.reallyMounted.some((mount) => mount.el === "#foreign"),
    false,
  );
  const foreign = capture.controls.resolve("foreign");
  assert.notEqual(foreign, undefined);
  for (const method of CAPTURED_FOREIGN_REQUIRED_METHODS) {
    assert.equal(
      foreign.methods.includes(method),
      true,
      `foreign is missing ${method}: ${JSON.stringify(foreign.methods)}`,
    );
  }
  assert.equal(capturedForeignEstablished(capture.controls), true);
  // The compact Garrison Battle reads comes out of the same Government draw.
  const compact = capture.controls.resolve("c_garrison");
  assert.notEqual(
    compact,
    undefined,
    "buildGarrison($('#c_garrison')) must be bound",
  );
  for (const method of CAPTURED_FOREIGN_GARRISON_REQUIRED_METHODS) {
    assert.equal(
      compact.methods.includes(method),
      true,
      `c_garrison is missing ${method}`,
    );
  }
  assert.equal(capturedForeignGarrisonEstablished(capture.controls), true);
  // The Foreign component itself is not left mounted; only its `vBind` methods were needed.
  // The temporary Government app went down with the scope, and took its effect with it.
  const governmentApp = page.apps.find(
    (app) => app.options.el === "#government",
  );
  assert.notEqual(governmentApp, undefined);
  assert.equal(governmentApp.unmounted, true);
  assert.equal(
    page.effects.every((effect) => effect.stopped),
    true,
    "no reactive effect from the scope may survive",
  );
  // The scratch panel and everything the draw built into it are gone.
  assert.equal(page.document.querySelector("#government"), null);
  assert.equal(page.document.querySelector("#foreign"), null);
  assert.equal(page.document.querySelector("#c_garrison"), null);
  assert.equal(page.document.querySelector("#r_govern0"), null);
  assert.notEqual(
    page.document.getElementById("mTabCivic"),
    null,
    "the scratch must give the player's own panel its id back",
  );
  // The player's own tabs are exactly what they were, including the animation flag.
  assert.equal(root.settings.civTabs, 3);
  assert.equal(root.settings.govTabs, 7);
  assert.equal(root.settings.govTabs2, 1);
  assert.equal(root.settings.animated, true);
  // The foreign component is callable afterwards, which is what "recorded, not mounted" means.
  const visible = capture.controls.invoke(foreign, "vis");
  assert.equal(visible.ok, true);
  assert.equal(visible.value, true);
}

// --- the fast path must not skip establishment ---------------------------------

{
  // The player is already on Civic → Government, so every step of the path names their own
  // current setting. Observing that panel in place discovers nothing, and `foreign` is absent.
  const { page, root, capture, discovery } = makeHarness({
    settings: { civTabs: 2, govTabs: 0 },
  });
  const draw = planForeignPanelDraw(root, capture.controls);
  assert.equal(draw.options.isPanelDrawn(), false);
  const result = discovery.discover(draw.path, draw.options);
  assert.equal(result.outcome.status, "succeeded");
  assert.deepEqual(
    [...new Set(page.reallyMounted.map((mount) => mount.el))],
    ["#government"],
    "the observed fast path must not answer 'already drawn' for an unestablished authority",
  );
  assert.equal(capturedForeignEstablished(capture.controls), true);
  assert.equal(root.settings.civTabs, 2);
  assert.equal(root.settings.govTabs, 0);
}

{
  // Once the authority exists and the player is looking at that panel, the pass observes it in
  // place: nothing is drawn, mounted, or discovered again. This is the `isPanelDrawn` condition
  // doing the work the tab settings alone cannot.
  const { page, root, capture, discovery } = makeHarness({
    settings: { civTabs: 2, govTabs: 0 },
  });
  const draw = planForeignPanelDraw(root, capture.controls);
  discovery.discover(draw.path, draw.options);
  assert.equal(capturedForeignEstablished(capture.controls), true);
  assert.equal(
    planForeignPanelDraw(root, capture.controls).options.isPanelDrawn(),
    true,
  );
  const before = page.reallyMounted.length;
  const again = discovery.discover(draw.path, draw.options);
  assert.equal(again.outcome.status, "succeeded");
  assert.deepEqual([...again.discovered], []);
  assert.equal(
    page.reallyMounted.length,
    before,
    "an established authority spends no draw",
  );
  assert.equal(root.settings.civTabs, 2);
  assert.equal(root.settings.govTabs, 0);
}

// --- what an ineligible run does not do ----------------------------------------

{
  // A panel upstream would not create is not a failed discovery: no draw, no error, no retry.
  const { page, root, capture } = makeHarness({
    garrison: { display: false },
  });
  assert.equal(planForeignPanelDraw(root, capture.controls), undefined);
  assert.equal(page.reallyMounted.length, 0);
  assert.equal(capture.controls.resolve("foreign"), undefined);
}

// --- the attempt key this draw retires -------------------------------------------

assert.equal(FOREIGN_PANEL_DRAW_KEY, "foreign");

console.log("captured-foreign-discovery ok");
