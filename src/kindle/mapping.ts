/**
 * Pure translation: raw Cloud Reader API shapes → domain types.
 * No I/O. This is the unit-tested core of the Kindle adapter.
 */
import { asin, type KindleBook, type Progress } from "../domain/types.js";
import type { LibraryItem, StartReadingResponse } from "./api-types.js";

/** Clamp a number into the inclusive [0, 1] range. */
export const clampFraction = (n: number): number =>
  Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;

/**
 * Compute reading fraction (0..1) from a startReading response.
 *
 * Follows the reference web clients (e.g. Xetera/kindle-api):
 *   percent = (startPosition + position) / endPosition
 * Returns `undefined` when there is no last-read position or the book bounds
 * are unusable (e.g. endPosition missing/zero).
 */
export const computeFraction = (
  res: Pick<StartReadingResponse, "startPosition" | "endPosition" | "lastPageReadData">,
): number | undefined => {
  const position = res.lastPageReadData?.position;
  if (position == null) return undefined;
  const start = res.startPosition ?? 0;
  const end = res.endPosition;
  if (end == null || end <= 0) return undefined;
  return clampFraction((start + position) / end);
};

/** Build a domain `Progress` from a startReading response, if any is present. */
export const toProgress = (
  res: StartReadingResponse,
): Progress | undefined => {
  const fraction = computeFraction(res);
  if (fraction === undefined) return undefined;
  const position = res.lastPageReadData?.position;
  const syncTime = res.lastPageReadData?.syncTime;
  return {
    fraction,
    ...(position != null ? { position: String(position) } : {}),
    updatedAt: syncTime != null ? new Date(syncTime) : new Date(0),
  };
};

/**
 * Combine a library item with its (optional) startReading result into a
 * domain `KindleBook`. Progress is omitted when unavailable.
 */
export const toKindleBook = (
  item: LibraryItem,
  reading?: StartReadingResponse,
): KindleBook => {
  const progress = reading ? toProgress(reading) : undefined;
  return {
    id: asin(item.asin),
    title: item.title,
    authors: item.authors,
    ...(progress ? { progress } : {}),
  };
};
