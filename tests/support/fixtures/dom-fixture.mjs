/**
 * A small DOM, because Node has none and the adapters under test are only interesting against real
 * nodes. It implements the slice the script touches: parentage, classes, attributes, text, events,
 * and the simple selectors the DOM helper's staged queries emit (`tag`, `#id`, `.class`, `[id]`,
 * `:scope >tag`).
 *
 * Shared by `dom-test.mjs`, which exercises the helper itself, and by the panel tests, which need a
 * page to draw into. Not named `*-test.mjs`, so the runner does not pick it up as a suite.
 */

import { createDomQuery } from "../../../src/adapters/browser/dom.ts";

const indexedElementsById = new Map();
const indexedElementsByClass = new Map();
const elementReferences = new WeakMap();

function referenceForElement(element) {
  let reference = elementReferences.get(element);
  if (reference === undefined) {
    reference = new WeakRef(element);
    elementReferences.set(element, reference);
  }
  return reference;
}

function addToSelectorIndex(index, key, element) {
  if (key === "") return;
  let elements = index.get(key);
  if (elements === undefined) {
    elements = new Set();
    index.set(key, elements);
  }
  elements.add(referenceForElement(element));
}

function removeFromSelectorIndex(index, key, element) {
  if (key === "") return;
  const elements = index.get(key);
  if (elements === undefined) return;
  elements.delete(referenceForElement(element));
  if (elements.size === 0) index.delete(key);
}

function isStrictDescendantOf(root, element) {
  let node = element.parentElement;
  while (node !== null) {
    if (node === root) return true;
    node = node.parentElement;
  }
  return false;
}

function indexedUniqueDescendants(root, token) {
  const idMatch = /^#([\w-]+)$/.exec(token);
  const classMatch = /^\.([\w-]+)$/.exec(token);
  const index = idMatch === null ? indexedElementsByClass : indexedElementsById;
  const key = idMatch === null ? classMatch?.[1] : idMatch[1];
  if (key === undefined) return null;

  const elements = index.get(key);
  if (elements === undefined) return [];

  const matches = [];
  for (const reference of elements) {
    const candidate = reference.deref();
    if (candidate === undefined) {
      elements.delete(reference);
      continue;
    }
    if (!isStrictDescendantOf(root, candidate)) continue;
    matches.push(candidate);
    // The index does not encode tree order. Fall back to the traversal for duplicates.
    if (matches.length > 1) return null;
  }
  return matches;
}

const compiledSimpleMatchers = new Map();

