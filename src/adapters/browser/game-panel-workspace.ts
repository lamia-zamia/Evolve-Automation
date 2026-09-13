/**
 * The document half of a discovery draw: gives the draw a disposable container to fill, and puts the
 * panels it must not touch out of the game's reach without taking them out of the page.
 *
 * Nothing is detached, and that is the whole design. A subtree removed from the document loses the
 * browser's hover state — Chrome drops `:hover` for everything inside it and does not restore it
 * when the node comes back — and the game clears the open tooltip itself as soon as its anchor stops
 * resolving (`runPanelClear`). Re-inserting the very same node is therefore not invisible: at the
 * discovery rate it reads as buttons that flicker under the cursor and tooltips that disappear
 * while they are being read. Redrawing the player's panel instead is worse: the content the redraw
 * produces is not part of any Vue template, so the re-mounted panel can come back empty.
 *
 * So a workspace hides a panel by *name* instead. Every panel the game clears or draws into, it
 * finds by id — `clearTabPanels` keys on `#mTabCivil`, `drawCity` appends to `#city`, and each
 * teardown helper looks up `#grid<type>`, `#resQueue`, `#geneticMinor`, `#spyopConfig<gov>` — so a
 * panel whose ids are aliased for the length of the draw is a panel the draw cannot find, while its
 * nodes stay exactly where they were: same elements, same Vue instances, same listeners, same drag
 * handlers, same hover state, same scroll position. The scratch container then carries the target
 * panel's real id, so the game resolves it the ordinary way and everything the draw produces is
 * dropped by removing one node.
 *
 * Two details make that safe. The scratch is inserted beside the panel it stands in for, so it is
 * already inside the hidden tab item the game would have drawn into, and it is absolutely
 * positioned off-screen and `visibility: hidden` rather than `display: none`, which leaves the
 * draw free to measure what it builds. And one id a hidden panel must keep answering for is the
 * open tooltip's anchor: a stand-in carrying that id is parked at the end of the document for the
 * length of the pass, so the game's own anchor check still finds something and leaves the player's
 * tooltip alone. It is last in document order, so a draw that happens to redraw the same row still
 * binds to its own copy.
 */

import type {
  GamePanelWorkspace,
  PanelWorkspace,
  PanelWorkspaceRequest,
} from "../../ports/game-panel-workspace.ts";
import {
  GAME_TOOLTIP_ANCHOR_ATTRIBUTE,
  GAME_TOOLTIP_ID,
} from "./game-tooltip-element.ts";

/** What an id is prefixed with while its panel is hidden from the game's lookups. */
const ALIAS_PREFIX = "ea-aside-";

/**
 * Out of the page's flow and out of sight, but still laid out: the game's draw is allowed to measure
 * what it builds, which `display: none` would answer with zeroes.
 */
const ASIDE_STYLE =
  "position:absolute;left:-100000px;top:0;visibility:hidden;pointer-events:none";

/** The subset of a document node this adapter touches. */
interface WorkspaceNode {
  readonly parentNode: WorkspaceParent | null;
}

interface WorkspaceParent {
  insertBefore(node: unknown, before: unknown): unknown;
}

interface WorkspaceElement extends WorkspaceNode {
  id: string;
  readonly isConnected: boolean;
  contains(other: unknown): boolean;
  remove(): void;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  querySelectorAll(selector: string): ArrayLike<WorkspaceElement>;
}

interface WorkspaceDocument {
  getElementById(id: string): WorkspaceElement | null;
  createElement(tag: string): WorkspaceElement;
  readonly body: WorkspaceParent | null;
}

export interface GamePanelWorkspaceDependencies {
  readonly getDocument: () => WorkspaceDocument;
}

/** One id the game could otherwise reach, held by identity so it can be put back. */
interface AliasedId {
  readonly element: WorkspaceElement;
  readonly id: string;
}

