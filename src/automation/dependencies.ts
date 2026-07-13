/**
 * Transitional factory boundary used while the extracted controllers acquire
 * precise game-domain types. Keys remain required even while their values are
 * intentionally permissive, so each factory has an explicit dependency contract.
 */
export type AutomationDependencies<Keys extends PropertyKey> = {
  [Key in Keys]: any;
};
