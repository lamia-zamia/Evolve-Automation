/**
 * The running bundle's own A.R.P.A. project mechanics, reached once and then reused.
 *
 * Deployed Evolve is an esbuild IIFE, so nothing in it is importable and no module namespace
 * exports anything. The mechanics authority is therefore the lexical scope the bundle's `physics()`
 * draw runs inside, captured through the one place the page reaches us while that draw happens.
 * Pinned `src/arpa.js` binds each offered project through `vBind`, which hands the running bundle's
 * own `buildArpa`/`arpaAdjustCosts` closures to `Vue.createApp`; those closures keep working after
 * the panel is torn down, and they are the only correct answers for offer membership, exact price,
 * and purchase.
 */

/** One project the native panel currently offers, priced for a single percentage point. */
export interface CapturedArpaOffer {
  readonly projectId: string;
  readonly rank: number;
  readonly progress: number;
  /**
   * Exact native cost of one percentage point: the adjusted cost function's own value divided by
   * 100, without the `.toFixed(0)` the display path applies.
   */
  readonly percentCosts: Readonly<Record<string, number>>;
}

export type CapturedArpaCapture =
  | { readonly kind: "captured" }
  | { readonly kind: "unavailable"; readonly reason: string };

/** Everything a decision was priced and sampled against, rechecked before the mutation. */
export interface CapturedArpaBuildPlan {
  readonly projectId: string;
  readonly rank: number;
  readonly progress: number;
  /** Whole percentage points, never crossing the rank boundary the planner priced. */
  readonly percent: number;
  readonly percentCosts: Readonly<Record<string, number>>;
}

export type CapturedArpaBuildResult =
  | {
      readonly kind: "built";
      readonly rank: number;
      readonly progress: number;
      /** What the native build actually charged, keyed by resource id. */
      readonly charged: Readonly<Record<string, number>>;
    }
  | { readonly kind: "unavailable"; readonly reason: string }
  | { readonly kind: "stale"; readonly reason: string };

export interface CapturedArpaMechanics {
  /**
   * Establishes the lexical bridge, drawing the Physics tab at most once for the life of the page.
   * A failure names what could not be identified; it never falls back to panel scraping.
   */
  ensureCaptured(): CapturedArpaCapture;
  /** The offered projects in native display order, or `undefined` while they cannot be read. */
  readOffers(root: unknown): readonly Readonly<CapturedArpaOffer>[] | undefined;
  /** Runs the native build for `plan`, or reports why the authority it was sampled from is gone. */
  buildPercent(
    root: unknown,
    plan: Readonly<CapturedArpaBuildPlan>,
  ): CapturedArpaBuildResult;
}
