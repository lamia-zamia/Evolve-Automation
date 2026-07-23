import type { MechInfoItem } from "../../domain/combat/mech-info.ts";
import type {
  MechInfoObserver,
  MechInfoReader,
} from "../../ports/mech-info.ts";
import {
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
  readonly getVueById: (id: string) => unknown;
  readonly reader: MechInfoReader;
  readonly observer: MechInfoObserver;
}

export interface MechInfoBrowserAdapter {
  createMechInfo(): void;
  removeMechInfo(): void;
}

function call(
  target: Record<PropertyKey, unknown>,
  key: string,
  path: string,
  args: readonly unknown[] = [],
): unknown {
  return Reflect.apply(requireFunction(target[key], path), target, args);
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
      return Boolean(call(raw, "hasClass", `${path}.hasClass`, [className]));
    },
    text(textValue: string): JQueryNode {
      call(raw, "text", `${path}.text`, [textValue]);
      return this;
    },
    remove(): JQueryNode {
      call(raw, "remove", `${path}.remove`);
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
      call(raw, "insertBefore", `${path}.insertBefore`, [note, before]);
    },
  };
}

function readMechList(value: unknown): MechList {
  const list = requireRecord(value, "mechList");
  const vnode = requireRecord(list["_vnode"], "mechList._vnode");
  const children = vnode["children"];
  if (!Array.isArray(children)) {
    throw new TypeError("mechList._vnode.children must be an array");
  }
  return Object.freeze({
    children: Object.freeze(
      children.map((child, index) =>
        readMechNode(
          child && requireRecord(child, `mechList child ${index}`)["elm"],
          `mechList child ${index}.elm`,
        ),
      ),
    ),
  });
}

export function createMechInfoBrowserAdapter({
  getDocument,
  getJQuery,
  getVueById,
  reader,
  observer,
}: MechInfoBrowserDependencies): MechInfoBrowserAdapter {
  function query(value: unknown): JQueryNode {
    const jquery = requireFunction(getJQuery(), "jQuery");
    return readJQueryNode(
      Reflect.apply(jquery, undefined, [value]),
      `jQuery(${String(value)})`,
    );
  }

  function createMechInfo(): void {
    if (query("#mechList .mechRow[draggable=true]").length > 0) return;
    if (!reader.ensureLabActive()) return;

    observer.disconnect();
    const list = readMechList(getVueById("mechList"));
    const items = reader.readItems(list.children.length);
    const document = requireRecord(getDocument(), "document");
    const getElementById = requireFunction(
      document["getElementById"],
      "document.getElementById",
    );
    const createElement = requireFunction(
      document["createElement"],
      "document.createElement",
    );

    for (let index = 0; index < list.children.length; index += 1) {
      const node = list.children[index];
      const item: MechInfoItem | undefined = items[index];
      if (!node || !item) continue;
      const firstNode = query(node.childNodes[0]);
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

    observer.observe(
      Reflect.apply(getElementById, document, ["mechList"]),
      Object.freeze({ childList: true }),
    );
  }

  function removeMechInfo(): void {
    observer.disconnect();
    query("#mechList .ea-mech-info").remove();
  }

  return Object.freeze({ createMechInfo, removeMechInfo });
}
