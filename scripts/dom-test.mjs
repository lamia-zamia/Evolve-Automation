import assert from "node:assert/strict";

import { createDomQuery } from "../src/adapters/browser/dom.ts";
import {
  isVisible,
  matchesSelector,
  queryAll,
} from "../src/adapters/browser/dom-selector.ts";

/*
 * A small DOM, because Node has none and the helper under test is only interesting against real
 * nodes. It implements the slice the helper touches: parentage, classes, attributes, text, events,
 * and the simple selectors the helper's staged queries emit (`tag`, `#id`, `.class`, `:scope >tag`).
 */

function parseSimple(token) {
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

class TestElement {
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
    this.classList = {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
      toggle: (name, force) => {
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

  click() {
    this.clicked = (this.clicked ?? 0) + 1;
  }
}

function element(tagName, properties = {}) {
  return Object.assign(new TestElement(tagName), properties);
}

/** A markup parser good enough for the flat `<tag class=…>` fragments the script builds. */
function parseTestMarkup(markup) {
  return [...markup.matchAll(/<([a-zA-Z]+)([^>]*)>/g)].map(([, tag, rest]) => {
    const node = new TestElement(tag);
    for (const [, name, value] of rest.matchAll(/([\w-]+)="([^"]*)"/g)) {
      if (name === "class") {
        for (const className of value.split(/\s+/))
          node.classList.add(className);
      } else node.setAttribute(name, value);
    }
    return node;
  });
}

function createTestDocument(root) {
  return {
    readyState: "complete",
    addEventListener() {},
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
    querySelectorAll: (selector) => root.querySelectorAll(selector),
  };
}

function setUp() {
  const root = element("div", { id: "root" });
  const document = createTestDocument(root);
  const scheduled = [];
  const $ = createDomQuery({
    getDocument: () => document,
    schedule: (callback) => scheduled.push(callback),
  });
  return { $, root, document, scheduled };
}

// --- selector engine -------------------------------------------------------------------------

{
  const table = element("table");
  const cells = ["a", "b", "c"].map((text) =>
    element("td", { textContent: text }),
  );
  table.append(...cells);
  assert.deepEqual(queryAll([table], "td:eq(1)"), [cells[1]]);
  assert.deepEqual(queryAll([table], "td:eq(9)"), []);
}

// A chunk after an extension is relative to what the extension selected, not to the document.
{
  const outer = element("div", { id: "outer" });
  const rows = [element("div"), element("div")];
  outer.append(...rows);
  const inner = element("span");
  rows[1].append(inner);
  assert.deepEqual(queryAll([outer], "div:eq(1)>span"), [inner]);
}

// `:visible` keeps only elements that occupy layout, and reads as a predicate too.
{
  const shown = element("p");
  const hidden = element("p", { offsetWidth: 0, offsetHeight: 0 });
  const holder = element("div");
  holder.append(shown, hidden);
  assert.deepEqual(queryAll([holder], "p:visible"), [shown]);
  assert.equal(isVisible(hidden), false);
  assert.equal(matchesSelector(shown, ":visible"), true);
  assert.equal(matchesSelector(hidden, "p:visible"), false);
  assert.equal(matchesSelector(shown, "p"), true);
}

// --- construction ----------------------------------------------------------------------------

{
  const { $, root } = setUp();
  const child = element("span", { id: "child" });
  root.append(child);

  assert.equal($("#child").length, 1);
  assert.equal($("#child")[0], child);
  assert.equal($("#missing").length, 0);
  assert.equal($(child)[0], child);
  assert.equal($(undefined).length, 0);
  assert.equal($(null).length, 0);
  assert.equal($($(child))[0], child);

  // Markup keeps the parsed elements, not the whitespace between them.
  const parsed = $(`\n  <label class="switch on"></label>\n`);
  assert.equal(parsed.length, 1);
  assert.equal(parsed.hasClass("switch"), true);
}

// --- traversal and narrowing -----------------------------------------------------------------

{
  const { $, root } = setUp();
  const first = element("li", { id: "one" });
  const second = element("li", { id: "two" });
  root.append(first, second);

  assert.equal($("li").length, 2);
  assert.equal($("li").eq(1)[0], second);
  assert.equal($("li").first()[0], first);
  assert.equal($("li").last()[0], second);
  assert.equal($("li").filter((index) => index === 1)[0], second);
  assert.equal($("#one").next()[0], second);
  assert.equal($("#two").next().length, 0);
  assert.equal($("li").eq(0).end().length, 2);
  assert.equal($("li").is("li"), true);

  const visited = [];
  $("li").each(function (index) {
    visited.push([index, this.id]);
  });
  assert.deepEqual(visited, [
    [0, "one"],
    [1, "two"],
  ]);
}

// --- attributes, properties, and content -----------------------------------------------------

{
  const { $, root } = setUp();
  const input = element("input", { id: "field" });
  input.setAttribute("data-queueid", "city-apartment");
  root.append(input);

  assert.equal($("#field").data("queueid"), "city-apartment");
  assert.equal($("#field").data("missing"), undefined);

  $("#field").attr("title", "hint");
  assert.equal($("#field").attr("title"), "hint");
  assert.equal($("#field").attr("absent"), undefined);

  $("#field").prop("checked", true);
  assert.equal($("#field").prop("checked"), true);

  $("#field").val("7");
  assert.equal($("#field").val(), "7");

  $("#field").text("shown");
  assert.equal($("#field").text(), "shown");

  $("#field").addClass("a").toggleClass("b", true).toggleClass("a", false);
  assert.deepEqual($("#field")[0].classList.values(), ["b"]);

  $("#field").css("backgroundColor", "red");
  assert.equal($("#field")[0].style["background-color"], "red");
}

// --- insertion and removal -------------------------------------------------------------------

{
  const { $, root } = setUp();
  const list = element("ul", { id: "list" });
  root.append(list);

  $("#list").append(`<li class="row"></li>`);
  assert.equal(list.children.length, 1);

  $("#list").append($(`<li class="row second"></li>`));
  assert.equal(list.children.length, 2);
  assert.equal($("#list .second").length, 1);

  $("#list").empty();
  assert.equal(list.children.length, 0);

  const doomed = element("li", { id: "doomed" });
  list.append(doomed);
  $("#doomed").remove();
  assert.equal(list.children.length, 0);
}

// --- events ----------------------------------------------------------------------------------

{
  const { $, root } = setUp();
  const button = element("button", { id: "go" });
  root.append(button);

  const seen = [];
  $("#go").on("click", function () {
    seen.push(this.id);
  });
  button.dispatch("click");
  assert.deepEqual(seen, ["go"]);

  // `off("*")` takes back every handler this helper registered.
  $("#go").off("*");
  button.dispatch("click");
  assert.deepEqual(seen, ["go"]);
  assert.equal(button.listeners.length, 0);
}

// The data form hands its value back to the handler as `event.data`.
{
  const { $, root } = setUp();
  const button = element("button", { id: "go" });
  root.append(button);

  let received = null;
  $("#go").on("click", { settingName: "autoBuild" }, (event) => {
    received = event.data;
  });
  button.dispatch("click");
  assert.deepEqual(received, { settingName: "autoBuild" });
}

// Delegation resolves the selector against the delegate, positional extension included.
{
  const { $, root } = setUp();
  const block = element("div", { id: "block" });
  const buttons = [element("button"), element("button")];
  block.append(...buttons);
  root.append(block);

  const clicked = [];
  $("#block").on("click", "button:eq(1)", function () {
    clicked.push(this);
  });
  block.dispatch("click", buttons[0]);
  assert.deepEqual(clicked, []);
  block.dispatch("click", buttons[1]);
  assert.deepEqual(clicked, [buttons[1]]);
}

// `click()` with no handler clicks the element; the game's listeners are native and need a real one.
{
  const { $, root } = setUp();
  const button = element("button", { id: "go" });
  root.append(button);
  $("#go").click();
  assert.equal(button.clicked, 1);
}

// --- readiness ---------------------------------------------------------------------------------

{
  const { $, scheduled } = setUp();
  let started = false;
  $().ready(() => {
    started = true;
  });
  assert.equal(started, false, "ready defers rather than running inline");
  assert.equal(scheduled.length, 1);
  scheduled[0]();
  assert.equal(started, true);
}

// A page still loading waits for the document instead.
{
  const root = element("div");
  const document = createTestDocument(root);
  document.readyState = "loading";
  const waiting = [];
  document.addEventListener = (type, listener) =>
    waiting.push([type, listener]);
  const $ = createDomQuery({
    getDocument: () => document,
    schedule: () =>
      assert.fail("a loading page must not schedule the callback"),
  });
  let started = false;
  $().ready(() => {
    started = true;
  });
  assert.equal(waiting[0][0], "DOMContentLoaded");
  waiting[0][1]();
  assert.equal(started, true);
}

console.log("DOM helper tests passed");
