// Fibonacci numbers starting from 5.
export const Fibonacci = (
  (memo) => (n) =>
    memo[n] ?? (memo[n] = Fibonacci(n - 1) + Fibonacci(n - 2))
)([5, 8]);

export function average(values) {
  return values.reduce((sum, value) => sum + value) / values.length;
}
