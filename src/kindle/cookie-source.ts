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
    if (this.opts.verbose) {
      process.stderr.write(
        `[verbose] GET ${url} → ${res.status}\n${res.body.slice(0, 800)}\n\n`,
      );
    }
    if (res.status !== 200) {
      throw new Error(
        `Kindle API ${url} returned HTTP ${res.status}: ${res.body.slice(0, 200)}`,
      );
    }
    return JSON.parse(res.body) as T;
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

  async listBooks(): Promise<readonly KindleBook[]> {
    const items = await this.fetchLibrary();
    const books = await Promise.all(
      items.map(async (item) => {
        try {
          const reading = await this.fetchReading(item.asin);
          return toKindleBook(item, reading);
        } catch (err) {
          process.stderr.write(
            `[warn] Could not fetch progress for ${item.asin} (${item.title}): ${String(err)}\n`,
          );
          return toKindleBook(item);
        }
      }),
    );
    return books;
  }
}
