/**
 * The narrow interface the rest of the app depends on for KOSync data.
 * Implementations: `KosyncApiSource` (live REST), `KosyncFixtureSource` (offline).
 */
import type { KosyncBook } from "../domain/types.js";

/**
 * A document the user wants to track on the KOSync server.
 *
 * KOSync has no "list my books" endpoint — progress is keyed by an opaque
 * document hash (KOReader's partial-md5 of the file). So the set of books to
 * list is user-curated: each entry pairs the hash with human-readable labels
 * (which the server itself never stores). The hash later links to a Kindle ASIN
 * via a `Pairing` (Checkpoint 3).
 */
export interface TrackedDocument {
  readonly hash: string;
  readonly title?: string | undefined;
  readonly authors?: readonly string[] | undefined;
}

export interface KosyncSource {
  /** List tracked documents with progress where available. */
  listBooks(): Promise<readonly KosyncBook[]>;
}
