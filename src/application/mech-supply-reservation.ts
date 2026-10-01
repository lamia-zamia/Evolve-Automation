/** Session-owned Supply reservation shared by Power and captured Mech planning. */
export function createMechSupplyReservation() {
  let powerSupplyHold: boolean | undefined;
  return Object.freeze({
    readPowerSupplyHold: (): boolean | undefined => powerSupplyHold,
    readSaveSupply: (): boolean => powerSupplyHold ?? false,
    reset(): void {
      powerSupplyHold = undefined;
    },
    setSaveSupply(expected: boolean, value: boolean): boolean {
      if ((powerSupplyHold ?? false) !== expected) return false;
      powerSupplyHold = value;
      return true;
    },
  });
}
