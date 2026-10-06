/**
 * Non-project values that share the `arpa` namespace.
 *
 * In DeadSpace `src/arpa.js`, `sequence` holds genetics controls and `m_type` holds the selected
 * monument type on `game.arpa`; neither is in `arpaProjects`. The Genetics draw also binds
 * `#arpaSequence`, so its parsed `Sequence` id must not be treated as a project binding.
 *
 * The same module owns the element id shape the Physics panel binds each offered project to
 * (`<div id="arpa${project}" class="arpaProject">`), because that id is also the build queue entry
 * id and the stored-condition operand for the same project.
 */

const NON_PROJECT_ARPA_IDS = Object.freeze(["sequence", "m_type", "Sequence"]);

const ARPA_ELEMENT_PREFIX = "arpa";

export function isBuildableArpaProjectId(projectId: string): boolean {
  return (
    projectId.length > 0 &&
    !NON_PROJECT_ARPA_IDS.some((key) => key === projectId)
  );
}

/** The panel binding, queue entry, and condition operand for one project. */
export function arpaProjectElementId(projectId: string): string {
  return `${ARPA_ELEMENT_PREFIX}${projectId}`;
}

/** The project an `arpa`-prefixed binding names, or `undefined` for any other element id. */
export function arpaProjectIdFromElementId(
  elementId: string,
): string | undefined {
  return elementId.startsWith(ARPA_ELEMENT_PREFIX)
    ? elementId.slice(ARPA_ELEMENT_PREFIX.length)
    : undefined;
}
