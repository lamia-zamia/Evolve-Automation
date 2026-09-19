/**
 * The crafted resources the foundry produces.
 *
 * Single ownership of the id list: the production defaults table, the captured foundry catalog,
 * and the settings-section ownership policy all read it from here. Each of those needs a
 * different fact *about* a crafter (its default weighting, its live control, the settings keys it
 * owns), but the set of crafters itself is one fact and has one home.
 */

export const CRAFTER_RESOURCE_KEYS = Object.freeze([
  "Plywood",
  "Brick",
  "Wrought_Iron",
  "Sheet_Metal",
  "Mythril",
  "Aerogel",
  "Nanoweave",
  "Scarletite",
  "Quantium",
] as const);

export type CrafterResourceKey = (typeof CRAFTER_RESOURCE_KEYS)[number];
