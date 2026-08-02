import assert from "node:assert/strict";

import { renderSettingsSectionContent } from "../src/adapters/browser/settings-section.ts";

let trace = [];

function makeDocument(documentElementTop, bodyTop) {
  return {
    documentElement: {
      get scrollTop() {
        trace.push(`read:documentElement:${documentElementTop}`);
        return documentElementTop;
      },
      set scrollTop(value) {
        trace.push(`write:documentElement:${value}`);
      },
    },
    body: {
      get scrollTop() {
        trace.push(`read:body:${bodyTop}`);
        return bodyTop;
      },
      set scrollTop(value) {
        trace.push(`write:body:${value}`);
      },
    },
  };
}

function makeJQuery(selectedNodes) {
  return (selector) => {
    const node = {
      selector,
      empty() {
        trace.push(`empty:${selector}`);
        return this;
      },
      off(events) {
        trace.push(`off:${events}`);
        return this;
      },
    };
    selectedNodes.push(node);
    return node;
  };
}

// The whole sequence, in order: read the scroll, select and clear the section's content node,
// render into that node, then restore both scroll positions.
{
  trace = [];
  const nodes = [];
  let rendered;
  renderSettingsSectionContent(
    {
      scrollDocument: makeDocument(0, 18),
      jquery: makeJQuery(nodes),
      sectionId: "authority",
    },
    (node) => {
      trace.push("render");
      rendered = node;
    },
  );

  assert.deepEqual(trace, [
    "read:documentElement:0",
    "read:body:18",
    "empty:#script_authorityContent",
    "off:*",
    "render",
    "write:body:18",
    "write:documentElement:18",
  ]);
  assert.equal(nodes.length, 1);
  assert.equal(rendered, nodes[0], "renders into the node it selected");
}

// A non-zero documentElement position wins and the body is never read, which is what the `||` in the
// copied implementations meant.
{
  trace = [];
  renderSettingsSectionContent(
    {
      scrollDocument: makeDocument(33, 6),
      jquery: makeJQuery([]),
      sectionId: "stateLog",
    },
    () => {},
  );

  assert.deepEqual(trace, [
    "read:documentElement:33",
    "empty:#script_stateLogContent",
    "off:*",
    "write:body:33",
    "write:documentElement:33",
  ]);
}

// A section nested under another one passes its whole prefixed id rather than a bare feature name.
{
  trace = [];
  renderSettingsSectionContent(
    {
      scrollDocument: makeDocument(0, 0),
      jquery: makeJQuery([]),
      sectionId: "prestigeAchievementGuard",
    },
    () => {},
  );

  assert.ok(trace.includes("empty:#script_prestigeAchievementGuardContent"));
}

// Deliberate improvement over the copied implementations: a control that throws mid-render used to
// leave the page wherever clearing the node had scrolled it. The restore now runs in a `finally`,
// and the error still reaches the caller.
{
  trace = [];
  const failure = new Error("control render failed");
  assert.throws(
    () =>
      renderSettingsSectionContent(
        {
          scrollDocument: makeDocument(0, 42),
          jquery: makeJQuery([]),
          sectionId: "challengeHelper",
        },
        () => {
          trace.push("render");
          throw failure;
        },
      ),
    (error) => error === failure,
  );

  assert.deepEqual(trace, [
    "read:documentElement:0",
    "read:body:42",
    "empty:#script_challengeHelperContent",
    "off:*",
    "render",
    "write:body:42",
    "write:documentElement:42",
  ]);
}

// A selection that throws is covered too: nothing has scrolled yet, so restoring is a no-op that
// costs one assignment rather than a special case.
{
  trace = [];
  const failure = new Error("no such section");
  assert.throws(
    () =>
      renderSettingsSectionContent(
        {
          scrollDocument: makeDocument(7, 0),
          jquery: () => {
            throw failure;
          },
          sectionId: "missing",
        },
        () => {
          throw new Error("render must not run");
        },
      ),
    (error) => error === failure,
  );

  assert.deepEqual(trace, [
    "read:documentElement:7",
    "write:body:7",
    "write:documentElement:7",
  ]);
}

console.log("Settings section render lifecycle tests passed");
