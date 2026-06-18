/**
 * Raw shapes returned by the Cloud Reader web API (read.amazon.com).
 * These mirror the wire format; they are translated into domain types in
 * `mapping.ts`. Validated with zod so malformed/!drifted responses fail loudly.
 *
 * Endpoints (see docs/decision-log.md):
 *   GET /kindle-library/search?libraryType=BOOKS&sortType=recency&querySize=50
 *   GET /service/mobile/reader/startReading?asin=<ASIN>&clientVersion=20000100
 */
import { z } from "zod";

/** One entry from `kindle-library/search` → `itemsList[]`. */
export const LibraryItemSchema = z.object({
  asin: z.string(),
  title: z.string(),
  /** Author strings, typically "Last, First". May be absent for some items. */
  authors: z.array(z.string()).default([]),
  /** Often 0 / unreliable here — real progress comes from startReading. */
  percentageRead: z.number().optional(),
  webReaderUrl: z.string().optional(),
});
export type LibraryItem = z.infer<typeof LibraryItemSchema>;

export const LibrarySearchResponseSchema = z.object({
  itemsList: z.array(LibraryItemSchema),
  /** Opaque cursor; absent on the last page. */
  paginationToken: z.string().optional(),
});
export type LibrarySearchResponse = z.infer<typeof LibrarySearchResponseSchema>;

/** Last-read position block from `startReading`. */
export const LastPageReadDataSchema = z.object({
  /** Kindle internal position (byte-offset units), NOT percent or page. */
  position: z.number(),
  /** Sync timestamp; epoch milliseconds. */
  syncTime: z.number().nullish(),
  deviceName: z.string().nullish(),
});
export type LastPageReadData = z.infer<typeof LastPageReadDataSchema>;

export const StartReadingResponseSchema = z
  .object({
    /** First content position in the book. */
    startPosition: z.number().nullish(),
    /** Last content position in the book. */
    endPosition: z.number().nullish(),
    /** Null for books with no synced position (e.g. CONTENT_UNSUPPORTED). */
    lastPageReadData: LastPageReadDataSchema.nullish(),
    /** "start reading location" indicator; kept for completeness. */
    srl: z.number().nullish(),
    /** URL to the JSONP metadata file containing spine/endPosition info. */
    metadataUrl: z.string().nullish(),
  })
  // The endpoint returns many other fields (format metadata, restrictions, …)
  // that we don't model; ignore them rather than failing.
  .passthrough();
export type StartReadingResponse = z.infer<typeof StartReadingResponseSchema>;
