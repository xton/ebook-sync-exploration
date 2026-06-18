import { describe, expect, it, vi, beforeEach } from "vitest";
import { CookieApiSource } from "../../../src/kindle/cookie-source.js";
import type { HttpRequest, HttpResponse, HttpTransport } from "../../../src/kindle/transport.js";

const COOKIES = {
  atMain: "at",
  sessionId: "sess",
  ubidMain: "ubid",
  xMain: "xm",
};

const DEVICE_TOKEN_RESPONSE = JSON.stringify({ deviceSessionToken: "tok-abc" });

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

/** Build a transport mock whose get() resolves based on URL patterns. */
function makeTransport(
  overrides: Partial<Record<"token" | "library" | "reading", string | Error>> = {},
): HttpTransport & { calls: HttpRequest[] } {
  const calls: HttpRequest[] = [];
  return {
    calls,
    get: vi.fn().mockImplementation(async (req: HttpRequest): Promise<HttpResponse> => {
      calls.push(req);
      const url = req.url;
      if (url.includes("getDeviceToken")) {
        const v = overrides.token ?? DEVICE_TOKEN_RESPONSE;
        if (v instanceof Error) throw v;
        return { status: 200, body: v };
      }
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

  it("fetches device token before listing books", async () => {
    const transport = makeTransport();
    const source = new CookieApiSource(transport, { cookies: COOKIES });
    await source.listBooks();
    const tokenCall = transport.calls.find((c) => c.url.includes("getDeviceToken"));
    expect(tokenCall).toBeDefined();
  });

  it("sends x-adp-session-token on subsequent requests after getDeviceToken", async () => {
    const transport = makeTransport();
    const source = new CookieApiSource(transport, { cookies: COOKIES });
    await source.listBooks();
    const libraryCall = transport.calls.find((c) => c.url.includes("kindle-library"));
    expect(libraryCall?.headers["x-adp-session-token"]).toBe("tok-abc");
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

  it("returns books with computed progress", async () => {
    const transport = makeTransport();
    const source = new CookieApiSource(transport, { cookies: COOKIES });
    const books = await source.listBooks();
    expect(books).toHaveLength(2);
    const b1 = books.find((b) => b.id === "B001");
    expect(b1?.progress?.fraction).toBeCloseTo(0.42);
  });

  it("continues without progress when startReading fails, logs a warning", async () => {
    const transport = makeTransport({ reading: new Error("403 Forbidden") });
    const source = new CookieApiSource(transport, { cookies: COOKIES });
    const books = await source.listBooks();
    expect(books).toHaveLength(2);
    expect(books.every((b) => b.progress === undefined)).toBe(true);
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining("[warn] Could not fetch progress"),
    );
  });

  it("continues without device token when getDeviceToken fails, logs a warning", async () => {
    const transport = makeTransport({ token: new Error("network error") });
    const source = new CookieApiSource(transport, { cookies: COOKIES });
    // Should not throw; device token is non-fatal
    const books = await source.listBooks();
    expect(books).toHaveLength(2);
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining("[warn] Could not obtain device session token"),
    );
  });

  it("only calls getDeviceToken once across multiple listBooks calls", async () => {
    const transport = makeTransport();
    const source = new CookieApiSource(transport, { cookies: COOKIES });
    await source.listBooks();
    await source.listBooks();
    const tokenCalls = transport.calls.filter((c) => c.url.includes("getDeviceToken"));
    expect(tokenCalls).toHaveLength(1);
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
        if (req.url.includes("getDeviceToken")) return { status: 200, body: DEVICE_TOKEN_RESPONSE };
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
