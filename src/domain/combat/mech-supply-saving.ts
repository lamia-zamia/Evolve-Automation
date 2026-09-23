/** One owner for the Mech Supply hold shared by build planning and Mech demand. */

export function shouldSaveMechSupply(
  input: Readonly<{
    saveSupplyRatio: number;
    lastFloor: boolean;
    forceBuild: boolean;
    supplyMaximum: number;
    supplyCurrent: number;
    supplyRate: number;
    baySpace: number;
    designSpace: number;
    titanSupplyRefund: number;
    timeToClear: number;
  }>,
): boolean {
  if (input.saveSupplyRatio <= 0 || input.lastFloor || input.forceBuild) {
    return false;
  }
  let missing =
    input.supplyMaximum * input.saveSupplyRatio - input.supplyCurrent;
  if (input.baySpace < input.designSpace) {
    missing -= input.titanSupplyRefund;
  }
  return input.timeToClear <= missing / input.supplyRate;
}
