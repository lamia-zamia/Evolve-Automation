/**
 * The script's own DOM helper: the slice of jQuery the settings UI and the game-facing controls
 * actually use, on native DOM.
 *
 * This exists so the userscript stops `@require`ing jQuery. Upstream took the same route for the
 * game itself at 1.5.0 — a `DomList` class plus a `$()` factory — and for the same reason: the call
 * sites are numerous and uninteresting, while the library behind them is small. Only the methods
 * the script calls are implemented; an unused jQuery method is a method whose corner cases nobody
 * would be checking.
 *
 * Deliberate departures from jQuery, all of them narrowings:
 *
 * - `$("<html>")` keeps only the elements it parses, not the whitespace text nodes between them.
 * - `.data(key)` returns the `data-*` attribute as a string. jQuery coerces `"12"` to a number; both
 *   call sites read ids they then match as text, so coercion would only be a way to get it wrong.
 * - `.off("*")` removes every handler this helper registered on the element. jQuery reads `"*"` as
 *   an event type literally named `*` and so removes nothing; the twenty call sites that pass it
 *   plainly mean the wildcard.
 * - `.click()` with no handler clicks the element rather than replaying registered handlers, which
 *   is what reaches the game: at 1.5.0 its listeners are native, so only a real event runs them.
 */

import { isRecord, readProperty } from "../validation.ts";
import { isVisible, matchesSelector, queryAll } from "./dom-selector.ts";

/** Anything that can be inserted: markup, a node, another list, or several of those. */
export type DomContent = unknown;

type DomEventHandler = (this: Element, event: Event) => void;

/** One handler this helper registered, kept so `.off()` can take it back off. */
interface HandlerRecord {
  readonly type: string;
  readonly selector: string | null;
  readonly listener: EventListener;
}

interface DomContext {
  readonly document: Document;
  readonly listeners: WeakMap<Element, HandlerRecord[]>;
  /** Defers the ready callback, the way jQuery hands it to the next turn rather than running it inline. */
  readonly schedule: (callback: () => void) => void;
}

export interface DomDependencies {
  readonly getDocument: () => Document;
  readonly schedule: (callback: () => void) => void;
}

function isNode(value: unknown): value is Node {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Node).nodeType === "number"
  );
}

function parseHtml(document: Document, markup: string): Element[] {
  const template = document.createElement("template");
  template.innerHTML = markup.trim();
  return [...template.content.childNodes].filter(
    (node): node is Element => node.nodeType === 1,
  );
}

function looksLikeMarkup(value: string): boolean {
  return value.trimStart().startsWith("<");
}

/** The nodes `content` stands for, ready to be inserted. */
function toNodes(context: DomContext, content: DomContent): Node[] {
  if (content === null || content === undefined) return [];
  if (content instanceof DomList) return [...content.elements];
  if (isNode(content)) return [content];
  if (Array.isArray(content)) {
    return content.flatMap((item: unknown) => toNodes(context, item));
  }
  const text = String(content);
  return looksLikeMarkup(text)
    ? parseHtml(context.document, text)
    : [context.document.createTextNode(text)];
}

/**
 * A set of elements, with the chainable operations the script performs on one.
 *
 * Every operation that narrows the set records where it came from, so `.end()` can walk back — the
 * one piece of jQuery state that is not derivable from the elements themselves.
 */
export class DomList {
  [index: number]: Element | undefined;

  readonly length: number;

  /** @internal The matched elements, in document order. */
  readonly elements: readonly Element[];

  private readonly context: DomContext;
  private readonly previous: DomList | null;

  constructor(
    context: DomContext,
    elements: readonly Element[],
    previous: DomList | null = null,
  ) {
    this.context = context;
    this.elements = elements;
    this.previous = previous;
    this.length = elements.length;
    elements.forEach((element, index) => {
      this[index] = element;
    });
  }

  private derive(elements: readonly Element[]): DomList {
    return new DomList(this.context, elements, this);
  }

  private get first_(): Element | undefined {
    return this.elements[0];
  }

  // --- iteration and narrowing -------------------------------------------------------------

  each(
    callback: (this: Element, index: number, element: Element) => void,
  ): DomList {
    this.elements.forEach((element, index) => {
      callback.call(element, index, element);
    });
    return this;
  }

  eq(index: number): DomList {
    const element =
      this.elements[index < 0 ? this.elements.length + index : index];
    return this.derive(element === undefined ? [] : [element]);
  }

  first(): DomList {
    return this.eq(0);
  }

  last(): DomList {
    return this.eq(-1);
  }

  filter(
    test: string | ((index: number, element: Element) => boolean),
  ): DomList {
    const keep =
      typeof test === "string"
        ? (_index: number, element: Element) => matchesSelector(element, test)
        : test;
    return this.derive(
      this.elements.filter((element, index) => keep(index, element)),
    );
  }

  find(selector: string): DomList {
    return this.derive(queryAll(this.elements, selector));
  }

  children(selector?: string): DomList {
    const found = this.elements.flatMap((element) => [...element.children]);
    return this.derive(
      selector === undefined
        ? found
        : found.filter((child) => matchesSelector(child, selector)),
    );
  }

