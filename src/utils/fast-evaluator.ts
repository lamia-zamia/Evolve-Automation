type CompiledExpression = () => unknown;

type FastEvaluatorDependencies = {
  compileExpression: (source: string) => CompiledExpression;
};

export function createFastEvaluator({
  compileExpression,
}: FastEvaluatorDependencies) {
  const evalCache: Record<string, CompiledExpression> = {};

  function fastEval(source: string) {
    if (!evalCache[source]) {
      evalCache[source] = compileExpression(source);
    }
    return evalCache[source]();
  }

  function cacheSize() {
    return Object.keys(evalCache).length;
  }

  return { fastEval, cacheSize };
}
