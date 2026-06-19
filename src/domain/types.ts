/**
 * Pure domain types. No I/O, no library-specific transport concerns.
 *
 * The two systems we bridge identify books differently:
 *   - Kindle keys on ASIN.
 *   - KOSync keys on a document hash (of the local book file).
 * The domain models both as opaque, branded identifiers and links them via a
 * user-confirmed `Pairing`.
 */

/** Clamp a number into the inclusive [0, 1] range; non-finite → 0. */
export const clampFraction = (n: number): number =>
  Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;

/** Branded string types prevent accidentally mixing identifier kinds. */
export type Brand<T, B> = T & { readonly __brand: B };

export type Asin = Brand<string, "Asin">;
export type DocumentHash = Brand<string, "DocumentHash">;

export const asin = (value: string): Asin => value as Asin;
export const documentHash = (value: string): DocumentHash =>
  value as DocumentHash;

/** Which side of the bridge a piece of data came from. */
export type Library = "kindle" | "kosync";

/**
 * Normalized reading progress, comparable across libraries.
 * `fraction` is the canonical, lossy-but-portable measure (0..1).
 * `position` is the source-native locator (Kindle location/CFI, KOSync xpointer)
 * kept verbatim for round-tripping and display.
 */
export interface Progress {
  readonly fraction?: number;   // undefined when endPosition unknown
  readonly position?: string;
  readonly updatedAt: Date;
}

/** A book as seen within a single library, with optional progress. */
export interface BookRef<Id extends string> {
  readonly id: Id;
  readonly title: string;
  readonly authors: readonly string[];
  readonly progress?: Progress;
}

export type KindleBook = BookRef<Asin>;
export type KosyncBook = BookRef<DocumentHash>;

/** A user-confirmed link between a Kindle book and a KOSync document. */
export interface Pairing {
  readonly asin: Asin;
  readonly documentHash: DocumentHash;
  /** Human-readable label for display/debugging (e.g. the title at pairing time). */
  readonly label: string;
}