  parent(): DomList {
    const found = new Set<Element>();
    for (const element of this.elements) {
      const parent = element.parentElement;
      if (parent !== null) found.add(parent);
    }
    return this.derive([...found]);
  }

  closest(selector: string): DomList {
    const found = new Set<Element>();
    for (const element of this.elements) {
      const match = element.closest(selector);
      if (match !== null) found.add(match);
    }
    return this.derive([...found]);
  }

  next(): DomList {
    const found: Element[] = [];
    for (const element of this.elements) {
      const sibling = element.nextElementSibling;
      if (sibling !== null) found.push(sibling);
    }
    return this.derive(found);
  }

  end(): DomList {
    return this.previous ?? this.derive([]);
  }

  is(selector: string): boolean {
    return this.elements.some((element) => matchesSelector(element, selector));
  }

  // --- classes, attributes, and properties -------------------------------------------------

  addClass(className: string): DomList {
    for (const element of this.elements) element.classList.add(className);
    return this;
  }

  removeClass(className: string): DomList {
    for (const element of this.elements) element.classList.remove(className);
    return this;
  }

  toggleClass(className: string, state?: boolean): DomList {
    for (const element of this.elements) {
      element.classList.toggle(className, state);
    }
    return this;
  }

  hasClass(className: string): boolean {
    return this.elements.some((element) =>
      element.classList.contains(className),
    );
  }

  attr(name: string): string | undefined;
  attr(name: string, value: unknown): DomList;
  attr(name: string, value?: unknown): string | undefined | DomList {
    if (value === undefined) {
      return this.first_?.getAttribute(name) ?? undefined;
    }
    for (const element of this.elements) {
      element.setAttribute(name, String(value));
    }
    return this;
  }

  prop(name: string): unknown;
  prop(name: string, value: unknown): DomList;
  prop(name: string, value?: unknown): unknown {
    if (value === undefined) {
      const element = this.first_;
      return element === undefined
        ? undefined
        : (element as unknown as Record<string, unknown>)[name];
    }
    for (const element of this.elements) {
      (element as unknown as Record<string, unknown>)[name] = value;
    }
    return this;
  }

  /**
   * The `data-*` attribute, as text. See the module comment: jQuery's type coercion is deliberately
   * not reproduced.
   */
  data(key: string): string | undefined {
    return this.first_?.getAttribute(`data-${key}`) ?? undefined;
  }

  val(): string;
  val(value: unknown): DomList;
  val(value?: unknown): string | DomList {
    if (value === undefined) {
      const element = this.first_ as HTMLInputElement | undefined;
      return element?.value ?? "";
    }
    for (const element of this.elements) {
      (element as HTMLInputElement).value = String(value);
    }
    return this;
  }

  text(): string;
  text(value: unknown): DomList;
  text(value?: unknown): string | DomList {
    if (value === undefined) return this.first_?.textContent ?? "";
    for (const element of this.elements) element.textContent = String(value);
    return this;
  }

  html(): string;
  html(value: unknown): DomList;
  html(value?: unknown): string | DomList {
    if (value === undefined) return this.first_?.innerHTML ?? "";
    for (const element of this.elements) element.innerHTML = String(value);
    return this;
  }

