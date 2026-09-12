import assert from "node:assert/strict";

import {
  isVisible,
  matchesSelector,
  queryAll,
} from "../src/adapters/browser/dom-selector.ts";
import { createDomQuery } from "../src/adapters/browser/dom.ts";
import { createTestDocument, element, setUp } from "./dom-fixture.mjs";

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

  // jQuery semantics: space-separated lists apply to every named class.
  $("#field").addClass("c d");
  assert.deepEqual($("#field")[0].classList.values(), ["b", "c", "d"]);
  $("#field").removeClass("b  d");
  assert.deepEqual($("#field")[0].classList.values(), ["c"]);
  $("#field").toggleClass("c e", true);
  assert.deepEqual($("#field")[0].classList.values(), ["c", "e"]);
  $("#field").removeClass("");
  assert.deepEqual($("#field")[0].classList.values(), ["c", "e"]);

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
