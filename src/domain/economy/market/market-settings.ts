/** Immutable description of the Market settings panel. */
export type MarketSettingsControl =
  | Readonly<{
      kind: "number";
      settingName: string;
      label: string;
      hint: string;
    }>
  | Readonly<{
      kind: "toggle";
      settingName: string;
      label: string;
      hint: string;
    }>
  | Readonly<{ kind: "heading"; label: string }>;

export interface MarketSettingsRow {
  readonly id: string;
  readonly label: string;
  readonly buySettingName: string;
  readonly buyRatioSettingName: string;
  readonly sellSettingName: string;
  readonly sellRatioSettingName: string;
  readonly tradeBuySettingName: string;
  readonly tradeSellSettingName: string;
  readonly tradeWeightingSettingName: string;
  readonly tradePrioritySettingName: string;
}

export interface MarketSettingsGalaxyRow {
  readonly buyId: string;
  readonly buyLabel: string;
  readonly sellLabel: string;
  readonly weightingSettingName: string;
  readonly prioritySettingName: string;
}

export interface MarketSettingsReadModel {
  readonly sectionId: "market";
  readonly sectionName: "Market";
  readonly controls: readonly MarketSettingsControl[];
  readonly rows: readonly MarketSettingsRow[];
  readonly galaxyRows: readonly MarketSettingsGalaxyRow[];
}

export type MarketSettingsIntent =
  | Readonly<{ type: "reset-market-settings" }>
  | Readonly<{
      type: "reorder-market-resources";
      resourceIds: readonly string[];
    }>;

const controls: readonly MarketSettingsControl[] = Object.freeze([
  Object.freeze({
    kind: "number",
    settingName: "minimumMoney",
    label: "Manual trade minimum money",
    hint: "Minimum money to keep after bulk buying",
  }),
  Object.freeze({
    kind: "number",
    settingName: "minimumMoneyPercentage",
    label: "Manual trade minimum money percentage",
    hint: "Minimum percentage of money to keep after bulk buying",
  }),
  Object.freeze({
    kind: "number",
    settingName: "tradeRouteMinimumMoneyPerSecond",
    label: "Trade minimum money /s",
    hint: "Uses the highest per second amount of these two values. Will trade for resources until this minimum money per second amount is hit",
  }),
  Object.freeze({
    kind: "number",
    settingName: "tradeRouteMinimumMoneyPercentage",
    label: "Trade minimum money percentage /s",
    hint: "Uses the highest per second amount of these two values. Will trade for resources until this percentage of your money per second amount is hit",
  }),
  Object.freeze({
    kind: "toggle",
    settingName: "tradeRouteSellExcess",
    label: "Sell excess resources",
    hint: "With this option enabled script will be allowed to sell resources above amounts needed for constructions or researches, without it script sell only capped resources. As side effect boughts will also be limited to that amounts, to avoid 'buy up to cap -> sell excess' loops.",
  }),
  Object.freeze({ kind: "heading", label: "Galaxy Trades" }),
  Object.freeze({
    kind: "number",
    settingName: "marketMinIngredients",
    label: "Minimum materials to preserve",
    hint: "Galaxy Market will buy resources only when all selling materials above given ratio",
  }),
]);

export function createMarketSettingsReadModel({
  rows,
  galaxyRows,
}: Readonly<{
  rows: readonly MarketSettingsRow[];
  galaxyRows: readonly MarketSettingsGalaxyRow[];
}>): MarketSettingsReadModel {
  return Object.freeze({
    sectionId: "market",
    sectionName: "Market",
    controls,
    rows: Object.freeze(rows.map((row) => Object.freeze({ ...row }))),
    galaxyRows: Object.freeze(
      galaxyRows.map((row) => Object.freeze({ ...row })),
    ),
  });
}
