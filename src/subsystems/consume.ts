import type { SubsystemDependencies } from "./types.ts";

type Dependencies = SubsystemDependencies<
  | "getResources"
  | "isHungryRace"
>;
export function createAutoConsume({ getResources, isHungryRace }: Dependencies) {
  return function autoConsume(m) {
    const resources = getResources();
    if (!m.initIndustry()) {
      return;
    }

    let consumeList = m.managedPriorityList();
    let consumeAdjustments = Object.fromEntries(
      consumeList.map((res) => [res.id, 0]),
    );

    if (m.isUseful()) {
      let remaining = m.maxConsume();
      for (let consumeRatio of m.useRatio()) {
        for (let resource of consumeList) {
          if (remaining <= 0) {
            break;
          }

          if (!m.resEnabled(resource.id) || resource.isDemanded()) {
            continue;
          }

          let keepRatio = consumeRatio;
          if (keepRatio === -1) {
            // Excess resources
            if (resource.storageRequired <= 1) {
              // Resource not used, can't determine excess
              continue;
            }
            keepRatio = Math.max(
              keepRatio,
              (resource.storageRequired / resource.maxQuantity) *
                m.storageShift,
            );
          }
          if (resource === resources.Food && !isHungryRace()) {
            // Preserve food
            keepRatio = Math.max(keepRatio, 0.25);
          }
          keepRatio = Math.max(
            keepRatio,
            (resource.requestedQuantity / resource.maxQuantity) *
              m.storageShift,
          );

          let allowedConsume = consumeAdjustments[resource.id];
          remaining += consumeAdjustments[resource.id];

          if (resource.isCraftable()) {
            if (
              resource.currentQuantity >
              resource.storageRequired * m.storageShift
            ) {
              let maxConsume = Math.floor(m.maxConsumeCraftable(resource));
              allowedConsume = Math.max(0, allowedConsume, maxConsume);
            }
          } else {
            if (resource.storageRatio > keepRatio + 0.01) {
              let maxConsume = Math.ceil(
                m.maxConsumeForRatio(resource, keepRatio),
              );
              allowedConsume = Math.max(1, allowedConsume, maxConsume);
            } else if (resource.storageRatio > keepRatio) {
              let maxConsume = Math.floor(
                m.maxConsumeForRatio(resource, keepRatio),
              );
              allowedConsume = Math.max(0, allowedConsume, maxConsume);
            } else if (resource.storageRatio >= 0.999 && keepRatio >= 1) {
              let maxConsume = Math.floor(
                m.maxConsumeForRatio(resource, resource.storageRatio),
              );
              allowedConsume = Math.max(0, allowedConsume, maxConsume);
            }
          }

          consumeAdjustments[resource.id] = Math.min(remaining, allowedConsume);
          remaining -= consumeAdjustments[resource.id];
        }
      }
    }

    Object.keys(consumeAdjustments).forEach(
      (id) => (consumeAdjustments[id] -= m.currentConsume(id)),
    );
    Object.entries(consumeAdjustments).forEach(
      ([id, delta]) => delta < 0 && m.consumeLess(id, delta * -1),
    );
    Object.entries(consumeAdjustments).forEach(
      ([id, delta]) => delta > 0 && m.consumeMore(id, delta),
    );
  }
}
