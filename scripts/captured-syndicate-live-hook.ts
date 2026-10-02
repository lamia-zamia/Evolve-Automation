/**
 * The test-surface hook bag the live Syndicate characterization reads through.
 *
 * Non-enumerable and inert unless a test bundle defines it, which is the same contract every other
 * characterization uses. Nothing here is reachable from a production run.
 */
const hook: Record<string, unknown> = {};
Object.defineProperty(globalThis, "__EA_TEST_HOOKS__", {
  configurable: true,
  enumerable: false,
  writable: true,
  value: hook,
});
