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
  GOVERNMENT_MODAL_BOX_SELECTOR,
  GOVERNMENT_MODAL_CONTAINER_SELECTOR,
  GOVERNMENT_MODAL_SELECTOR,
  GOVERNMENT_MODAL_TITLE_SELECTOR,
  GOVERNMENT_MODAL_WRAPPER_SELECTOR,
  governmentModalDraw,
} from "./government-panel-draw.ts";

interface GovernmentModalElement {
  readonly __vue_proxy__?: unknown;
  readonly isConnected?: boolean;
  querySelector(selector: string): GovernmentModalElement | null;
  click(): void;
}

interface GovernmentModalDocument {
  getElementById(id: string): GovernmentModalElement | null;
  querySelectorAll(selector: string): ArrayLike<GovernmentModalElement>;
}

interface PendingGovernmentModal {
  readonly document: GovernmentModalDocument;
  readonly root: unknown;
  readonly government: string;
  readonly startingGeneration: number;
  nativeHandle: unknown;
  wrapper: GovernmentModalElement | null;
  observer: MutationObserver | null;
  canceled: boolean;
  ownershipFailed: boolean;
  cleanupScheduled: boolean;
  cleanupWaitChecks: number;
  creationChecks: number;
}

function governmentDocument(
  value: unknown,
): GovernmentModalDocument | undefined {
  return isRecord(value) &&
    typeof value.getElementById === "function" &&
    typeof value.querySelectorAll === "function"
    ? (value as unknown as GovernmentModalDocument)
    : undefined;
}

function activeModals(
  document: GovernmentModalDocument,
): readonly GovernmentModalElement[] {
  return Array.from(document.querySelectorAll(GOVERNMENT_MODAL_SELECTOR));
}

function modalWrappers(
  document: GovernmentModalDocument,
): readonly GovernmentModalElement[] {
  return Array.from(
    document.querySelectorAll(GOVERNMENT_MODAL_WRAPPER_SELECTOR),
  );
}

function modalBoxFor(
  wrapper: GovernmentModalElement,
): GovernmentModalElement | null {
  return wrapper.querySelector(GOVERNMENT_MODAL_BOX_SELECTOR);
}

