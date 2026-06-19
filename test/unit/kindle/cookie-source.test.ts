import { describe, expect, it, vi, beforeEach } from "vitest";
import { CookieApiSource } from "../../../src/kindle/cookie-source.js";
import type { HttpRequest, HttpResponse, HttpTransport } from "../../../src/kindle/transport.js";

const COOKIES = {
  atMain: "at",
  sessionId: "sess",
  ubidMain: "ubid",
  xMain: "xm",
};

const LIBRARY_RESPONSE = JSON.stringify({
  itemsList: [
    { asin: "B001", title: "Book One", authors: ["Author, A"] },
    { asin: "B002", title: "Book Two", authors: ["Author, B"] },
  ],
});

const startReadingResponse = (position: number) =>
  JSON.stringify({
    startPosition: 0,
    endPosition: 10000,
    lastPageReadData: { position, syncTime: 1_718_500_000_000, deviceName: "Kindle" },
  });

function makeTransport(
  overrides: Partial<Record<"library" | "reading", string | Error>> = {},
): HttpTransport & { calls: HttpRequest[] } {
  const calls: HttpRequest[] = [];
  return {
    calls,
    get: vi.fn().mockImplementation(async (req: HttpRequest): Promise<HttpResponse> => {
      calls.push(req);
      const url = req.url;
      if (url.includes("kindle-library")) {
        const v = overrides.library ?? LIBRARY_RESPONSE;
        if (v instanceof Error) throw v;
        return { status: 200, body: v };
      }
      if (url.includes("startReading")) {
        const asin = new URL(url).searchParams.get("asin") ?? "B001";
        const v = overrides.reading ?? startReadingResponse(asin === "B001" ? 4200 : 8000);
        if (v instanceof Error) throw v;
        return { status: 200, body: typeof v === "string" ? v : JSON.stringify(v) };
      }
      return { status: 404, body: "not found" };
    }),
  };
}

