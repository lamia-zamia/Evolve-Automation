import assert from "node:assert/strict";

import { createGamePanelWorkspace } from "../src/adapters/browser/game-panel-workspace.ts";

/**
 * Enough of a document to hide panels by name in: ids, parents, order, containment, connectivity,
 * and an `[id]` query, which is what the workspace hides a subtree with.
 */
function makeDocument() {
  const root = element("root");

  function element(id) {
    return {
      id,
      children: [],
      parentNode: null,
      attributes: {},
      get isConnected() {
        for (let node = this; node !== null; node = node.parentNode) {
          if (node === root) return true;
        }
        return false;
      },
      get nextSibling() {
        const parent = this.parentNode;
        if (parent === null) return null;
        return parent.children[parent.children.indexOf(this) + 1] ?? null;
      },
      contains(other) {
        for (let node = other; node !== null; node = node.parentNode) {
          if (node === this) return true;
        }
        return false;
      },
      getAttribute(name) {
        return this.attributes[name] ?? null;
      },
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
      querySelectorAll(selector) {
        assert.equal(selector, "[id]", "the workspace only hides ids");
        const found = [];
        const walk = (node) => {
          for (const child of node.children) {
            if (child.id !== "") found.push(child);
            walk(child);
          }
        };
        walk(this);
        return found;
      },
      remove() {
        const parent = this.parentNode;
        if (parent === null) return;
        parent.children.splice(parent.children.indexOf(this), 1);
        this.parentNode = null;
      },
      insertBefore(node, before) {
        node.remove();
        const at =
          before === null
            ? this.children.length
            : this.children.indexOf(before);
        this.children.splice(at < 0 ? this.children.length : at, 0, node);
        node.parentNode = this;
        return node;
      },
      // Present so that a workspace which swaps nodes instead of names can run here too, and fail
      // on what it does to the player's panel rather than on a missing method.
      replaceChild(node, replaced) {
        const at = this.children.indexOf(replaced);
        if (at < 0) throw new Error(`${replaced.id} is not a child`);
        node.remove();
        this.children.splice(at, 1, node);
        node.parentNode = this;
        replaced.parentNode = null;
        return replaced;
      },
      append(...nodes) {
        for (const node of nodes) this.insertBefore(node, null);
        return this;
      },
    };
  }

  function find(node, id) {
    if (node.id === id) return node;
    for (const child of node.children) {
      const hit = find(child, id);
      if (hit !== null) return hit;
    }
    return null;
  }
  const body = element("body");
  root.append(body);
  return {
    root,
    body,
    element,
    getElementById: (id) => find(root, id),
    createElement: () => element(""),
  };
}

/** The main column: each panel inside its own tab-item wrapper, the way Buefy renders them. */
function makePage() {
  const dom = makeDocument();
  const panels = {};
  for (const id of ["mTabCivil", "mTabCivic", "mTabResearch", "mTabResource"]) {
    const wrapper = dom.element(`item-${id}`);
    const panel = dom.element(id);
    wrapper.append(panel);
    dom.body.append(wrapper);
    panels[id] = panel;
  }
  // The player's panel has content the game built, and the workspace must not disturb it: a
  // sub-panel the draw would fill and a row the game's own teardown helpers look up by id.
  const content = dom.element("resTrade");
  const row = dom.element("resQueue");
  content.append(row);
  panels["mTabResource"].append(content);
  return { dom, panels, content, row };
}

function workspaceFor(page) {
  return createGamePanelWorkspace({ getDocument: () => page.dom });
}

// --- keeping the player's panel and scratching the target ------------------------------------

