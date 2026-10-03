import assert from "node:assert/strict";

import { runCapturedPhaseOrderCycle } from "./captured-phase-order-fixture.mjs";

function runHellDiscovery(warlord = false) {
  let register;
  const root = {
    race: { warlord },
    settings: { civTabs: 1, govTabs: 0, animated: false, showPortal: true },
    civic: { garrison: { workers: 100, max: 100, crew: 0 } },
    portal: {
      fortress: { garrison: 0, patrols: 0, patrol_size: 1, assigned: 0 },
    },
    tech: { elysium: 0 },
  };
  const methods = {
    patrolling: () => 0,
    aNext() {},
    aLast() {},
    patInc() {},
    patDec() {},
    patSizeInc() {},
    patSizeDec() {},
  };
  return runCapturedPhaseOrderCycle({
    root,
    settings: { autoHell: true, hellMinSoldiers: 200 },
    mount: true,
    controlSetup: (setup) => {
      register = setup.register;
    },
    controls: {
      "#mainColumn div.content": {
        methods: {
          swapTab(index) {
            if (index === 2) {
              register("mTabCivic", {
                methods: {
                  swapTab(subTab) {
                    if (subTab !== 3) return;
                    register("garrison", {
                      methods: {
                        hell: () => 100,
                        s_max: () => 100,
                        rating: () => 2.5,
                      },
                    });
                    register("gFort", { methods });
                  },
                },
              });
            }
          },
        },
      },
    },
  });
}

const ordinary = runHellDiscovery();
assert.ok(
  ordinary.invocations.some(
    ({ elementId, method, args }) =>
      elementId === "mTabCivic" && method === "swapTab" && args[0] === 3,
  ),
);
assert.ok(
  ordinary.invocations.some(
    ({ elementId, method }) => elementId === "garrison" && method === "hell",
  ),
);
assert.ok(
  ordinary.invocations.some(
    ({ elementId, method }) => elementId === "garrison" && method === "s_max",
  ),
);

const warlord = runHellDiscovery(true);
assert.equal(
  warlord.invocations.some(({ elementId }) => elementId === "mTabCivic"),
  false,
);

console.log("Captured Hell discovery tests passed");
