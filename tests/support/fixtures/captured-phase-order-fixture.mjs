import { withControlCaptureAuthority } from "./control-capture-fixture.mjs";
import {
  makeCapturedTechBindingFixture,
  makeCapturedTechMechanicsFixture,
} from "./captured-tech-mechanics-fixture.mjs";
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
 *                 `events[method]` may be a function of the invocation arguments when two phases
 *                 share one captured method for two different mutations.
 *   documentSetup({ document, body, root }) - add the panels a feature reads out of the DOM.
 *   mount       - `true` lets the runtime's tab discovery draw, which is what the progression
 *                 phases need to sample their own panels. Off by default, so a fixture that does
 *                 not care pays nothing for it.
 *   logEvents   - `[{ match, event }]`. A phase that reports itself through the production error
 *                 path rather than through a control invocation — Power, whose whole answer on an
 *                 unavailable cycle is a log line — is still an executed phase.
 *   cycles      - how many `runCycle` calls this one runtime instance serves. Features that carry
 *                 state across cycles — the Storage allocation debounce, the prestige goal — only
 *                 move when the same instance runs again, so a relation that depends on such a
 *                 mutation must ask for the cycle it lands in.
 */
import { startCapturedRuntime } from "../../../src/bootstrap/captured-runtime-control.ts";
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
  controlSetup = () => {},
  documentSetup = () => {},
  mechanics,
  mount = false,
  logEvents = [],
  cycles = 1,
  settingsHostWindow = {},
  afterCycle = () => {},
}) {
  const trace = [];
  const errors = [];
  const invocations = [];
  const persisted = [];
  const cycleTrace = [];
  const cycleErrors = [];
  const cycleInvocations = [];
  const handles = new Map();
  let currentRoot = root;
  const rootListeners = [];
  const replaceRoot = (nextRoot) => {
    currentRoot = nextRoot;
    for (const listener of rootListeners) listener();
  };
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
  controlSetup({
    replaceRoot,
    rebind(elementId) {
      const handle = handles.get(elementId);
      if (handle !== undefined)
        handles.set(elementId, {
          ...handle,
          generation: handle.generation + 1,
        });
    },
    register(elementId, spec) {
      handles.set(elementId, {
        elementId,
        generation: 1,
        methods: Object.keys(spec.methods ?? {}),
        implementations: spec.methods ?? {},
        event: spec.event,
      });
    },
  });
  const body = element("div", { id: "page" });
  const document = createTestDocument(body);
  documentSetup({ document, body, root });

  const registry = withControlCaptureAuthority({
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
      cycleInvocations.push({ elementId: handle.elementId, method, args });
      // `event` marks every invocation of the control; `events` marks named methods only, for the
      // controls whose read-only oracles must not look like the mutation they sit beside. A marked
      // method may also be a function of the arguments, for a captured method two different phases
      // invoke for two different mutations — Espionage's release and Battle's raid are both
      // `garrison.campaign(index)` — so the phase is read off what the stub is about to change.
      const marked =
        typeof current.event === "string"
          ? current.event
          : (current.events ?? {})[method];
      const event = typeof marked === "function" ? marked(args) : marked;
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
  });

  let runCycle;
  const pageCapture = {
    isComplete: () => true,
    rootState: {
      readRoot: () => currentRoot,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: (listener) => {
        rootListeners.push(listener);
        return () => {};
      },
    },
    controls: registry,
    bindings: makeCapturedTechBindingFixture(registry),
    mechanics: {
      ...makeCapturedTechMechanicsFixture([
        ...Object.keys(currentRoot?.tech ?? {}).map(
          (technology) => `tech-${technology}`,
        ),
        "tech-polymer-reserve",
        "tech-elerium-reserve",
      ]),
      ...(mechanics ?? {}),
      readStructures: mechanics?.readStructures ?? (() => undefined),
      readStructureIdentities:
        mechanics?.readStructureIdentities ?? (() => undefined),
    },
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
    // The capture-only path. No scenario here runs a real espionage operation — a release goes
    // through `garrison.campaign` — so this reports the closed door the adapter must fail on.
    synthesis: {
      available: true,
      invoke: () => ({ ok: false, reason: "unknown-method" }),
    },
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
      cycleErrors.push(message);
      for (const { match, event } of logEvents) {
        if (match.test(message)) {
          trace.push(event);
          cycleTrace.push(event);
        }
      }
    },
  });
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    const traceBefore = trace.length;
    const errorBefore = cycleErrors.length;
    const invocationBefore = cycleInvocations.length;
    runCycle({ periods: 1 });
    cycleTrace.push({
      cycle,
      trace: trace.slice(traceBefore),
      errors: cycleErrors.slice(errorBefore),
      invocations: cycleInvocations.slice(invocationBefore),
    });
    afterCycle(cycle, { root: currentRoot, replaceRoot });
  }
  stop();
  return {
    trace,
    errors,
    invocations,
    // Per-cycle slices of the same accumulated log, for a relation whose phases run in the cycle a
    // cross-cycle state change actually lands in rather than in the first one.
    cycleTrace,
    root: currentRoot,
    effectiveSettings:
      persisted.length === 0 ? {} : JSON.parse(persisted[persisted.length - 1]),
  };
}

/** Index of the first trace entry, or -1. Asserting on the result names the missing phase. */
function traceIndex(trace, name) {
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
