/** Runs an advisory read without allowing its failures to interrupt the automation cycle. */
export function runCapturedDiagnosticSafely(
  observe: () => void,
  onFailure: (error: unknown) => void,
): void {
  try {
    observe();
  } catch (error) {
    try {
      onFailure(error);
    } catch {
      // Diagnostics cannot become a failure path for normal automation.
    }
  }
}
