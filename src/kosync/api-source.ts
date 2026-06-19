/**
 * Live KosyncSource backed by the KOSync REST API.
 *
 * Flow:
 *   1. authorize() once (fail fast on bad credentials).
 *   2. getProgress per tracked document hash → domain Progress.
 *
 * The set of documents is user-curated (see `TrackedDocument`) because KOSync
 * exposes no library listing — it only answers "what's the progress for hash X?".
 */
import type { KosyncBook } from "../domain/types.js";
import type { KosyncClient } from "./client.js";
import { toKosyncBook } from "./mapping.js";
import type { KosyncSource, TrackedDocument } from "./source.js";

export interface KosyncApiSourceOptions {
  readonly documents: readonly TrackedDocument[];
  readonly verbose?: boolean | undefined;
}

export class KosyncApiSource implements KosyncSource {
  constructor(
    private readonly client: KosyncClient,
    private readonly opts: KosyncApiSourceOptions,
  ) {}

  async listBooks(): Promise<readonly KosyncBook[]> {
    await this.client.authorize();

    const failures: { hash: string; title: string; error: string }[] = [];
    const books = await Promise.all(
      this.opts.documents.map(async (doc) => {
        try {
          const progress = await this.client.getProgress(doc.hash);
          return toKosyncBook(doc, progress);
        } catch (err) {
          failures.push({
            hash: doc.hash,
            title: doc.title ?? doc.hash,
            error: String(err),
          });
          return toKosyncBook(doc);
        }
      }),
    );

    // Match the Kindle adapter: quiet by default (one summary line), per-book
    // detail only under --verbose, so a transient failure doesn't bury output.
    if (failures.length > 0) {
      if (this.opts.verbose) {
        for (const f of failures) {
          process.stderr.write(
            `[warn] Could not fetch progress for ${f.hash} (${f.title}): ${f.error}\n`,
          );
        }
      } else {
        process.stderr.write(
          `[warn] Progress unavailable for ${failures.length} of ` +
            `${this.opts.documents.length} documents. Re-run with --verbose for details.\n`,
        );
      }
    }
    return books;
  }
}
