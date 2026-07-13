import type { AutomationDependencies } from "../dependencies.ts";

type Dependencies = AutomationDependencies<
  | "getReplicatorManager"
  | "getSettings"
  | "getResources"
  | "getGame"
  | "getGovernor"
  | "haveTech"
  | "getVueById"
>;
export function createAutoReplicator({
  getReplicatorManager,
  getSettings,
  getResources,
  getGame,
  getGovernor,
  haveTech,
  getVueById,
}: Dependencies) {
  return function autoReplicator() {
    const ReplicatorManager = getReplicatorManager();
    const settings = getSettings();
    const resources = getResources();
    const game = getGame();
    // No replicator; no auto autoreplicator
    if (!ReplicatorManager.initIndustry()) {
      return;
    }

    let allProducts = Object.values(ReplicatorManager.Productions) as any[];

    // Sort groups by priorities
    let priorityGroups = {};
    for (let i = 0; i < allProducts.length; i++) {
      let production = allProducts[i];
      if (production.unlocked && production.enabled) {
        if (production.weighting > 0) {
          let priority = production.resource.isDemanded()
            ? Math.max(production.priority, 100)
            : production.priority;
          priority *= !production.resource.isUseful() ? 0 : production.priority;
          if (priority !== 0) {
            priorityGroups[priority] = priorityGroups[priority] ?? [];
            priorityGroups[priority].push(production);
          }
        }
      }
    }

    let priorityList = (Object.keys(priorityGroups) as any[])
      .sort((a, b) => b - a)
      .map((key) => priorityGroups[key]);
    if (priorityGroups["-1"] && priorityList.length > 1) {
      priorityList.splice(priorityList.indexOf(priorityGroups["-1"], 1));
      priorityList[0].push(...priorityGroups["-1"]);
    }

    // For some situation where resource A has 100 weighting and resource B has 200 weighting, while both have 1000 quantity,
    // we want to spend 2x as much "time" on resource B in some way.
    // But not all resources take equally long to replicate, and some people may want different behavior.
    //
    // Mass mode: Factor in atomic mass (production time) & 1.4 exotic mass nerf.
    //   A doubled weighting is treated as approximately "spend 2x as much time on this" (based on current quantities).
    //   Actual quantities may vary a lot (eg may have 10x as much Plywood as compared to).
    // Quantity mode: Simple quantity split.
    //   A doubled weighting is treated as approximately "make 2x as much of this".
    // Legacy mode: None of that matters, we only ever make the resource with the highest weighting. Intended for compat with old configs only. May be removed in the future.
    let weightFn;
    switch (settings.replicatorWeightingMode) {
      case "mass":
        weightFn = (production, resource) =>
          production.weighting /
          resource.atomicMass /
          (resource === resources.Elerium || resource === resources.Infernite
            ? 4
            : 1) /
          resource.currentQuantity;
        break;

      case "quantity":
        weightFn = (production, resource) =>
          production.weighting / resource.currentQuantity;
        break;

      case "legacy":
      default:
        weightFn = (production, resource) => production.weighting;
        break;
    }

    // Set the replicator to whatever has the highest priority, roughly multiplied by the weighting
    if (priorityList.length > 0 && priorityList[0].length > 0) {
      let list = priorityList[0].sort(
        (a, b) => weightFn(a, a.resource) - weightFn(b, b.resource),
      );
      let selectedResource =
        settings.replicatorWeightingMode !== "legacy"
          ? list[list.length - 1]
          : list[0];
      ReplicatorManager.setResource(selectedResource.id);
    }

    // Enable matter replicator task

    if (!settings.replicatorAssignGovernorTask) {
      return;
    }

    // Cannot assign if there is no governor, matter replicator has not been reserached, or governor office is not yet rendered
    if (getGovernor() === "none" || !haveTech("replicator")) {
      return;
    }
    const office = getVueById("govOffice");
    if (!office) {
      return;
    }

    var replicatorTaskIndex = Object.values(
      game.global.race.governor.tasks,
    ).findIndex((task) => task === "replicate");

    // If the replicator task is not yet assigned, assign it to the first free slot
    if (replicatorTaskIndex == -1) {
      replicatorTaskIndex = Object.values(
        game.global.race.governor.tasks,
      ).findIndex((task) => task === "none");

      //No free task slots, cannot assign
      if (replicatorTaskIndex == -1) {
        return;
      }

      office.setTask("replicate", replicatorTaskIndex);
    }

    const govSettings = office.c?.replicate;
    if (!govSettings) {
      return;
    }
    let changed = false;
    if (govSettings.pow.on == false) {
      // Enable auto power management
      govSettings.pow.on = true;
      changed = true;
    }
    if (govSettings.res.que) {
      // Disable focus queue
      govSettings.res.que = false;
      changed = true;
    }
    if (govSettings.res.neg) {
      // Disable negative focus
      govSettings.res.neg = false;
      changed = true;
    }
    if (govSettings.res.cap) {
      // Disable switch on cap
      govSettings.res.cap = false;
      changed = true;
    }
    if (govSettings.pow.cap < 1e12) {
      // Set power cap to a very high number
      office.c.replicate.pow.cap = 1e12;
      changed = true;
    }
    if (changed) {
      office.$forceUpdate();
    }
  };
}
