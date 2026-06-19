/**
 * Live KindleSource backed by the Cloud Reader web API.
 *
 * Flow (see docs/decision-log.md):
 *   1. kindle-library/search (paginated) → owned books + ASINs
 *   2. startReading per ASIN → last-read position → domain Progress
 *
 * Optionally: if a deviceSessionToken is supplied (obtained manually from
 * browser devtools — see `kindle setup`), it is sent as x-adp-session-token,
 * which causes startReading to return full position data.
 *
 * Auth is via browser session cookies. The actual browser-impersonating I/O is
 * delegated to an injected `HttpTransport`.
 */
import { ZodError } from "zod";
import type { KindleBook } from "../domain/types.js";
import {
  LibrarySearchResponseSchema,
  StartReadingResponseSchema,
} from "./api-types.js";
import { parseMetadataEndPosition, toKindleBook } from "./mapping.js";
import type { KindleSource } from "./source.js";
import type { HttpRequest, HttpTransport } from "./transport.js";

const BASE = "https://read.amazon.com";
const CLIENT_VERSION = "20000100";
const PAGE_SIZE = 50;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36";

/** Amazon session cookies copied from a logged-in browser. */
export interface KindleCookies {
  readonly atMain: string;
  readonly sessionId: string;
  readonly ubidMain: string;
  readonly xMain: string;
}

export interface CookieSourceOptions {
  readonly cookies: KindleCookies;
  /**
   * Optional device session token (x-adp-session-token).
   * Obtained from browser devtools — see `kindle setup` instructions.
   * Without it startReading may return no position data.
   */
  readonly deviceSessionToken?: string | undefined;
  readonly verbose?: boolean | undefined;
}

const cookieHeader = (c: KindleCookies): string =>
  [
    `at-main=${c.atMain}`,
    `session-id=${c.sessionId}`,
    `ubid-main=${c.ubidMain}`,
    `x-main=${c.xMain}`,
  ].join("; ");

/** startReading is fired per-book; keep concurrency low so Amazon doesn't throttle. */
const READING_CONCURRENCY = 6;
/** HTTP statuses worth retrying — Amazon sheds load with 500s under burst traffic. */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Map over items with bounded concurrency. Unlike `Promise.all(items.map(...))`,
 * at most `limit` calls are in flight at once, which avoids hammering Amazon
 * into rate-limit 500s. Results preserve input order.
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i] as T, i);
    }
  });
  await Promise.all(workers);
  return results;
}

export class CookieApiSource implements KindleSource {
  constructor(
    private readonly transport: HttpTransport,
    private readonly opts: CookieSourceOptions,
  ) {}

  private headers(): Record<string, string> {
    const { cookies, deviceSessionToken } = this.opts;
    return {
      Cookie: cookieHeader(cookies),
      Accept: "application/json",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": USER_AGENT,
      "x-amzn-sessionid": cookies.sessionId,
      ...(deviceSessionToken ? { "x-adp-session-token": deviceSessionToken } : {}),
    };
  }

  private async getJson<T>(url: string): Promise<T> {
    const req: HttpRequest = { url, headers: this.headers() };
    let lastBody = "";
    let lastStatus = 0;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const res = await this.transport.get(req);
      if (this.opts.verbose) {
        process.stderr.write(
          `[verbose] GET ${url} → ${res.status}\n${res.body.slice(0, 4000)}\n\n`,
        );
      }
      if (res.status === 200) return JSON.parse(res.body) as T;
      lastStatus = res.status;
      lastBody = res.body;
      // Retry transient throttling/server errors with exponential backoff + jitter.
      if (RETRYABLE_STATUSES.has(res.status) && attempt < MAX_RETRIES) {
        await sleep(200 * 2 ** attempt + Math.floor(Math.random() * 100));
        continue;
      }
      break;
    }
    throw new Error(
      `Kindle API ${url} returned HTTP ${lastStatus}: ${lastBody.slice(0, 200)}`,
    );
  }

  private parseOrThrow<T>(
    schema: { parse(v: unknown): T },
    raw: unknown,
    context: string,
  ): T {
    try {
      return schema.parse(raw);
    } catch (err) {
      if (err instanceof ZodError) {
        // Include a snippet of the raw value so the caller can diagnose shape mismatches.
        const snippet = JSON.stringify(raw).slice(0, 300);
        throw new Error(
          `Unexpected response shape for ${context}. Raw: ${snippet}\nValidation: ${err.message}`,
        );
      }
      throw err;
    }
  }

  /** Walk the paginated library endpoint, returning all owned items. */
  private async fetchLibrary() {
    const items: import("./api-types.js").LibraryItem[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        query: "",
        libraryType: "BOOKS",
        sortType: "recency",
        querySize: String(PAGE_SIZE),
      });
      if (pageToken) params.set("paginationToken", pageToken);
      const raw = await this.getJson(`${BASE}/kindle-library/search?${params}`);
      const page = this.parseOrThrow(
        LibrarySearchResponseSchema,
        raw,
        "kindle-library/search",
      );
      items.push(...page.itemsList);
      pageToken = page.paginationToken;
    } while (pageToken);
    return items;
  }

  private async fetchReading(asin: string) {
    const params = new URLSearchParams({ asin, clientVersion: CLIENT_VERSION });
    const raw = await this.getJson(
      `${BASE}/service/mobile/reader/startReading?${params}`,
    );
    return this.parseOrThrow(
      StartReadingResponseSchema,
      raw,
      `startReading(${asin})`,
    );
  }

  /**
   * Fetch the JSONP metadata blob for a book and extract the end position.
   * Uses plain `fetch` (not the CycleTLS transport) since the metadata URL
   * is a CDN asset that doesn't require TLS fingerprinting.
   */
  async fetchMetadataEndPosition(metadataUrl: string): Promise<number | undefined> {
    const res = await fetch(metadataUrl);
    const text = await res.text();
    return parseMetadataEndPosition(text);
  }

  async listBooks(): Promise<readonly KindleBook[]> {
    const items = await this.fetchLibrary();
    const failures: { asin: string; title: string; error: string }[] = [];
    const books = await mapWithConcurrency(
      items,
      READING_CONCURRENCY,
      async (item) => {
        try {
          const reading = await this.fetchReading(item.asin);
          // If endPosition is missing but metadataUrl present, try to fill it in.
          if (reading.endPosition == null && reading.metadataUrl) {
            const endPosition = await this.fetchMetadataEndPosition(
              reading.metadataUrl,
            ).catch(() => undefined);
            if (endPosition != null) {
              return toKindleBook(item, { ...reading, endPosition });
            }
          }
          return toKindleBook(item, reading);
        } catch (err) {
          failures.push({ asin: item.asin, title: item.title, error: String(err) });
          return toKindleBook(item);
        }
      },
    );

    // Default output stays quiet: one summary line. Per-book detail only under
    // --verbose, so a handful of transient throttles don't bury the listing.
    if (failures.length > 0) {
      if (this.opts.verbose) {
        for (const f of failures) {
          process.stderr.write(
            `[warn] Could not fetch progress for ${f.asin} (${f.title}): ${f.error}\n`,
          );
        }
      } else {
        process.stderr.write(
          `[warn] Progress unavailable for ${failures.length} of ${items.length} ` +
            `books (Amazon throttled or transient). Re-run with --verbose for details.\n`,
        );
      }
    }
    return books;
  }
}
