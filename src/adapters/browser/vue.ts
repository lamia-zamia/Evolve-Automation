// TRANSITIONAL: Support the current Vue 2 marker and the DeadSpace branch's Vue 3
// compatibility markers in one browser adapter. Replace this bridge with explicit
// game-facing ports when the upstream Vue 3 component contracts stabilize.

import type { TickDiagnostics } from "../../ports/tick.ts";
import { readProperty } from "../validation.ts";

export interface VueAdapterDependencies {
  readonly getWin: () => {
    readonly document: {
      readonly getElementById: (id: string) => unknown;
      readonly querySelector?: (selector: string) => unknown;
    };
  };
  readonly diagnostics?: TickDiagnostics | undefined;
}

export type VueMethodCaller = (
  view: unknown,
  methodName: string,
  args: readonly unknown[],
  legacyFilterName?: string,
) => unknown;

export type VueMethodResolver = (
  view: unknown,
  methodName: string,
  legacyFilterName?: string,
) => (...args: unknown[]) => unknown;

function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null;
}

function readVueProxy(element: unknown): unknown {
  const customProxy = readProperty(element, "__vue_proxy__");
  if (isPresent(customProxy)) {
    return customProxy;
  }

  const app = readProperty(element, "__vue_app__");
  const instance = readProperty(app, "_instance");
  const appProxy = readProperty(instance, "proxy");
  if (isPresent(appProxy)) {
    return appProxy;
  }

  const legacyVue = readProperty(element, "__vue__");
  return isPresent(legacyVue) ? legacyVue : undefined;
}

export function createVueAdapter({
  getWin,
  diagnostics,
}: VueAdapterDependencies) {
  function lookUpVue(elementId: string): unknown {
    const element = getWin().document.getElementById(elementId);
    return readVueProxy(element);
  }

  /**
   * Every "is this action rendered" question in the script funnels through here,
   * and each one is a document lookup plus a property walk over the element.
   * The weighting pass asks it several times per candidate, so the call count
   * and its total cost are measured to size that.
   */
  function getVueById(elementId: string): unknown {
    if (diagnostics === undefined || !diagnostics.readPerformanceEnabled()) {
      return lookUpVue(elementId);
    }
    const startedAtMs = diagnostics.nowMs();
    try {
      return lookUpVue(elementId);
    } finally {
      diagnostics.recordPerformance(
        "getVueById",
        diagnostics.nowMs() - startedAtMs,
      );
    }
  }

  function getMainVue(): unknown {
    const document = getWin().document;
    const querySelector = document.querySelector;
    if (typeof querySelector !== "function") {
      return undefined;
    }
    return readVueProxy(
      Reflect.apply(querySelector, document, ["#mainColumn > div:first-child"]),
    );
  }

  const resolveVueMethod: VueMethodResolver = (
    view,
    methodName,
    legacyFilterName = methodName,
  ) => {
    const method = readProperty(view, methodName);
    if (typeof method === "function") {
      return (...args) => Reflect.apply(method, view, args);
    }

    const filters = readProperty(readProperty(view, "$options"), "filters");
    const legacyFilter = readProperty(filters, legacyFilterName);
    if (typeof legacyFilter === "function") {
      return (...args) => Reflect.apply(legacyFilter, filters, args);
    }

    throw new TypeError(`${methodName} must be a function`);
  };

  const callVueMethod: VueMethodCaller = (
    view,
    methodName,
    args,
    legacyFilterName = methodName,
  ): unknown =>
    resolveVueMethod(view, methodName, legacyFilterName)(...Array.from(args));

  function getVueElement(view: unknown): unknown {
    return readProperty(view, "$el");
  }

  return Object.freeze({
    callVueMethod,
    getMainVue,
    getVueById,
    getVueElement,
    resolveVueMethod,
  });
}
