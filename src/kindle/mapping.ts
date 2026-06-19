/**
 * Pure translation: raw Cloud Reader API shapes → domain types.
 * No I/O. This is the unit-tested core of the Kindle adapter.
 */
import { asin, clampFraction, type KindleBook, type Progress } from "../domain/types.js";
import type { LibraryItem, StartReadingResponse } from "./api-types.js";

// Re-exported for backwards compatibility; the canonical home is `domain/types`.
export { clampFraction };

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
  const position = res.lastPageReadData?.position;
  if (position == null) return undefined;
  const fraction = computeFraction(res);
  const syncTime = res.lastPageReadData?.syncTime;
  return {
    ...(fraction !== undefined ? { fraction } : {}),
    position: String(position),
    updatedAt: syncTime != null ? new Date(syncTime) : new Date(0),
  };
};

/**
 * Extract the total book end-position from a JSONP metadata blob.
 *
 * The JSONP wrapper is stripped by finding the first `{` to the last `}`.
 * Looks for:
 *   1. Top-level `endPosition` (number) — used directly.
 *   2. Top-level `spine` array of objects with `length` (number) — summed.
 * Returns `undefined` when neither is found or parsing fails.
 */
export const parseMetadataEndPosition = (jsonp: string): number | undefined => {
  try {
    const start = jsonp.indexOf("{");
    const end = jsonp.lastIndexOf("}");
    if (start === -1 || end === -1) return undefined;
    const json = JSON.parse(jsonp.slice(start, end + 1)) as unknown;
    if (typeof json !== "object" || json === null) return undefined;
    const obj = json as Record<string, unknown>;
    if (typeof obj["endPosition"] === "number") {
      return obj["endPosition"];
    }
    if (Array.isArray(obj["spine"])) {
      const spine = obj["spine"] as unknown[];
      let total = 0;
      for (const entry of spine) {
        if (typeof entry === "object" && entry !== null && typeof (entry as Record<string, unknown>)["length"] === "number") {
          total += (entry as Record<string, unknown>)["length"] as number;
        }
      }
      return total > 0 ? total : undefined;
    }
    return undefined;
  } catch {
    return undefined;
  }
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
