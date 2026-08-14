import { createEntityCatalogs } from "../game/entity-catalogs.ts";
import { createEntityClasses } from "../game/entities.ts";

type EntityClassDependencies = Parameters<typeof createEntityClasses>[0];
type EntityCatalogDependencies = Parameters<typeof createEntityCatalogs>[0];

export type EntityCompatibilitySurfaceDependencies = EntityClassDependencies &
  Pick<EntityCatalogDependencies, "getHaveTech" | "setResources">;

export function createEntityCompatibilitySurface(
  dependencies: EntityCompatibilitySurfaceDependencies,
) {
  const classes = createEntityClasses(dependencies);
  const catalogs = createEntityCatalogs({
    classes: {
      Action: classes.Action,
      BasicJob: classes.BasicJob,
      BeltSupport: classes.BeltSupport,
      CityAction: classes.CityAction,
      CraftingJob: classes.CraftingJob,
      ElectrolysisSupport: classes.ElectrolysisSupport,
      Job: classes.Job,
      ModalAction: classes.ModalAction,
      Morale: classes.Morale,
      Pillar: classes.Pillar,
      Population: classes.Population,
      Power: classes.Power,
      PrestigeResource: classes.PrestigeResource,
      Project: classes.Project,
      Resource: classes.Resource,
      ResourceAction: classes.ResourceAction,
      SoulGem: classes.SoulGem,
      SpaceDock: classes.SpaceDock,
      Supply: classes.Supply,
      Support: classes.Support,
      Thrall: classes.Thrall,
      Troops: classes.Troops,
      WomlingsSupport: classes.WomlingsSupport,
    },
    getHaveTech: dependencies.getHaveTech,
    setResources: dependencies.setResources,
  });

  return Object.freeze({ ...classes, ...catalogs });
}
