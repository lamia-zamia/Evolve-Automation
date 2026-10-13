import assert from "node:assert/strict";

import { createPlanningScheduler } from "../../src/application/planning-worker.ts";

class FakePlanningWorker {
  messages = [];
  listeners = undefined;
  terminated = false;
  failPost = false;

  postMessage(message) {
    if (this.failPost) throw new DOMException("clone failed", "DataCloneError");
    this.messages.push(message);
  }

  subscribe(onMessage, onError) {
    this.listeners = { onMessage, onError };
    return () => {
      this.listeners = undefined;
    };
  }

  terminate() {
    this.terminated = true;
  }

  respond(message) {
    this.listeners?.onMessage(message);
  }

  crash(error) {
    this.listeners?.onError(error);
  }
}

const identity = (snapshotVersion, overrides = {}) => ({
  task: "research-goal-candidates",
  rootGeneration: 3,
  progressionEpoch: "run:5",
  offerIdentity: "tech-mad@2",
  snapshotVersion,
  ...overrides,
});

const decode = (value) => {
  if (typeof value !== "object" || value === null) return undefined;
  const response = value;
  if (
    typeof response.requestId !== "number" ||
    typeof response.identity !== "object" ||
    response.identity === null ||
    typeof response.outcome !== "object" ||
    response.outcome === null
  )
    return undefined;
  return response;
};

const responseFor = (request, value = { proposal: "evidence-only" }) => ({
  requestId: request.requestId,
  identity: request.identity,
  outcome: { kind: "decision", value },
  workerComputeMs: 0.25,
});

{
  const worker = new FakePlanningWorker();
  const received = [];
  const diagnostics = [];
  const scheduler = createPlanningScheduler({
    worker,
    decodeResponse: decode,
    onResponse: (value) => received.push(value),
    onDiagnostic: (...value) => diagnostics.push(value),
  });

  const firstId = scheduler.submit(identity(1), { version: 1 });
  assert.equal(scheduler.submit(identity(1), { version: 1 }), firstId);
  scheduler.submit(identity(2), { version: 2 });
  scheduler.submit(identity(3), { version: 3 });
  assert.equal(worker.messages.length, 1, "only one request is active");
  assert.equal(scheduler.readPendingCount(), 1, "only the newest update waits");

  const first = worker.messages[0];
  worker.respond(responseFor({ ...first, requestId: -1 }));
  assert.equal(
    worker.messages.length,
    1,
    "out-of-order response cannot free the active slot",
  );
  worker.respond(responseFor(first));
  assert.equal(received.length, 0, "superseded work cannot publish a proposal");
  assert.equal(worker.messages.length, 2);
  assert.equal(worker.messages[1].identity.snapshotVersion, 3);
  worker.respond(responseFor(worker.messages[1]));
  assert.equal(received.length, 1);
  assert.equal(received[0].identity.snapshotVersion, 3);
  assert.equal(received[0].outcome.value.proposal, "evidence-only");
  assert.ok(diagnostics.some(([code]) => code === "stale-response"));
  assert.equal(scheduler.readDiscardedCount(), 3);
  scheduler.close();
  assert.equal(worker.terminated, true);
}

{
  const worker = new FakePlanningWorker();
  const received = [];
  const scheduler = createPlanningScheduler({
    worker,
    decodeResponse: decode,
    onResponse: (value) => received.push(value),
    onDiagnostic: () => {},
  });
  scheduler.submit(identity(1), { version: 1 });
  scheduler.invalidate(); // root replacement, goal change, pause or reload
  scheduler.submit(identity(2, { rootGeneration: 4 }), { version: 2 });
  worker.respond(responseFor(worker.messages[0]));
  assert.equal(received.length, 0, "the invalidated root result is discarded");
  assert.equal(worker.messages.length, 2);
  worker.respond(responseFor(worker.messages[1]));
  assert.equal(received[0].identity.rootGeneration, 4);
  scheduler.close();
}

{
  const worker = new FakePlanningWorker();
  worker.failPost = true;
  const diagnostics = [];
  const scheduler = createPlanningScheduler({
    worker,
    decodeResponse: decode,
    onResponse: () =>
      assert.fail("failed serialization cannot publish a result"),
    onDiagnostic: (...value) => diagnostics.push(value),
  });
  scheduler.submit(identity(1), { bad: () => 1 });
  assert.equal(worker.terminated, true);
  assert.ok(
    diagnostics.some(([code]) => code === "request-serialization-failed"),
  );
  assert.equal(scheduler.submit(identity(2), { version: 2 }), undefined);
}

{
  const worker = new FakePlanningWorker();
  const diagnostics = [];
  const scheduler = createPlanningScheduler({
    worker,
    decodeResponse: decode,
    onResponse: () => {},
    onDiagnostic: (...value) => diagnostics.push(value),
  });
  scheduler.submit(identity(1), { version: 1 });
  worker.crash(new Error("worker crashed"));
  assert.equal(worker.terminated, true);
  assert.ok(diagnostics.some(([code]) => code === "worker-error"));
}
