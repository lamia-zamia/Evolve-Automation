/**
 * The comparators of the override and trigger condition language. Each one decides whether a
 * condition matches, and writes itself as the custom expression the editor shows — in the comparator
 * select's tooltip, and as the text the evalize button hands the player. `override-catalog.ts` joins
 * the two halves for the consumers that need only one of them.
 *
 * A condition compares two operand reads, and an operand read is `unknown`: a building count, a
 * setting of whichever type it happens to store, a literal the editor stored, or the result of a
 * custom expression. The model below is JavaScript's own, narrowed where JavaScript's answer is not
 * worth reproducing — see `orderedBy`.
 */

/** Whether a condition matches. Only the answer is used; neither operand is passed through. */
export type OverrideComparison = (left: unknown, right: unknown) => boolean;

export interface OverrideComparatorDefinition {
  readonly compare: OverrideComparison;
  /** The same comparison as a custom expression, given each operand's expression text. */
  readonly express: (left: string, right: string) => string;
}

/** A symbol has no numeric value, and ordering one throws rather than answering. */
function asNumber(value: unknown): number {
  return typeof value === "symbol" ? Number.NaN : Number(value);
}

/**
 * JavaScript's relational order: two strings compare lexicographically, anything else numerically.
 * Two deliberate narrowings of `<`, both for values no operand currently reads: an object orders by
 * its numeric value rather than by a string it might convert to, and a symbol orders as `NaN`
 * instead of throwing. Every comparison against `NaN` is false, which is what `<` already answers.
 */
function orderedBy(
  ordered: (left: string | number, right: string | number) => boolean,
): OverrideComparison {
  return (left, right) =>
    typeof left === "string" && typeof right === "string"
      ? ordered(left, right)
      : ordered(asNumber(left), asNumber(right));
}

/**
 * Loose equality is part of the language: a `Number` operand read equals the `"1000"` a `String`
 * operand stored, and a numeric setting equals the text a condition compares it against. `===` and
 * `!==` are offered beside it for conditions that want the stricter answer.
 */
export const overrideComparators = {
  "==": {
    compare: (left, right) => left == right,
    express: (left, right) => `${left} == ${right}`,
  },
  "!=": {
    compare: (left, right) => left != right,
    express: (left, right) => `${left} != ${right}`,
  },
  ">": {
    compare: orderedBy((left, right) => left > right),
    express: (left, right) => `${left} > ${right}`,
  },
  "<": {
    compare: orderedBy((left, right) => left < right),
    express: (left, right) => `${left} < ${right}`,
  },
  ">=": {
    compare: orderedBy((left, right) => left >= right),
    express: (left, right) => `${left} >= ${right}`,
  },
  "<=": {
    compare: orderedBy((left, right) => left <= right),
    express: (left, right) => `${left} <= ${right}`,
  },
  "===": {
    compare: (left, right) => left === right,
    express: (left, right) => `${left} === ${right}`,
  },
  "!==": {
    compare: (left, right) => left !== right,
    express: (left, right) => `${left} !== ${right}`,
  },
  AND: {
    compare: (left, right) => Boolean(left) && Boolean(right),
    express: (left, right) => `${left} && ${right}`,
  },
  OR: {
    compare: (left, right) => Boolean(left) || Boolean(right),
    express: (left, right) => `${left} || ${right}`,
  },
  NAND: {
    compare: (left, right) => !(left && right),
    express: (left, right) => `!(${left} && ${right})`,
  },
  NOR: {
    compare: (left, right) => !(left || right),
    express: (left, right) => `!(${left} || ${right})`,
  },
  XOR: {
    compare: (left, right) => !left != !right,
    express: (left, right) => `!${left} != !${right}`,
  },
  XNOR: {
    compare: (left, right) => !left == !right,
    express: (left, right) => `!${left} == !${right}`,
  },
  "AND!": {
    compare: (left, right) => Boolean(left) && !right,
    express: (left, right) => `${left} && !${right}`,
  },
  "OR!": {
    compare: (left, right) => Boolean(left) || !right,
    express: (left, right) => `${left} || !${right}`,
  },
  "A?B": {
    compare: (left) => Boolean(left),
    express: (left) => left,
  },
  "!A?B": {
    compare: (left) => !left,
    express: (left) => `!${left}`,
  },
} satisfies Record<string, OverrideComparatorDefinition>;

function byComparator<T>(
  select: (comparator: OverrideComparatorDefinition) => T,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(overrideComparators).map(([id, comparator]) => [
      id,
      select(comparator),
    ]),
  );
}

/** What an evaluated condition asks: does this comparator match these two operand reads? */
export const overrideComparisons = byComparator(
  (comparator) => comparator.compare,
);

/** What the editor asks: how does this comparator read as a custom expression? */
export const overrideComparatorExpressions = byComparator(
  (comparator) => comparator.express,
);
