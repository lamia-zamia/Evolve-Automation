/** Shared DeadSpace control and panel coordinates for its two distinct lab components. */
export const CELESTIAL_LAB_CONTROL_ID = "celestialLab";
export const CELESTIAL_LAB_PANEL_SELECTOR = "#celestialLab";

/** Opaque identity for one mounted game lab on one captured root. */
export type CelestialLabSession = Readonly<{ readonly identity: object }>;
