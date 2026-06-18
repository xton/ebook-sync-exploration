/**
 * The narrow interface the rest of the app depends on for Kindle data.
 * Implementations: `CookieApiSource` (live web API), `FixtureSource` (offline).
 */
import type { KindleBook } from "../domain/types.js";

export interface KindleSource {
  /** List owned books with progress where available. */
  listBooks(): Promise<readonly KindleBook[]>;
}
