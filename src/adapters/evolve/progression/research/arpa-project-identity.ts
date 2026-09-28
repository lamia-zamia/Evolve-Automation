/**
 * Keys stored beside project records on `game.arpa` that are not project ids.
 * `sequence` holds the genetics controls and `m_type` holds the selected monument type in
 * DeadSpace `src/arpa.js`; neither appears in the game's `arpaProjects` catalog.
 */

const NON_PROJECT_ARPA_KEYS = Object.freeze(["sequence", "m_type"]);

export function isBuildableArpaProjectId(projectId: string): boolean {
  return (
    projectId.length > 0 &&
    !NON_PROJECT_ARPA_KEYS.some((key) => key === projectId)
  );
}
