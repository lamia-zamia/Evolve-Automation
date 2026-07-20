export interface ShapeshiftControls {
  setShape(genus: string): boolean;
}

export interface UniverseSelectionControls {
  selectUniverse(name: string): boolean;
}

export interface PlanetSelectionControls {
  selectPlanet(elementId: string): boolean;
}