function closeOwnedModal(pending: PendingGovernmentModal): boolean {
  const background = pending.wrapper?.querySelector(".modal-background");
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

/** Buefy's `ModalProgrammatic.open` returns the Vue instance for this exact modal. */
function invokeGovernmentTriggerWithHandle(
  active: PendingGovernmentModal,
  mounted: {
    readonly proxy: object;
    readonly trigger: (...args: unknown[]) => unknown;
  },
): void {
  const modalApi = readProperty(readProperty(mounted.proxy, "$buefy"), "modal");
  const open = readProperty(modalApi, "open");
  if (!isRecord(modalApi) || typeof open !== "function") {
    throw new Error("Buefy modal.open is unavailable for ownership capture");
  }
  const previousDescriptor = Object.getOwnPropertyDescriptor(modalApi, "open");
  let captured = false;
  const captureOpen = function (this: unknown, ...args: unknown[]): unknown {
    const handle = Reflect.apply(open, this, args);
    active.nativeHandle = handle;
    captured = true;
    return handle;
  };
  let installed = false;
  let restoreFailed = false;
  let triggerFailed = false;
  let triggerError: unknown;
  try {
    installed = Reflect.set(modalApi, "open", captureOpen, modalApi);
    if (!installed) {
      throw new Error("Buefy modal.open could not be wrapped safely");
    }
    Reflect.apply(mounted.trigger, mounted.proxy, []);
  } catch (error) {
    triggerFailed = true;
    triggerError = error;
  } finally {
    if (installed) {
      try {
        if (previousDescriptor === undefined) {
          restoreFailed = !Reflect.deleteProperty(modalApi, "open");
        } else {
          Object.defineProperty(modalApi, "open", previousDescriptor);
        }
      } catch {
        restoreFailed = true;
      }
    }
  }
  if (restoreFailed) {
    throw new Error("Buefy modal.open wrapper could not be restored");
  }
  if (triggerFailed) throw triggerError;
  if (!captured) {
    throw new Error("Government opener did not return its Buefy modal handle");
  }
}

function governmentModalWrapperFromHandle(
  active: PendingGovernmentModal,
): GovernmentModalElement | undefined {
  const element = readProperty(active.nativeHandle, "$el");
  const matches = readProperty(element, "matches");
  if (
    !isRecord(element) ||
    readProperty(element, "nodeType") !== 1 ||
    readProperty(element, "isConnected") !== true ||
    typeof matches !== "function"
  ) {
    return undefined;
  }
  try {
    return Reflect.apply(matches, element, [
      GOVERNMENT_MODAL_WRAPPER_SELECTOR,
    ]) === true
      ? (element as unknown as GovernmentModalElement)
      : undefined;
  } catch {
    return undefined;
  }
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

  const deferClose = (active: PendingGovernmentModal): void => {
    const wrapper = active.wrapper;
    if (wrapper === null || active.cleanupScheduled) return;
    active.cleanupScheduled = true;
    setTimeout(() => {
      active.cleanupScheduled = false;
      if (!modalWrappers(active.document).includes(wrapper)) return;
      if (wrapper.querySelector(GOVERNMENT_MODAL_TITLE_SELECTOR) === null) {
        active.cleanupWaitChecks += 1;
        if (active.cleanupWaitChecks >= 30) return;
        deferClose(active);
        return;
      }
      closeOwnedModal(active);
    }, 75);
  };

  const watchModalCreation = (
    document: GovernmentModalDocument,
    active: PendingGovernmentModal,
  ): void => {
    if (
      typeof MutationObserver !== "function" ||
      readProperty(document, "nodeType") !== 9
    ) {
      active.ownershipFailed = true;
      return;
    }
    const observer = new MutationObserver(() => {
      if (active.wrapper !== null || active.ownershipFailed) return;
      const wrapper = governmentModalWrapperFromHandle(active);
      if (wrapper === undefined) return;
      active.wrapper = wrapper;
      observer.disconnect();
      active.observer = null;
      if (active.canceled) {
        pending = null;
        deferClose(active);
      }
    });
    active.observer = observer;
    observer.observe(document as unknown as Node, {
      childList: true,
      subtree: true,
    });
    setTimeout(() => {
      if (active.observer !== observer) return;
      active.ownershipFailed = true;
      active.observer = null;
      observer.disconnect();
    }, 1000);
  };

  const failAndClose = (
    active: PendingGovernmentModal,
    code: string,
    message: string,
  ) => {
    pending = null;
    blockedRoot = active.root;
    deferClose(active);
    return stale(
      code,
      `${message}; the owned modal stays open until #modalBoxTitle proves the native poll has stopped (cleanup gives up after 30 checks)`,
    );
  };

  const openNativeModal = (
    government: string,
    root: unknown,
    document: GovernmentModalDocument,
  ): PendingGovernmentModal | CommandExecutionOutcome => {
    const startingGeneration =
      dependencies.controls.resolve(GOVERNMENT_MODAL_CONTROL)?.generation ?? 0;
    const opened: PendingGovernmentModal = {
      document,
      root,
      government,
      startingGeneration,
      nativeHandle: undefined,
      wrapper: null,
      observer: null,
      canceled: false,
      ownershipFailed: false,
      cleanupScheduled: false,
      cleanupWaitChecks: 0,
      creationChecks: 0,
    };
    const currentProxy = mountedGovernmentProxy(document);
    if (currentProxy !== undefined) {
      watchModalCreation(document, opened);
      try {
        if (dependencies.mountSuppression.available) {
          dependencies.mountSuppression.withMountingEnabled(() => {
            invokeGovernmentTriggerWithHandle(opened, currentProxy);
          });
        } else {
          invokeGovernmentTriggerWithHandle(opened, currentProxy);
        }
      } catch (error) {
        opened.wrapper = governmentModalWrapperFromHandle(opened) ?? null;
        opened.canceled = true;
        if (opened.wrapper !== null) {
          opened.ownershipFailed = false;
          opened.observer?.disconnect();
          opened.observer = null;
        }
        const closed = opened.wrapper !== null && closeOwnedModal(opened);
        return stale(
          "government-modal-open-failed",
          !closed
            ? `native Government modal opener failed: ${String(error)}; modal ownership and cleanup could not be established`
            : `native Government modal opener failed: ${String(error)}; its partially opened modal was closed`,
        );
      }
      opened.wrapper = governmentModalWrapperFromHandle(opened) ?? null;
      if (opened.wrapper !== null) {
        opened.ownershipFailed = false;
        opened.observer?.disconnect();
        opened.observer = null;
      }
      return opened;
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
    let openedModal: PendingGovernmentModal | undefined;
    let partialCleanupClosed = false;
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
          const activeModal: PendingGovernmentModal = {
            document,
            root,
            government,
            startingGeneration,
            nativeHandle: undefined,
            wrapper: null,
            observer: null,
            canceled: false,
            ownershipFailed: false,
            cleanupScheduled: false,
            cleanupWaitChecks: 0,
            creationChecks: 0,
          };
          openedModal = activeModal;
          watchModalCreation(document, activeModal);
          dependencies.mountSuppression.withMountingEnabled(() => {
            invokeGovernmentTriggerWithHandle(activeModal, mounted);
          });
          activeModal.wrapper =
            governmentModalWrapperFromHandle(activeModal) ?? null;
          if (activeModal.wrapper !== null) {
            activeModal.ownershipFailed = false;
            activeModal.observer?.disconnect();
            activeModal.observer = null;
          }
          return true;
        } catch (error) {
          if (openedModal !== undefined) {
            openedModal.wrapper =
              governmentModalWrapperFromHandle(openedModal) ?? null;
            openedModal.canceled = true;
            if (openedModal.wrapper !== null) {
              openedModal.observer?.disconnect();
              openedModal.observer = null;
              partialCleanupClosed = closeOwnedModal(openedModal);
            }
          }
          triggerFailure = `native Government modal opener failed: ${String(error)}`;
          return false;
        }
      },
    });
    if (dependencies.rootState.readRoot() !== root) {
      blockedRoot = root;
      if (openedModal !== undefined) {
        openedModal.canceled = true;
        if (openedModal.wrapper !== null) deferClose(openedModal);
      }
      return stale(
        "government-root-changed",
        openedModal?.wrapper === null
          ? "game root changed while opening the native Government modal; ownership is still being observed and cleanup cannot yet be established"
          : "game root changed while opening the native Government modal",
      );
    }
    if (triggerFailure !== undefined) {
      return stale(
        "government-modal-open-failed",
        partialCleanupClosed
          ? `${triggerFailure}; its partially opened modal was closed`
          : openedModal?.wrapper === null || openedModal === undefined
            ? `${triggerFailure}; modal ownership and cleanup could not be established`
            : `${triggerFailure}; owned modal cleanup was scheduled`,
      );
    }
    if (result.outcome.status !== "succeeded") {
      if (openedModal?.wrapper !== null && openedModal !== undefined) {
        deferClose(openedModal);
        return stale(
          result.outcome.failure.code,
          `${result.outcome.failure.message}; owned modal cleanup waits for the native poll to finish`,
        );
      }
      if (openedModal !== undefined) {
        openedModal.canceled = true;
        return stale(
          result.outcome.failure.code,
          `${result.outcome.failure.message}; ownership is still being observed and cleanup cannot yet be established`,
        );
      }
      return result.outcome;
    }
    if (openedModal === undefined) {
      return stale(
        "government-modal-ownership-unverified",
        "native Government modal trigger did not run",
      );
    }
    return openedModal;
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
        cancelPending();
        return stale(
          "government-root-changed",
          "game root changed after sampling",
        );
      }
      if (pending !== null) {
        if (pending.root !== sampledRoot || pending.government !== government) {
          cancelPending();
          return stale(
            "government-modal-canceled",
            "pending native Government modal no longer matches the sampled request",
          );
        }
        if (pending.canceled) {
          return stale(
            "government-modal-canceled",
            "pending native Government modal is being reconciled",
          );
        }
        if (pending.ownershipFailed) {
          pending.observer?.disconnect();
          pending = null;
          blockedRoot = sampledRoot;
          return stale(
            "government-modal-ownership-unverified",
            "native modal creation could not be tied to the Government opener; no modal was closed",
          );
        }
        if (pending.wrapper === null) return SUCCEEDED;
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
        if (activeModals(document).length !== 0) {
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
        pending = opened;
        return SUCCEEDED;
      }

      const active = pending;
      if (active === null || active.wrapper === null) return SUCCEEDED;
      const ownedWrapper = active.wrapper;
      const wrappers = modalWrappers(document);
      const visibleModals = activeModals(document);
      if (!wrappers.includes(ownedWrapper)) {
        return failAndClose(
          active,
          "government-modal-replaced",
          "automation-owned Government modal is no longer active",
        );
      }
      if (visibleModals.some((modal) => modal !== ownedWrapper)) {
        cancelPending();
        return stale(
          "government-modal-ownership-ambiguous",
          "another active modal appeared while the native Government modal was pending",
        );
      }
      if (!visibleModals.includes(ownedWrapper)) {
        active.creationChecks += 1;
        if (active.creationChecks < 3) return SUCCEEDED;
        return failAndClose(
          active,
          "government-modal-not-visible",
          "native Government modal never became active",
        );
      }
      if (visibleModals.length !== 1) {
        cancelPending();
        return stale(
          "government-modal-ownership-ambiguous",
          "another active modal appeared while the native Government modal was pending",
        );
      }
      const box = modalBoxFor(ownedWrapper);
      if (box === null) {
        active.creationChecks += 1;
        if (active.creationChecks < 3) return SUCCEEDED;
        return failAndClose(
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
          active,
          "government-modal-binding-missing",
          "native Government modal did not produce a current setGov binding",
        );
      }
      if (dependencies.rootState.readRoot() !== active.root) {
        return failAndClose(
          active,
          "government-root-changed",
          "game root changed while the native Government modal was opening",
        );
      }
      if (!modal.methods.includes("setGov")) {
        return failAndClose(
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
        closeOwnedModal(active);
        blockedRoot = active.root;
        return stale(
          "government-native-setter-noop",
          "native Government setGov returned without applying the requested government",
        );
      }
      return SUCCEEDED;
    },
    cancel: cancelPending,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelPending();
    },
  });

  function cancelPending(): void {
    if (pending === null) return;
    const active = pending;
    active.canceled = true;
    if (active.wrapper === null) {
      if (active.ownershipFailed || active.observer === null) pending = null;
      return;
    }
    active.observer?.disconnect();
    active.observer = null;
    pending = null;
    deferClose(active);
  }
}