export function parseSimple(token) {
  const match = /^(\*|[a-zA-Z][\w-]*)?(#[\w-]+)?((?:\.[\w-]+)*)$/.exec(token);
  if (match === null) throw new Error(`unsupported test selector: ${token}`);
  return {
    tag: match[1] === undefined || match[1] === "*" ? null : match[1],
    id: match[2] === undefined ? null : match[2].slice(1),
    classes: match[3] === "" ? [] : match[3].slice(1).split("."),
  };
}

function matchesParsedSimple(element, { tag, id, classes }) {
  if (tag !== null && element.tagName !== tag) return false;
  if (id !== null && element.id !== id) return false;
  return classes.every((className) => element.classList.contains(className));
}

function compileSimpleMatcher(token) {
  const cached = compiledSimpleMatchers.get(token);
  if (cached !== undefined) return cached;
  if (token === "[id]") {
    const matcher = (element) => element.id !== "";
    compiledSimpleMatchers.set(token, matcher);
    return matcher;
  }
  const parsed = parseSimple(token);
  const matcher = (element) => matchesParsedSimple(element, parsed);
  compiledSimpleMatchers.set(token, matcher);
  return matcher;
}

function* descendants(node) {
  const frames = [{ node, nextChildIndex: 0 }];
  while (frames.length > 0) {
    const frame = frames[frames.length - 1];
    if (frame.nextChildIndex >= frame.node.children.length) {
      frames.pop();
      continue;
    }
    const child = frame.node.children[frame.nextChildIndex];
    frame.nextChildIndex += 1;
    yield child;
    frames.push({ node: child, nextChildIndex: 0 });
  }
}

export class TestElement {
  constructor(tagName) {
    this.nodeType = 1;
    this.tagName = tagName;
    if (tagName === "input") this.value = "";
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
    const addClass = (name) => {
      if (!classes.has(name)) {
        classes.add(name);
        addToSelectorIndex(indexedElementsByClass, name, this);
      }
    };
    const removeClass = (name) => {
      if (classes.delete(name)) {
        removeFromSelectorIndex(indexedElementsByClass, name, this);
      }
    };
    // DOMTokenList is variadic and rejects empty or whitespace-bearing tokens.
    const checkToken = (name) => {
      if (name === "") throw new Error("The token provided must not be empty.");
      if (/\s/.test(name)) {
        throw new Error("The token provided contains HTML space characters.");
      }
      return name;
    };
    this.classList = {
      add: (...names) => names.forEach((name) => addClass(checkToken(name))),
      remove: (...names) =>
        names.forEach((name) => removeClass(checkToken(name))),
      contains: (name) => classes.has(name),
      toggle: (name, force) => {
        checkToken(name);
        const wanted = force === undefined ? !classes.has(name) : force;
        if (wanted) addClass(name);
        else removeClass(name);
        return wanted;
      },
      values: () => [...classes],
    };
  }

  get parentNode() {
    return this.parentElement;
  }

  get isConnected() {
    let node = this;
    while (node.parentElement !== null) node = node.parentElement;
    return node.__testDocumentRoot === true;
  }

  get id() {
    return this.attributes.get("id") ?? "";
  }

  set id(value) {
    const previous = this.id;
    if (previous === value) return;
    if (typeof previous === "string") {
      removeFromSelectorIndex(indexedElementsById, previous, this);
    }
    this.attributes.set("id", value);
    if (typeof value === "string") {
      addToSelectorIndex(indexedElementsById, value, this);
    }
  }

  getAttribute(name) {
    // A real `class` attribute is the token list, so reading it has to see what `classList` holds.
    if (name === "class") return this.classList.values().join(" ");
    // HTML lowercases attribute names, which is what makes `data-Money` readable as `data-money`.
    return this.attributes.get(name.toLowerCase()) ?? null;
  }

  setAttribute(name, value) {
    if (name.toLowerCase() === "id") {
      this.id = value;
      return;
    }
    if (name === "class") {
      for (const className of this.classList.values())
        this.classList.remove(className);
      for (const className of String(value).split(/\s+/).filter(Boolean)) {
        this.classList.add(className);
      }
      return;
    }
    this.attributes.set(name.toLowerCase(), value);
  }

  get nextElementSibling() {
    const siblings = this.parentElement?.children ?? [];
    return siblings[siblings.indexOf(this) + 1] ?? null;
  }

  get nextSibling() {
    return this.nextElementSibling;
  }

  contains(other) {
    if (other === this) return true;
    for (const descendant of descendants(this)) {
      if (descendant === other) return true;
    }
    return false;
  }

  append(...nodes) {
    for (const node of nodes) {
      // A browser keeps text nodes out of `children`, which is an element-only list. The script
      // reaches this path whenever it appends an empty string — an empty settings table, say.
      if (node.nodeType !== 1) {
        this.textContent += String(node.textContent ?? "");
        continue;
      }
      if (node.parentElement !== null) node.remove();
      node.parentElement = this;
      this.children.push(node);
    }
  }

  prepend(...nodes) {
    for (const node of [...nodes].reverse()) {
      if (node.parentElement !== null) node.remove();
      node.parentElement = this;
      this.children.unshift(node);
    }
  }

  before(...nodes) {
    const parent = this.parentElement;
    if (parent === null) return;
    for (const node of nodes) {
      if (node === this) continue;
      if (node.parentElement !== null) node.remove();
      const siblings = parent.children;
      node.parentElement = parent;
      siblings.splice(siblings.indexOf(this), 0, node);
    }
  }

  after(...nodes) {
    const parent = this.parentElement;
    if (parent === null) return;
    let previous = this;
    for (const node of nodes) {
      if (node === this) continue;
      if (node.parentElement !== null) node.remove();
      const siblings = parent.children;
      node.parentElement = parent;
      siblings.splice(siblings.indexOf(previous) + 1, 0, node);
      previous = node;
    }
  }

  appendChild(node) {
    this.append(node);
    return node;
  }

  insertBefore(node, reference) {
    if (node.parentElement !== null) node.remove();
    const index =
      reference === null
        ? this.children.length
        : this.children.indexOf(reference);
    if (index < 0) throw new Error("reference node is not a child");
    node.parentElement = this;
    this.children.splice(index, 0, node);
    return node;
  }

  removeChild(node) {
    const index = this.children.indexOf(node);
    if (index < 0) throw new Error("node is not a child");
    this.children.splice(index, 1);
    node.parentElement = null;
    return node;
  }

  remove() {
    const siblings = this.parentElement?.children;
    if (siblings !== undefined) siblings.splice(siblings.indexOf(this), 1);
    this.parentElement = null;
  }

  replaceChildren(...nodes) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this.append(...nodes);
  }

  matches(selector) {
    return compileSimpleMatcher(selector.trim())(this);
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
      if (current.length === 0) continue;
      const directChild = token.startsWith(">");
      const simpleToken = directChild ? token.slice(1) : token;
      const matcher = compileSimpleMatcher(simpleToken);
      const matches = [];
      for (const node of current) {
        if (directChild) {
          for (const child of node.children) {
            if (matcher(child)) matches.push(child);
          }
        } else {
          const indexed = indexedUniqueDescendants(node, simpleToken);
          if (indexed !== null) {
            matches.push(...indexed);
            continue;
          }
          for (const child of descendants(node)) {
            if (matcher(child)) matches.push(child);
          }
        }
      }
      current = matches;
    }
    return current;
  }

  getElementsByClassName(className) {
    const matches = [];
    for (const child of descendants(this)) {
      if (child.classList.contains(className)) matches.push(child);
    }
    return matches;
  }

  getClientRects() {
    return this.offsetWidth === 0 && this.offsetHeight === 0 ? [] : [{}];
  }

  getBoundingClientRect() {
    return { left: 0, bottom: 10, width: 100 };
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

  /** The DOM spelling, for code that constructs an event object rather than naming a type. */
  dispatchEvent(event) {
    this.dispatch(String(event?.type ?? ""), this, event ?? {});
    return true;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  /** Dispatches to this element's own listeners, then bubbles the same event upward. */
  dispatch(type, target = this, properties = {}) {
    const event = { type, target, preventDefault() {}, ...properties };
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
  root.__testDocumentRoot = true;
  return {
    readyState: "complete",
    hidden: false,
    visibilityState: "visible",
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
    querySelector: (selector) => root.querySelectorAll(selector)[0] ?? null,
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
