/**
 * The document half of a discovery draw: takes the player's panel out of the game's reach and
 * gives the draw a disposable container to fill.
 *
 * Every move is by node identity and restored by the same, so the player's panel comes back as the
 * object it was — same Vue app instances, same drag handlers, same listeners, same scroll position.
 * The scratch container carries the target panel's id because that is how the game finds where to
 * draw; the real panel is standing aside untouched while it does.
 */

import type {
  GamePanelWorkspace,
  PanelWorkspace,
  PanelWorkspaceRequest,
} from "../../ports/game-panel-workspace.ts";

/** The subset of a document node this adapter touches. */
interface WorkspaceNode {
  readonly parentNode: WorkspaceParent | null;
  readonly nextSibling: WorkspaceNode | null;
}

interface WorkspaceParent {
  insertBefore(node: unknown, before: unknown): unknown;
  replaceChild(node: unknown, replaced: unknown): unknown;
}

interface WorkspaceElement extends WorkspaceNode {
  id: string;
  contains(other: unknown): boolean;
  remove(): void;
}

interface WorkspaceDocument {
  getElementById(id: string): WorkspaceElement | null;
  createElement(tag: string): WorkspaceElement;
}

export interface GamePanelWorkspaceDependencies {
  readonly getDocument: () => WorkspaceDocument;
}

interface MovedPanel {
  readonly element: WorkspaceElement;
  readonly parent: WorkspaceParent;
  readonly nextSibling: WorkspaceNode | null;
}

function locate(
  document: WorkspaceDocument,
  id: string,
): MovedPanel | undefined {
  const element = document.getElementById(id);
  const parent = element?.parentNode;
  if (
    element === null ||
    element === undefined ||
    parent === null ||
    parent === undefined
  ) {
    return undefined;
  }
  return { element, parent, nextSibling: element.nextSibling };
}

export function createGamePanelWorkspace({
  getDocument,
}: GamePanelWorkspaceDependencies): GamePanelWorkspace {
  return Object.freeze({
    open(request: Readonly<PanelWorkspaceRequest>): PanelWorkspace | undefined {
      const { keep, scratch: scratchId } = request;
      // One panel cannot both stand aside and be drawn into. The caller draws the ordinary way.
      if (keep !== undefined && keep === scratchId) return undefined;

      const document = getDocument();
      const target = locate(document, scratchId);
      if (target === undefined) return undefined;
      const kept = keep === undefined ? undefined : locate(document, keep);
      if (keep !== undefined && kept === undefined) return undefined;

      const scratch = document.createElement("div");
      scratch.id = scratchId;

      // Out of the document is out of every `document.querySelectorAll` the draw will run, which
      // is the whole of the protection.
      kept?.element.remove();
      target.parent.replaceChild(scratch, target.element);

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
          target.parent.replaceChild(target.element, scratch);
          if (kept !== undefined) {
            kept.parent.insertBefore(kept.element, kept.nextSibling);
          }
        },
        isIntact(): boolean {
          const document = getDocument();
          return released
            ? document.getElementById(scratchId) === target.element &&
                (keep === undefined ||
                  document.getElementById(keep) === kept?.element)
            : document.getElementById(scratchId) === scratch;
        },
      });
    },
  });
}
