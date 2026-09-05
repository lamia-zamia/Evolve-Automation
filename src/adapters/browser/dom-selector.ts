/**
 * The selector dialect the script's DOM helper answers: CSS, plus the two jQuery extensions the
 * call sites still depend on.
 *
 * - `:eq(n)` picks one element out of the matches so far by position. It is not a CSS selector and
 *   cannot be handed to `querySelectorAll`, so a selector containing it is evaluated in stages.
 * - `:visible` keeps only elements that occupy layout, which is how the script tests whether a
 *   panel it rendered is currently on screen.
 *
 * Anything else is passed to the browser untouched, so ordinary selectors cost one native call.
 */

/** A node a search can start from: the document, an element, or a parsed fragment. */
export type DomQueryRoot = Document | Element | DocumentFragment;

/** Matches the first jQuery extension in a selector, capturing an `:eq(n)` index when it is one. */
const EXTENSION_PATTERN = /:(?:eq\((\d+)\)|visible)/;

/**
 * jQuery's `:visible`: the element generates at least one layout box. An element inside a
 * `display: none` ancestor has no boxes, which is what the script is really asking about.
 */
export function isVisible(element: Element): boolean {
  const box = element as HTMLElement;
  return Boolean(
    box.offsetWidth || box.offsetHeight || element.getClientRects().length,
  );
}

function isElement(node: Node): node is Element {
  return node.nodeType === 1;
}

/**
 * Narrows a set of roots by one plain-CSS chunk. An empty chunk narrows nothing, which is what a
 * selector that starts or ends with an extension needs.
 */
function search(roots: readonly DomQueryRoot[], chunk: string): Element[] {
  const selector = chunk.trim();
  if (selector === "") {
    return roots.filter(isElement);
  }
  // A chunk that follows an extension starts with a combinator (`>div`), which only means
  // "relative to the root" once `:scope` names that root.
  const scoped = /^[>+~]/.test(selector) ? `:scope ${selector}` : selector;
  const found = new Set<Element>();
  for (const root of roots) {
    for (const element of root.querySelectorAll(scoped)) found.add(element);
  }
  return [...found];
}

/**
 * Resolves `selector` against `roots`, in stages wherever a jQuery extension appears. Each stage
 * narrows by the CSS chunk before the extension and then applies the extension to that result, so
 * `td:eq(1)>*:first-child` means "the second `td`, then its first child element".
 */
export function queryAll(
  roots: readonly DomQueryRoot[],
  selector: string,
): Element[] {
  let current: DomQueryRoot[] = [...roots];
  let rest = selector;
  for (;;) {
    const extension = EXTENSION_PATTERN.exec(rest);
    if (extension === null) break;
    const matched = search(current, rest.slice(0, extension.index));
    rest = rest.slice(extension.index + extension[0].length);
    const index = extension[1];
    if (index === undefined) {
      current = matched.filter(isVisible);
      continue;
    }
    const picked = matched[Number(index)];
    current = picked === undefined ? [] : [picked];
  }
  return search(current, rest);
}

/**
 * `element.matches`, extended with `:visible`.
 *
 * Positional `:eq(n)` is deliberately not accepted: it describes a position in a match set and has
 * no meaning against a single element. Every call site that uses it is a query, not a predicate.
 */
export function matchesSelector(element: Element, selector: string): boolean {
  const trimmed = selector.trim();
  if (!trimmed.includes(":visible")) return element.matches(trimmed);
  if (!isVisible(element)) return false;
  const remaining = trimmed.replaceAll(":visible", "").trim();
  return remaining === "" || element.matches(remaining);
}
