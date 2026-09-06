/**
 * Observes completed game periods from the game's own worker.
 *
 * `main.js` creates `new Worker("evolve/evolve.js")` and runs `execGameLoops(data.periods)`
 * synchronously inside its `message` listener. Wrapping that listener — original first, notify
 * after it returns — puts the signal after the game's mutations and on the game's own cadence,
 * with no wall-clock timer of ours.
 *
 * The `Worker` constructor is replaced only until the game's worker exists, then restored inside
 * the same construct call: every later worker the page or the script creates is untouched. The
 * game reuses that one worker for the life of the document — pause and unpause post `clear` and
 * `start` to it rather than building a new one — so one capture covers the whole session.
 */

import type {
  CompletedGamePeriod,
  GamePeriodSource,
} from "../../ports/game-period-source.ts";
import { isRecord, readProperty } from "../validation.ts";

type AnyFunction = (this: unknown, ...args: unknown[]) => unknown;
type WorkerConstructor = new (...args: unknown[]) => object;

const DEFAULT_WORKER_PATTERN = /evolve\/evolve\.js(\?|$)/;

export interface WorkerCapture {
  readonly periods: GamePeriodSource;
  /** True once the game's worker has been constructed and its listener wrapped. */
  isCaptured(): boolean;
  /** True while the `Worker` constructor is still replaced. */
  isConstructorWrapped(): boolean;
  /** Stops notifying and restores the constructor if it is still wrapped. Idempotent. */
  uninstall(): void;
}

export interface WorkerCaptureOptions {
  readonly workerUrlPattern?: RegExp;
  readonly onCaptureError?: (stage: string, detail: string) => void;
}

function asFunction(value: unknown): AnyFunction | undefined {
  return typeof value === "function" ? (value as AnyFunction) : undefined;
}

function readPeriods(event: unknown): CompletedGamePeriod | undefined {
  const data = readProperty(event, "data");
  if (!isRecord(data)) return undefined;
  if (data["loop"] !== "main") return undefined;
  const periods = data["periods"];
  return {
    periods: typeof periods === "number" && periods > 0 ? periods : 1,
  };
}

export function installWorkerCapture(
  pageWindow: unknown,
  options: WorkerCaptureOptions = {},
): WorkerCapture {
  const listeners = new Set<(period: CompletedGamePeriod) => void>();
  const periods: GamePeriodSource = Object.freeze({
    subscribe(listener: (period: CompletedGamePeriod) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  });

  if (!isRecord(pageWindow)) {
    return Object.freeze({
      periods,
      isCaptured: () => false,
      isConstructorWrapped: () => false,
      uninstall: () => {},
    });
  }

  // Narrowed once so the closures below keep the record type.
  const target = pageWindow;
  const pattern = options.workerUrlPattern ?? DEFAULT_WORKER_PATTERN;
  const reportError = options.onCaptureError ?? (() => {});
  const original = target["Worker"];
  if (typeof original !== "function") {
    return Object.freeze({
      periods,
      isCaptured: () => false,
      isConstructorWrapped: () => false,
      uninstall: () => {},
    });
  }

  let stopped = false;
  let captured = false;
  let wrappedConstructor: unknown = undefined;

  function notify(event: unknown): void {
    if (stopped) return;
    const period = readPeriods(event);
    if (period === undefined) return;
    for (const listener of [...listeners]) {
      try {
        listener(period);
      } catch (error) {
        // A subscriber fault must never reach the game's own listener chain.
        reportError("period-listener", String(error));
      }
    }
  }

  function hookWorkerInstance(worker: unknown): void {
    if (!isRecord(worker)) return;
    const add = asFunction(readProperty(worker, "addEventListener"));
    const remove = asFunction(readProperty(worker, "removeEventListener"));
    if (add === undefined || remove === undefined) return;

    // Listener identity has to survive: the game may remove a listener it registered by reference.
    const wrappers = new WeakMap<AnyFunction, AnyFunction>();

    worker["addEventListener"] = function addEventListener(
      this: unknown,
      ...args: unknown[]
    ): unknown {
      const type = args[0];
      const listener = asFunction(args[1]);
      if (type !== "message" || listener === undefined) {
        return Reflect.apply(add, worker, args);
      }
      let wrapper = wrappers.get(listener);
      if (wrapper === undefined) {
        wrapper = function messageListener(
          this: unknown,
          ...listenerArgs: unknown[]
        ): unknown {
          // The game's own handler runs first and its exceptions propagate unchanged; a period
          // that threw is not a completed period.
          const result = Reflect.apply(listener, this, listenerArgs);
          notify(listenerArgs[0]);
          return result;
        };
        wrappers.set(listener, wrapper);
      }
      return Reflect.apply(add, worker, [type, wrapper, ...args.slice(2)]);
    };

    worker["removeEventListener"] = function removeEventListener(
      this: unknown,
      ...args: unknown[]
    ): unknown {
      const listener = asFunction(args[1]);
      const wrapper =
        listener === undefined ? undefined : wrappers.get(listener);
      if (wrapper === undefined) return Reflect.apply(remove, worker, args);
      return Reflect.apply(remove, worker, [
        args[0],
        wrapper,
        ...args.slice(2),
      ]);
    };

    captured = true;
  }

  function restoreConstructor(): void {
    if (wrappedConstructor === undefined) return;
    if (target["Worker"] === wrappedConstructor) {
      target["Worker"] = original;
    }
    wrappedConstructor = undefined;
  }

  const proxy = new Proxy(original as unknown as WorkerConstructor, {
    construct(workerConstructor, args, newTarget) {
      const worker = Reflect.construct(workerConstructor, args, newTarget);
      try {
        if (!stopped && pattern.test(String(args[0]))) {
          hookWorkerInstance(worker);
          restoreConstructor();
        }
      } catch (error) {
        reportError("construct", String(error));
      }
      return worker;
    },
  });
  wrappedConstructor = proxy;
  target["Worker"] = proxy;

  return Object.freeze({
    periods,
    isCaptured: () => captured,
    isConstructorWrapped: () => wrappedConstructor !== undefined,
    uninstall() {
      stopped = true;
      listeners.clear();
      restoreConstructor();
    },
  });
}
