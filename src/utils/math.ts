// Fibonacci numbers starting from 5.
export const Fibonacci: (n: number) => number = ((memo: number[]) =>
  function fibonacci(n: number): number {
    return memo[n] ?? (memo[n] = fibonacci(n - 1) + fibonacci(n - 2));
  })([5, 8]);

export function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value) / values.length;
}
