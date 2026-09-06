import assert from "node:assert/strict";

import { installWorkerCapture } from "../src/adapters/evolve/worker-capture.ts";

/** A worker just real enough to register, remove, and dispatch `message` listeners. */
class FakeWorker {
  constructor(url) {
    this.url = String(url);
    this.registered = [];
  }
  addEventListener(type, listener, options) {
    assert.ok(
      this instanceof FakeWorker,
      "the listener registers on the worker itself",
    );
    this.registered.push({ type, listener, options });
  }
  removeEventListener(type, listener) {
    const index = this.registered.findIndex(
      (entry) => entry.type === type && entry.listener === listener,
    );
    if (index !== -1) this.registered.splice(index, 1);
  }
  dispatch(data) {
    const event = { data };
    for (const entry of [...this.registered]) {
      if (entry.type === "message") entry.listener.call(this, event);
    }
  }
}

function makePage() {
  return { Worker: FakeWorker };
}

// --- absent globals ---------------------------------------------------------------------------

for (const page of [undefined, {}, { Worker: "not a constructor" }]) {
  const capture = installWorkerCapture(page);
  assert.equal(capture.isCaptured(), false);
  assert.equal(capture.isConstructorWrapped(), false);
  let notified = false;
  const stop = capture.periods.subscribe(() => {
    notified = true;
  });
  stop();
  capture.uninstall();
  assert.equal(notified, false);
}

// --- the game's worker is hooked, everything else is left alone --------------------------------

const page = makePage();
const capture = installWorkerCapture(page);
assert.equal(capture.isConstructorWrapped(), true);
assert.notEqual(page.Worker, FakeWorker);

const unrelated = new page.Worker("some/other-worker.js");
assert.equal(capture.isCaptured(), false);
assert.equal(
  capture.isConstructorWrapped(),
  true,
  "a non-game worker does not end the capture",
);

const order = [];
const worker = new page.Worker("evolve/evolve.js");
assert.equal(
  worker instanceof FakeWorker,
  true,
  "construction still yields a real Worker",
);
assert.equal(capture.isCaptured(), true);
assert.equal(
  page.Worker,
  FakeWorker,
  "the constructor is restored as soon as the game's worker exists",
);

const later = new page.Worker("evolve/evolve.js");
assert.equal(
  later.addEventListener,
  FakeWorker.prototype.addEventListener,
  "later workers are untouched",
);

// --- the game's listener runs first; the notification follows it --------------------------------

const seen = [];
const unsubscribe = capture.periods.subscribe((period) => {
  order.push("notify");
  seen.push(period);
});

const gameListener = function gameListener(event) {
  assert.equal(this, worker, "the original listener keeps its receiver");
  order.push(`game:${event.data?.periods}`);
};
worker.addEventListener("message", gameListener, false);
assert.equal(worker.registered.length, 1);
assert.notEqual(
  worker.registered[0].listener,
  gameListener,
  "the listener is wrapped",
);
assert.equal(
  worker.registered[0].options,
  false,
  "capture options are preserved",
);

worker.dispatch({ loop: "main", periods: 1 });
assert.deepEqual(order, ["game:1", "notify"]);
assert.deepEqual(seen, [{ periods: 1 }]);

// The game reports batched periods; they are passed through rather than assumed to be one.
worker.dispatch({ loop: "main", periods: 4 });
assert.deepEqual(seen.at(-1), { periods: 4 });

// Non-main loops and malformed payloads are not completed periods.
worker.dispatch({ loop: "other", periods: 3 });
worker.dispatch(undefined);
worker.dispatch({ loop: "main" });
assert.deepEqual(seen, [{ periods: 1 }, { periods: 4 }, { periods: 1 }]);

// --- registering the same listener twice must not double-notify ---------------------------------

worker.addEventListener("message", gameListener);
assert.equal(worker.registered.length, 2);
assert.equal(
  worker.registered[0].listener,
  worker.registered[1].listener,
  "the same listener maps to the same wrapper",
);

// --- removal works through the wrapper ----------------------------------------------------------

worker.removeEventListener("message", gameListener);
worker.removeEventListener("message", gameListener);
assert.equal(worker.registered.length, 0);

// --- a non-message listener is passed straight through ------------------------------------------

const errorListener = () => {};
worker.addEventListener("error", errorListener);
assert.equal(worker.registered[0].listener, errorListener);
worker.removeEventListener("error", errorListener);
assert.equal(worker.registered.length, 0);

// --- an exception in the game's listener propagates and cancels the notification -----------------

const before = seen.length;
worker.addEventListener("message", () => {
  throw new Error("game loop threw");
});
assert.throws(
  () => worker.dispatch({ loop: "main", periods: 1 }),
  /game loop threw/,
);
assert.equal(
  seen.length,
  before,
  "a period that threw is not a completed period",
);
worker.registered.length = 0;

// --- a subscriber fault never reaches the game ---------------------------------------------------

const faults = [];
const faultPage = makePage();
const faultCapture = installWorkerCapture(faultPage, {
  onCaptureError: (stage, detail) => faults.push([stage, detail]),
});
const faultWorker = new faultPage.Worker("evolve/evolve.js");
faultCapture.periods.subscribe(() => {
  throw new Error("subscriber threw");
});
let secondSubscriberRan = false;
faultCapture.periods.subscribe(() => {
  secondSubscriberRan = true;
});
let gameListenerRan = false;
faultWorker.addEventListener("message", () => {
  gameListenerRan = true;
});
faultWorker.dispatch({ loop: "main", periods: 1 });
assert.equal(gameListenerRan, true);
assert.equal(secondSubscriberRan, true);
assert.deepEqual(
  faults.map(([stage]) => stage),
  ["period-listener"],
);
faultCapture.uninstall();

// --- unsubscribe and teardown ---------------------------------------------------------------------

unsubscribe();
worker.addEventListener("message", () => {});
worker.dispatch({ loop: "main", periods: 1 });
assert.deepEqual(seen, [{ periods: 1 }, { periods: 4 }, { periods: 1 }]);

const teardownPage = makePage();
const teardown = installWorkerCapture(teardownPage);
assert.equal(teardownPage.Worker === FakeWorker, false);
teardown.uninstall();
assert.equal(
  teardownPage.Worker,
  FakeWorker,
  "uninstall restores an unused constructor",
);
teardown.uninstall();

// A custom pattern selects a different worker URL.
const customPage = makePage();
const custom = installWorkerCapture(customPage, {
  workerUrlPattern: /custom-worker\.js$/,
});
new customPage.Worker("evolve/evolve.js");
assert.equal(custom.isCaptured(), false);
new customPage.Worker("custom-worker.js");
assert.equal(custom.isCaptured(), true);
custom.uninstall();

assert.equal(unrelated.url, "some/other-worker.js");
assert.equal(later.url, "evolve/evolve.js");

console.log("worker-capture ok");