{
  const page = makePage();
  const player = page.panels["mTabResource"];
  const playerWrapper = player.parentNode;
  const research = page.panels["mTabResearch"];
  const researchParent = research.parentNode;

  const workspace = workspaceFor(page).open({
    keep: "mTabResource",
    scratch: "mTabResearch",
  });
  assert.notEqual(workspace, undefined);

  // The player's panel is still in the page, as the same node, in the same place.
  assert.equal(player.isConnected, true);
  assert.equal(player.parentNode, playerWrapper);
  assert.deepEqual(player.children, [page.content]);
  // It just cannot be found by the names the game's draw and teardown helpers look up.
  assert.equal(page.dom.getElementById("mTabResource"), null);
  assert.equal(page.dom.getElementById("resTrade"), null);
  assert.equal(page.dom.getElementById("resQueue"), null);

  // The target id resolves to a disposable container beside the real panel, which is also hidden so
  // that nothing the draw appends can land in it.
  const scratch = page.dom.getElementById("mTabResearch");
  assert.notEqual(scratch, research);
  assert.equal(scratch.parentNode, researchParent);
  assert.equal(research.isConnected, true);
  assert.equal(
    scratch.getAttribute("style").includes("visibility:hidden"),
    true,
  );
  assert.equal(scratch.getAttribute("style").includes("display:none"), false);
  assert.equal(workspace.isIntact(), true);

  // What the draw produced goes away with the container it went into.
  const drawn = page.dom.element("tech");
  scratch.append(drawn);
  workspace.release();

  assert.equal(page.dom.getElementById("mTabResearch"), research);
  assert.equal(page.dom.getElementById("tech"), null);
  // The player's panel answers to its own names again, with the same nodes.
  assert.equal(page.dom.getElementById("mTabResource"), player);
  assert.equal(page.dom.getElementById("resTrade"), page.content);
  assert.equal(page.dom.getElementById("resQueue"), page.row);
  assert.equal(workspace.isIntact(), true);
}

{
  // A path into the player's own main panel: the one panel is both drawn into and kept, and hiding
  // it by name answers both. This is the case that used to fall back to rebuilding it.
  const page = makePage();
  const player = page.panels["mTabResource"];
  const workspace = workspaceFor(page).open({
    keep: "mTabResource",
    scratch: "mTabResource",
  });
  assert.notEqual(workspace, undefined);

  const scratch = page.dom.getElementById("mTabResource");
  assert.notEqual(scratch, player);
  assert.equal(player.isConnected, true, "the player's panel is never moved");
  assert.deepEqual(player.children, [page.content], "or emptied");
  assert.equal(page.dom.getElementById("resTrade"), null);

  workspace.release();
  assert.equal(page.dom.getElementById("mTabResource"), player);
  assert.equal(page.dom.getElementById("resTrade"), page.content);
  assert.equal(workspace.isIntact(), true);
}

{
  // Order is preserved: the scratch leaves, the panels stay where they were.
  const page = makePage();
  const before = page.dom.body.children.map((item) => item.id);
  const wrapper = page.panels["mTabCivil"].parentNode;
  const workspace = workspaceFor(page).open({
    keep: "mTabCivil",
    scratch: "mTabResearch",
  });
  workspace.release();
  assert.deepEqual(
    page.dom.body.children.map((item) => item.id),
    before,
  );
  assert.equal(page.panels["mTabCivil"].parentNode, wrapper);
}

{
  // Release is idempotent.
  const page = makePage();
  const workspace = workspaceFor(page).open({
    keep: "mTabResource",
    scratch: "mTabResearch",
  });
  workspace.release();
  workspace.release();
  assert.equal(
    page.dom.getElementById("mTabResource"),
    page.panels["mTabResource"],
  );
  assert.equal(
    page.dom.getElementById("mTabResearch"),
    page.panels["mTabResearch"],
  );
}

// --- the open tooltip ---------------------------------------------------------------------------

{
  // The game clears the open tooltip as soon as its anchor stops resolving, so an anchor inside a
  // hidden panel gets a stand-in for the length of the pass — parked last, so a draw that redraws
  // the same row still finds its own copy first.
  const page = makePage();
  const tooltip = page.dom.element("popper");
  tooltip.setAttribute("data-id", "resQueue");
  page.dom.body.append(tooltip);

  const workspace = workspaceFor(page).open({
    keep: "mTabResource",
    scratch: "mTabResearch",
  });
  const standIn = page.dom.getElementById("resQueue");
  assert.notEqual(standIn, null, "the anchor id still answers");
  assert.notEqual(standIn, page.row);
  assert.equal(standIn.parentNode, page.dom.body);
  assert.equal(
    page.dom.body.children.at(-1),
    standIn,
    "and answers last, behind anything the draw builds",
  );

  workspace.release();
  assert.equal(page.dom.getElementById("resQueue"), page.row);
  assert.equal(page.dom.body.children.includes(standIn), false);
}

