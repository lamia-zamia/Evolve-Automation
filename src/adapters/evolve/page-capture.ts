/**
 * Installs the page-world capture the independent runtime is built on: live game state, completed
 * game periods, and game-owned control methods, with neither Debug Mode nor Preload Tab Content.
 *
 * Must run before the page's own scripts (`@run-at document-start`) to win the race for
 * `window.Vue` and the game's worker. Installed later it still returns working ports, but the
 * initial root and the game's worker will already exist and go uncaptured — `isComplete()` says
 * which happened.
 */

import type { GameControlRegistry } from "../../ports/game-control-registry.ts";
import type { GameControlUsageReader } from "../../ports/game-control-usage.ts";
import type { GameMountSuppression } from "../../ports/game-mount-suppression.ts";
import type { GamePeriodSource } from "../../ports/game-period-source.ts";
import type { GameRootStateSource } from "../../ports/game-root-state.ts";
import { isRecord, readProperty } from "../validation.ts";
import { installVueCapture, type VueCaptureOptions } from "./vue-capture.ts";
import {
  installWorkerCapture,
  type WorkerCaptureOptions,
} from "./worker-capture.ts";

export interface PageCapture {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly controlUsage: GameControlUsageReader;
  readonly periods: GamePeriodSource;
  /** Scoped suppression of temporary component mounting, for a discovery draw. */
  readonly mountSuppression: GameMountSuppression;
  /** True once the root state has been captured and the game's worker listener is wrapped. */
  isComplete(): boolean;
  uninstall(): void;
}

export type PageCaptureOptions = VueCaptureOptions & WorkerCaptureOptions;

/**
 * Marks the page this capture is installed on, so a second copy of the script joins the live
 * capture instead of installing a second worker hook beside a shared Vue hook. It is a registered
 * symbol because the two copies do not share a module scope.
 */
export const PAGE_CAPTURE_MARKER = Symbol.for("evolve-automation.page-capture");

function readInstalledCapture(pageWindow: unknown): PageCapture | undefined {
  const existing = readProperty(pageWindow, PAGE_CAPTURE_MARKER);
  return isRecord(existing) && typeof existing["isComplete"] === "function"
    ? (existing as unknown as PageCapture)
    : undefined;
}

export function installPageCapture(
  pageWindow: unknown,
  options: PageCaptureOptions = {},
): PageCapture {
  const installed = readInstalledCapture(pageWindow);
  if (installed !== undefined) return installed;

  const vue = installVueCapture(pageWindow, options);
  const worker = installWorkerCapture(pageWindow, options);
  const capture: PageCapture = Object.freeze({
    rootState: vue.rootState,
    controls: vue.controls,
    controlUsage: vue.controlUsage,
    periods: worker.periods,
    mountSuppression: vue.mountSuppression,
    isComplete: () =>
      vue.rootState.readRoot() !== undefined && worker.isCaptured(),
    uninstall() {
      if (isRecord(pageWindow) && pageWindow[PAGE_CAPTURE_MARKER] === capture) {
        delete pageWindow[PAGE_CAPTURE_MARKER];
      }
      vue.uninstall();
      worker.uninstall();
    },
  });
  if (isRecord(pageWindow)) {
    Object.defineProperty(pageWindow, PAGE_CAPTURE_MARKER, {
      configurable: true,
      enumerable: false,
      writable: true,
      value: capture,
    });
  }
  return capture;
}
