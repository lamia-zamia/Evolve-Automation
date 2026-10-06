/**
 * Captures the game's live state and its control methods by watching Vue, with neither Debug Mode
 * nor Preload Tab Content.
 *
 * The game keeps `global`, `actions`, and `runAction` as lexical bindings inside its bundled ES
 * module, so nothing is reflectable after startup. What is reachable is the Vue global it uses:
 *
 * - `vars.js:makeReactive` sends the loaded save through `Vue.reactive`, and does it again from
 *   `setGlobal` / `restoreReactivity`. Wrapping `reactive` yields the root proxy itself.
 * - `vars.js:suppressReactivity` calls `Vue.toRaw(global)` before offline catch-up. Wrapping
 *   `toRaw` brackets that window; the matching `reactive` call closes it.
 * - `functions.js:vBind` sends every component through `Vue.createApp`, and the action components'
 *   methods close over the private `c_action` and `runAction`. Wrapping `createApp` captures those
 *   methods, which keep working after their panel is torn down.
 *
 * `window.Vue` is intercepted with an accessor only long enough to win the load race against the
 * page's Vue script, then restored to a plain data property. The three Vue methods stay wrapped:
 * root replacement, reactivity suppression, and component rebuilds are lifecycle events that keep
 * happening for as long as the page lives.
 */

import type { GameRootStateSource } from "../../ports/game-root-state.ts";
import type {
  ControlCaptureCheckpoint,
  GameControlHandle,
  GameControlRegistry,
  GameControlResult,
} from "../../ports/game-control-registry.ts";
import type {
  GameControlSyntheticReceiver,
  GameControlSynthesis,
  GameControlSynthesisRequest,
} from "../../ports/game-control-synthesis.ts";
import type {
  GameControlUsage,
  GameControlUsageReader,
} from "../../ports/game-control-usage.ts";
import type {
  GameMountSuppression,
  MountSuppressionScope,
} from "../../ports/game-mount-suppression.ts";
import { isRecord, readProperty } from "../validation.ts";

type AnyFunction = (this: unknown, ...args: unknown[]) => unknown;

const CAPTURE_MARKER = Symbol.for("evolve-automation.vue-capture");

/**
 * Marks a disposable app handed to `vBind` in place of a real one, so a browser check can tell a
 * temporary app that outlived its scope from one the game mounted for the player.
 */
export const DISPOSABLE_APP_MARKER = Symbol.for(
  "evolve-automation.disposable-vue-app",
);

/**
 * Everything `vBind` does with what `Vue.createApp` returns: `use(Buefy.default)` unless the bind
 * opts out, `mount(el)` whose result it keeps as `el.__vue_proxy__`, and `unmount()` when
 * `unmountApp` tears the panel down. Its update path reaches for `_instance`/`_container` first and
 * falls back to that stored proxy, so the proxy answers `$forceUpdate` and the redraw is a no-op
 * rather than a warning.
 */
function createDisposableApp(): Record<PropertyKey, unknown> {
  const proxy = { $forceUpdate: () => {} };
  const app: Record<PropertyKey, unknown> = {
    use: () => app,
    mount: () => proxy,
    unmount: () => {},
  };
  app[DISPOSABLE_APP_MARKER] = true;
  return app;
}

/** A bare `#name` selector: no descendant, class, or attribute part. */
const BARE_ID = /^#[\w-]+$/;

/** A dotted `this` path a synthetic receiver may name, e.g. `$buefy.modal.open`. */
const RECEIVER_PATH = /^[$A-Z_a-z][\w$]*(?:\.[$A-Z_a-z][\w$]*)*$/;

/** One method the game declared in a component's own `methods` bag. */
export type CapturedBindingMethod = (
  this: unknown,
  ...args: unknown[]
) => unknown;

/**
 * Observes every `vBind` configuration the capture records, with the game-owned closures it declared.
 *
 * A control handle is superseded by the next redraw of its element, so invoking through one is only
 * valid until then. A caller that needs the lexical authority *behind* a binding — the closures the
 * bundle closed over, which keep working after the component is torn down — observes the draw that
 * produced it and keeps what it needs. Capture-layer only; nothing here is a game mechanic.
 */
export type VueBindingListener = (
  elementId: string,
  methods: Readonly<Record<string, CapturedBindingMethod>>,
) => void;

export type VueBindingObserver = (listener: VueBindingListener) => () => void;

