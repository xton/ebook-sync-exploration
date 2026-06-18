/**
 * Pure presentation helpers for CLI output (kept separate so they're testable).
 */
import type { BookRef } from "../domain/types.js";

const pct = (fraction: number): string => `${Math.round(fraction * 100)}%`;

/** One human-readable line per book. */
export const formatBookLine = (book: BookRef<string>): string => {
  const authors = book.authors.length ? book.authors.join(", ") : "Unknown author";
  if (!book.progress) {
    return `  [  --] ${book.title} — ${authors} (${book.id})`;
  }
  const when = book.progress.updatedAt.getTime()
    ? book.progress.updatedAt.toISOString().slice(0, 10)
    : "unsynced";
  return `  [${pct(book.progress.fraction).padStart(4)}] ${book.title} — ${authors} (${book.id}) @ ${when}`;
};

export const formatBookList = (books: readonly BookRef<string>[]): string =>
  books.map(formatBookLine).join("\n");
