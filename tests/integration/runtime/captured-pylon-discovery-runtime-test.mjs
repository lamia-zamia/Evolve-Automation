import assert from "node:assert/strict";
import { runCapturedPhaseOrderCycle } from "../../support/fixtures/captured-phase-order-fixture.mjs";
import { element } from "../../support/fixtures/dom-fixture.mjs";

function scenario(eligible) {
  const root = {
    race: eligible ? { casting: { farmer: 0, total: 0 } } : {},
    tech: { magic: 4 },
    civic: { priest: { workers: 0 } },
    city: eligible ? { pylon: { count: 1 } } : {},
    space: {},
    tauceti: {},
    resource: { Mana: { amount: 0, max: 100, diff: 0.02 } },
    settings: { civTabs: 4, govTabs: 0, animated: false },
  };
  let register;
  const result = runCapturedPhaseOrderCycle({
    root,
    settings: { autoPylon: true, productionRitualManaUse: 0.5 },
    mount: true,
    controlSetup: (controls) => {
      register = controls.register;
    },
    controls: {
      "#mainColumn div.content": {
        methods: {
          swapTab(index) {
            root.settings.civTabs = index;
          },
        },
      },
      mTabCivic: {
        methods: {
          swapTab(index) {
            root.settings.govTabs = index;
            if (index === 1) register("iPylon", { methods: { addSpell() {} } });
          },
        },
      },
    },
    documentSetup: ({ body }) => {
      const main = element("div", { id: "mainColumn" });
      const content = element("div");
      content.classList.add("content");
      content.append(element("div", { id: "mTabCivic" }));
      main.append(content);
      body.append(main);
    },
  });
  return result;
}

const eligible = scenario(true);
assert.ok(
  eligible.invocations.some(
    ({ elementId, args }) =>
      elementId === "#mainColumn div.content" && args[0] === 2,
  ),
);
assert.ok(
  eligible.invocations.some(
    ({ elementId, args }) => elementId === "mTabCivic" && args[0] === 1,
  ),
);
assert.equal(eligible.root.settings.civTabs, 4);
assert.equal(eligible.root.settings.govTabs, 0);
assert.ok(
  !eligible.errors.some((message) =>
    message.includes(
      "pylon discovery drew its tab without capturing its control",
    ),
  ),
  JSON.stringify(eligible.errors),
);

const ineligible = scenario(false);
assert.equal(
  ineligible.invocations.some(({ elementId }) => elementId === "mTabCivic"),
  false,
);
assert.ok(
  !ineligible.errors.some((message) =>
    message.includes(
      "pylon discovery drew its tab without capturing its control",
    ),
  ),
);
console.log(
  "captured Pylon discovery follows Civic Industry and restores tabs",
);
