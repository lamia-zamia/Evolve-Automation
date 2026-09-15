/** One user-visible activity entry in Evolve's message log. */
export interface GameActivity {
  readonly message: string;
  readonly color: string;
  /** Message-log filters the entry belongs to, without the implicit `all` filter. */
  readonly tags: readonly string[];
}

export type GameActivitySink = (activity: Readonly<GameActivity>) => void;
