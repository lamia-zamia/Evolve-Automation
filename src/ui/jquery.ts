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

export interface JQueryNode {
  addClass(className: string): JQueryNode;
  append(content: unknown): JQueryNode;
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
  prop(name: string, value: unknown): JQueryNode;
  removeClass(className: string): JQueryNode;
  sortable(
    option: string | Record<string, unknown>,
    value?: unknown,
  ): JQueryNode | string[];
  text(value: unknown): JQueryNode;
  val(value: unknown): JQueryNode;
}

export interface JQuery {
  (target: string | JQueryNode): JQueryNode;
  readonly ui: { readonly autocomplete: { escapeRegex(term: string): string } };
}