export interface VueCapture {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly controlUsage: GameControlUsageReader;
  readonly mountSuppression: GameMountSuppression;
  /** One-shot invocation of a captured method with a synthetic receiver. Capture-layer only. */
  readonly synthesis: GameControlSynthesis;
  /** Registers a listener for each recorded binding; returns the removal. Capture-layer only. */
  readonly observeBindings: VueBindingObserver;
  /** True when the Vue methods are wrapped; false for an inert capture with no Vue to hook. */
  readonly installed: boolean;
  /** Restores every wrapped Vue method and stops recording. Idempotent. */
  uninstall(): void;
}

export interface VueCaptureOptions {
  /**
   * Structural boundary check identifying the game root. The default is deliberately not "the
   * first reactive object": component data goes through `Vue.reactive` too.
   */
  readonly isRootCandidate?: (value: unknown) => boolean;
  /** Reports a fault in the capture itself. Never used to report game faults. */
  readonly onCaptureError?: (stage: string, detail: string) => void;
}

/**
 * Attached to every function this adapter wraps, so a second installation finds the first one's
 * capture instead of quietly building an empty parallel registry. It lives on the page's own Vue
 * object, not in module state.
 */
interface CaptureMarker {
  capture: VueCapture | undefined;
}

interface CapturedControl {
  readonly elementId: string;
  generation: number;
  rejectedGeneration?: number;
  methods: Record<string, AnyFunction>;
  /** Exactly what the options carried, which for a game component is a factory. See `bindingData`. */
  data: unknown;
  /** The factory's one result, boxed so a legitimately absent value is not re-derived. */
  materialized: { value: unknown } | undefined;
  receiver: Record<string, AnyFunction> | undefined;
}

function asFunction(value: unknown): AnyFunction | undefined {
  return typeof value === "function" ? (value as AnyFunction) : undefined;
}

/**
 * DeadSpace adds `settings` after its first `makeReactive(global)` call on a new game. The root's
 * state collections already exist at that boundary; requiring settings would miss the only fresh
 * root capture until an unrelated later reactivity restore.
 */
export function isGameRootShape(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isRecord(readProperty(value, "resource")) &&
    isRecord(readProperty(value, "race")) &&
    isRecord(readProperty(value, "stats")) &&
    isRecord(readProperty(value, "tech")) &&
    isRecord(readProperty(value, "city")) &&
    isRecord(readProperty(value, "civic"))
  );
}

function readMarker(value: unknown): CaptureMarker | undefined {
  const marker = readProperty(value, CAPTURE_MARKER);
  return isRecord(marker) && "capture" in marker
    ? (marker as unknown as CaptureMarker)
    : undefined;
}

function inertCapture(): VueCapture {
  return Object.freeze({
    installed: false,
    rootState: Object.freeze({
      readRoot: () => undefined,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    }),
    controls: Object.freeze({
      resolve: () => undefined,
      checkpoint: () => Object.freeze({}) as ControlCaptureCheckpoint,
      rejectChanges: () => {},
      invoke: () => ({ ok: false, reason: "unknown-control" }) as const,
      capturedElementIds: () => [],
    }),
    controlUsage: Object.freeze({ readUsage: () => [] }),
    mountSuppression: Object.freeze({
      available: false,
      withoutMounting: () => {
        throw new Error(
          "no Vue was captured, so mounting cannot be suppressed",
        );
      },
      withMountingEnabled: () => {
        throw new Error(
          "no Vue was captured, so mounting cannot be re-enabled",
        );
      },
    }),
    synthesis: Object.freeze({
      available: false,
      invoke: () => ({ ok: false, reason: "unknown-control" }) as const,
    }),
    observeBindings: () => () => {},
    uninstall: () => {},
  });
}

