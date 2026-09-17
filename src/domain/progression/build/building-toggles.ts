export interface BuildingToggleItem {
  readonly binding: string;
  /** Live game element id; omitted when it is the same as `binding`. */
  readonly elementId?: string;
  readonly settingKey: string;
  readonly enabled: boolean;
}
