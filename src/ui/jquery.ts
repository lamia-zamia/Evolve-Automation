/**
 * The jQuery surface the settings UI uses, as narrow structural types.
 *
 * TRANSITIONAL: the implementation is the game's jQuery today. Keeping the contract this small is
 * what lets the DOM implementation be replaced without touching the controls that use it.
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

/** One suggestion of an autocomplete input: what it shows and what it stores. */
export interface AutocompleteItem {
  label: string;
  value: unknown;
}

export interface AutocompleteUi {
  item: AutocompleteItem | null;
}

export interface AutocompleteEvent {
  preventDefault(): void;
}

export interface JQueryNode {
  addClass(className: string): JQueryNode;
  append(content: unknown): JQueryNode;
  appendTo(target: JQueryNode): JQueryNode;
  attr(name: string): string | undefined;
  autocomplete(options: Record<string, unknown>): JQueryNode;
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
  sortable(
    option: string | Record<string, unknown>,
    value?: unknown,
  ): JQueryNode | string[];
  text(value: unknown): JQueryNode;
  toggleClass(className: string, state: boolean): JQueryNode;
  val(value: unknown): JQueryNode;
}

export interface JQuery {
  (target: string | JQueryNode): JQueryNode;
  readonly ui: { readonly autocomplete: { escapeRegex(term: string): string } };
}
