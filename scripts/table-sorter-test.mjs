import assert from "node:assert/strict";

import { createTableSorter } from "../src/adapters/browser/table-sorter.ts";

function makeRow(id, sortable = true) {
  return {
    getAttribute: (name) => (name === "value" ? id : null),
    matches: () => sortable,
  };
}

const options = {
  items: "tr:not(.unsortable)",
  attribute: "value",
  onOrderChanged: () => {},
};

// A page without SortableJS leaves the table static rather than throwing.
{
  const sorter = createTableSorter({ getSortable: () => undefined });
  assert.doesNotThrow(() => sorter.attach({ children: [] }, options));
}

// The order skips rows the table does not reorder, and rows with no id.
{
  const sorter = createTableSorter({ getSortable: () => undefined });
  const container = {
    children: [
      makeRow("city"),
      makeRow("header", false),
      { getAttribute: () => null, matches: () => true },
      makeRow("transport"),
    ],
  };
  assert.deepEqual(sorter.readOrder(container, options), ["city", "transport"]);
}

// A container that is not an element yields no order rather than throwing.
{
  const sorter = createTableSorter({ getSortable: () => undefined });
  assert.deepEqual(sorter.readOrder(undefined, options), []);
  assert.deepEqual(sorter.readOrder({}, options), []);
}

// Attaching hands SortableJS the item selector and reports the order on update.
{
  const created = [];
  const destroyed = [];
  let existing = null;
  // SortableJS ships as a class, so the page's namespace is a function, not a plain object.
  const factory = Object.assign(class Sortable {}, {
    create(element, sortableOptions) {
      created.push({ element, sortableOptions });
      return { destroy() {} };
    },
    get: () => existing,
  });
  const orders = [];
  const sorter = createTableSorter({ getSortable: () => factory });
  const container = { children: [makeRow("wood"), makeRow("coal")] };

  sorter.attach(container, {
    ...options,
    onOrderChanged: (ids) => orders.push(ids),
  });

  assert.equal(created.length, 1);
  assert.equal(created[0].element, container);
  assert.equal(created[0].sortableOptions.draggable, "tr:not(.unsortable)");

  created[0].sortableOptions.onUpdate();
  assert.deepEqual(orders, [["wood", "coal"]]);

  // Re-rendering the table re-attaches, which must not leave the old instance behind.
  existing = {
    destroy() {
      destroyed.push("old");
    },
  };
  sorter.attach(container, options);
  assert.deepEqual(destroyed, ["old"]);
  assert.equal(created.length, 2);
}
