/**
 * The render lifecycle every script settings section shares: read the page scroll position, replace
 * the section's content node, and put the scroll back. Twenty browser settings adapters were each
 * carrying their own copy of this sequence along with the three narrow DOM types it needs.
 *
 * This is deliberately a lifecycle, not a settings-adapter factory. Feature-specific control
 * rendering stays in the feature adapter and arrives here as one callback.
 */

/** The two scroll positions the lifecycle reads and restores. */
export interface ScrollDocument {
  documentElement: { scrollTop: number };
  body: { scrollTop: number };
}

/**
 * The minimum a section's content node must support to be re-rendered in place. Adapters that also
 * append or query extend this; a richer node satisfies it structurally.
 */
export interface SettingsContentNode {
  empty(): SettingsContentNode;
  off(events: string): SettingsContentNode;
}

export interface SettingsSectionContentTarget<
  TNode extends SettingsContentNode,
> {
  readonly scrollDocument: ScrollDocument;
  readonly jquery: (selector: string) => TNode;
  /**
   * The section's content id. Sections nested under another one prefix it themselves, so this is the
   * whole id rather than a bare feature name.
   */
  readonly sectionId: string;
}

/**
 * Clears `#script_<sectionId>Content`, renders into it, and restores the scroll position the page
 * had before any of that.
 *
 * The restore runs in a `finally`, which the copied versions did not do: a control that throws
 * mid-render used to leave the page wherever clearing the node had scrolled it. The section is
 * already half-rendered in that case, so keeping the player's position is the better of the two
 * outcomes and costs nothing when rendering succeeds.
 */
export function renderSettingsSectionContent<TNode extends SettingsContentNode>(
  { scrollDocument, jquery, sectionId }: SettingsSectionContentTarget<TNode>,
  render: (node: TNode) => void,
): void {
  const scrollPosition =
    scrollDocument.documentElement.scrollTop || scrollDocument.body.scrollTop;
  try {
    const contentNode = jquery(`#script_${sectionId}Content`);
    contentNode.empty().off("*");
    render(contentNode);
  } finally {
    scrollDocument.documentElement.scrollTop = scrollDocument.body.scrollTop =
      scrollPosition;
  }
}
