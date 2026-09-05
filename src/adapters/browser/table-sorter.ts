import { isRecord } from "../validation.ts";

/**
 * Drag-to-reorder for the script's priority tables, on the SortableJS the game page already loads.
 *
 * This replaces jQuery UI's `.sortable()`. jQuery UI dragged a detached clone, which is why the
 * old call sites had to pass a `helper` that copied each cell's measured width onto the clone;
 * SortableJS drags the row itself, so no helper is needed and none is accepted here.
 */

/** One reorderable row. It carries the id the table reports in its order attribute. */
interface SortableRow {
  getAttribute(name: string): string | null;
  matches(selector: string): boolean;
}

export interface TableSorterOptions {
  /** Which child rows may be dragged, as a CSS selector. */
  readonly items: string;
  /** The attribute each row carries its id in. */
  readonly attribute: string;
  /** Called with the new row order once a drag has changed it. */
  readonly onOrderChanged: (ids: string[]) => void;
}

export interface TableSorterDependencies {
  /** The page's SortableJS namespace, or anything else if the page has not loaded it. */
  readonly getSortable: () => unknown;
}

/**
 * SortableJS is published as a class, so its namespace is a function rather than a plain object and
 * `isRecord` rejects it. Read members off either shape.
 */
function readMembers(value: unknown): Record<string, unknown> | null {
  if (value === null) return null;
  if (typeof value !== "object" && typeof value !== "function") return null;
  return value as Record<string, unknown>;
}

function readRows(container: unknown): SortableRow[] {
  if (!isRecord(container)) return [];
  const children = container["children"];
  if (!isRecord(children)) return [];
  const length = children["length"];
  if (typeof length !== "number") return [];
  const rows: SortableRow[] = [];
  for (let index = 0; index < length; index += 1) {
    const row = children[index];
    if (
      isRecord(row) &&
      typeof row["getAttribute"] === "function" &&
      typeof row["matches"] === "function"
    ) {
      rows.push(row as unknown as SortableRow);
    }
  }
  return rows;
}

export function createTableSorter({ getSortable }: TableSorterDependencies) {
  /** The row order as ids, in DOM order, skipping rows the table does not reorder. */
  function readOrder(
    container: unknown,
    options: TableSorterOptions,
  ): string[] {
    const ids: string[] = [];
    for (const row of readRows(container)) {
      if (!row.matches(options.items)) continue;
      const id = row.getAttribute(options.attribute);
      if (id !== null) ids.push(id);
    }
    return ids;
  }

  /**
   * Make `container`'s rows draggable. Tables are re-rendered in place and re-attached, so any
   * instance SortableJS still holds for this element is destroyed first.
   */
  function attach(container: unknown, options: TableSorterOptions): void {
    const factory = readMembers(getSortable());
    if (factory === null) return;
    const create = factory["create"];
    const get = factory["get"];
    if (typeof create !== "function" || typeof get !== "function") return;
    if (!isRecord(container)) return;

    const existing = readMembers(Reflect.apply(get, factory, [container]));
    if (existing !== null && typeof existing["destroy"] === "function") {
      Reflect.apply(existing["destroy"], existing, []);
    }

    Reflect.apply(create, factory, [
      container,
      {
        draggable: options.items,
        // onUpdate fires only when the drag actually changed the order, which is the contract
        // the call sites had from jQuery UI's `update`. onEnd would also fire for a no-op drag.
        onUpdate: () => {
          options.onOrderChanged(readOrder(container, options));
        },
      },
    ]);
  }

  return Object.freeze({ attach, readOrder });
}

/** The sorter the settings tables are handed. */
export type TableSorter = ReturnType<typeof createTableSorter>;
