import assert from "node:assert/strict";

import { createCustomRacePresetEditor } from "../src/ui/custom-race-ui.ts";

class Node {
  constructor(selector = "") {
    this.selector = selector;
    this.value = "";
    this.textContent = "";
    this.html = "";
    this.children = [];
    this.events = new Map();
    this.nodes = new Map();
  }
  append(content) {
    if (content instanceof Node) this.children.push(content);
    else this.html += String(content);
    if (this === modal) {
      for (const selector of selectors)
        this.nodes.set(selector, new Node(selector));
    }
    return this;
  }
  appendTo(target) {
    target.append(this);
    return this;
  }
  empty() {
    this.children = [];
    this.value = "";
    this.textContent = "";
    this.html = "";
    return this;
  }
  find(selector) {
    if (!this.nodes.has(selector)) this.nodes.set(selector, new Node(selector));
    return this.nodes.get(selector);
  }
  off() {
    this.events.clear();
    return this;
  }
  on(event, handler) {
    this.events.set(event, handler);
    return this;
  }
  text(value) {
    this.textContent = value;
    return this;
  }
  val(value) {
    if (value === undefined) return this.value;
    this.value = String(value);
    return this;
  }
  trigger(event, value = this.value) {
    const handler = this.events.get(event);
    if (handler) handler.call({ value }, { type: event });
  }
}

const selectors = [
  ".script-custom-race-preset-list",
  ".script-custom-race-preset-name",
  ".script-custom-race-preset-json",
  ".script-custom-race-preset-status",
  ".script-custom-race-preset-add",
  ".script-custom-race-preset-clone",
  ".script-custom-race-preset-delete",
  ".script-custom-race-capture-race0",
  ".script-custom-race-capture-race1",
];
const modal = new Node("modal");
const $ = (selector) => new Node(selector);
const settings = {
  prestigeCustomRacePreset: "0",
  prestigeCustomRacePresets: [
    { name: "General", json: '{"name":"A"}' },
    { name: "Cataclysm", json: '{"name":"B"}' },
  ],
};
let saves = 0;
let refreshes = 0;
const editor = createCustomRacePresetEditor({
  getJQuery: () => $,
  getSettingsRaw: () => settings,
  persist: () => saves++,
  customRaceLab: {
    readSavedRaceJson: (slot) =>
      slot === "race0" ? '{"name":"Saved","traitlist":[]}' : undefined,
  },
  onSettingsChanged: () => refreshes++,
});

editor.buildCustomRacePresetEditor(modal);
const find = (selector) => modal.find(selector);
assert.match(modal.html, /game's Export control in the Ascension Lab/);
assert.equal(find(".script-custom-race-preset-list").children.length, 2);
assert.equal(find(".script-custom-race-preset-name").val(), "General");

find(".script-custom-race-preset-add").trigger("click");
assert.equal(settings.prestigeCustomRacePresets.length, 3);
assert.equal(settings.prestigeCustomRacePreset, "2");
assert.equal(find(".script-custom-race-preset-name").val(), "Preset 3");

find(".script-custom-race-preset-name")
  .val("Manual race")
  .trigger("change", "Manual race");
find(".script-custom-race-preset-json")
  .val('{"traitlist":[]}')
  .trigger("change", '{"traitlist":[]}');
assert.equal(settings.prestigeCustomRacePresets[2].name, "Manual race");
assert.equal(settings.prestigeCustomRacePresets[2].json, '{"traitlist":[]}');

find(".script-custom-race-preset-clone").trigger("click");
assert.equal(settings.prestigeCustomRacePresets.length, 4);
assert.equal(settings.prestigeCustomRacePreset, "3");
assert.equal(settings.prestigeCustomRacePresets[3].name, "Manual race copy");
assert.equal(settings.prestigeCustomRacePresets[3].json, '{"traitlist":[]}');

find(".script-custom-race-capture-race0").trigger("click");
assert.deepEqual(JSON.parse(settings.prestigeCustomRacePresets[3].json), {
  name: "Saved",
  traitlist: [],
});
assert.equal(
  find(".script-custom-race-preset-status").textContent,
  "Saved race copied into this preset.",
);

find(".script-custom-race-preset-delete").trigger("click");
assert.equal(settings.prestigeCustomRacePresets.length, 3);
assert.equal(settings.prestigeCustomRacePreset, "0");
assert.ok(saves >= 5);
assert.ok(refreshes >= 5);

editor.buildCustomRacePresetEditor(modal);
find(".script-custom-race-preset-list").trigger("change", "1");
assert.equal(settings.prestigeCustomRacePreset, "1");

console.log("Custom race preset editor checks passed");
