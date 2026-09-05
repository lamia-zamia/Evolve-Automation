import assert from "node:assert/strict";

import { createAutocomplete } from "../src/adapters/browser/autocomplete.ts";

function makeElement(tag) {
  const element = {
    tagName: tag,
    className: "",
    textContent: "",
    style: {},
    children: [],
    classList: {
      added: [],
      removed: [],
      add(name) {
        element.classList.added.push(name);
      },
      remove(name) {
        element.classList.removed.push(name);
      },
    },
    listeners: new Map(),
    addEventListener(type, handler) {
      element.listeners.set(type, handler);
    },
    appendChild(child) {
      element.children.push(child);
      return child;
    },
    remove() {
      removed.push(element);
    },
  };
  return element;
}

const removed = [];

function makeDocument() {
  const body = makeElement("body");
  return {
    body,
    defaultView: { scrollX: 0, scrollY: 5 },
    createElement: (tag) => makeElement(tag),
  };
}

function makeInput(value = "") {
  const input = makeElement("input");
  input.value = value;
  input.getBoundingClientRect = () => ({
    left: 10,
    bottom: 20,
    width: 100,
  });
  return input;
}

// escapeRegex must neutralize every character a typed term could smuggle into the matcher.
{
  const document = makeDocument();
  const { escapeRegex } = createAutocomplete({ getDocument: () => document });
  const term = "a.b*c(d)e[f]g{h}i+j?k|l^m$n#o," + String.fromCharCode(92) + "p";
  const escaped = escapeRegex(term);
  // The escaped form matches the literal term and nothing else.
  assert.ok(new RegExp(escaped).test(term));
  assert.equal(escapeRegex("a.c"), "a\\.c");
  assert.equal(
    escapeRegex(String.fromCharCode(92)),
    "\\" + String.fromCharCode(92),
  );
  assert.ok(!new RegExp("^" + escapeRegex("a.c") + "$").test("abc"));
}

// A target that is not an input is ignored rather than throwing.
{
  const document = makeDocument();
  const { attach } = createAutocomplete({ getDocument: () => document });
  assert.doesNotThrow(() =>
    attach(undefined, { minLength: 1, source: () => {} }),
  );
  assert.doesNotThrow(() => attach({}, { minLength: 1, source: () => {} }));
}

// Typing below minLength asks for nothing; at minLength the menu opens under the input.
{
  const document = makeDocument();
  const { attach } = createAutocomplete({ getDocument: () => document });
  const input = makeInput();
  const terms = [];
  const selected = [];
  const focused = [];
  const changed = [];

  attach(input, {
    minLength: 2,
    source(request, response) {
      terms.push(request.term);
      response([
        { label: "Alpha", value: 1 },
        { label: "Beta", value: 2 },
      ]);
    },
    select(event, ui) {
      event.preventDefault();
      selected.push([this.value, ui.item.value]);
    },
    focus(event, ui) {
      event.preventDefault();
      focused.push(ui.item.value);
    },
    change(event, ui) {
      changed.push(ui.item);
    },
  });

  input.value = "A";
  input.listeners.get("input")();
  assert.deepEqual(terms, []);
  assert.equal(document.body.children.length, 0);

  input.value = "Al";
  input.listeners.get("input")();
  assert.deepEqual(terms, ["Al"]);
  assert.equal(document.body.children.length, 1);

  const menu = document.body.children[0];
  assert.equal(menu.className, "ui-autocomplete");
  assert.deepEqual(
    menu.children.map((entry) => entry.textContent),
    ["Alpha", "Beta"],
  );
  // Positioned under the input, in page coordinates.
  assert.equal(menu.style.top, "25px");
  assert.equal(menu.style.left, "10px");
  assert.equal(menu.style.width, "100px");

  // Arrow keys report the focused item without committing it.
  let prevented = 0;
  input.listeners.get("keydown")({
    key: "ArrowDown",
    preventDefault: () => (prevented += 1),
  });
  assert.deepEqual(focused, [1]);
  assert.equal(prevented, 1);

  // Enter commits the focused item and closes the menu.
  input.listeners.get("keydown")({
    key: "Enter",
    preventDefault: () => (prevented += 1),
  });
  assert.deepEqual(selected, [["Al", 1]]);
  assert.equal(removed.at(-1), menu);
}

// Blur reports a change only when the text actually changed, and reports no item.
{
  const document = makeDocument();
  const { attach } = createAutocomplete({ getDocument: () => document });
  const input = makeInput("start");
  const changed = [];
  attach(input, {
    minLength: 2,
    source: () => {},
    change(event, ui) {
      changed.push(ui.item);
    },
  });

  input.listeners.get("focus")();
  input.listeners.get("blur")();
  assert.deepEqual(changed, []);

  input.listeners.get("focus")();
  input.value = "edited";
  input.listeners.get("blur")();
  assert.deepEqual(changed, [null]);
}