describe("CookieApiSource", () => {
  beforeEach(() => {
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
  });

  it("includes session cookies on every request", async () => {
    const transport = makeTransport();
    const source = new CookieApiSource(transport, { cookies: COOKIES });
    await source.listBooks();
    for (const call of transport.calls) {
      expect(call.headers["Cookie"]).toContain("at-main=at");
      expect(call.headers["Cookie"]).toContain("session-id=sess");
    }
  });

  it("does NOT call getDeviceToken automatically", async () => {
    const transport = makeTransport();
    const source = new CookieApiSource(transport, { cookies: COOKIES });
    await source.listBooks();
    const tokenCall = transport.calls.find((c) => c.url.includes("getDeviceToken"));
    expect(tokenCall).toBeUndefined();
  });

  it("sends x-adp-session-token when deviceSessionToken is supplied", async () => {
    const transport = makeTransport();
    const source = new CookieApiSource(transport, {
      cookies: COOKIES,
      deviceSessionToken: "tok-abc",
    });
    await source.listBooks();
    for (const call of transport.calls) {
      expect(call.headers["x-adp-session-token"]).toBe("tok-abc");
    }
  });

  it("omits x-adp-session-token when no deviceSessionToken is supplied", async () => {
    const transport = makeTransport();
    const source = new CookieApiSource(transport, { cookies: COOKIES });
    await source.listBooks();
    for (const call of transport.calls) {
      expect(call.headers["x-adp-session-token"]).toBeUndefined();
    }
  });

  it("returns books with computed progress", async () => {
    const transport = makeTransport();
    const source = new CookieApiSource(transport, { cookies: COOKIES });
    const books = await source.listBooks();
    expect(books).toHaveLength(2);
    const b1 = books.find((b) => b.id === "B001");
    expect(b1?.progress?.fraction).toBeCloseTo(0.42);
  });

  it("continues without progress when startReading fails, logs a quiet summary", async () => {
    const transport = makeTransport({ reading: new Error("403 Forbidden") });
    const source = new CookieApiSource(transport, { cookies: COOKIES });
    const books = await source.listBooks();
    expect(books).toHaveLength(2);
    expect(books.every((b) => b.progress === undefined)).toBe(true);
    // Default (non-verbose) mode summarises rather than printing one line per book.
    const out = (process.stderr.write as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .map((c) => String(c[0]))
      .join("");
    expect(out).toMatch(/Progress unavailable for 2 of 2 books/);
    expect(out).not.toMatch(/Could not fetch progress for B001/);
  });

  it("prints per-book warnings under verbose when startReading fails", async () => {
    const transport = makeTransport({ reading: new Error("403 Forbidden") });
    const source = new CookieApiSource(transport, { cookies: COOKIES, verbose: true });
    await source.listBooks();
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining("[warn] Could not fetch progress for B001"),
    );
  });

  it("retries transient throttling statuses and recovers progress", async () => {
    let attempts = 0;
    const transport: HttpTransport & { calls: HttpRequest[] } = {
      calls: [],
      get: vi.fn().mockImplementation(async (req: HttpRequest): Promise<HttpResponse> => {
        transport.calls.push(req);
        if (req.url.includes("kindle-library")) {
          return { status: 200, body: JSON.stringify({ itemsList: [{ asin: "B1", title: "T", authors: [] }] }) };
        }
        // Fail the first two startReading attempts with 500, then succeed.
        if (attempts++ < 2) return { status: 500, body: '{"message":null}' };
        return { status: 200, body: startReadingResponse(5000) };
      }),
    };
    const source = new CookieApiSource(transport, { cookies: COOKIES });
    const books = await source.listBooks();
    expect(books[0]?.progress?.fraction).toBeCloseTo(0.5);
    const readingCalls = transport.calls.filter((c) => c.url.includes("startReading"));
    expect(readingCalls).toHaveLength(3); // 2 failed + 1 succeeded
  });

  it("bounds per-book concurrency", async () => {
    const asins = Array.from({ length: 30 }, (_, i) => `B${i}`);
    let inFlight = 0;
    let maxInFlight = 0;
    const transport: HttpTransport & { calls: HttpRequest[] } = {
      calls: [],
      get: vi.fn().mockImplementation(async (req: HttpRequest): Promise<HttpResponse> => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        try {
          await Promise.resolve();
          if (req.url.includes("kindle-library")) {
            return { status: 200, body: JSON.stringify({ itemsList: asins.map((a) => ({ asin: a, title: a, authors: [] })) }) };
          }
          return { status: 200, body: startReadingResponse(1000) };
        } finally {
          inFlight--;
        }
      }),
    };
    const source = new CookieApiSource(transport, { cookies: COOKIES });
    await source.listBooks();
    expect(maxInFlight).toBeLessThanOrEqual(6);
    expect(maxInFlight).toBeGreaterThan(1);
  });

  it("throws with a diagnostic snippet when the library response has unexpected shape", async () => {
    const transport = makeTransport({ library: JSON.stringify({ wrong: "shape" }) });
    const source = new CookieApiSource(transport, { cookies: COOKIES });
    await expect(source.listBooks()).rejects.toThrow("kindle-library/search");
  });

  it("paginates the library using paginationToken", async () => {
    const page1 = JSON.stringify({
      itemsList: [{ asin: "B001", title: "Book One", authors: [] }],
      paginationToken: "page2token",
    });
    const page2 = JSON.stringify({
      itemsList: [{ asin: "B002", title: "Book Two", authors: [] }],
    });
    let libraryCalls = 0;
    const transport: HttpTransport & { calls: HttpRequest[] } = {
      calls: [],
      get: vi.fn().mockImplementation(async (req: HttpRequest): Promise<HttpResponse> => {
        transport.calls.push(req);
        if (req.url.includes("kindle-library")) {
          return { status: 200, body: libraryCalls++ === 0 ? page1 : page2 };
        }
        return { status: 200, body: startReadingResponse(100) };
      }),
    };
    const source = new CookieApiSource(transport, { cookies: COOKIES });
    const books = await source.listBooks();
    expect(books).toHaveLength(2);
    const libCalls = transport.calls.filter((c) => c.url.includes("kindle-library"));
    expect(libCalls).toHaveLength(2);
    expect(libCalls[1]?.url).toContain("paginationToken=page2token");
  });

  it("logs raw responses to stderr in verbose mode", async () => {
    const transport = makeTransport();
    const source = new CookieApiSource(transport, { cookies: COOKIES, verbose: true });
    await source.listBooks();
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining("[verbose]"),
    );
  });
});
