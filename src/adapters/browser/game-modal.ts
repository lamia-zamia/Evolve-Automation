// TRANSITIONAL: the current Vue 2 shell mounts one `.modal` at a time and fills
// `#modalBoxTitle` only after the shell exists, so a script-opened modal is hidden
// and its subtree watched until the title identifies it. Replace this selector
// knowledge and the mutation watch when the Vue 3 update provides a stable
// modal-content lifecycle hook.

import type {
  GameModalElement,
  GameModalPort,
  GameModalRequest,
} from "../../ports/game-modal.ts";

/** The subset of a page element this adapter touches. Each call uses one part of it. */
interface ModalPageElement {
  readonly textContent?: string | null;
  readonly style?: { display: string };
  getAttribute?(name: string): string | null;
  click?(): void;
}

interface ModalDocument {
  getElementById(id: string): ModalPageElement | null;
  querySelector(selector: string): ModalPageElement | null;
}

interface ModalMutationObserver {
  observe(
    target: GameModalElement,
    options: { childList: boolean; subtree: boolean },
  ): void;
}

type ModalMutationObserverConstructor = new (
  callback: () => void,
) => ModalMutationObserver;

export interface GameModalDependencies {
  readonly getDocument: () => ModalDocument;
  readonly getMutationObserver: () => ModalMutationObserverConstructor;
}

export function createGameModal({
  getDocument,
  getMutationObserver,
}: GameModalDependencies): GameModalPort {
  let awaitingScriptModal = false;
  let requestedTitle = "";
  let pendingAction: (() => void) | null = null;
  let actionCompleted = false;

  function currentTitle(): string {
    const text = getDocument().getElementById("modalBoxTitle")?.textContent;
    if (typeof text !== "string") {
      return "";
    }

    // A modal titles itself either with a name ("Factory") or with a name and a
    // quantity ("Iridium - 26.4K/279.9K"); only the name identifies the window.
    const separator = text.indexOf(" - ");
    return separator === -1 ? text : text.substring(0, separator);
  }

  function isOpen(): boolean {
    const document = getDocument();
    // `modalBox` is the game's window; `scriptModal` is this script's own.
    return (
      awaitingScriptModal ||
      document.getElementById("modalBox") !== null ||
      document.getElementById("scriptModal")?.style?.display === "block"
    );
  }

  function checkCallbacks(): void {
    const title = currentTitle();
    // Vue creates the modal shell before rendering its content. Keep the pending
    // action alive until the title identifies the requested window; otherwise an
    // empty intermediate mutation consumes it and leaves the caller's options
    // uncached.
    if (awaitingScriptModal && title === "") {
      return;
    }

    const document = getDocument();
    if (awaitingScriptModal && title === requestedTitle) {
      if (!actionCompleted && pendingAction !== null) {
        const action = pendingAction;
        pendingAction = null;
        actionCompleted = true;
        try {
          action();
        } finally {
          // The close control can be mounted just after the title. Keep the
          // request alive if it is not queryable yet so a later mutation can
          // retry the cleanup instead of leaving the construction modal open.
          const close = document.querySelector(".modal .modal-close");
          if (typeof close?.click === "function") {
            close.click();
            awaitingScriptModal = false;
            requestedTitle = "";
            actionCompleted = false;
          }
        }
        return;
      }

      const close = document.querySelector(".modal .modal-close");
      if (typeof close?.click !== "function") {
        return;
      }
      close.click();
    } else {
      // The window is the player's, or is not the one that was requested. It was
      // hidden on the way in, so show it back.
      const style = document.querySelector(".modal")?.style;
      if (style !== undefined) {
        style.display = "";
      }
    }

    awaitingScriptModal = false;
    requestedTitle = "";
    pendingAction = null;
    actionCompleted = false;
  }

  return Object.freeze({
    isOpen,

    canOpen(triggerSelector: string): boolean {
      const trigger = getDocument().querySelector(triggerSelector);
      return (
        trigger !== null && trigger.getAttribute?.("disabled") !== "disabled"
      );
    },

    open({ triggerSelector, title, action }: GameModalRequest): void {
      if (isOpen()) {
        return;
      }

      const trigger = getDocument().querySelector(triggerSelector);
      if (typeof trigger?.click !== "function") {
        return;
      }

      awaitingScriptModal = true;
      requestedTitle = title;
      pendingAction = action;
      actionCompleted = false;
      trigger.click();
    },

    isAwaitingScriptModal(): boolean {
      return awaitingScriptModal;
    },

    captureScriptModal(element: GameModalElement): void {
      element.style.display = "none"; // Hide the splash the player never asked for

      const Observer = getMutationObserver();
      new Observer(checkCallbacks).observe(element, {
        childList: true,
        subtree: true,
      });
    },
  });
}
