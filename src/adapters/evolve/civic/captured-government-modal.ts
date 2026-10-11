/** Owns the native Government modal until the game's asynchronous `setGov` binding is ready. */

import type { GameControlRegistry } from "../../../ports/game-control-registry.ts";
import type { GameMountSuppression } from "../../../ports/game-mount-suppression.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";
import type { GameTabDiscovery } from "../../../ports/game-tab-discovery.ts";
import type { GovernmentModalControl } from "../../../ports/government-modal-control.ts";
import type { CommandExecutionOutcome } from "../../../domain/commands.ts";
import { stale, SUCCEEDED } from "../../command-outcomes.ts";
import { isRecord, readProperty } from "../../validation.ts";
import {
  GOVERNMENT_CONTROL,
  GOVERNMENT_MODAL_CONTROL,
} from "./captured-government.ts";
import {
  GOVERNMENT_MODAL_BOX_ID,
  GOVERNMENT_MODAL_BOX_SELECTOR,
  GOVERNMENT_MODAL_CONTAINER_SELECTOR,
  GOVERNMENT_MODAL_SELECTOR,
  governmentModalDraw,
} from "./government-panel-draw.ts";

interface GovernmentModalElement {
  readonly __vue_proxy__?: unknown;
  readonly isConnected?: boolean;
  querySelector(selector: string): GovernmentModalElement | null;
  closest(selector: string): GovernmentModalElement | null;
  click(): void;
}

interface GovernmentModalDocument {
  getElementById(id: string): GovernmentModalElement | null;
  querySelector(selector: string): GovernmentModalElement | null;
}

interface PendingGovernmentModal {
  readonly root: unknown;
  readonly government: string;
  readonly startingGeneration: number;
  wrapper: GovernmentModalElement | null;
  canceled: boolean;
  creationChecks: number;
}

function governmentDocument(
  value: unknown,
): GovernmentModalDocument | undefined {
  return isRecord(value) &&
    typeof value.getElementById === "function" &&
    typeof value.querySelector === "function"
    ? (value as unknown as GovernmentModalDocument)
    : undefined;
}

function visibleModal(
  document: GovernmentModalDocument,
): GovernmentModalElement | null {
  return document.querySelector(GOVERNMENT_MODAL_SELECTOR);
}

function modalBoxFor(
  document: GovernmentModalDocument,
  wrapper: GovernmentModalElement | null,
): GovernmentModalElement | null {
  return (
    wrapper?.querySelector(GOVERNMENT_MODAL_BOX_SELECTOR) ??
    document.getElementById(GOVERNMENT_MODAL_BOX_ID)
  );
}

function closeOwnedModal(
  document: GovernmentModalDocument,
  pending: PendingGovernmentModal,
): boolean {
  const box = modalBoxFor(document, pending.wrapper);
  const wrapper = pending.wrapper ?? box?.closest(GOVERNMENT_MODAL_SELECTOR);
  const background = wrapper?.querySelector(".modal-background");
  if (background === null || background === undefined) return false;
  try {
    background.click();
    return true;
  } catch {
    return false;
  }
}

/** The Game's `vBind` stores its real Vue public proxy on the mount element. */
function mountedGovernmentProxy(
  document: GovernmentModalDocument,
  requireConnected = true,
):
  | {
      readonly proxy: object;
      readonly trigger: (...args: unknown[]) => unknown;
    }
  | undefined {
  const element = document.getElementById(GOVERNMENT_CONTROL);
  if (
    element === null ||
    (requireConnected && readProperty(element, "isConnected") !== true)
  )
    return undefined;
  const proxy = readProperty(element, "__vue_proxy__");
  const trigger = readProperty(proxy, "trigModal");
  return isRecord(proxy) && typeof trigger === "function"
    ? {
        proxy,
        trigger: trigger as (...args: unknown[]) => unknown,
      }
    : undefined;
}

