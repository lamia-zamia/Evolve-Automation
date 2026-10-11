import assert from "node:assert/strict";

import { createCapturedGovernmentModalControl } from "../../../src/adapters/evolve/civic/captured-government-modal.ts";
import {
  GOV_TABS_SETTING,
  MAIN_TAB_CONTROL,
  SUB_TAB_CONTROLS,
} from "../../../src/adapters/evolve/captured-tab-discovery.ts";

function makeEnvironment({
  activeModal = false,
  rejectedBinding = false,
  throwAfterOpen = false,
  createBox = true,
} = {}) {
  const root = { civic: { govern: { type: "anarchy", rev: 0 } } };
  let currentRoot = root;
  const active = [];
  let hasBox = false;
  let hasGovModal = false;
  let hasGovernmentTitle = false;
  let govTypeMounted = false;
  let generation = activeModal ? 1 : 0;
  let opens = 0;
  let setters = 0;
  let closes = 0;
  let mountingEnabled = 0;
  let discoveries = 0;
  const selectedTabs = { civTabs: 0, govTabs: 2 };

  const box = {
    querySelector(selector) {
      if (selector === "#modalBoxTitle") return hasGovernmentTitle ? {} : null;
      return selector === "#govModal" && hasGovModal ? {} : null;
    },
  };
  function makeWrapper() {
    const background = {
      click() {
        closes += 1;
        const index = active.indexOf(wrapper);
        if (index >= 0) active.splice(index, 1);
        hasBox = false;
        hasGovModal = false;
        hasGovernmentTitle = false;
      },
    };
    const wrapper = {
      querySelector(selector) {
        if (selector === "#modalBox") return hasBox ? box : null;
        if (selector === "#modalBoxTitle")
          return hasGovernmentTitle ? {} : null;
        if (selector === ".modal-background") return background;
        return null;
      },
    };
    return wrapper;
  }
  if (activeModal) active.push(makeWrapper());
  const openOwned = () => {
    active.push(makeWrapper());
    hasBox = createBox;
    if (throwAfterOpen) throw new Error("partial open");
  };
  const govTypeProxy = {
    $buefy: {
      modal: {
        open() {
          opens += 1;
          openOwned();
        },
      },
    },
    trigModal() {
      this.$buefy.modal.open();
    },
  };
  const govTypeElement = {
    get __vue_proxy__() {
      return govTypeMounted ? govTypeProxy : undefined;
    },
    isConnected: true,
  };
  const document = {
    getElementById(id) {
      if (id === "govType") return govTypeElement;
      return null;
    },
    querySelectorAll(selector) {
      return selector === ".modal.is-active" || selector === ".modal"
        ? active.slice()
        : [];
    },
  };
  const controls = {
    resolve(elementId) {
      if (
        elementId === MAIN_TAB_CONTROL ||
        elementId === SUB_TAB_CONTROLS[GOV_TABS_SETTING]
      ) {
        return { elementId, generation: 1, methods: ["swapTab"] };
      }
      if (elementId === "govType") {
        return { elementId, generation: 1, methods: ["trigModal"] };
      }
      if (elementId === "govModal" && hasGovModal && !rejectedBinding) {
        return { elementId, generation, methods: ["setGov"] };
      }
      if (elementId === "govModal" && activeModal) {
        return { elementId, generation, methods: ["setGov"] };
      }
      return undefined;
    },
    invoke(_handle, method, args) {
      assert.equal(method, "setGov");
      setters += 1;
      root.civic.govern.type = args[0];
      active[0]?.querySelector(".modal-background")?.click();
      return { ok: true, value: undefined };
    },
    checkpoint() {
      return {};
    },
    rejectChanges() {},
    capturedElementIds() {
      return [];
    },
  };
  const discovery = {
    discover(_path, options) {
      discoveries += 1;
      assert.deepEqual(options.mount, ["#government", "#govType"]);
      assert.equal(options.forceDraw, true);
      assert.deepEqual(selectedTabs, { civTabs: 0, govTabs: 2 });
      govTypeMounted = true;
      const opened = options.whileDrawn();
      assert.equal(opened, !throwAfterOpen);
      return {
        outcome: opened
          ? { status: "succeeded" }
          : {
              status: "stale",
              failure: { code: "test-open-failed", message: "partial open" },
            },
        discovered: [],
      };
    },
  };
  const control = createCapturedGovernmentModalControl({
    controls,
    rootState: { readRoot: () => currentRoot },
    discovery,
    mountSuppression: {
      available: true,
      withoutMounting: (draw) => draw(),
      withMountingEnabled: (draw) => {
        mountingEnabled += 1;
        return draw();
      },
    },
    getDocument: () => document,
  });
  return {
    control,
    root,
    setCurrentRoot(value) {
      currentRoot = value;
    },
    bindModal() {
      hasGovModal = true;
      generation += 1;
    },
    drawNativeContent() {
      hasGovernmentTitle = true;
    },
    setRejectedBinding(value) {
      rejectedBinding = value;
    },
    addPlayerModal() {
      active.push(makeWrapper());
    },
    activeModals() {
      return active.length;
    },
    state() {
      return {
        opens,
        setters,
        closes,
        mountingEnabled,
        discoveries,
        selectedTabs,
      };
    },
  };
}

// The genuine mounted receiver supplies Buefy; repeated callbacks wait for the async binding.
{
  const environment = makeEnvironment();
  assert.deepEqual(environment.control.apply("democracy", environment.root), {
    status: "succeeded",
  });
  assert.deepEqual(environment.control.apply("democracy", environment.root), {
    status: "succeeded",
  });
  assert.equal(environment.state().opens, 1);
  assert.equal(environment.state().mountingEnabled, 1);
  environment.bindModal();
  assert.deepEqual(environment.control.apply("democracy", environment.root), {
    status: "succeeded",
  });
  assert.equal(environment.root.civic.govern.type, "democracy");
  assert.deepEqual(environment.state(), {
    opens: 1,
    setters: 1,
    closes: 1,
    mountingEnabled: 1,
    discoveries: 1,
    selectedTabs: { civTabs: 0, govTabs: 2 },
  });
}

