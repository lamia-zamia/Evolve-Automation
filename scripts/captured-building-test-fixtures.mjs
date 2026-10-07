import { CAPTURED_AUTOMATION_BUILDING_BINDINGS } from "../src/adapters/evolve/progression/build/captured-building-bindings.generated.ts";
import { bindingForBuildingElement } from "../src/adapters/evolve/progression/build/captured-building-metadata.ts";
import { splitActionId } from "../src/adapters/validation.ts";
import { makeCapturedTechMechanicsFixture } from "./captured-tech-mechanics-fixture.mjs";

const absent = Object.freeze({ kind: "absent" });
const nativeRead = (value) => Object.freeze({ kind: "value", value });

/** Test mechanics catalog derived from the production-owned managed binding set. */
export function makeCapturedBuildingMechanics(
  root,
  {
    availability = () => nativeRead(false),
    omitBindings = new Set(),
    overrides = new Map(),
    extraStructures = [],
  } = {},
) {
  const structures = [];
  for (const actionId of CAPTURED_AUTOMATION_BUILDING_BINDINGS) {
    const binding = bindingForBuildingElement(actionId);
    if (omitBindings.has(binding)) continue;
    const parts = splitActionId(binding);
    if (parts === undefined) continue;
    const override = overrides.get(binding);
    const native = {
      entryKey: `${parts.region}:${parts.id}`,
      region: parts.region,
      sector: parts.region,
      struct: parts.id,
      actionId,
      readAvailability: (root) => availability(root, binding),
      readTitle: () => nativeRead(binding),
      readDescription: () => nativeRead(""),
      readValue: () => absent,
      readWorkers: () => absent,
      readShipRating: () => absent,
      ownsPowered: false,
      readPowered: () => absent,
      readPowerGridRole: () => nativeRead("none"),
      readSwitchable: () => nativeRead(true),
      readPowerRequirements: () => absent,
      readFuel: () => absent,
      readFuelAdjustmentRequested: () => nativeRead(false),
      ...(override ?? {}),
    };
    structures.push(Object.freeze(native));
  }
  structures.push(...extraStructures);
  const readStructureIdentities = () =>
    Object.freeze(
      structures.map(({ entryKey, region, sector, struct, actionId }) =>
        Object.freeze({ entryKey, region, sector, struct, actionId }),
      ),
    );
  return Object.freeze({
    ...makeCapturedTechMechanicsFixture(
      Object.keys(root?.tech ?? {}).map((technology) => `tech-${technology}`),
    ),
    readStructures: () => Object.freeze(structures),
    readStructureIdentities,
  });
}

export function availableWhenBindings(...bindings) {
  const available = new Set(bindings.map(bindingForBuildingElement));
  return (_root, binding) => nativeRead(available.has(binding));
}
