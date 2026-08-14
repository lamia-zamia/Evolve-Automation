import { createOverrideCatalog } from "../settings/override-catalog.ts";

type OverrideCatalogDependencies = Parameters<typeof createOverrideCatalog>[0];

export type OverrideCatalogControlDependencies = OverrideCatalogDependencies;

export function createOverrideCatalogControl(
  dependencies: OverrideCatalogControlDependencies,
) {
  return createOverrideCatalog(dependencies);
}