/** Every id in a subtree, the panel's own included. An element without one has nothing to hide. */
function idsOf(root: WorkspaceElement): AliasedId[] {
  const ids: AliasedId[] =
    root.id === "" ? [] : [{ element: root, id: root.id }];
  const descendants = root.querySelectorAll("[id]");
  for (let index = 0; index < descendants.length; index += 1) {
    const element = descendants[index];
    if (element !== undefined && element.id !== "") {
      ids.push({ element, id: element.id });
    }
  }
  return ids;
}

function alias(ids: readonly AliasedId[]): void {
  for (const entry of ids) entry.element.id = `${ALIAS_PREFIX}${entry.id}`;
}

function restore(ids: readonly AliasedId[]): void {
  for (const entry of ids) entry.element.id = entry.id;
}

function createAside(
  document: WorkspaceDocument,
  id: string,
): WorkspaceElement {
  const element = document.createElement("div");
  element.id = id;
  element.setAttribute("style", ASIDE_STYLE);
  return element;
}

/**
 * A stand-in for the open tooltip's anchor, when that anchor is one of the ids this pass is hiding.
 * Without it the game's own `runPanelClear` sees the anchor gone and tears the player's tooltip
 * down mid-read.
 */
function openTooltipStandIn(
  document: WorkspaceDocument,
  aliased: readonly AliasedId[],
): WorkspaceElement | undefined {
  const tooltip = document.getElementById(GAME_TOOLTIP_ID);
  if (tooltip === null || tooltip === undefined) return undefined;
  const anchorId = tooltip.getAttribute(GAME_TOOLTIP_ANCHOR_ATTRIBUTE);
  if (anchorId === null || anchorId === "") return undefined;
  // An anchor outside the hidden panels still answers for itself.
  if (!aliased.some((entry) => entry.id === anchorId)) return undefined;
  const body = document.body;
  if (body === null || body === undefined) return undefined;
  const standIn = createAside(document, anchorId);
  body.insertBefore(standIn, null);
  return standIn;
}

export function createGamePanelWorkspace({
  getDocument,
}: GamePanelWorkspaceDependencies): GamePanelWorkspace {
  return Object.freeze({
    open(request: Readonly<PanelWorkspaceRequest>): PanelWorkspace | undefined {
      const { keep, scratch: scratchId } = request;
      const document = getDocument();
      const target = document.getElementById(scratchId);
      const parent = target?.parentNode;
      if (
        target === null ||
        target === undefined ||
        parent === null ||
        parent === undefined
      ) {
        return undefined;
      }
      // A path into the player's own main panel names one panel twice: it is both what the draw
      // fills and what must survive it. Hiding it by name answers both at once.
      const kept: WorkspaceElement | undefined =
        keep === undefined
          ? undefined
          : keep === scratchId
            ? target
            : (document.getElementById(keep) ?? undefined);
      if (keep !== undefined && kept === undefined) {
        return undefined;
      }

      // Names first: from here neither panel answers to the id the draw will look for, so the
      // scratch can take the target's own id without two elements claiming it.
      const aliased = [
        ...idsOf(target),
        ...(kept !== undefined && kept !== target ? idsOf(kept) : []),
      ];
      alias(aliased);

      const scratch = createAside(document, scratchId);
      parent.insertBefore(scratch, target);
      const standIn = openTooltipStandIn(document, aliased);

      let released = false;
      return Object.freeze({
        discard(elementId: string): boolean {
          if (released) return false;
          const element = getDocument().getElementById(elementId);
          // Only the draw's own output. Anything outside the scratch panel belongs to the player.
          if (
            element === null ||
            element === undefined ||
            !scratch.contains(element)
          ) {
            return false;
          }
          element.remove();
          return true;
        },
        release(): void {
          if (released) return;
          released = true;
          scratch.remove();
          standIn?.remove();
          restore(aliased);
        },
        isIntact(): boolean {
          const document = getDocument();
          if (released) {
            return (
              document.getElementById(scratchId) === target &&
              (keep === undefined || document.getElementById(keep) === kept)
            );
          }
          return (
            document.getElementById(scratchId) === scratch &&
            target.isConnected &&
            (kept === undefined || kept.isConnected)
          );
        },
      });
    },
  });
}
