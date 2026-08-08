// TRANSITIONAL: the Vue 2 page shell mounts the automation's long-lived
// mutation observers on `#main`, `body`, and `#msgQueueLog`, marks readiness
// with `#queueColumn`, and carries jQuery UI as a CDN script tag when the
// page arrived without it. Replace the observer mounts and the readiness
// marker with the Vue 3 update's lifecycle hooks and bundled UI.

import type { GameModalPort } from "../../ports/game-modal.ts";
import type { GamePageShellPort } from "../../ports/game-page-shell.ts";
import { isRecord, readProperty, requireRecord } from "../validation.ts";

export interface GamePageShellDependencies {
  readonly getDocument: () => unknown;

  /** The page's MutationObserver, read per mount because it can be stubbed. */
  readonly getMutationObserver: () => unknown;

  /** The page's Node constructor, for ELEMENT_NODE comparisons. */
  readonly getNode: () => unknown;

  /** The script-owned tooltip observer, mounted on main content and modals. */
  readonly getTooltipObserver: () => (mutations: unknown) => void;

  /** The script-owned log filter, mounted on the message queue. */
  readonly getLogFilter: () => (mutations: unknown) => void;

  /** The modal port the shell routes newly-mounted `.modal` elements through. */
  readonly getModal: () => GameModalPort;

  /** The jQuery function whose `.ui` presence decides the UI injection. */
  readonly getJQuery: () => unknown;
}

export function createGamePageShell({
  getDocument,
  getMutationObserver,
  getNode,
  getTooltipObserver,
  getLogFilter,
  getModal,
  getJQuery,
}: GamePageShellDependencies): GamePageShellPort {
  /** One element lookup by id through the page's document. */
  function byId(id: string): unknown {
    const documentValue = requireRecord(getDocument(), "document");
    const getElementById = readProperty(documentValue, "getElementById");
    return typeof getElementById === "function"
      ? Reflect.apply(getElementById, documentValue, [id])
      : null;
  }

  /** One element lookup by selector through the page's document. */
  function bySelector(selector: string): unknown {
    const documentValue = requireRecord(getDocument(), "document");
    const querySelector = readProperty(documentValue, "querySelector");
    return typeof querySelector === "function"
      ? Reflect.apply(querySelector, documentValue, [selector])
      : null;
  }

  /**
   * Mounts one childList observer over a target when both exist. The target for
   * modal capture is the page body, but Buefy mounts programmatic modals inside
   * the Vue app container rather than as direct body children, so the body
   * observer must also watch the subtree.
   */
  function observeNode(
    target: unknown,
    callback: (mutations: unknown) => void,
    options: { subtree?: boolean } = {},
  ): void {
    if (!isRecord(target)) {
      return;
    }
    const Observer = getMutationObserver();
    if (typeof Observer !== "function") {
      return;
    }
    const observer = new (
      Observer as new (callback: (mutations: unknown) => void) => unknown
    )(callback);
    const observe = readProperty(observer, "observe");
    if (typeof observe === "function") {
      Reflect.apply(observe, observer, [
        target,
        { childList: true, subtree: options.subtree ?? false },
      ]);
    }
  }

  /**
   * Walks the added nodes of one mutation record. Real MutationRecords carry a
   * NodeList in `addedNodes`, which is not an Array; iterate through the generic
   * `forEach` both Array and NodeList expose, matching the tooltip filter.
   */
  function forEachAddedNode(
    bodyMutation: unknown,
    visit: (node: unknown) => void,
  ): void {
    const addedNodes = readProperty(bodyMutation, "addedNodes");
    const forEach = readProperty(addedNodes, "forEach");
    if (typeof forEach === "function" && isRecord(addedNodes)) {
      Reflect.apply(forEach, addedNodes, [visit]);
    }
  }

  /** Whether a newly added node is an element carrying the modal class. */
  function isModalElement(node: unknown): node is {
    readonly style: { display: string };
  } {
    if (
      readProperty(node, "nodeType") !== readProperty(getNode(), "ELEMENT_NODE")
    ) {
      return false;
    }
    const classList = readProperty(node, "classList");
    const contains = isRecord(classList)
      ? readProperty(classList, "contains")
      : undefined;
    return (
      typeof contains === "function" &&
      Boolean(Reflect.apply(contains, classList, ["modal"]))
    );
  }

  return Object.freeze({
    mountObservers(): void {
      observeNode(byId("main"), getTooltipObserver());
      // The Vue 2 shell mounts modals inside the app container, so the body
      // observer needs the subtree to catch them. Keep the other mounts on
      // direct children where the tooltips and log rows are added.
      observeNode(
        bySelector("body"),
        (bodyMutations) => {
          if (!Array.isArray(bodyMutations)) {
            return;
          }
          for (const bodyMutation of bodyMutations) {
            forEachAddedNode(bodyMutation, (node) => {
              if (!isModalElement(node)) {
                return;
              }
              const modal = getModal();
              if (modal.isAwaitingScriptModal()) {
                modal.captureScriptModal(node);
              } else {
                observeNode(node, getTooltipObserver());
              }
            });
          }
        },
        { subtree: true },
      );
      observeNode(byId("msgQueueLog"), getLogFilter());
    },

    isPageReady(): boolean {
      return byId("queueColumn") !== null;
    },

    needsJQueryUi(): boolean {
      const jquery = getJQuery();
      return !readProperty(jquery, "ui");
    },

    loadJQueryUi(handlers: {
      readonly onLoaded: () => void;
      readonly onFailed: () => void;
    }): void {
      const { onLoaded, onFailed } = handlers;
      const documentValue = requireRecord(getDocument(), "document");
      const createElement = readProperty(documentValue, "createElement");
      const body = readProperty(documentValue, "body");
      const appendChild = isRecord(body)
        ? readProperty(body, "appendChild")
        : undefined;
      if (
        typeof createElement !== "function" ||
        typeof appendChild !== "function"
      ) {
        onFailed();
        return;
      }
      const script = Reflect.apply(createElement, documentValue, ["script"]);
      if (!isRecord(script)) {
        onFailed();
        return;
      }
      script["src"] = "https://code.jquery.com/ui/1.12.1/jquery-ui.min.js";
      script["onload"] = onLoaded;
      script["onerror"] = onFailed;
      Reflect.apply(appendChild, body, [script]);
    },
  });
}
