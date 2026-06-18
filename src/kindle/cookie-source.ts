/**
 * Live KindleSource backed by the Cloud Reader web API.
 *
 * Flow (see docs/decision-log.md):
 *   1. kindle-library/search (paginated) → owned books + ASINs
 *   2. startReading per ASIN → last-read position → domain Progress
 *
 * Auth is via browser session cookies plus an optional device session token,
 * carried on every request. The actual browser-impersonating I/O is delegated
 * to an injected `HttpTransport`.
 */
import type { KindleBook } from "../domain/types.js";
import {
  LibrarySearchResponseSchema,
  StartReadingResponseSchema,
} from "./api-types.js";
import { toKindleBook } from "./mapping.js";
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
  /** Device session token from getDeviceToken, sent as x-adp-session-token. */
  readonly deviceSessionToken?: string;
}

const cookieHeader = (c: KindleCookies): string =>
  [
    `at-main=${c.atMain}`,
    `session-id=${c.sessionId}`,
    `ubid-main=${c.ubidMain}`,
    `x-main=${c.xMain}`,
  ].join("; ");

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
    const res = await this.transport.get(req);
    if (res.status !== 200) {
      throw new Error(`Kindle API ${url} returned HTTP ${res.status}`);
    }
    return JSON.parse(res.body) as T;
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
      const page = LibrarySearchResponseSchema.parse(raw);
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
    return StartReadingResponseSchema.parse(raw);
  }

  async listBooks(): Promise<readonly KindleBook[]> {
    const items = await this.fetchLibrary();
    const books = await Promise.all(
      items.map(async (item) => {
        try {
          const reading = await this.fetchReading(item.asin);
          return toKindleBook(item, reading);
        } catch {
          // Progress lookup can fail per-book (samples, transient blocks);
          // still surface the book without progress.
          return toKindleBook(item);
        }
      }),
    );
    return books;
  }
}
