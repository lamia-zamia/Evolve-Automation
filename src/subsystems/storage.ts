import type { SubsystemDependencies } from "./types.ts";

type Dependencies = SubsystemDependencies<
  | "getStorageManager"
  | "getGame"
  | "getSettings"
  | "getState"
  | "getResources"
  | "getWindow"
  | "getBuildingManager"
  | "getProjectManager"
  | "getFleetManagerOuter"
  | "expandStorage"
>;
export function createAutoStorage({ getStorageManager, getGame, getSettings, getState, getResources, getWindow, getBuildingManager, getProjectManager, getFleetManagerOuter, expandStorage }: Dependencies) {
  return function autoStorage() {
    const StorageManager = getStorageManager();
    const game = getGame();
    const settings = getSettings();
    const state = getState();
    const resources = getResources();
    const window = getWindow();
    const BuildingManager = getBuildingManager();
    const ProjectManager = getProjectManager();
    const FleetManagerOuter = getFleetManagerOuter();
    let m = StorageManager;
    const dbg = window.storageDebug ?? false;
    if (!m.initStorage()) {
      return;
    }

    if (m.crateValue <= 0 || m.containerValue <= 0) {
      // Shouldn't ever happen, but better check than sorry. Trying to adjust storages thinking that crates are worthless could end pretty bad.
      return;
    }

    let storageList = m.priorityList.filter(
      (r) => r.isUnlocked() && r.isManagedStorage(),
    );
    if (storageList.length === 0) {
      return;
    }

    // Init base storage and multipliers
    let totalCrates = resources.Crates.currentQuantity;
    let totalContainers = resources.Containers.currentQuantity;
    let storageAdjustments = {},
      resMods = {},
      resCurrent = {},
      resOverflow = {},
      resMin = {},
      resRequired = {};
    for (let resource of storageList) {
      let res = resource.id;

      if (!settings.storageAssignExtra) {
        resMods[res] = 1;
      } else {
        let sellAllowed =
          !game.global.race["no_trade"] &&
          settings.autoMarket &&
          resource.autoSellEnabled &&
          resource.autoSellRatio > 0;
        resMods[res] = sellAllowed ? 1.03 / resource.autoSellRatio : 1.03;
      }

      if (resource.storeOverflow) {
        resOverflow[res] = resource.currentQuantity * 1.03;
      }
      resRequired[res] = resource.storageRequired;
      resCurrent[res] = resource.currentQuantity;
      resMin[res] = resource.minStorage;

      storageAdjustments[res] = {
        crate: 0,
        container: 0,
        amount:
          resource.maxQuantity -
          (resource.currentCrates * m.crateValue +
            resource.currentContainers * m.containerValue),
      };
      totalCrates += resource.currentCrates;
      totalContainers += resource.currentContainers;
    }

    let buildingsList = [];
    let storageEntries = storageList.map((res) => [res.id, []]);
    const addList = (list) => {
      let resGroups = Object.fromEntries(storageEntries);
      list.forEach((obj) =>
        storageList.find(
          (res) => obj.cost[res.id] && resGroups[res.id].push(obj),
        ),
      );
      Object.entries(resGroups).forEach(([res, list]) =>
        list.sort((a, b) => b.cost[res] - a.cost[res]),
      );
      buildingsList.push(...Object.values(resGroups).flat());
    };

    // TODO: Configurable priority?
    if (settings.storageSafeReassign) {
      addList([
        {
          cost: resCurrent,
          isList: true,
          _dbgLabel: "safeReassign(currentQty)",
        },
      ]);
    }
    addList([{ cost: resMin, isList: true, _dbgLabel: "minStorage" }]);
    addList([
      {
        cost: resOverflow,
        isList: true,
        _dbgLabel: "overflow(currentQty*1.03)",
      },
    ]);
    addList(state.queuedTargetsAll);
    addList(state.triggerTargets);
    if (
      settings.autoFleet &&
      FleetManagerOuter.nextShipExpandable &&
      settings.prioritizeOuterFleet !== "ignore"
    ) {
      addList([{ cost: FleetManagerOuter.nextShipCost }]);
    }
    addList(state.unlockedTechs);
    addList(
      ProjectManager.priorityList.filter(
        (b) => b.isUnlocked() && b.autoBuildEnabled,
      ),
    );
    addList(
      BuildingManager.priorityList.filter(
        (p) => p.isUnlocked() && p.autoBuildEnabled,
      ),
    );
    if (settings.storageAssignPart) {
      addList([
        { cost: resRequired, isList: true, _dbgLabel: "storageRequired" },
      ]);
    }

    let storageToBuild = 0;
    // Track which item drove each resource's allocation (for debug logging)
    let dbgAllocDriver = {};
    // Calculate required storages
    nextBuilding: for (let item of buildingsList) {
      let currentAssign = {};
      let remainingCrates = totalCrates;
      let remainingContainers = totalContainers;

      for (let res in item.cost) {
        let resource = resources[res];
        let quantity = item.cost[res];
        let mod = item.isList ? 1 : resMods[res];

        if (!storageAdjustments[res]) {
          if (resource.maxQuantity >= quantity) {
            // Non-expandable, storage met - we're good
            continue;
          } else {
            // Non-expandable, storage not met - ignore building
            continue nextBuilding;
          }
        } else if (storageAdjustments[res].amount >= quantity * mod) {
          // Expandable, storage met - we're good
          continue;
        }
        if (
          !item.isList &&
          resource.maxStorage >= 0 &&
          resource.maxStorage < quantity * mod
        ) {
          continue nextBuilding;
        }
        // Expandable, storage not met - try to assign
        let missingStorage =
          Math.min(
            resource.maxStorage >= 0
              ? resource.maxStorage
              : Number.MAX_SAFE_INTEGER,
            quantity * mod,
          ) - storageAdjustments[res].amount;
        let availableStorage =
          remainingCrates * m.crateValue +
          remainingContainers * m.containerValue;
        if (item.isList || missingStorage <= availableStorage) {
          currentAssign[res] = { crate: 0, container: 0 };
          if (missingStorage > 0 && remainingCrates > 0) {
            let assignCrates = Math.min(
              Math.ceil(missingStorage / m.crateValue),
              remainingCrates,
            );
            remainingCrates -= assignCrates;
            missingStorage -= assignCrates * m.crateValue;
            currentAssign[res].crate = assignCrates;
          }
          if (missingStorage > 0 && remainingContainers > 0) {
            let assignContainer = Math.min(
              Math.ceil(missingStorage / m.containerValue),
              remainingContainers,
            );
            remainingContainers -= assignContainer;
            missingStorage -= assignContainer * m.containerValue;
            currentAssign[res].container = assignContainer;
          }
          if (missingStorage > 0) {
            storageToBuild = Math.max(storageToBuild, missingStorage);
          }
        } else {
          storageToBuild = Math.max(
            storageToBuild,
            missingStorage - availableStorage,
          );
          continue nextBuilding;
        }
      }
      // Building as affordable, record used storage
      for (let id in currentAssign) {
        if (
          dbg &&
          (currentAssign[id].crate > 0 || currentAssign[id].container > 0)
        ) {
          let label =
            item._dbgLabel ??
            item._originalName ??
            item.name ??
            item.actionId ??
            "?";
          dbgAllocDriver[id] = `${label} (qty=${
            item.cost[id]?.toFixed?.(1) ?? item.cost[id]
          }, missing≈${(item.cost[id] - storageAdjustments[id].amount).toFixed(
            1,
          )})`;
        }
        storageAdjustments[id].crate += currentAssign[id].crate;
        storageAdjustments[id].container += currentAssign[id].container;
        storageAdjustments[id].amount +=
          currentAssign[id].crate * m.crateValue +
          currentAssign[id].container * m.containerValue;
      }
      totalCrates = remainingCrates;
      totalContainers = remainingContainers;
    }

    // Missing storage, try to build more
    if (storageToBuild > 0 && expandStorage(storageToBuild)) {
      // Stop if we bought something, we'll continue in next tick, after re-calculation of required storage
      return;
    }

    // Anti-flicker debounce on the final crate/container counts.
    //
    // The desired count is recomputed from scratch every tick from `missing = requirement - base`,
    // and `base` (building-provided storage) jitters tick-to-tick, so Math.ceil(missing/value)
    // chatters between two adjacent values N and N+1. We suppress that without blocking real change:
    //
    //   - A change only applies once `desired` has stayed on the SAME side of the current
    //     allocation for STORAGE_DEBOUNCE_TICKS consecutive ticks.
    //   - When `desired === current`, the counter RESETS. In an A<->B oscillation, every other
    //     tick `desired` equals the held value, so the counter never reaches the threshold ->
    //     the allocation freezes at a safe value. A persistent (genuine) need is never
    //     interrupted by a reset, so it still applies after a few ticks.
    const STORAGE_DEBOUNCE_TICKS = 3;
    const debounceField = (map, id, desired, current) => {
      let d = map[id] ?? (map[id] = {});

      // Oscillation lock. The residual flicker is a feedback loop: the building-provided
      // `base` storage itself depends on the current crate count (a crate adds slightly
      // MORE capacity than the script's crateValue accounts for), so being at N crates
      // makes the algorithm want N-1, and being at N-1 makes it want N — a self-sustaining
      // ±1 chatter a plain debounce can only slow, never stop. Once we see a change that
      // reverts the previous one, we pin the HIGHER (requirement-meeting) value and only
      // release on a genuine change: the need grew to >= locked, or dropped to <= locked-2
      // (beyond the 1-unit chatter band).
      if (d.locked !== undefined) {
        if (desired >= d.locked || desired <= d.locked - 2) {
          delete d.locked; // genuine change -> stop holding
        } else {
          return d.locked; // within chatter band -> hold the safe value
        }
      }

      if (desired === current) {
        d.dir = 0;
        d.ticks = 0;
        return desired;
      }

      let dir = desired > current ? 1 : -1;
      if (d.dir === dir) {
        d.ticks++;
      } else {
        d.dir = dir;
        d.ticks = 1;
      }
      if (d.ticks < STORAGE_DEBOUNCE_TICKS) {
        return current;
      } // not sustained yet
      d.dir = 0;
      d.ticks = 0;

      if (d.prev === desired) {
        // This change would undo the previous one -> it's the chatter loop. Lock high.
        d.locked = Math.max(current, desired);
        return d.locked;
      }
      d.prev = current; // remember the value we're leaving
      return desired;
    };
    for (let id in storageAdjustments) {
      let resource = resources[id];
      let adj = storageAdjustments[id];
      adj.crate = debounceField(
        m._crateDebounce,
        id,
        adj.crate,
        resource.currentCrates,
      );
      adj.container = debounceField(
        m._containerDebounce,
        id,
        adj.container,
        resource.currentContainers,
      );
    }

    // Debug logging — enable with: window.storageDebug = true
    // Runs AFTER debounce, so it reports only changes actually being applied this tick.
    // If the flicker is fixed, this stays quiet.
    if (dbg) {
      for (let id in storageAdjustments) {
        let resource = resources[id];
        let adj = storageAdjustments[id];
        let dCrate = adj.crate - resource.currentCrates;
        let dCon = adj.container - resource.currentContainers;
        if (dCrate !== 0 || dCon !== 0) {
          let baseStorage =
            resource.maxQuantity -
            (resource.currentCrates * m.crateValue +
              resource.currentContainers * m.containerValue);
          console.log(
            `[storage] ${id}: crates ${resource.currentCrates}→${adj.crate} (Δ${
              dCrate >= 0 ? "+" : ""
            }${dCrate}), ` +
              `containers ${resource.currentContainers}→${adj.container} (Δ${
                dCon >= 0 ? "+" : ""
              }${dCon}) | ` +
              `currentQty=${resource.currentQuantity.toFixed(
                1,
              )}, base=${baseStorage.toFixed(1)}, ` +
              `storageRequired=${
                resource.storageRequired?.toFixed?.(1) ??
                resource.storageRequired
              }, ` +
              `driver=${dbgAllocDriver[id] ?? "none"}`,
          );
        }
      }
    }

    // Go to clicking, unassign first
    for (let id in storageAdjustments) {
      let resource = resources[id];
      let crateDelta = storageAdjustments[id].crate - resource.currentCrates;
      let containerDelta =
        storageAdjustments[id].container - resource.currentContainers;
      if (crateDelta < 0) {
        m.unassignCrate(resource, crateDelta * -1);
        resource.maxQuantity += crateDelta * m.crateValue;
        resources.Crates.currentQuantity -= crateDelta;
      }
      if (containerDelta < 0) {
        m.unassignContainer(resource, containerDelta * -1);
        resource.maxQuantity += containerDelta * m.containerValue;
        resources.Containers.currentQuantity -= containerDelta;
      }
    }
    for (let id in storageAdjustments) {
      let resource = resources[id];
      let crateDelta = storageAdjustments[id].crate - resource.currentCrates;
      let containerDelta =
        storageAdjustments[id].container - resource.currentContainers;
      if (crateDelta > 0) {
        m.assignCrate(resource, crateDelta);
        resource.maxQuantity += crateDelta * m.crateValue;
        resources.Crates.currentQuantity += crateDelta;
      }
      if (containerDelta > 0) {
        m.assignContainer(resource, containerDelta);
        resource.maxQuantity += containerDelta * m.containerValue;
        resources.Containers.currentQuantity += containerDelta;
      }
    }
  }
}