export function createCapturedGovernmentModalControl(dependencies: {
  readonly controls: GameControlRegistry;
  readonly rootState: GameRootStateSource;
  readonly discovery: GameTabDiscovery;
  readonly mountSuppression: GameMountSuppression;
  readonly getDocument: () => unknown;
}): GovernmentModalControl {
  let pending: PendingGovernmentModal | null = null;
  let blockedRoot: unknown;
  let disposed = false;

  const failAndClose = (
    document: GovernmentModalDocument,
    active: PendingGovernmentModal,
    code: string,
    message: string,
  ) => {
    closeOwnedModal(document, active);
    pending = null;
    blockedRoot = active.root;
    return stale(code, message);
  };

  const openNativeModal = (
    government: string,
    root: unknown,
    document: GovernmentModalDocument,
  ): PendingGovernmentModal | CommandExecutionOutcome => {
    const startingGeneration =
      dependencies.controls.resolve(GOVERNMENT_MODAL_CONTROL)?.generation ?? 0;
    const currentProxy = mountedGovernmentProxy(document);
    if (currentProxy !== undefined) {
      try {
        if (dependencies.mountSuppression.available) {
          dependencies.mountSuppression.withMountingEnabled(() => {
            Reflect.apply(currentProxy.trigger, currentProxy.proxy, []);
          });
        } else {
          Reflect.apply(currentProxy.trigger, currentProxy.proxy, []);
        }
      } catch (error) {
        return stale(
          "government-modal-open-failed",
          `native Government modal opener failed: ${String(error)}`,
        );
      }
      return {
        root,
        government,
        startingGeneration,
        wrapper: visibleModal(document),
        canceled: false,
        creationChecks: 0,
      };
    }
    if (!dependencies.mountSuppression.available) {
      return stale(
        "government-modal-mount-unavailable",
        "native Government modal requires protected Vue mounting",
      );
    }
    const draw = governmentModalDraw(dependencies.controls);
    if (draw === undefined) {
      return stale(
        "government-controls-unavailable",
        "Government tab controls are not captured",
      );
    }
    let triggerFailure: string | undefined;
    const result = dependencies.discovery.discover(draw.path, {
      ...draw.options,
      whileDrawn: () => {
        if (dependencies.rootState.readRoot() !== root) {
          triggerFailure = "game root changed while drawing Government";
          return false;
        }
        const control = dependencies.controls.resolve(GOVERNMENT_CONTROL);
        if (control?.methods.includes("trigModal") !== true) {
          triggerFailure = "native Government trigger was not captured";
          return false;
        }
        const mounted = mountedGovernmentProxy(document, false);
        if (mounted === undefined) {
          triggerFailure = "mounted Government Vue receiver is unavailable";
          return false;
        }
        try {
          dependencies.mountSuppression.withMountingEnabled(() => {
            Reflect.apply(mounted.trigger, mounted.proxy, []);
          });
          return true;
        } catch (error) {
          triggerFailure = `native Government modal opener failed: ${String(error)}`;
          return false;
        }
      },
    });
    if (dependencies.rootState.readRoot() !== root) {
      blockedRoot = root;
      const abandoned: PendingGovernmentModal = {
        root,
        government,
        startingGeneration,
        wrapper: visibleModal(document),
        canceled: true,
        creationChecks: 0,
      };
      closeOwnedModal(document, abandoned);
      return stale(
        "government-root-changed",
        "game root changed while opening the native Government modal",
      );
    }
    if (triggerFailure !== undefined) {
      return stale("government-modal-open-failed", triggerFailure);
    }
    if (result.outcome.status !== "succeeded") return result.outcome;
    return {
      root,
      government,
      startingGeneration,
      wrapper: visibleModal(document),
      canceled: false,
      creationChecks: 0,
    };
  };

  return Object.freeze({
    apply(government: string, sampledRoot: unknown) {
      if (disposed) {
        return stale(
          "government-modal-disposed",
          "Government modal control is stopped",
        );
      }
      if (dependencies.rootState.readRoot() !== sampledRoot) {
        return stale(
          "government-root-changed",
          "game root changed after sampling",
        );
      }
      if (pending !== null) {
        if (pending.root !== sampledRoot || pending.government !== government) {
          pending.canceled = true;
        }
        if (pending.canceled) {
          const canceledRoot = pending.root;
          const document = governmentDocument(dependencies.getDocument());
          if (document !== undefined) closeOwnedModal(document, pending);
          pending = null;
          blockedRoot = canceledRoot;
          return stale(
            "government-modal-canceled",
            "pending native Government modal no longer matches the sampled request",
          );
        }
      }

      const document = governmentDocument(dependencies.getDocument());
      if (document === undefined) {
        return stale(
          "government-modal-document-unavailable",
          "page document is unavailable",
        );
      }
      if (pending === null) {
        if (blockedRoot === sampledRoot) {
          return stale(
            "government-modal-retry-suppressed",
            "native Government modal previously failed for this game root",
          );
        }
        if (visibleModal(document) !== null) {
          return stale(
            "government-modal-already-open",
            "a player-visible modal is already open",
          );
        }
        const opened = openNativeModal(government, sampledRoot, document);
        if ("status" in opened) {
          blockedRoot = sampledRoot;
          return opened;
        }
        pending = { ...opened, government };
        return SUCCEEDED;
      }

      const active = pending;
      const currentWrapper = visibleModal(document);
      if (active.wrapper === null && currentWrapper !== null) {
        active.wrapper = currentWrapper;
      }
      if (currentWrapper !== null && active.wrapper !== currentWrapper) {
        return failAndClose(
          document,
          active,
          "government-modal-replaced",
          "another modal replaced the automation-owned Government modal",
        );
      }
      const box = modalBoxFor(document, active.wrapper);
      if (box === null) {
        active.creationChecks += 1;
        if (active.creationChecks < 3) return SUCCEEDED;
        return failAndClose(
          document,
          active,
          "government-modal-missing",
          "native Government modal content was not created",
        );
      }
      const modalElement = box.querySelector(
        GOVERNMENT_MODAL_CONTAINER_SELECTOR,
      );
      const modal = dependencies.controls.resolve(GOVERNMENT_MODAL_CONTROL);
      if (
        modalElement === null ||
        modal === undefined ||
        modal.generation <= active.startingGeneration
      ) {
        active.creationChecks += 1;
        if (active.creationChecks < 3) return SUCCEEDED;
        return failAndClose(
          document,
          active,
          "government-modal-binding-missing",
          "native Government modal did not produce a current setGov binding",
        );
      }
      if (dependencies.rootState.readRoot() !== active.root) {
        return failAndClose(
          document,
          active,
          "government-root-changed",
          "game root changed while the native Government modal was opening",
        );
      }
      if (!modal.methods.includes("setGov")) {
        return failAndClose(
          document,
          active,
          "government-modal-setter-missing",
          "native Government modal binding has no setGov method",
        );
      }
      const result = dependencies.controls.invoke(modal, "setGov", [
        government,
      ]);
      if (!result.ok) {
        return failAndClose(
          document,
          active,
          "government-modal-setter-failed",
          `native Government setGov failed: ${result.detail ?? result.reason}`,
        );
      }
      pending = null;
      if (dependencies.rootState.readRoot() !== active.root) {
        return stale(
          "government-root-changed",
          "game root changed while applying the native Government setter",
        );
      }
      const currentGovernment = readProperty(
        readProperty(readProperty(active.root, "civic"), "govern"),
        "type",
      );
      if (currentGovernment !== government) {
        closeOwnedModal(document, active);
        blockedRoot = active.root;
        return stale(
          "government-native-setter-noop",
          "native Government setGov returned without applying the requested government",
        );
      }
      return SUCCEEDED;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const document = governmentDocument(dependencies.getDocument());
      if (pending !== null && document !== undefined) {
        closeOwnedModal(document, pending);
      }
      pending = null;
    },
  });
}
