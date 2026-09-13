/**
 * A small DOM, because Node has none and the adapters under test are only interesting against real
 * nodes. It implements the slice the script touches: parentage, classes, attributes, text, events,
 * and the simple selectors the DOM helper's staged queries emit (`tag`, `#id`, `.class`,
 * `:scope >tag`).
 *
 * Shared by `dom-test.mjs`, which exercises the helper itself, and by the panel tests, which need a
 * page to draw into. Not named `*-test.mjs`, so the runner does not pick it up as a suite.
 */

import { createDomQuery } from "../src/adapters/browser/dom.ts";

export function parseSimple(token) {
  const match = /^(\*|[a-zA-Z][\w-]*)?(#[\w-]+)?((?:\.[\w-]+)*)$/.exec(token);
  if (match === null) throw new Error(`unsupported test selector: ${token}`);
  return {
    tag: match[1] === undefined || match[1] === "*" ? null : match[1],
    id: match[2] === undefined ? null : match[2].slice(1),
    classes: match[3] === "" ? [] : match[3].slice(1).split("."),
  };
}

function matchesSimple(element, token) {
  const { tag, id, classes } = parseSimple(token);
  if (tag !== null && element.tagName !== tag) return false;
  if (id !== null && element.id !== id) return false;
  return classes.every((className) => element.classList.contains(className));
}

function descendants(node) {
  return node.children.flatMap((child) => [child, ...descendants(child)]);
}

export class TestElement {
  constructor(tagName) {
    this.nodeType = 1;
    this.tagName = tagName;
    this.children = [];
    this.parentElement = null;
    this.attributes = new Map();
    this.textContent = "";
    this.innerHTML = "";
    this.style = {
      display: "",
      setProperty(name, value) {
        this[name] = value;
      },
    };
    this.offsetWidth = 10;
    this.offsetHeight = 10;
    this.listeners = [];
    const classes = new Set();
    // DOMTokenList is variadic and rejects empty or whitespace-bearing tokens.
    const checkToken = (name) => {
      if (name === "") throw new Error("The token provided must not be empty.");
      if (/\s/.test(name)) {
        throw new Error("The token provided contains HTML space characters.");
      }
      return name;
    };
    this.classList = {
      add: (...names) => names.forEach((name) => classes.add(checkToken(name))),
      remove: (...names) =>
        names.forEach((name) => classes.delete(checkToken(name))),
      contains: (name) => classes.has(name),
      toggle: (name, force) => {
        checkToken(name);
        const wanted = force === undefined ? !classes.has(name) : force;
        if (wanted) classes.add(name);
        else classes.delete(name);
        return wanted;
      },
      values: () => [...classes],
    };
  }

  get parentNode() {
    return this.parentElement;
  }

  get id() {
    return this.attributes.get("id") ?? "";
  }

  set id(value) {
    this.attributes.set("id", value);
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  get nextElementSibling() {
    const siblings = this.parentElement?.children ?? [];
    return siblings[siblings.indexOf(this) + 1] ?? null;
  }

  append(...nodes) {
    for (const node of nodes) {
      node.parentElement = this;
      this.children.push(node);
    }
  }

  prepend(...nodes) {
    for (const node of [...nodes].reverse()) {
      node.parentElement = this;
      this.children.unshift(node);
    }
  }

  before(...nodes) {
    const siblings = this.parentElement.children;
    siblings.splice(siblings.indexOf(this), 0, ...nodes);
    for (const node of nodes) node.parentElement = this.parentElement;
  }

  after(...nodes) {
    const siblings = this.parentElement.children;
    siblings.splice(siblings.indexOf(this) + 1, 0, ...nodes);
    for (const node of nodes) node.parentElement = this.parentElement;
  }

  appendChild(node) {
    this.append(node);
  }

  remove() {
    const siblings = this.parentElement?.children;
    if (siblings !== undefined) siblings.splice(siblings.indexOf(this), 1);
    this.parentElement = null;
  }

  replaceChildren() {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
  }

  matches(selector) {
    return matchesSimple(this, selector.trim());
  }

  closest(selector) {
    let node = this;
    while (node !== null) {
      if (node.matches(selector)) return node;
      node = node.parentElement;
    }
    return null;
  }

  querySelectorAll(selector) {
    let current = [this];
    for (const token of selector.trim().split(/\s+/)) {
      if (token === ":scope") continue;
      current = token.startsWith(">")
        ? current.flatMap((node) =>
            node.children.filter((child) =>
              matchesSimple(child, token.slice(1)),
            ),
          )
        : current.flatMap((node) =>
            descendants(node).filter((child) => matchesSimple(child, token)),
          );
    }
    return current;
  }

  getElementsByClassName(className) {
    return descendants(this).filter((child) =>
      child.classList.contains(className),
    );
  }

  getClientRects() {
    return this.offsetWidth === 0 && this.offsetHeight === 0 ? [] : [{}];
  }

  addEventListener(type, listener) {
    this.listeners.push({ type, listener });
  }

  removeEventListener(type, listener) {
    const index = this.listeners.findIndex(
      (record) => record.type === type && record.listener === listener,
    );
    if (index >= 0) this.listeners.splice(index, 1);
  }

  /** Dispatches to this element's own listeners, then bubbles the same event upward. */
  dispatch(type, target = this) {
    const event = { type, target, preventDefault() {} };
    let node = this;
    while (node !== null) {
      for (const record of [...node.listeners]) {
        if (record.type === type) record.listener(event);
      }
      node = node.parentElement;
    }
    return event;
  }

  select() {
    this.selected = (this.selected ?? 0) + 1;
  }

  click() {
    this.clicked = (this.clicked ?? 0) + 1;
  }
}

export function element(tagName, properties = {}) {
  return Object.assign(new TestElement(tagName), properties);
}

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

/**
 * A markup parser for the fragments the script builds: nested elements, valueless boolean
 * attributes, and text. It nests rather than flattening, because the script's own markup nests —
 * a settings toggle is an `<input>` inside the `<label>` that carries the delegated change handler,
 * and a flat parse silently breaks every delegated event. Only top-level elements are returned,
 * which is what a real `<template>`'s `content.childNodes` yields.
 */
export function parseTestMarkup(markup) {
  const roots = [];
  const stack = [];
  const current = () => (stack.length === 0 ? null : stack[stack.length - 1]);
  const pattern =
    /<\/([a-zA-Z][a-zA-Z0-9]*)\s*>|<([a-zA-Z][a-zA-Z0-9]*)((?:[^>"]|"[^"]*")*)>|([^<]+)/g;
  for (const [, closing, tag, rest, text] of markup.matchAll(pattern)) {
    if (closing !== undefined) {
      if (current()?.tagName === closing.toLowerCase()) stack.pop();
      continue;
    }
    if (text !== undefined) {
      const trimmed = text.replace(/\s+/g, " ");
      const parent = current();
      if (parent !== null && trimmed.trim() !== "") {
        parent.textContent += trimmed;
      }
      continue;
    }
    const node = new TestElement(tag);
    for (const [, name, value] of rest.matchAll(/([\w-]+)="([^"]*)"/g)) {
      if (name === "class") {
        for (const className of value.split(/\s+/))
          node.classList.add(className);
      } else node.setAttribute(name, value);
    }
    // Valueless boolean attributes, which the script writes for a checked toggle. A browser
    // reflects these onto the property too, so the fixture does as well.
    for (const [, name] of rest.matchAll(
      /(?:^|\s)(checked|disabled|selected)(?=[\s/]|$)/g,
    )) {
      node.setAttribute(name, "");
      node[name] = true;
    }
    const parent = current();
    if (parent === null) roots.push(node);
    else parent.appendChild(node);
    if (!VOID_TAGS.has(tag.toLowerCase()) && !rest.trimEnd().endsWith("/")) {
      stack.push(node);
    }
  }
  return roots;
}

export function createTestDocument(root) {
  return {
    readyState: "complete",
    documentElement: { scrollTop: 0 },
    body: root,
    addEventListener() {},
    execCommand: () => true,
    createTextNode: (text) => ({ nodeType: 3, textContent: String(text) }),
    createElement: (tag) => {
      if (tag !== "template") return new TestElement(tag);
      const template = { innerHTML: "", content: { childNodes: [] } };
      return new Proxy(template, {
        set(target, property, value) {
          target[property] = value;
          if (property === "innerHTML") {
            target.content = { childNodes: parseTestMarkup(String(value)) };
          }
          return true;
        },
      });
    },
    getElementById: (id) => root.querySelectorAll(`#${id}`)[0] ?? null,
    querySelectorAll: (selector) => root.querySelectorAll(selector),
  };
}

export function setUp() {
  const root = element("div", { id: "root" });
  const document = createTestDocument(root);
  const scheduled = [];
  const $ = createDomQuery({
    getDocument: () => document,
    schedule: (callback) => scheduled.push(callback),
  });
  return { $, root, document, scheduled };
}
