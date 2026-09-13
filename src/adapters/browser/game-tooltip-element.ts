/**
 * How the game names the tooltip it is showing.
 *
 * `popover()` keeps exactly one `#popper` element and stamps the id of the control it describes on
 * it as `data-id`. Both halves are read back by the game itself — `clearPopper(id)` compares the
 * stamp, and `runPanelClear` clears the tooltip as soon as `#<stamp>` stops resolving — so anything
 * here that has to reason about the open tooltip reads these names rather than restating them.
 */

/** The element the game shows the open tooltip in. */
export const GAME_TOOLTIP_ID = "popper";

/** The same element as a selector, for the readers that query rather than look up by id. */
export const GAME_TOOLTIP_SELECTOR = `#${GAME_TOOLTIP_ID}`;

/** The attribute carrying the element id of the control the open tooltip describes. */
export const GAME_TOOLTIP_ANCHOR_ATTRIBUTE = "data-id";
