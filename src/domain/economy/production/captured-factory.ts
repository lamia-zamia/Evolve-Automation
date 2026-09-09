/**
 * The bounded factory slice that can be decided from a captured city-only
 * factory allocation. The full weighted allocator needs the upstream
 * production catalog, which remains lexical in DeadSpace.
 */

export const CAPTURED_FACTORY_LINES = Object.freeze([
  "Lux",
  "Furs",
  "Alloy",
  "Polymer",
  "Nano",
  "Stanene",
] as const);

export interface CapturedFactoryLine {
  readonly id: (typeof CAPTURED_FACTORY_LINES)[number];
  readonly current: number;
}

export interface CapturedFactoryInput {
  readonly maximum: number;
  readonly lines: readonly Readonly<CapturedFactoryLine>[];
}

export interface CapturedFactoryAdjustment {
  readonly id: (typeof CAPTURED_FACTORY_LINES)[number];
  readonly delta: number;
}

/** Match DeadSpace's trimFactoryLines order when capacity falls. */
export function planCapturedFactoryTrim(
  input: Readonly<CapturedFactoryInput>,
): readonly Readonly<CapturedFactoryAdjustment>[] {
  if (!Number.isSafeInteger(input.maximum) || input.maximum < 0) {
    return Object.freeze([]);
  }
  let over =
    input.lines.reduce((sum, line) => sum + line.current, 0) - input.maximum;
  if (over <= 0) return Object.freeze([]);

  const current = new Map(input.lines.map((line) => [line.id, line.current]));
  const adjustments: CapturedFactoryAdjustment[] = [];
  for (const id of CAPTURED_FACTORY_LINES) {
    if (over <= 0) break;
    const available = current.get(id) ?? 0;
    const amount = Math.min(available, over);
    if (amount <= 0) continue;
    adjustments.push(Object.freeze({ id, delta: -amount }));
    over -= amount;
  }
  return Object.freeze(adjustments);
}
