import { createCraftingCosts } from "../game/crafting-costs.ts";
import { createGameCompatibility } from "../game/compatibility.ts";
import { createMechIntelligence } from "../game/mech-intelligence.ts";
import { createPlanetGeneration } from "../game/planet-generation.ts";
import { createTraitValue } from "../game/trait-value.ts";

export const createTraitValueControl = createTraitValue;
export const createMechIntelligenceControl = createMechIntelligence;
export const createCraftingCostsControl = createCraftingCosts;
export const createPlanetGenerationControl = createPlanetGeneration;
export const createGameCompatibilityControl = createGameCompatibility;
