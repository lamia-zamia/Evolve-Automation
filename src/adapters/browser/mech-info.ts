import type { MechInfoItem } from "../../domain/combat/mech-info.ts";
import type {
  MechInfoObserver,
  MechInfoReader,
} from "../../ports/mech-info.ts";
import {
  callBoolean,
  callVoid,
  requireFunction,
  requireNumber,
  requireRecord,
} from "../validation.ts";

interface JQueryNode {
  readonly length: number;
  hasClass(className: string): boolean;
  text(value: string): JQueryNode;
  remove(): JQueryNode;
}

interface MechNode {
  readonly childNodes: readonly unknown[];
  readonly firstChild: unknown;
  insertBefore(note: unknown, before: unknown): void;
}

interface MechList {
  readonly children: readonly MechNode[];
}

export interface MechInfoBrowserDependencies {
  readonly getDocument: () => unknown;
  readonly getJQuery: () => unknown;
  readonly reader: MechInfoReader;
  readonly observer: MechInfoObserver;
}

export interface MechInfoBrowserAdapter {
  createMechInfo(): void;
  removeMechInfo(): void;
}

function requireObjectLike(
  value: unknown,
  path: string,
): Record<PropertyKey, unknown> {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  ) {
    throw new TypeError(`${path} must be an object`);
  }
  return value as Record<PropertyKey, unknown>;
}

function readJQueryNode(value: unknown, path: string): JQueryNode {
  const raw = requireObjectLike(value, path);
  return {
    length: requireNumber(raw["length"], `${path}.length`),
    hasClass(className: string): boolean {
      return callBoolean(raw, "hasClass", path, className);
    },
    text(textValue: string): JQueryNode {
      callVoid(raw, "text", path, textValue);
      return this;
    },
    remove(): JQueryNode {
      callVoid(raw, "remove", path);
      return this;
    },
  };
}

function readArrayLike(value: unknown, path: string): readonly unknown[] {
  const raw = requireRecord(value, path);
  const length = raw["length"];
  if (typeof length !== "number" || !Number.isInteger(length) || length < 0) {
    throw new TypeError(`${path} must be an array or array-like object`);
  }
  const arrayLike = raw as unknown as ArrayLike<unknown>;
  return Object.freeze(Array.from(arrayLike));
}

function readMechNode(value: unknown, path: string): MechNode {
  const raw = requireRecord(value, path);
  const childNodes = readArrayLike(raw["childNodes"], `${path}.childNodes`);
  return {
    childNodes,
    firstChild: raw["firstChild"],
    insertBefore(note: unknown, before: unknown): void {
      callVoid(raw, "insertBefore", path, note, before);
    },
  };
}

// The rows are read from the list element's own children instead of from Vue
// internals. Vue 3 mounts into `#mechList` and the panel's root is a `v-for`
// fragment, so its component proxy exposes no `_vnode` and its `$el` is the
// fragment's text anchor rather than the panel. The rendered `.mechRow` divs
// are the element's element children under either Vue version.
function readMechList(value: unknown): MechList {
  const list = requireRecord(value, "mechList");
  const children = readArrayLike(list["children"], "mechList.children");
  return Object.freeze({
    children: Object.freeze(
      children.map((child, index) =>
        readMechNode(child, `mechList child ${index}`),
      ),
    ),
  });
}

export function createBrowserMechInfoObserver(
  getWindow: () => unknown,
): MechInfoObserver {
  let observer: Record<PropertyKey, unknown> | undefined;
  let onMutation: () => void = () => {};

  function ensureObserver(): void {
    if (observer !== undefined) return;
    const pageWindow = getWindow();
    if (
      pageWindow === null ||
      (typeof pageWindow !== "object" && typeof pageWindow !== "function")
    ) {
      return;
    }
    const constructor = requireObjectLike(pageWindow, "window")[
      "MutationObserver"
    ];
    if (typeof constructor !== "function") return;
    try {
      observer = requireObjectLike(
        Reflect.construct(constructor, [() => onMutation()]),
        "MutationObserver instance",
      );
    } catch {
      // A host without a usable MutationObserver can still render static notes.
      observer = undefined;
    }
  }

  return Object.freeze({
    disconnect(): void {
      if (observer !== undefined) {
        callVoid(observer, "disconnect", "MutationObserver");
      }
    },
    observe(
      target: unknown,
      options: Readonly<{ readonly childList: true }>,
      refresh: () => void,
    ): void {
      onMutation = refresh;
      ensureObserver();
      if (observer !== undefined) {
        callVoid(observer, "observe", "MutationObserver", target, options);
      }
    },
  });
}

export function createMechInfoBrowserAdapter({
  getDocument,
  getJQuery,
  reader,
  observer,
}: MechInfoBrowserDependencies): MechInfoBrowserAdapter {
  let enabled = false;
  let observedList: unknown;

  function query(value: unknown): JQueryNode {
    const jquery = requireFunction(getJQuery(), "jQuery");
    return readJQueryNode(
      Reflect.apply(jquery, undefined, [value]),
      `jQuery(${String(value)})`,
    );
  }

  function refreshMechInfo(force: boolean): void {
    if (!enabled) return;
    const document = requireRecord(getDocument(), "document");
    const getElementById = requireFunction(
      document["getElementById"],
      "document.getElementById",
    );
    let listElement = Reflect.apply(getElementById, document, ["mechList"]);
    if (!force && listElement !== null && listElement === observedList) return;
    if (!reader.ensureLabActive()) {
      observer.disconnect();
      observedList = undefined;
      return;
    }

    observer.disconnect();
    // Control discovery can draw the lab while enabling Mech Info. Read the list again after it
    // runs so the adapter observes the newly mounted Vue 3 panel on the next available render.
    listElement = Reflect.apply(getElementById, document, ["mechList"]);
    if (listElement === null || listElement === undefined) {
      observedList = undefined;
      return;
    }
    const createElement = requireFunction(
      document["createElement"],
      "document.createElement",
    );
    const list = readMechList(listElement);
    const items = reader.readItems(list.children.length);

    for (let index = 0; index < list.children.length; index += 1) {
      const node = list.children[index];
      const item: MechInfoItem | undefined = items[index];
      if (!node) continue;
      const firstNode = query(node.childNodes[0]);
      if (item === undefined) {
        if (firstNode.hasClass("ea-mech-info")) firstNode.remove();
        continue;
      }
      if (firstNode.hasClass("ea-mech-info")) {
        firstNode.text(item.text);
      } else {
        const note = requireRecord(
          Reflect.apply(createElement, document, ["span"]),
          "document.createElement(span)",
        );
        note["className"] = "ea-mech-info";
        note["innerHTML"] = item.text;
        node.insertBefore(note, node.firstChild);
      }
    }

    observer.observe(listElement, Object.freeze({ childList: true }), () =>
      refreshMechInfo(true),
    );
    observedList = listElement;
  }

  function createMechInfo(): void {
    enabled = true;
    refreshMechInfo(false);
  }

  function removeMechInfo(): void {
    if (!enabled) return;
    enabled = false;
    observer.disconnect();
    observedList = undefined;
    query("#mechList .ea-mech-info").remove();
  }

  return Object.freeze({ createMechInfo, removeMechInfo });
}
