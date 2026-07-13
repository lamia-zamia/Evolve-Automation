import type { SubsystemDependencies } from "./types.ts";

type Dependencies = SubsystemDependencies<
  | "getState"
  | "getGetCostConflict"
  | "getBuildingManager"
  | "getProjectManager"
>;
export function createAutoResearch({ getState, getGetCostConflict, getBuildingManager, getProjectManager }: Dependencies) {
  return function autoResearch() {
    const state = getState();
    const getCostConflict = getGetCostConflict();
    const BuildingManager = getBuildingManager();
    const ProjectManager = getProjectManager();
    for (let tech of state.unlockedTechs) {
      if (tech.isAffordable() && !getCostConflict(tech) && tech.click()) {
        BuildingManager.updateBuildings(); // Cache cost if we just unlocked some building
        ProjectManager.updateProjects();
        return;
      }
    }
  }
}
