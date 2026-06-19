/**
 * Pure translation: raw KOSync API shapes → domain types.
 * No I/O. This is the unit-tested core of the KOSync adapter.
 */
import {
  clampFraction,
  documentHash,
  type KosyncBook,
  type Progress,
} from "../domain/types.js";
import type { ProgressResponse } from "./api-types.js";
import type { TrackedDocument } from "./source.js";

/**
 * Build a domain `Progress` from a KOSync progress record, if one exists.
 *
 * A record counts as "no progress" when it carries neither a position nor a
 * percentage — that's what the server returns for a document it has never seen.
 * `percentage` is already a 0..1 fraction (clamped defensively). `timestamp` is
 * Unix *seconds*, converted to ms; absent → epoch 0 (treated as "unsynced").
 */
export const toKosyncProgress = (
  res: ProgressResponse,
): Progress | undefined => {
  const hasPosition = typeof res.progress === "string" && res.progress.length > 0;
  const hasPercentage = res.percentage != null;
  if (!hasPosition && !hasPercentage) return undefined;

  const fraction = hasPercentage ? clampFraction(res.percentage as number) : undefined;
  return {
    ...(fraction !== undefined ? { fraction } : {}),
    ...(hasPosition ? { position: res.progress as string } : {}),
    updatedAt: res.timestamp != null ? new Date(res.timestamp * 1000) : new Date(0),
  };
};

/**
 * Combine a tracked document (user-supplied identity/labels) with its optional
 * progress record into a domain `KosyncBook`.
 *
 * KOSync keys purely on the document hash and returns no title/author, so those
 * come from the user's tracked-document config; title falls back to the hash.
 */
export const toKosyncBook = (
  doc: TrackedDocument,
  res?: ProgressResponse,
): KosyncBook => {
  const progress = res ? toKosyncProgress(res) : undefined;
  return {
    id: documentHash(doc.hash),
    title: doc.title ?? doc.hash,
    authors: doc.authors ?? [],
    ...(progress ? { progress } : {}),
  };
};
