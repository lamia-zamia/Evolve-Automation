import { isRecord } from "../validation.ts";

/**
 * The typeahead the settings inputs use, on plain DOM.
 *
 * This replaces jQuery UI's `.autocomplete()`. It keeps that widget's handler contract, because
 * the call sites depend on it: a handler runs with `this` set to the input, receives an event it
 * can `preventDefault()` to own the input's value itself, and receives a `ui` whose `item` it may
 * overwrite to resolve text the user typed rather than picked. jQuery UI's `delay` is gone — both
 * call sites passed 0 — and the menu keeps jQuery UI's class names so the script's own CSS for
 * `.ui-autocomplete` still styles it.
 */

/** One suggestion: what the menu shows and what the caller stores. */
export interface AutocompleteItem {
  label: string;
  value: unknown;
}

/** The suggestion a handler is called about. Handlers may replace it. */
export interface AutocompleteUi {
  item: AutocompleteItem | null;
}

export interface AutocompleteEvent {
  preventDefault(): void;
}

/** The input a handler runs against. */
export interface AutocompleteInput {
  value: string;
}

type AutocompleteHandler = (
  this: AutocompleteInput,
  event: AutocompleteEvent,
  ui: AutocompleteUi,
) => void;

export interface AutocompleteOptions {
  /** How many characters must be typed before suggestions are requested. */
  readonly minLength: number;
  readonly source: (
    request: { term: string },
    response: (items: AutocompleteItem[]) => void,
  ) => void;
  /** The user picked an item, by click or by Enter. */
  readonly select?: AutocompleteHandler;
  /** The user moved onto an item with the arrow keys. */
  readonly focus?: AutocompleteHandler;
  /** The input lost focus after its text changed, with no item picked. */
  readonly change?: AutocompleteHandler;
}

export interface AutocompleteDependencies {
  readonly getDocument: () => Document;
}

const ACTIVE_CLASS = "ui-state-active";

/** The input elements this widget can drive, whatever wrapper the call site holds it in. */
function readInput(target: unknown): HTMLInputElement | null {
  if (!isRecord(target)) return null;
  if (typeof target["value"] !== "string") return null;
  if (typeof target["addEventListener"] !== "function") return null;
  if (typeof target["getBoundingClientRect"] !== "function") return null;
  return target as unknown as HTMLInputElement;
}

export function createAutocomplete({ getDocument }: AutocompleteDependencies) {
  /** jQuery UI's `$.ui.autocomplete.escapeRegex`, which the sources use to build their matcher. */
  function escapeRegex(term: string): string {
    return String(term).replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
  }

  function attach(target: unknown, options: AutocompleteOptions): void {
    const found = readInput(target);
    if (found === null) return;
    const input: HTMLInputElement = found;
    const document = getDocument();

    let menu: HTMLUListElement | null = null;
    let items: AutocompleteItem[] = [];
    let activeIndex = -1;
    // jQuery UI fires `change` only when the text actually changed while focused. Without this
    // guard every blur would rewrite the setting from the unchanged text.
    let valueAtFocus = input.value;

    function close(): void {
      menu?.remove();
      menu = null;
      items = [];
      activeIndex = -1;
    }

    /** Run a handler the way jQuery UI did, and apply the default action it did not prevent. */
    function fire(
      handler: AutocompleteHandler | undefined,
      item: AutocompleteItem | null,
    ): void {
      if (handler === undefined) return;
      let prevented = false;
      const event: AutocompleteEvent = {
        preventDefault() {
          prevented = true;
        },
      };
      const ui: AutocompleteUi = { item };
      Reflect.apply(handler, input, [event, ui]);
      if (!prevented && ui.item !== null) input.value = ui.item.label;
    }

    function setActive(index: number): void {
      const children = menu?.children;
      if (children === undefined) return;
      children[activeIndex]?.classList.remove(ACTIVE_CLASS);
      activeIndex = index;
      children[activeIndex]?.classList.add(ACTIVE_CLASS);
    }

    function choose(index: number): void {
      const item = items[index];
      if (item === undefined) return;
      close();
      valueAtFocus = input.value;
      fire(options.select, item);
    }

    function open(suggestions: AutocompleteItem[]): void {
      close();
      if (suggestions.length === 0) return;
      items = suggestions;

      const list = document.createElement("ul");
      list.className = "ui-autocomplete";
      suggestions.forEach((item, index) => {
        const entry = document.createElement("li");
        entry.className = "ui-menu-item";
        entry.textContent = item.label;
        // mousedown, not click: a click would blur the input first and close the menu.
        entry.addEventListener("mousedown", (event) => {
          event.preventDefault();
          choose(index);
        });
        list.appendChild(entry);
      });

      const view = document.defaultView;
      const rect = input.getBoundingClientRect();
      list.style.left = `${rect.left + (view?.scrollX ?? 0)}px`;
      list.style.top = `${rect.bottom + (view?.scrollY ?? 0)}px`;
      list.style.width = `${rect.width}px`;
      document.body.appendChild(list);
      menu = list;
    }

    function search(): void {
      const term = input.value;
      if (term.length < options.minLength) {
        close();
        return;
      }
      options.source({ term }, open);
    }

    input.addEventListener("focus", () => {
      valueAtFocus = input.value;
    });

    input.addEventListener("input", search);

    input.addEventListener("keydown", (event) => {
      if (menu === null) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        const next = (activeIndex + step + items.length) % items.length;
        setActive(next);
        const item = items[next];
        if (item !== undefined) fire(options.focus, item);
      } else if (event.key === "Enter") {
        if (activeIndex >= 0) {
          event.preventDefault();
          choose(activeIndex);
        }
      } else if (event.key === "Escape") {
        close();
      }
    });

    input.addEventListener("blur", () => {
      close();
      if (input.value === valueAtFocus) return;
      valueAtFocus = input.value;
      fire(options.change, null);
    });
  }

  return Object.freeze({ attach, escapeRegex });
}

/** The typeahead the settings inputs are handed. */
export type Autocomplete = ReturnType<typeof createAutocomplete>;
