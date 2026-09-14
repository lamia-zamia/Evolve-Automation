/** The page's observed keyboard state, kept by an adapter at document start. */
export interface GameKeyStateReader {
  /** Whether the page has observed the named key as pressed, or `undefined` when unavailable. */
  readPressed(key: string | number): boolean | undefined;
}