{
  // An anchor that is not in a hidden panel needs no stand-in.
  const page = makePage();
  const tooltip = page.dom.element("popper");
  tooltip.setAttribute("data-id", "mTabCivic");
  page.dom.body.append(tooltip);
  const workspace = workspaceFor(page).open({
    keep: "mTabResource",
    scratch: "mTabResearch",
  });
  assert.equal(page.dom.getElementById("mTabCivic"), page.panels["mTabCivic"]);
  assert.equal(page.dom.body.children.at(-1), tooltip);
  workspace.release();
}

{
  // No tooltip shown, and a tooltip with no anchor stamp: nothing to stand in for.
  const page = makePage();
  const tooltip = page.dom.element("popper");
  page.dom.body.append(tooltip);
  const workspace = workspaceFor(page).open({
    keep: "mTabResource",
    scratch: "mTabResearch",
  });
  assert.equal(page.dom.body.children.at(-1), tooltip);
  workspace.release();
  assert.equal(page.dom.getElementById("resQueue"), page.row);
}

// --- discarding what the draw fills but nobody reads ------------------------------------------

{
  const page = makePage();
  const workspace = workspaceFor(page).open({
    keep: "mTabResource",
    scratch: "mTabResearch",
  });
  const scratch = page.dom.getElementById("mTabResearch");
  const container = page.dom.element("oldTech");
  scratch.append(container);

  assert.equal(workspace.discard("oldTech"), true);
  assert.equal(page.dom.getElementById("oldTech"), null);
  // Nothing to discard twice, and nothing that was never there.
  assert.equal(workspace.discard("oldTech"), false);
  assert.equal(workspace.discard("nothing"), false);

  // Anything outside the draw's own container belongs to the player and is refused.
  assert.equal(workspace.discard("mTabCivic"), false);
  assert.equal(page.panels["mTabCivic"].isConnected, true);

  workspace.release();
  assert.equal(
    workspace.discard("mTabCivic"),
    false,
    "and nothing after release",
  );
  assert.equal(page.dom.getElementById("mTabCivic"), page.panels["mTabCivic"]);
}

// --- when a workspace cannot be opened whole ---------------------------------------------------

{
  const page = makePage();
  const workspace = workspaceFor(page);
  // A panel that is not in the document is not one this can protect.
  assert.equal(
    workspace.open({ keep: "mTabGone", scratch: "mTabResearch" }),
    undefined,
  );
  assert.equal(
    workspace.open({ keep: "mTabResource", scratch: "mTabGone" }),
    undefined,
  );
  // Refused whole: nothing was renamed and nothing was inserted.
  assert.equal(
    page.dom.getElementById("mTabResource"),
    page.panels["mTabResource"],
  );
  assert.equal(
    page.dom.getElementById("mTabResearch"),
    page.panels["mTabResearch"],
  );
  assert.equal(page.dom.getElementById("resTrade"), page.content);
}

{
  // Nothing to keep is a workspace too: the draw still gets its disposable container.
  const page = makePage();
  const workspace = workspaceFor(page).open({ scratch: "mTabResearch" });
  assert.notEqual(workspace, undefined);
  assert.notEqual(
    page.dom.getElementById("mTabResearch"),
    page.panels["mTabResearch"],
  );
  workspace.release();
  assert.equal(
    page.dom.getElementById("mTabResearch"),
    page.panels["mTabResearch"],
  );
}

{
  // Something else moved the scratch while the draw was running: the workspace says so rather than
  // reporting a restore it did not manage.
  const page = makePage();
  const workspace = workspaceFor(page).open({
    keep: "mTabResource",
    scratch: "mTabResearch",
  });
  page.dom.getElementById("mTabResearch").remove();
  assert.equal(workspace.isIntact(), false);
  workspace.release();
}

{
  // And if the player's panel itself is torn out from under the pass, that is not intact either.
  const page = makePage();
  const workspace = workspaceFor(page).open({
    keep: "mTabResource",
    scratch: "mTabResearch",
  });
  page.panels["mTabResource"].remove();
  assert.equal(workspace.isIntact(), false);
  workspace.release();
}

console.log("game-panel-workspace ok");
