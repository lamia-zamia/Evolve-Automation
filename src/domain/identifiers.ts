declare const identifierBrand: unique symbol;

type Identifier<Name extends string> = string & {
  readonly [identifierBrand]: Name;
};

export type AutomationCycleId = Identifier<"AutomationCycleId">;
export type CommandId = Identifier<"CommandId">;
export type SnapshotId = Identifier<"SnapshotId">;

function parseIdentifier<Name extends string>(
  value: unknown,
  label: string,
): Identifier<Name> {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value as Identifier<Name>;
}

export function automationCycleId(value: unknown): AutomationCycleId {
  return parseIdentifier(value, "automation cycle id");
}

export function commandId(value: unknown): CommandId {
  return parseIdentifier(value, "command id");
}

export function snapshotId(value: unknown): SnapshotId {
  return parseIdentifier(value, "snapshot id");
}
