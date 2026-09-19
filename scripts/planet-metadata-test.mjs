/**
 * Reading a generated planet's popover out of a live document.
 *
 * The fixture reproduces what `setPlanet` and `popover` build: a row carrying `.aTitle`, a
 * `mouseover` handler that appends `#popper` with `data-id`, a `mouseout` handler that removes it,
 * and the `set_planet` line plus `.pGeo` rows `planetDesc` renders into it.
 */

import assert from "node:assert/strict";

import { createPlanetMetadataReader } from "../src/adapters/browser/planet-metadata.ts";
import { createTestDocument, element } from "./dom-fixture.mjs";

class TestMouseEvent {
  constructor(type) {
    this.type = type;
  }
}

function textDiv(text) {
  const node = element("div");
  node.textContent = text;
  return node;
}

function geologyRow(text, className) {
  const node = element("div");
  node.classList.add(className);
  node.classList.add("pGeo");
  node.textContent = text;
  return node;
}

function createPage(rows) {
  const root = element("div", { id: "root" });
  const main = element("div", { id: "main" });
  const evolution = element("div", { id: "evolution" });
  root.appendChild(evolution);
  root.appendChild(main);
  const opened = [];

  for (const row of rows) {
    const node = element("div", { id: row.id });
    node.classList.add("action");
    const title = element("span");
    title.classList.add("aTitle");
    title.textContent = row.title;
    node.appendChild(title);
    evolution.appendChild(node);

    node.addEventListener("mouseover", () => {
      // The game clears any existing popper before building the new one.
      for (const stale of root.querySelectorAll("#popper")) stale.remove();
      const popper = element("div", { id: "popper" });
      popper.setAttribute("data-id", row.id);
      popper.appendChild(textDiv(row.summary));
      popper.appendChild(textDiv("A description of the biome."));
      for (const geo of row.geology ?? []) popper.appendChild(geo);
      main.appendChild(popper);
      opened.push(row.id);
    });
    node.addEventListener("mouseout", () => {
      for (const stale of root.querySelectorAll("#popper")) stale.remove();
    });
  }

  const document = createTestDocument(root);
  return {
    root,
    opened,
    reader: createPlanetMetadataReader({
      getDocument: () => document,
      getMouseEventConstructor: () => TestMouseEvent,
    }),
  };
}

// --- the popover is opened, read, and closed again ----------------------------------------------

{
  const page = createPage([
    {
      id: "Volcanic4821",
      title: "Toxic Dense Volcanic 4821",
      summary:
        "Toxic Dense Volcanic 4821 is a Volcanic planet with an orbital period of 412 days.",
      geology: [
        geologyRow("Copper: +18%", "has-text-advanced"),
        geologyRow("Iron: Malus", "has-text-caution"),
      ],
    },
  ]);

  const detail = page.reader.readPlanetDetail("Volcanic4821");
  assert.deepEqual(detail, {
    elementId: "Volcanic4821",
    title: "Toxic Dense Volcanic 4821",
    summary:
      "Toxic Dense Volcanic 4821 is a Volcanic planet with an orbital period of 412 days.",
    geology: [
      { label: "Copper", beneficial: true, percent: 18 },
      { label: "Iron", beneficial: false, percent: undefined },
    ],
  });
  assert.deepEqual(page.opened, ["Volcanic4821"]);
  assert.equal(
    page.root.querySelectorAll("#popper").length,
    0,
    "the popover must be closed again, not left on screen",
  );
}

// --- a row that is not there, and a row whose popover never opens -------------------------------

{
  const page = createPage([
    { id: "Eden7", title: "Eden 7", summary: "Eden 7 is a planet." },
  ]);
  assert.equal(page.reader.readPlanetDetail("Missing1"), undefined);

  const quiet = createPage([]);
  const root = quiet.root.querySelectorAll("#evolution")[0];
  const node = element("div", { id: "Desert3" });
  const title = element("span");
  title.classList.add("aTitle");
  title.textContent = "Desert 3";
  node.appendChild(title);
  root.appendChild(node);
  assert.equal(
    quiet.reader.readPlanetDetail("Desert3"),
    undefined,
    "no popover means no metadata, not empty metadata",
  );
}

// --- a popover left over from another row is not read as this one's ------------------------------

{
  const page = createPage([
    { id: "Eden7", title: "Eden 7", summary: "Eden 7 is a planet." },
  ]);
  const main = page.root.querySelectorAll("#main")[0];
  const foreign = element("div", { id: "popper" });
  foreign.setAttribute("data-id", "Desert3");
  foreign.appendChild(textDiv("Desert 3 is a planet."));
  main.appendChild(foreign);
  // The row's own handler replaces it, so this reads Eden7 — the guard matters when a row has no
  // handler at all, which the previous case covers. Assert the stamp is honoured either way.
  const detail = page.reader.readPlanetDetail("Eden7");
  assert.equal(detail.elementId, "Eden7");
  assert.equal(detail.summary, "Eden 7 is a planet.");
}

// --- one unreadable deposit refuses the whole planet ---------------------------------------------

{
  const page = createPage([
    {
      id: "Forest9",
      title: "Forest 9",
      summary:
        "Forest 9 is a Forest planet with an orbital period of 300 days.",
      // No sign class: the row says nothing about whether the deposit helps or hurts.
      geology: [
        geologyRow("Copper: +18%", "has-text-advanced"),
        (() => {
          const node = element("div");
          node.classList.add("pGeo");
          node.textContent = "Iron: Malus";
          return node;
        })(),
      ],
    },
  ]);
  assert.equal(page.reader.readPlanetDetail("Forest9"), undefined);
}

console.log("planet metadata reader checks passed");
