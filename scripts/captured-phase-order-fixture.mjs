/**
 * Shared fixture for the captured runtime's phase-order regressions.
 *
 * The assertions in `captured-phase-order-test.mjs` read the order the production
 * `startCapturedRuntime().runCycle()` actually executes, so a phase only shows up in the trace
 * when it really invoked a captured game control and really changed the live root. Nothing here
 * inspects the runtime's source, and no phase is faked into the trace.
 *
 * A scenario supplies:
 *
 *   root        - the live captured game root, mutated in place by the control stubs;
 *   settings    - the persisted script settings the cycle reads;
 *   controls    - `{ [elementId]: { event?, events?, data?, methods: { [method]: implementation } } }`.
 *                 Every invocation of that control appends its event to the trace, so an enabled
 *                 phase that decides not to act leaves no mark and the assertion fails loudly.
 *   documentSetup({ document, body, root }) - add the panels a feature reads out of the DOM.
 *   mount       - `true` lets the runtime's tab discovery draw, which is what the progression
 *                 phases need to sample their own panels. Off by default, so a fixture that does
 *                 not care pays nothing for it.
 *   logEvents   - `[{ match, event }]`. A phase that reports itself through the production error
 *                 path rather than through a control invocation — Power, whose whole answer on an
 *                 unavailable cycle is a log line — is still an executed phase.
 */
import { startCapturedRuntime } from "../src/bootstrap/captured-runtime-control.ts";
import { createTestDocument, element } from "./dom-fixture.mjs";

const DEFAULT_SETTINGS = Object.freeze({
  masterScriptToggle: true,
  tickRate: 1,
});

/**
 * Runs one production captured cycle and returns the trace of control invocations.
 *
 * @param {object} scenario
 * @param {unknown} scenario.root live game root the control stubs mutate
 * @param {Record<string, unknown>} [scenario.settings] persisted script settings
 * @param {Record<string, {event?: string, methods: Record<string, Function>}>} [scenario.controls]
 * @param {(state: {document: unknown, root: unknown}) => void} [scenario.documentSetup]
 * @param {Record<string, unknown>} [scenario.mechanics] captured semantic mechanics reader
 * @param {unknown} [scenario.settingsHostWindow]
 */
export function runCapturedPhaseOrderCycle({
  root,
  settings = {},
  controls = {},
  documentSetup = () => {},
  mechanics,
  mount = false,
  logEvents = [],
  settingsHostWindow = {},
}) {
  const trace = [];
  const errors = [];
  const invocations = [];
  const persisted = [];
  const handles = new Map();
  for (const [elementId, spec] of Object.entries(controls)) {
    const methods = spec.methods ?? {};
    handles.set(elementId, {
      elementId,
      generation: 1,
      methods: Object.keys(methods),
      implementations: methods,
      // Some game controls act by writing the reactive object they were bound to, not by being
      // invoked. The handle carries it as `data`, exactly as `vue-capture` records it.
      ...(spec.data === undefined ? {} : { data: spec.data }),
      event: spec.event,
      ...(spec.events === undefined ? {} : { events: spec.events }),
    });
  }
  const body = element("div", { id: "page" });
  const document = createTestDocument(body);
  documentSetup({ document, body, root });

  const registry = {
    resolve(elementId) {
      const handle = handles.get(elementId);
      return handle === undefined
        ? undefined
        : {
            elementId: handle.elementId,
            generation: handle.generation,
            methods: handle.methods,
            ...(handle.data === undefined ? {} : { data: handle.data }),
          };
    },
    invoke(handle, method, args = []) {
      const current = handles.get(handle.elementId);
      if (current === undefined || current.generation !== handle.generation) {
        return { ok: false, reason: "stale-control" };
      }
      invocations.push({ elementId: handle.elementId, method, args });
      // `event` marks every invocation of the control; `events` marks named methods only, for the
      // controls whose read-only oracles must not look like the mutation they sit beside.
      const event =
        typeof current.event === "string"
          ? current.event
          : (current.events ?? {})[method];
      if (event !== undefined) trace.push(event);
      const implementation = current.implementations[method];
      return {
        ok: true,
        value:
          typeof implementation === "function"
            ? implementation(...args)
            : undefined,
      };
    },
    capturedElementIds: () => [...handles.keys()],
  };

  let runCycle;
  const pageCapture = {
    isComplete: () => true,
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls: registry,
    ...(mechanics === undefined ? {} : { mechanics }),
    keyState: { readPressed: () => false },
    controlUsage: { readUsage: () => [] },
    periods: {
      subscribe(next) {
        runCycle = next;
        return () => {};
      },
    },
    mountSuppression:
      mount === true
        ? {
            available: true,
            withoutMounting: (draw) => draw(),
            withMountingEnabled: (draw) => draw(),
          }
        : { available: false, withoutMounting: () => undefined },
    uninstall: () => {},
  };

  const stop = startCapturedRuntime({
    pageCapture,
    document,
    keyboardEvent: class {},
    mouseEvent: class {},
    settingsHostWindow: { document, ...settingsHostWindow },
    storage: {
      getItem: () => JSON.stringify({ ...DEFAULT_SETTINGS, ...settings }),
      // The migrated record the script actually persisted, which is what every feature reads
      // through `settingsLifecycle.readEffective`.
      setItem: (_key, value) => persisted.push(String(value)),
    },
    logError: (message) => {
      errors.push(message);
      for (const { match, event } of logEvents) {
        if (match.test(message)) trace.push(event);
      }
    },
  });
  runCycle({ periods: 1 });
  stop();
  return {
    trace,
    errors,
    invocations,
    root,
    effectiveSettings:
      persisted.length === 0 ? {} : JSON.parse(persisted[persisted.length - 1]),
  };
}

/**
 * The same fixture over several cycles, with the trace and invocation log accumulated. Some
 * features debounce across cycles — Storage holds a freshly built crate back before assigning it —
 * so a relation that depends on their mutation needs the cycle it lands in.
 */
export function runCapturedPhaseOrderCycles(count, scenario) {
  const trace = [];
  const errors = [];
  const invocations = [];
  let result;
  for (let cycle = 0; cycle < count; cycle += 1) {
    result = runCapturedPhaseOrderCycle(scenario);
    trace.push(...result.trace);
    errors.push(...result.errors);
    invocations.push(...result.invocations);
  }
  return Object.freeze({
    trace,
    errors,
    invocations,
    root: result?.root,
    effectiveSettings: result?.effectiveSettings,
    cycles: count,
  });
}

/** Index of the first trace entry, or -1. Asserting on the result names the missing phase. */
export function traceIndex(trace, name) {
  return trace.indexOf(name);
}

/**
 * Asserts `earlier` ran before `later`, naming the trace that proves it.
 *
 * @param {import("node:assert/strict").strict} assert
 * @param {readonly string[]} trace
 * @param {string} earlier
 * @param {string} later
 */
export function assertRunsBefore(assert, trace, earlier, later) {
  const from = traceIndex(trace, earlier);
  const to = traceIndex(trace, later);
  assert.notEqual(from, -1, `${earlier} never ran: ${JSON.stringify(trace)}`);
  assert.notEqual(to, -1, `${later} never ran: ${JSON.stringify(trace)}`);
  assert.ok(
    from < to,
    `expected ${earlier} before ${later}: ${JSON.stringify(trace)}`,
  );
}
