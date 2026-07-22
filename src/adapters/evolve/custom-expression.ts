export interface CustomExpressionScope {
  readonly [name: string]: unknown;
}

export interface CustomExpressionAdapter {
  readonly fastEval: (source: string) => unknown;
  readonly cacheSize: () => number;
}

interface CustomExpressionDependencies {
  readonly getScope: () => CustomExpressionScope;
}

type CompiledExpression = () => unknown;
type ExpressionFactory = (scope: CustomExpressionScope) => CompiledExpression;

function createExpressionCache(
  compileExpression: (source: string) => CompiledExpression,
) {
  const cache: Record<string, CompiledExpression> = {};

  return {
    fastEval(source: string) {
      if (!cache[source]) {
        cache[source] = compileExpression(source);
      }
      return cache[source]();
    },
    cacheSize() {
      return Object.keys(cache).length;
    },
  };
}

/**
 * Compatibility boundary for user-authored expressions. Evolve historically evaluated these
 * expressions lexically, so the adapter recreates that behavior with a `with` scope whose
 * properties are resolved at invocation time. The scope is supplied by the adapter edge and the
 * dynamic code does not escape this module.
 */
export function createCustomExpressionAdapter({
  getScope,
}: CustomExpressionDependencies): CustomExpressionAdapter {
  const { fastEval, cacheSize } = createExpressionCache(
    (source): CompiledExpression => {
      // This is the deliberate compatibility escape hatch for the game's custom-expression
      // language. Keep it here so new code cannot spread dynamic evaluation through the app.
      const factory = Function(
        "scope",
        `with (scope) { return function() { return (${source}); }; }`,
      ) as unknown as ExpressionFactory;
      return () => factory(getScope())();
    },
  );

  return Object.freeze({ fastEval, cacheSize });
}
