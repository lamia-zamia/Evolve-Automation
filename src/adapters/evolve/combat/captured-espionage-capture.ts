/**
 * The game's own espionage operations, captured without a Buefy modal.
 *
 * DeadSpace offers espionage only inside one. `foreign.trigModal(gov)` asks Buefy to open a modal
 * whose content is `<div id="modalBox">`, then polls every 50 ms for that box before calling the
 * module-private `drawEspModal(gov)` — which appends `<div id="espModal">` to it and binds
 * `influence`, `sabotage`, `incite`, `annex` and `purchase` as the Vue methods of that component.
 * `drawEspModal` is private to the civics module, so `trigModal` is the only route to those methods.
 *
 * This calls it with the smallest receiver that lets the draw run without a modal:
 *
 * - `$buefy.modal.open` is a no-op, so Buefy builds no `.modal.is-active` and no
 *   `.modal-background`. Nothing is faked in its place;
 * - a hidden `#modalBox` capture host stands in for the markup the real modal's content string
 *   would have produced, and is removed before this returns;
 * - the page's `setInterval`/`clearInterval` are replaced for the one call so the game's own poll
 *   callback runs synchronously, and are restored before this returns — no timer hook is left
 *   installed, and a callback that throws cannot prevent the restore;
 * - mounting stays suppressed, so the capture's `Vue.createApp` interception records the operation
 *   methods from the binding options and the component is never rendered.
 *
 * `drawEspModal(gov)` closes over `gov`, and `annex()` reads `global.civic.foreign['gov' + gov]`
 * from that closure while accepting a separate requested government, so a control captured for one
 * government is not correct for another. Each capture re-enters the game and is not kept: the
 * returned handle's `data` is the government object the game bound, which is what a caller compares
 * to prove the scope.
 *
 * That per-government check is not enough on its own, and neither is the generation check the caller
 * makes afterwards: a recapture of the *same* government leaves the previous `espModal` control in
 * the registry with a current generation and a matching `data`, so a failure that never reached
 * `vBind` would hand back a perfectly plausible handle whose closure is from an earlier draw. A
 * capture therefore succeeds only when this invocation demonstrably rebound the control: the
 * generation before the call is read, the invocation must report success, and the resolved control
 * must carry every operation method *and* a generation produced after it. Nothing is deleted to make
 * that work — an old control stays a correct answer for the government it was drawn for.
 */
import type { CapturedEspionageOperationCapture } from "../../../ports/captured-espionage.ts";
import type {
  GameControlHandle,
  GameControlRegistry,
} from "../../../ports/game-control-registry.ts";
import type { GameControlSynthesis } from "../../../ports/game-control-synthesis.ts";
import type { GameMountSuppression } from "../../../ports/game-mount-suppression.ts";
import { isRecord, readProperty } from "../../validation.ts";
import {
  CAPTURED_FOREIGN_CONTROL,
  CAPTURED_FOREIGN_ESPIONAGE_TRIGGER_METHOD,
} from "./captured-foreign-state.ts";

type AnyFunction = (this: unknown, ...args: unknown[]) => unknown;

/** The element `drawEspModal(gov)` binds its operations to. */
const ESPIONAGE_OPERATION_CONTROL = "espModal";
const ESPIONAGE_OPERATION_METHODS = [
  "influence",
  "sabotage",
  "incite",
  "annex",
  "purchase",
] as const;
/** The host `drawEspModal(gov)` appends to, named by the modal content it normally lives in. */
const ESPIONAGE_CAPTURE_HOST_ID = "modalBox";
/** Buefy's marker for a modal the player can currently see. */
const ESPIONAGE_ACTIVE_MODAL_SELECTOR = ".modal.is-active";
const ESPIONAGE_SYNTHETIC_OPEN_METHODS = ["$buefy.modal.open"] as const;

export interface CapturedEspionageOperationCaptureDependencies {
  readonly controls: GameControlRegistry;
  /** Absent on a capture fixture with no Vue hook; the capture then fails closed. */
  readonly synthesis: GameControlSynthesis | undefined;
  readonly mountSuppression: GameMountSuppression;
  readonly getDocument: () => unknown;
  /** The page's global object, whose timer functions the game's poll resolves through. */
  readonly getPageWindow: () => unknown;
  /** Reports a fault in the capture itself, never a game fault. */
  readonly onCaptureError?: (detail: string) => void;
}

function espionageOperationControl(
  controls: GameControlRegistry,
  minimumGeneration: number,
): GameControlHandle | undefined {
  const control = controls.resolve(ESPIONAGE_OPERATION_CONTROL);
  return control !== undefined &&
    control.generation > minimumGeneration &&
    ESPIONAGE_OPERATION_METHODS.every((method) =>
      control.methods.includes(method),
    )
    ? control
    : undefined;
}