  css(property: string, value: unknown): DomList {
    for (const element of this.elements) {
      (element as HTMLElement).style.setProperty(
        property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`),
        String(value),
      );
    }
    return this;
  }

  width(): number;
  width(value: unknown): DomList;
  width(value?: unknown): number | DomList {
    if (value === undefined) {
      return (this.first_ as HTMLElement | undefined)?.offsetWidth ?? 0;
    }
    return this.css("width", value);
  }

  outerHeight(): number {
    return (this.first_ as HTMLElement | undefined)?.offsetHeight ?? 0;
  }

  // --- visibility --------------------------------------------------------------------------

  show(): DomList {
    for (const element of this.elements) {
      const style = (element as HTMLElement).style;
      if (style.display === "none") style.display = "";
    }
    return this;
  }

  hide(): DomList {
    for (const element of this.elements) {
      (element as HTMLElement).style.display = "none";
    }
    return this;
  }

  toggle(state?: boolean): DomList {
    if (state !== undefined) return state ? this.show() : this.hide();
    for (const element of this.elements) {
      const single = this.derive([element]);
      if (isVisible(element)) single.hide();
      else single.show();
    }
    return this;
  }

  // --- insertion and removal -----------------------------------------------------------------

  append(content: DomContent): DomList {
    const nodes = toNodes(this.context, content);
    for (const element of this.elements) {
      for (const node of nodes) element.append(node);
    }
    return this;
  }

  prepend(content: DomContent): DomList {
    const nodes = toNodes(this.context, content);
    for (const element of this.elements) {
      element.prepend(...nodes);
    }
    return this;
  }

  before(content: DomContent): DomList {
    const nodes = toNodes(this.context, content);
    for (const element of this.elements) element.before(...nodes);
    return this;
  }

  after(content: DomContent): DomList {
    const nodes = toNodes(this.context, content);
    for (const element of this.elements) element.after(...nodes);
    return this;
  }

  appendTo(target: DomContent): DomList {
    for (const node of toNodes(this.context, target)) {
      for (const element of this.elements) node.appendChild(element);
    }
    return this;
  }

  insertBefore(target: DomContent): DomList {
    for (const node of toNodes(this.context, target)) {
      for (const element of this.elements) {
        (node as Element).before(element);
      }
    }
    return this;
  }

  insertAfter(target: DomContent): DomList {
    for (const node of toNodes(this.context, target)) {
      for (const element of this.elements) {
        (node as Element).after(element);
      }
    }
    return this;
  }

  empty(): DomList {
    for (const element of this.elements) element.replaceChildren();
    return this;
  }

  remove(): DomList {
    for (const element of this.elements) element.remove();
    return this;
  }

  // --- events ------------------------------------------------------------------------------

  /**
   * `on(types, handler)`, `on(types, selector, handler)` for delegation, and `on(types, data,
   * handler)`, which hands `data` back to the handler as `event.data`.
   */
  on(types: string, second: unknown, third?: unknown): DomList {
    const selector = typeof second === "string" ? second : null;
    const handler = (typeof third === "function" ? third : second) as
      DomEventHandler | undefined;
    if (typeof handler !== "function") return this;
    const data = selector === null && third !== undefined ? second : undefined;

    for (const type of types.trim().split(/\s+/)) {
      if (type === "") continue;
      for (const element of this.elements) {
        const listener: EventListener = (event) => {
          if (data !== undefined) Object.assign(event, { data });
          if (selector === null) {
            handler.call(element, event);
            return;
          }
          const candidates = queryAll([element], selector);
          let node = event.target as Node | null;
          while (node !== null && node !== element) {
            if (node.nodeType === 1 && candidates.includes(node as Element)) {
              handler.call(node as Element, event);
              return;
            }
            node = node.parentNode;
          }
        };
        element.addEventListener(type, listener);
        const records = this.context.listeners.get(element) ?? [];
        records.push({ type, selector, listener });
        this.context.listeners.set(element, records);
      }
    }
    return this;
  }

  /** Removes handlers this helper registered. `"*"` removes all of them; see the module comment. */
  off(types: string): DomList {
    const wanted = types.trim().split(/\s+/);
    const all = wanted.includes("*");
    for (const element of this.elements) {
      const records = this.context.listeners.get(element);
      if (records === undefined) continue;
      const kept = records.filter((record) => {
        if (!all && !wanted.includes(record.type)) return true;
        element.removeEventListener(record.type, record.listener);
        return false;
      });
      this.context.listeners.set(element, kept);
    }
    return this;
  }

  click(handler?: DomEventHandler): DomList {
    if (handler !== undefined) return this.on("click", handler);
    for (const element of this.elements) {
      const clickable = element as Partial<HTMLElement>;
      if (typeof clickable.click === "function") clickable.click();
    }
    return this;
  }

  ready(callback: () => void): DomList {
    if (this.context.document.readyState === "loading") {
      this.context.document.addEventListener(
        "DOMContentLoaded",
        () => callback(),
        { once: true },
      );
    } else {
      this.context.schedule(callback);
    }
    return this;
  }
}

export interface DomQuery {
  (target?: unknown): DomList;
}

/**
 * Builds the script's `$`. The listener registry lives in this closure, so a second helper is a
 * second, independent one rather than a shared module-level store.
 */
export function createDomQuery(dependencies: DomDependencies): DomQuery {
  const context: DomContext = {
    document: dependencies.getDocument(),
    listeners: new WeakMap<Element, HandlerRecord[]>(),
    schedule: dependencies.schedule,
  };

  return (target?: unknown): DomList => {
    if (target === null || target === undefined) {
      return new DomList(context, []);
    }
    if (target instanceof DomList) return target;
    if (isNode(target)) {
      return new DomList(
        context,
        target.nodeType === 1 ? [target as Element] : [],
      );
    }
    if (typeof target === "string") {
      return new DomList(
        context,
        looksLikeMarkup(target)
          ? parseHtml(context.document, target)
          : queryAll([context.document], target),
      );
    }
    if (Array.isArray(target)) {
      return new DomList(
        context,
        target.filter(
          (item): item is Element => isNode(item) && item.nodeType === 1,
        ),
      );
    }
    return new DomList(context, []);
  };
}

/**
 * The page's helper, from whatever global object the userscript is running against. This is the one
 * place the script reaches for `document`; everything else takes the `$` it returns.
 */
export function createBrowserDomQuery(globalObject: unknown): DomQuery {
  const documentValue = readProperty(globalObject, "document");
  if (!isRecord(documentValue)) {
    throw new Error("The page has no document");
  }
  const setTimeoutValue = readProperty(globalObject, "setTimeout");
  const schedule =
    typeof setTimeoutValue === "function"
      ? (callback: () => void): void => {
          Reflect.apply(setTimeoutValue, globalObject, [callback, 0]);
        }
      : (callback: () => void): void => {
          callback();
        };
  return createDomQuery({
    getDocument: () => documentValue as unknown as Document,
    schedule,
  });
}
