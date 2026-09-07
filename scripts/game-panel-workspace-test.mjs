import assert from "node:assert/strict";

import { createGamePanelWorkspace } from "../src/adapters/browser/game-panel-workspace.ts";

/** Enough of a document to move panels around in: ids, parents, order, containment. */
function makeDocument() {
  function element(id) {
    return {
      id,
      children: [],
      parentNode: null,
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
      replaceChild(node, replaced) {
        const at = this.children.indexOf(replaced);
        if (at < 0)
          throw new Error(`${replaced.id} is not a child of ${this.id}`);
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

  const root = element("root");
  function find(node, id) {
    if (node.id === id) return node;
    for (const child of node.children) {
      const hit = find(child, id);
      if (hit !== null) return hit;
    }
    return null;
  }
  return {
    root,
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
    dom.root.append(wrapper);
    panels[id] = panel;
  }
  // The player's panel has content the game built, and the workspace must not disturb it.
  const content = dom.element("resTrade");
  panels["mTabResource"].append(content);
  return { dom, panels, content };
}

function workspaceFor(page) {
  return createGamePanelWorkspace({ getDocument: () => page.dom });
}

// --- keeping the player's panel and scratching the target ------------------------------------

{
  const page = makePage();
  const player = page.panels["mTabResource"];
  const research = page.panels["mTabResearch"];
  const researchParent = research.parentNode;

  const workspace = workspaceFor(page).open({
    keep: "mTabResource",
    scratch: "mTabResearch",
  });
  assert.notEqual(workspace, undefined);

  // The player's panel is out of the document, so nothing the game looks up can reach it.
  assert.equal(page.dom.getElementById("mTabResource"), null);
  assert.equal(player.parentNode, null);
  assert.equal(page.dom.getElementById("resTrade"), null);
  assert.deepEqual(player.children, [page.content], "and it kept its contents");

  // The target id resolves to a disposable container, not the game's own panel.
  const scratch = page.dom.getElementById("mTabResearch");
  assert.notEqual(scratch, research);
  assert.equal(scratch.parentNode, researchParent);
  assert.equal(research.parentNode, null);
  assert.equal(workspace.isIntact(), true);

  // What the draw produced goes away with the container it went into.
  const drawn = page.dom.element("tech");
  scratch.append(drawn);
  workspace.release();

  assert.equal(page.dom.getElementById("mTabResearch"), research);
  assert.equal(research.parentNode, researchParent);
  assert.equal(page.dom.getElementById("tech"), null);
  // The player's panel is back, as the same object, in the same place, with the same contents.
  assert.equal(page.dom.getElementById("mTabResource"), player);
  assert.equal(page.dom.getElementById("resTrade"), page.content);
  assert.equal(workspace.isIntact(), true);
}

{
  // Order is preserved: the panels come back where they were, not appended at the end.
  const page = makePage();
  const before = page.dom.root.children.map((item) => item.id);
  const wrapper = page.panels["mTabCivil"].parentNode;
  const workspace = workspaceFor(page).open({
    keep: "mTabCivil",
    scratch: "mTabResearch",
  });
  workspace.release();
  assert.deepEqual(
    page.dom.root.children.map((item) => item.id),
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
  assert.equal(workspace.discard("resTrade"), false);
  assert.equal(workspace.discard("mTabCivic"), false);
  assert.equal(page.panels["mTabCivic"].parentNode !== null, true);

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
  // One panel cannot both stand aside and be drawn into.
  assert.equal(
    workspace.open({ keep: "mTabCivil", scratch: "mTabCivil" }),
    undefined,
  );
  // A panel that is not in the document is not one this can protect.
  assert.equal(
    workspace.open({ keep: "mTabGone", scratch: "mTabResearch" }),
    undefined,
  );
  assert.equal(
    workspace.open({ keep: "mTabResource", scratch: "mTabGone" }),
    undefined,
  );
  // Refused whole: nothing was moved.
  assert.equal(
    page.dom.getElementById("mTabResource"),
    page.panels["mTabResource"],
  );
  assert.equal(
    page.dom.getElementById("mTabResearch"),
    page.panels["mTabResearch"],
  );
  assert.equal(page.dom.getElementById("mTabCivil"), page.panels["mTabCivil"]);
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
  // Something else moved the panel while the draw was running: the workspace says so rather than
  // reporting a restore it did not manage.
  const page = makePage();
  const workspace = workspaceFor(page).open({
    keep: "mTabResource",
    scratch: "mTabResearch",
  });
  page.dom.getElementById("mTabResearch").remove();
  assert.equal(workspace.isIntact(), false);
}

console.log("game-panel-workspace ok");