/**
 * The generation the operation control holds right now, and `0` when the registry has never seen
 * one. `vue-capture` starts a control at generation 1 and increments it on every rebind, so this is
 * the whole freshness question: did *this* invocation bind, or is the caller looking at a control an
 * earlier invocation left behind?
 */
function espionageOperationGeneration(controls: GameControlRegistry): number {
  return controls.resolve(ESPIONAGE_OPERATION_CONTROL)?.generation ?? 0;
}

function espionageActiveModals(
  document: unknown,
): readonly unknown[] | undefined {
  const querySelectorAll = readProperty(document, "querySelectorAll");
  if (typeof querySelectorAll !== "function") return undefined;
  let result: unknown;
  try {
    result = Reflect.apply(querySelectorAll, document, [
      ESPIONAGE_ACTIVE_MODAL_SELECTOR,
    ]);
  } catch {
    return undefined;
  }
  const length = readProperty(result, "length");
  if (
    typeof length !== "number" ||
    !Number.isSafeInteger(length) ||
    length < 0
  ) {
    return undefined;
  }
  return Object.freeze(
    Array.from({ length }, (_, index) =>
      readProperty(result, String(index)),
    ).filter((modal) => modal !== undefined && modal !== null),
  );
}

interface EspionageCaptureHost {
  readonly parent: unknown;
  readonly element: unknown;
}

/**
 * The hidden `#modalBox` the game's poll and draw will find. Refused when one already exists: a real
 * modal owns that id then, and a capture must never displace or reuse the player's markup.
 */
function espionageCaptureHost(
  document: unknown,
): EspionageCaptureHost | undefined {
  if (!isRecord(document)) return undefined;
  const querySelector = readProperty(document, "querySelector");
  if (typeof querySelector === "function") {
    try {
      if (
        Reflect.apply(querySelector, document, [
          `#${ESPIONAGE_CAPTURE_HOST_ID}`,
        ]) != null
      ) {
        return undefined;
      }
    } catch {
      return undefined;
    }
  }
  const createElement = readProperty(document, "createElement");
  if (typeof createElement !== "function") return undefined;
  const parent =
    readProperty(document, "body") ?? readProperty(document, "documentElement");
  const appendChild = readProperty(parent, "appendChild");
  if (typeof appendChild !== "function") return undefined;
  const element = Reflect.apply(createElement, document, ["div"]);
  if (!isRecord(element)) return undefined;
  Reflect.set(element, "id", ESPIONAGE_CAPTURE_HOST_ID);
  const style = readProperty(element, "style");
  if (isRecord(style)) Reflect.set(style, "display", "none");
  Reflect.apply(appendChild, parent, [element]);
  return { parent, element };
}

function removeEspionageCaptureHost(host: EspionageCaptureHost): void {
  const removeChild = readProperty(host.parent, "removeChild");
  try {
    if (typeof removeChild === "function") {
      Reflect.apply(removeChild, host.parent, [host.element]);
      return;
    }
    const remove = readProperty(host.element, "remove");
    if (typeof remove === "function") Reflect.apply(remove, host.element, []);
  } catch {
    // The page already took the host, or refused to; nothing here may escape.
  }
}

/**
 * Runs `trigModal`'s own poll callback against the capture host instead of waiting 50 ms for it.
 *
 * The callbacks are flushed after `trigModal` returns rather than at registration, because
 * upstream closes each interval handle over the very expression that registers it — `var
 * checkExist` in the poll, `const attach` in the close button — and a callback that ran during the
 * registration would read its own handle before it is assigned.
 *
 * The replacement only claims a callback it can run; anything else — a nested interval, a
 * non-callable handler, a `clearInterval` for a timer this did not create — is the page's own
 * timer, so the game's real behavior is what still answers it. The page's functions are put back
 * before this returns, and a callback that throws cannot prevent that.
 */
