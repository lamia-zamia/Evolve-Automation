import assert from "node:assert/strict";

import { createEmbeddedPlanningWorker } from "../../../src/adapters/browser/planning-worker.ts";

class FakeBrowserWorker {
  listeners = { message: new Set(), error: new Set() };
  sent = [];
  terminated = false;

  addEventListener(type, listener) {
    this.listeners[type].add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners[type].delete(listener);
  }

  postMessage(message) {
    this.sent.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  emit(type, value) {
    for (const listener of this.listeners[type]) listener(value);
  }
}

const makeHost = ({ ready = true, failConstruction = false } = {}) => {
  const events = { revoked: [], workers: [], timers: [] };
  const host = {
    Blob: class {
      constructor(parts) {
        this.parts = parts;
      }
    },
    URL: {
      createObjectURL: (blob) => {
        events.blob = blob;
        return "blob:planning-worker-test";
      },
      revokeObjectURL: (url) => events.revoked.push(url),
    },
    Worker: class extends FakeBrowserWorker {
      constructor(url) {
        super();
        events.url = url;
        events.workers.push(this);
        if (failConstruction) throw new Error("CSP blocked worker");
        if (ready)
          queueMicrotask(() =>
            this.emit("message", { data: { kind: "worker-ready" } }),
          );
      }
    },
    setTimeout: (callback, delayMs) => {
      const timer = { callback, delayMs };
      events.timers.push(timer);
      return timer;
    },
    clearTimeout: (timer) => {
      timer.cleared = true;
    },
  };
  return { host, events };
};

{
  const { host, events } = makeHost();
  const result = await createEmbeddedPlanningWorker(
    "postMessage('worker-ready')",
    host,
  );
  assert.equal(result.status, "ready");
  assert.equal(events.blob.parts[0], "postMessage('worker-ready')");
  assert.deepEqual(events.revoked, ["blob:planning-worker-test"]);
  assert.equal(events.timers[0].cleared, true);
  const received = [];
  const errors = [];
  const unsubscribe = result.worker.subscribe(
    (message) => received.push(message),
    (error) => errors.push(error),
  );
  events.workers[0].emit("message", { data: { requestId: 1 } });
  events.workers[0].emit("error", { message: "later crash" });
  assert.deepEqual(received, [{ requestId: 1 }]);
  assert.deepEqual(errors, ["later crash"]);
  unsubscribe();
  result.worker.terminate();
  assert.equal(events.workers[0].terminated, true);
}

{
  const { host, events } = makeHost({ failConstruction: true });
  const result = await createEmbeddedPlanningWorker("blocked", host);
  assert.deepEqual(result, {
    status: "unavailable",
    code: "worker-startup-failed",
    detail: "Error: CSP blocked worker",
  });
  assert.deepEqual(events.revoked, ["blob:planning-worker-test"]);
}

{
  const { host, events } = makeHost({ ready: false });
  const pending = createEmbeddedPlanningWorker("no-ready", host, 500);
  await new Promise((resolve) => setImmediate(resolve));
  events.timers[0].callback();
  const result = await pending;
  assert.equal(result.status, "unavailable");
  assert.equal(result.code, "worker-startup-timeout");
  assert.equal(events.workers[0].terminated, true);
  assert.deepEqual(events.revoked, ["blob:planning-worker-test"]);
}

{
  const result = await createEmbeddedPlanningWorker("unsupported", {});
  assert.equal(result.status, "unavailable");
  assert.equal(result.code, "worker-unsupported");
}