// A player-visible modal is left alone, even when an old govModal handle is captured.
{
  const environment = makeEnvironment({ activeModal: true });
  const outcome = environment.control.apply("democracy", environment.root);
  assert.equal(outcome.status, "stale");
  assert.equal(outcome.failure.code, "government-modal-already-open");
  assert.equal(environment.state().opens, 0);
  assert.equal(environment.state().setters, 0);
  assert.equal(environment.state().closes, 0);
}

// A native open without a current modal binding is closed and latched instead of retried.
for (const rejectedBinding of [false, true]) {
  const environment = makeEnvironment({ rejectedBinding });
  environment.control.apply("democracy", environment.root);
  environment.drawNativeContent();
  const firstPoll = environment.control.apply("democracy", environment.root);
  const secondPoll = environment.control.apply("democracy", environment.root);
  const failed = environment.control.apply("democracy", environment.root);
  assert.equal(firstPoll.status, "succeeded");
  assert.equal(secondPoll.status, "succeeded");
  assert.equal(failed.failure.code, "government-modal-binding-missing");
  assert.equal(environment.state().closes, 0);
  await new Promise((resolve) => setTimeout(resolve, 90));
  assert.equal(environment.state().closes, 1);
  assert.equal(
    environment.control.apply("democracy", environment.root).failure.code,
    "government-modal-retry-suppressed",
  );
  assert.equal(environment.state().opens, 1);
}

// A root replacement cancels the pending modal without invoking its setter.
{
  const environment = makeEnvironment();
  environment.control.apply("democracy", environment.root);
  const nextRoot = { civic: { govern: { type: "anarchy", rev: 0 } } };
  environment.setCurrentRoot(nextRoot);
  const outcome = environment.control.apply("democracy", nextRoot);
  assert.equal(outcome.failure.code, "government-modal-canceled");
  assert.equal(environment.state().setters, 0);
  environment.drawNativeContent();
  await new Promise((resolve) => setTimeout(resolve, 90));
  assert.equal(environment.state().closes, 1);
}

// Runtime teardown defers close until the upstream polling interval can terminate.
{
  const environment = makeEnvironment();
  environment.control.apply("democracy", environment.root);
  environment.control.dispose();
  assert.equal(environment.state().closes, 0);
  environment.drawNativeContent();
  await new Promise((resolve) => setTimeout(resolve, 90));
  assert.equal(environment.state().closes, 1);
}

// A player modal opened while the native opener is pending is never adopted or closed.
{
  const environment = makeEnvironment();
  environment.control.apply("democracy", environment.root);
  environment.addPlayerModal();
  environment.control.cancel();
  environment.drawNativeContent();
  await new Promise((resolve) => setTimeout(resolve, 90));
  assert.equal(environment.state().closes, 1);
  assert.equal(environment.activeModals(), 1);
  assert.equal(environment.state().setters, 0);
}

// Intentional cancellation does not latch the root and a later enable can retry.
{
  const environment = makeEnvironment();
  environment.control.apply("democracy", environment.root);
  environment.control.cancel();
  assert.equal(environment.state().closes, 0);
  environment.drawNativeContent();
  await new Promise((resolve) => setTimeout(resolve, 90));
  assert.equal(environment.state().opens, 1);
  assert.deepEqual(environment.control.apply("democracy", environment.root), {
    status: "succeeded",
  });
  assert.equal(environment.state().opens, 2);
}

// A changed Government request closes its former owned modal without suppressing the new target.
{
  const environment = makeEnvironment();
  environment.control.apply("democracy", environment.root);
  const changed = environment.control.apply("autocracy", environment.root);
  assert.equal(changed.failure.code, "government-modal-canceled");
  assert.equal(environment.state().setters, 0);
  environment.drawNativeContent();
  await new Promise((resolve) => setTimeout(resolve, 90));
  assert.equal(environment.state().closes, 1);
  assert.deepEqual(environment.control.apply("autocracy", environment.root), {
    status: "succeeded",
  });
  assert.equal(environment.state().opens, 2);
}

// A native open that throws after appending its wrapper still gets owned cleanup.
{
  const environment = makeEnvironment({ throwAfterOpen: true });
  const outcome = environment.control.apply("democracy", environment.root);
  assert.equal(outcome.failure.code, "government-modal-open-failed");
  assert.match(
    outcome.failure.message,
    /its partially opened modal was closed/,
  );
  assert.equal(environment.state().closes, 1);
  assert.equal(environment.activeModals(), 0);
  assert.equal(
    environment.control.apply("democracy", environment.root).failure.code,
    "government-modal-retry-suppressed",
  );
}

// A uniquely owned wrapper without modal content fails closed and cleans up only itself.
{
  const environment = makeEnvironment({ createBox: false });
  environment.control.apply("democracy", environment.root);
  environment.control.apply("democracy", environment.root);
  environment.control.apply("democracy", environment.root);
  const failed = environment.control.apply("democracy", environment.root);
  assert.equal(failed.failure.code, "government-modal-missing");
  assert.match(failed.failure.message, /stays open until #modalBoxTitle/);
  await new Promise((resolve) => setTimeout(resolve, 90));
  assert.equal(environment.state().closes, 0);
  assert.equal(environment.activeModals(), 1);
}

console.log("Captured native government modal tests passed");