function espionageFlushedTimers(
  pageWindow: unknown,
  reportError: (detail: string) => void,
  run: () => void,
): void {
  if (!isRecord(pageWindow)) {
    run();
    return;
  }
  const originalSetInterval = readProperty(pageWindow, "setInterval");
  if (typeof originalSetInterval !== "function") {
    run();
    return;
  }
  const originalClearInterval = readProperty(pageWindow, "clearInterval");
  const immediateHandles = new Set<unknown>();
  const queued: Array<{
    readonly callback: AnyFunction;
    readonly self: unknown;
    readonly args: readonly unknown[];
  }> = [];
  let flushing = false;
  const immediateSetInterval = function (
    this: unknown,
    ...args: unknown[]
  ): unknown {
    const [callback, ...rest] = args;
    if (flushing || typeof callback !== "function") {
      return Reflect.apply(originalSetInterval, this, args);
    }
    const handle = Object.freeze({ espionageCaptureTimer: true });
    immediateHandles.add(handle);
    // The cast is confined to this edge, after the callable check above.
    queued.push({ callback: callback as AnyFunction, self: this, args: rest });
    return handle;
  };
  const immediateClearInterval = function (
    this: unknown,
    ...args: unknown[]
  ): void {
    if (immediateHandles.delete(args[0])) return;
    if (typeof originalClearInterval === "function") {
      Reflect.apply(originalClearInterval, this, args);
    }
  };
  Reflect.set(pageWindow, "setInterval", immediateSetInterval);
  Reflect.set(pageWindow, "clearInterval", immediateClearInterval);
  try {
    run();
    flushing = true;
    // Bounded: a callback that keeps registering work cannot hold the cycle open.
    for (let round = 0; queued.length > 0 && round < 16; round += 1) {
      const next = queued.shift();
      if (next === undefined) break;
      try {
        Reflect.apply(next.callback, next.self, next.args);
      } catch (error) {
        reportError(`timer callback threw: ${String(error)}`);
      }
    }
  } finally {
    flushing = false;
    // Restored only if nothing replaced them meanwhile, so a page that re-hooked the timers keeps
    // its own hook.
    if (readProperty(pageWindow, "setInterval") === immediateSetInterval) {
      Reflect.set(pageWindow, "setInterval", originalSetInterval);
    }
    if (readProperty(pageWindow, "clearInterval") === immediateClearInterval) {
      Reflect.set(pageWindow, "clearInterval", originalClearInterval);
    }
  }
}

export function createCapturedEspionageOperationCapture(
  dependencies: CapturedEspionageOperationCaptureDependencies,
): CapturedEspionageOperationCapture {
  const reportError = dependencies.onCaptureError ?? (() => {});
  let capturing = false;

  return Object.freeze({
    blockedByPlayerModal(): boolean {
      const active = espionageActiveModals(dependencies.getDocument());
      return active !== undefined && active.length > 0;
    },
    capture(governmentId: number): GameControlHandle | undefined {
      const synthesis = dependencies.synthesis;
      if (
        capturing ||
        synthesis === undefined ||
        !synthesis.available ||
        !dependencies.mountSuppression.available
      ) {
        return undefined;
      }
      capturing = true;
      try {
        // Read before the invocation, never cleared: a control that survives in the registry from an
        // earlier capture is still a valid handle to *its* government, so the only honest test of
        // this capture is whether the invocation itself rebound it. For the same government the
        // stale control's `data` still matches and its generation is still current, so the
        // executor's own scope check cannot tell the two apart.
        const generationBefore = espionageOperationGeneration(
          dependencies.controls,
        );
        let invoked = false;
        const document = dependencies.getDocument();
        const host = espionageCaptureHost(document);
        if (host === undefined) return undefined;
        try {
          dependencies.mountSuppression.withoutMounting(() => {
            espionageFlushedTimers(
              dependencies.getPageWindow(),
              reportError,
              () => {
                const result = synthesis.invoke({
                  elementId: CAPTURED_FOREIGN_CONTROL,
                  method: CAPTURED_FOREIGN_ESPIONAGE_TRIGGER_METHOD,
                  args: [governmentId],
                  receiver: {
                    noOpMethods: ESPIONAGE_SYNTHETIC_OPEN_METHODS,
                  },
                });
                invoked = result.ok;
                if (!result.ok) {
                  reportError(
                    `${CAPTURED_FOREIGN_ESPIONAGE_TRIGGER_METHOD} failed: ${result.reason} ${result.detail ?? ""}`,
                  );
                }
              },
            );
          });
        } finally {
          removeEspionageCaptureHost(host);
        }
        // A refused or failed invocation captured nothing, whatever the registry happens to hold.
        // This also covers the game's poll callback throwing before `drawEspModal` binds: the
        // reported failure and the freshness check are independent, and either one refuses.
        if (!invoked) {
          reportError(
            `the ${CAPTURED_FOREIGN_ESPIONAGE_TRIGGER_METHOD} invocation did not complete`,
          );
          return undefined;
        }
        const control = espionageOperationControl(
          dependencies.controls,
          generationBefore,
        );
        if (control === undefined) {
          reportError(
            dependencies.controls.resolve(ESPIONAGE_OPERATION_CONTROL) ===
              undefined
              ? `no ${ESPIONAGE_OPERATION_CONTROL} operations captured`
              : `${ESPIONAGE_OPERATION_CONTROL} was not rebound by this capture`,
          );
        }
        return control;
      } catch (error) {
        reportError(String(error));
        return undefined;
      } finally {
        capturing = false;
      }
    },
  });
}
