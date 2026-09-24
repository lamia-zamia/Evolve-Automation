export type {
  AutocompleteEvent,
  AutocompleteItem,
  AutocompleteUi,
} from "../adapters/browser/autocomplete.ts";

/**
 * The jQuery surface the settings UI uses, as narrow structural types.
 *
 * TRANSITIONAL: UI modules keep a jQuery-shaped contract, implemented by the script's own narrow
 * `DomList` helper rather than Evolve's jQuery. Replace that facade module by module as those UIs
 * move to direct DOM ports.
 */

/** The raw element a change handler runs against. */
export interface EditableInput {
  value: string;
  checked: boolean;
}

/** A handler registered with data, as the event hands that data back to it. */
export interface DelegatedEvent<TData> {
  readonly [key: string]: unknown;
  preventDefault(): void;
  readonly data: TData;
}

export interface JQueryNode {
  /** The element itself, which the table sorter attaches to. */
  readonly 0: unknown;
  addClass(className: string): JQueryNode;
  append(content: unknown): JQueryNode;
  appendTo(target: JQueryNode): JQueryNode;
  attr(name: string): string | undefined;
  children(): JQueryNode;
  empty(): JQueryNode;
  end(): JQueryNode;
  eq(index: number): JQueryNode;
  find(selector: string): JQueryNode;
  next(): JQueryNode;
  off(events: string): JQueryNode;
  on(events: string, handler: (this: EditableInput) => void): JQueryNode;
  /** The delegated form: the handler runs against the descendant matching `selector`. */
  on(
    events: string,
    selector: string,
    handler: (this: EditableInput) => void,
  ): JQueryNode;
  /** The data form: the event hands `data` back to the handler. */
  on<TData>(
    events: string,
    data: TData,
    handler: (event: DelegatedEvent<TData>) => void,
  ): JQueryNode;
  prop(name: string, value: unknown): JQueryNode;
  removeClass(className: string): JQueryNode;
  text(value: unknown): JQueryNode;
  toggleClass(className: string, state: boolean): JQueryNode;
  val(value: unknown): JQueryNode;
}

export interface JQuery {
  (target: string | JQueryNode): JQueryNode;
}