export function installVueCapture(
  pageWindow: unknown,
  options: VueCaptureOptions = {},
): VueCapture {
  if (!isRecord(pageWindow)) return inertCapture();

  const isRootCandidate = options.isRootCandidate ?? isGameRootShape;
  const reportError = options.onCaptureError ?? (() => {});

  // Already installed on this page: hand back the live capture rather than a second empty one.
  const existingDescriptor = Object.getOwnPropertyDescriptor(pageWindow, "Vue");
  const existingMarker =
    readMarker(readProperty(readProperty(pageWindow, "Vue"), "reactive")) ??
    readMarker(existingDescriptor?.get);
  if (existingMarker?.capture !== undefined) return existingMarker.capture;

  const marker: CaptureMarker = { capture: undefined };

  let root: unknown = undefined;
  let rootRaw: unknown = undefined;
  let suppressed = false;
  let stopped = false;
  const rootListeners = new Set<() => void>();

  const controls = new Map<string, CapturedControl>();
  const controlCheckpoints = new WeakMap<
    ControlCaptureCheckpoint,
    ReadonlyMap<string, number>
  >();
  const captureOrder: string[] = [];
  const usage = new Map<string, GameControlUsage>();
  const bindingListeners = new Set<VueBindingListener>();

  let createAppHooked = false;
  let mountingEnabled = 0;
  const suppressionScopes: Array<Readonly<MountSuppressionScope>> = [];
  /** Apps a scope let through, newest first, so a scope's end can take them down again. */
  const mountedInScope: Array<{
    readonly depth: number;
    readonly app: unknown;
  }> = [];

  let restoreVue: (() => void) | undefined;

  function notifyRootReplaced(): void {
    for (const listener of [...rootListeners]) {
      try {
        listener();
      } catch (error) {
        reportError("root-listener", String(error));
      }
    }
  }

  function recordRoot(target: unknown, proxy: unknown): void {
    root = proxy;
    rootRaw = target;
    suppressed = false;
    notifyRootReplaced();
  }

  function recordSuppression(target: unknown, raw: unknown): void {
    // `toRaw` on anything that is not the root proxy — including our own reads — must not count.
    if (raw === target) return;
    if (rootRaw !== undefined && raw !== rootRaw) return;
    suppressed = true;
  }

  function recordApp(optionsValue: unknown): void {
    if (!isRecord(optionsValue)) return;
    const elementSelector = readProperty(optionsValue, "el");
    if (typeof elementSelector !== "string" || elementSelector.length === 0) {
      return;
    }
    const methodsValue = readProperty(optionsValue, "methods");
    if (!isRecord(methodsValue)) return;
    const methods: Record<string, AnyFunction> = {};
    for (const key of Object.keys(methodsValue)) {
      const method = asFunction(methodsValue[key]);
      if (method !== undefined) methods[key] = method;
    }
    if (Object.keys(methods).length === 0) return;

    // The game declares selectors, not ids. A bare `#id` is addressed by that id; anything else
    // (`#mainColumn div.content`, `#popper > div`) keeps its whole selector as its name, because
    // the leading id alone does not say which element was bound.
    const elementId = BARE_ID.test(elementSelector)
      ? elementSelector.slice(1)
      : elementSelector;
    for (const listener of bindingListeners) {
      try {
        listener(elementId, methods);
      } catch (error) {
        reportError("binding-listener", String(error));
      }
    }
    const existing = controls.get(elementId);
    if (existing === undefined) {
      captureOrder.push(elementId);
      controls.set(elementId, {
        elementId,
        generation: 1,
        methods,
        data: readProperty(optionsValue, "data"),
        materialized: undefined,
        receiver: undefined,
      });
      return;
    }
    existing.generation += 1;
    existing.methods = methods;
    existing.data = readProperty(optionsValue, "data");
    existing.materialized = undefined;
    existing.receiver = undefined;
  }

  /**
   * The binding data a control was given, as a value rather than as the factory the game wrapped it
   * in.
   *
   * `vBind` rewrites the options before it calls `Vue.createApp`: `data: { title, act }` becomes
   * `data(){ return Vue.reactive(original) }`, so what `createApp` receives — and therefore what is
   * recorded here — is a function for every component the game binds. Reading a field off that
   * answers `undefined`, which is silent and total: it is why every building row's `act` went
   * missing at once. Vue would call the factory at mount, but a discovery pass suppresses mounting
   * precisely so no component is built, so nothing else ever calls it.
   *
   * Called once per binding and only for a caller that actually asks for the data. That is narrow
   * on purpose: `vBind` is the only route to `Vue.createApp` on this page and its factory does
   * nothing but return `Vue.reactive(original)`, which has no side effects and is idempotent — but
   * an arbitrary component's `data()` is not something to run speculatively. A factory that throws
   * leaves the control with no data instead of failing its caller.
   */
  function bindingData(control: CapturedControl): unknown {
    if (control.materialized === undefined) {
      const recorded = control.data;
      const factory = asFunction(recorded);
      let value: unknown = recorded;
      if (factory !== undefined) {
        try {
          value = Reflect.apply(factory, undefined, []);
        } catch (error) {
          reportError("control-data", `${control.elementId}: ${String(error)}`);
          value = undefined;
        }
      }
      control.materialized = { value };
    }
    return control.materialized.value;
  }

  function receiverFor(control: CapturedControl): Record<string, AnyFunction> {
    if (control.receiver !== undefined) return control.receiver;
    // Captured methods call at most their own siblings through `this` (city actions use
    // `this.on_cap()`), so a bag of self-bound methods is a sufficient receiver. No component
    // data, no DOM node, and no live effect scope is needed.
    const receiver: Record<string, AnyFunction> = {};
    for (const [name, method] of Object.entries(control.methods)) {
      receiver[name] = method.bind(receiver) as AnyFunction;
    }
    control.receiver = receiver;
    return receiver;
  }

  /**
   * The extras a one-shot synthetic invocation may add, as a fresh object layered over the
   * control's own receiver bag. Only no-op callables named by path exist here, so the copy is what
   * keeps the captured receiver — and anything reachable from it — untouched for the call.
   */
  function syntheticReceiver(
    control: CapturedControl,
    requested: GameControlSyntheticReceiver | undefined,
  ): Record<string, unknown> {
    const base = receiverFor(control);
    if (requested === undefined) return { ...base };
    const extras: Record<string, unknown> = {};
    for (const path of requested.noOpMethods) {
      if (!RECEIVER_PATH.test(path)) {
        reportError("synthesis", `rejected receiver path: ${path}`);
        continue;
      }
      const segments = path.split(".");
      const leaf = segments.pop() as string;
      let node = extras;
      for (const segment of segments) {
        const child = node[segment];
        if (isRecord(child)) {
          node = child as Record<string, unknown>;
        } else {
          const created: Record<string, unknown> = {};
          node[segment] = created;
          node = created;
        }
      }
      node[leaf] = (): void => {};
    }
    return { ...base, ...extras };
  }

  function handleFor(control: CapturedControl): GameControlHandle {
    const handleGeneration = control.generation;
    return Object.freeze({
      elementId: control.elementId,
      generation: handleGeneration,
      methods: Object.freeze(Object.keys(control.methods)),
      // Lazy: a handle resolved only to invoke a method never runs the game's data factory.
      get data(): unknown {
        if (
          control.generation !== handleGeneration ||
          control.rejectedGeneration === handleGeneration
        )
          return undefined;
        return bindingData(control);
      },
    });
  }

  function invokeControl(
    handle: GameControlHandle,
    method: string,
    args: readonly unknown[],
    receiver: GameControlSyntheticReceiver | undefined,
  ): GameControlResult {
    const control = controls.get(handle.elementId);
    if (control === undefined) {
      return { ok: false, reason: "unknown-control" };
    }
    if (control.generation !== handle.generation) {
      return {
        ok: false,
        reason: "stale-control",
        detail: `${handle.elementId} generation ${handle.generation}, current ${control.generation}`,
      };
    }
    if (control.rejectedGeneration === control.generation) {
      return {
        ok: false,
        reason: "stale-control",
        detail: `${handle.elementId} generation ${handle.generation} came from a rejected protected draw`,
      };
    }
    const target = control.methods[method];
    if (target === undefined) {
      return {
        ok: false,
        reason: "unknown-method",
        detail: `${handle.elementId}.${method}`,
      };
    }
    const usageKey = `${handle.elementId} ${method}`;
    const previous = usage.get(usageKey);
    const record = (outcome: "returned" | "threw"): void => {
      const next: GameControlUsage = Object.freeze({
        elementId: handle.elementId,
        method,
        returned: (previous?.returned ?? 0) + (outcome === "returned" ? 1 : 0),
        threw: (previous?.threw ?? 0) + (outcome === "threw" ? 1 : 0),
      });
      usage.set(usageKey, next);
    };
    try {
      const value = Reflect.apply(
        target,
        syntheticReceiver(control, receiver),
        [...args],
      );
      record("returned");
      return { ok: true, value };
    } catch (error) {
      record("threw");
      return {
        ok: false,
        reason: "threw",
        detail: `${handle.elementId}.${method}: ${String(error)}`,
      };
    }
  }

  function wrap(
    vue: Record<PropertyKey, unknown>,
    name: string,
    make: (original: AnyFunction) => AnyFunction,
  ): (() => void) | undefined {
    const original = asFunction(vue[name]);
    if (original === undefined) return undefined;
    const wrapped = make(original);
    Reflect.set(wrapped, CAPTURE_MARKER, marker);
    vue[name] = wrapped;
    return () => {
      if (vue[name] === wrapped) vue[name] = original;
    };
  }

  function hookVue(vue: unknown): void {
    if (!isRecord(vue) || stopped) return;
    if (readMarker(vue["reactive"]) !== undefined) return;

    const restores: Array<() => void> = [];

    const restoreReactive = wrap(vue, "reactive", (original) => {
      return function reactive(this: unknown, ...args: unknown[]): unknown {
        const proxy = Reflect.apply(original, this, args);
        try {
          if (!stopped && isRootCandidate(args[0])) recordRoot(args[0], proxy);
        } catch (error) {
          reportError("reactive", String(error));
        }
        return proxy;
      };
    });
    if (restoreReactive !== undefined) restores.push(restoreReactive);

    const restoreToRaw = wrap(vue, "toRaw", (original) => {
      return function toRaw(this: unknown, ...args: unknown[]): unknown {
        const raw = Reflect.apply(original, this, args);
        try {
          if (!stopped && isRootCandidate(args[0])) {
            recordSuppression(args[0], raw);
          }
        } catch (error) {
          reportError("toRaw", String(error));
        }
        return raw;
      };
    });
    if (restoreToRaw !== undefined) restores.push(restoreToRaw);

    const restoreCreateApp = wrap(vue, "createApp", (original) => {
      return function createApp(this: unknown, ...args: unknown[]): unknown {
        try {
          if (!stopped) recordApp(args[0]);
        } catch (error) {
          reportError("createApp", String(error));
        }
        // Recording happens either way: the selector and the game-owned closures come from the
        // options, so a control discovered inside a suppressed scope is as callable as any other.
        if (suppressionScopes.length === 0 || stopped || mountingEnabled > 0) {
          return Reflect.apply(original, this, args);
        }
        const selector = readProperty(args[0], "el");
        let wanted = false;
        if (typeof selector === "string") {
          for (const scope of suppressionScopes) {
            try {
              scope.onComponentBound?.(selector);
            } catch (error) {
              reportError("component-bound", String(error));
            }
            try {
              if (scope.shouldMount?.(selector) === true) wanted = true;
            } catch (error) {
              reportError("should-mount", String(error));
            }
          }
        }
        if (!wanted) return createDisposableApp();
        // Built for real because the draw needs what it renders. It is remembered so the scope
        // that asked for it can take it down again: an app left mounted on a discarded node keeps
        // its reactive effects alive and re-renders on every later change to what it watched.
        const app = Reflect.apply(original, this, args);
        mountedInScope.push({ depth: suppressionScopes.length, app });
        return app;
      };
    });
    if (restoreCreateApp !== undefined) {
      restores.push(restoreCreateApp);
      createAppHooked = true;
    }

    restoreVue = () => {
      for (const restore of restores) restore();
    };
  }

  const existingVue = readProperty(pageWindow, "Vue");
  if (isRecord(existingVue)) {
    hookVue(existingVue);
  } else {
    // Document-start: claim the name before the page's Vue script assigns it, then hand the name
    // back as an ordinary data property so nothing else observes an accessor.
    let pending: unknown = existingVue;
    let accessorInstalled = true;
    const readPending = () => pending;
    Reflect.set(readPending, CAPTURE_MARKER, marker);
    try {
      Object.defineProperty(pageWindow, "Vue", {
        configurable: true,
        enumerable: true,
        get: readPending,
        set: (value: unknown) => {
          pending = value;
          try {
            hookVue(value);
          } catch (error) {
            reportError("hook", String(error));
          }
          if (accessorInstalled) {
            accessorInstalled = false;
            Object.defineProperty(pageWindow, "Vue", {
              configurable: true,
              enumerable: true,
              writable: true,
              value,
            });
          }
        },
      });
    } catch (error) {
      accessorInstalled = false;
      reportError("define-vue", String(error));
    }
  }

  const rootState: GameRootStateSource = Object.freeze({
    readRoot: () => root,
    isReactivitySuppressed: () => suppressed,
    subscribeRootReplaced: (listener: () => void) => {
      rootListeners.add(listener);
      return () => {
        rootListeners.delete(listener);
      };
    },
  });

  const registry: GameControlRegistry = Object.freeze({
    checkpoint(): ControlCaptureCheckpoint {
      const controlCheckpoint = Object.freeze({}) as ControlCaptureCheckpoint;
      controlCheckpoints.set(
        controlCheckpoint,
        new Map([...controls].map(([id, control]) => [id, control.generation])),
      );
      return controlCheckpoint;
    },
    rejectChanges(
      checkpoint: ControlCaptureCheckpoint,
      through?: ControlCaptureCheckpoint,
    ): void {
      const checkpointGenerations = controlCheckpoints.get(checkpoint);
      const throughGenerations =
        through === undefined ? undefined : controlCheckpoints.get(through);
      if (
        checkpointGenerations === undefined ||
        (through !== undefined && throughGenerations === undefined)
      )
        throw new Error("control checkpoint belongs to another capture");
      for (const [id, control] of controls) {
        if (
          checkpointGenerations.get(id) !== control.generation &&
          (throughGenerations === undefined ||
            throughGenerations.get(id) === control.generation)
        ) {
          control.rejectedGeneration = control.generation;
        }
      }
    },
    resolve(elementId: string): GameControlHandle | undefined {
      const control = controls.get(elementId);
      return control === undefined ||
        control.rejectedGeneration === control.generation
        ? undefined
        : handleFor(control);
    },
    invoke(
      handle: GameControlHandle,
      method: string,
      args: readonly unknown[] = [],
    ): GameControlResult {
      return invokeControl(handle, method, args, undefined);
    },
    capturedElementIds: () => Object.freeze([...captureOrder]),
  });

  const controlUsage: GameControlUsageReader = Object.freeze({
    readUsage: () => Object.freeze([...usage.values()]),
  });

  /**
   * The capture-layer-only path to a method the registry cannot call. It resolves the current build
   * of the control itself, so a caller can never hold a handle across a rebuild, and the receiver
   * extras exist for that one call only.
   */
  const synthesis: GameControlSynthesis = Object.freeze({
    get available(): boolean {
      return !stopped;
    },
    invoke(request: Readonly<GameControlSynthesisRequest>): GameControlResult {
      const control = controls.get(request.elementId);
      if (control === undefined) {
        return { ok: false, reason: "unknown-control" };
      }
      return invokeControl(
        handleFor(control),
        request.method,
        request.args ?? [],
        request.receiver,
      );
    },
  });

  const mountSuppression: GameMountSuppression = Object.freeze({
    get available(): boolean {
      return createAppHooked && !stopped;
    },
    withoutMounting<T>(
      draw: () => T,
      scope: Readonly<MountSuppressionScope> = {},
    ): T {
      if (!createAppHooked || stopped) {
        throw new Error(
          "Vue.createApp is not wrapped, so mounting cannot be suppressed",
        );
      }
      suppressionScopes.push(scope);
      const depth = suppressionScopes.length;
      try {
        return draw();
      } finally {
        suppressionScopes.pop();
        // Whatever this scope let through goes down with it, innermost first.
        while (
          mountedInScope.length > 0 &&
          (mountedInScope[mountedInScope.length - 1]?.depth ?? 0) >= depth
        ) {
          const entry = mountedInScope.pop();
          const unmount = asFunction(readProperty(entry?.app, "unmount"));
          if (unmount === undefined) continue;
          try {
            Reflect.apply(unmount, entry?.app, []);
          } catch (error) {
            reportError("scope-unmount", String(error));
          }
        }
      }
    },
    withMountingEnabled<T>(draw: () => T): T {
      if (!createAppHooked || stopped) {
        throw new Error(
          "Vue.createApp is not wrapped, so mounting cannot be re-enabled",
        );
      }
      mountingEnabled += 1;
      try {
        return draw();
      } finally {
        mountingEnabled -= 1;
      }
    },
  });

  const capture: VueCapture = Object.freeze({
    installed: true,
    rootState,
    controls: registry,
    controlUsage,
    mountSuppression,
    synthesis,
    observeBindings(listener: VueBindingListener) {
      bindingListeners.add(listener);
      return () => {
        bindingListeners.delete(listener);
      };
    },
    uninstall() {
      stopped = true;
      marker.capture = undefined;
      rootListeners.clear();
      bindingListeners.clear();
      restoreVue?.();
      restoreVue = undefined;
    },
  });
  marker.capture = capture;
  return capture;
}
