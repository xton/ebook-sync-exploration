import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the cycletls module before importing the transport so the native binary
// is never spawned in unit tests.
const mockClient = {
  get: vi.fn(),
  exit: vi.fn(),
};
const mockInit = vi.fn().mockResolvedValue(mockClient);

vi.mock("cycletls", () => ({ default: mockInit }));

// Import AFTER mocking so the top-level `await import("cycletls")` picks up the mock.
const { CycleTlsTransport } = await import(
  "../../../src/kindle/cycletls-transport.js"
);

describe("CycleTlsTransport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInit.mockResolvedValue(mockClient);
  });

  it("initialises the CycleTLS client on first get()", async () => {
    mockClient.get.mockResolvedValue({ status: 200, data: '{"ok":true}' });
    const transport = new CycleTlsTransport();
    await transport.get({ url: "https://example.com", headers: {} });
    expect(mockInit).toHaveBeenCalledOnce();
  });

  it("reuses the same client across multiple requests", async () => {
    mockClient.get.mockResolvedValue({ status: 200, data: "" });
    const transport = new CycleTlsTransport();
    await transport.get({ url: "https://a.com", headers: {} });
    await transport.get({ url: "https://b.com", headers: {} });
    expect(mockInit).toHaveBeenCalledOnce();
  });

  it("passes headers and tlsClientIdentifier to the underlying client", async () => {
    mockClient.get.mockResolvedValue({ status: 200, data: "" });
    const transport = new CycleTlsTransport();
    await transport.get({
      url: "https://read.amazon.com/test",
      headers: { Cookie: "at-main=abc", "User-Agent": "TestAgent/1.0" },
    });
    expect(mockClient.get).toHaveBeenCalledWith(
      "https://read.amazon.com/test",
      expect.objectContaining({
        headers: { Cookie: "at-main=abc", "User-Agent": "TestAgent/1.0" },
        userAgent: "TestAgent/1.0",
        tlsClientIdentifier: "chrome_112",
      }),
    );
  });

  it("returns status and string body from data field", async () => {
    mockClient.get.mockResolvedValue({ status: 200, data: '{"itemsList":[]}' });
    const transport = new CycleTlsTransport();
    const res = await transport.get({ url: "https://x.com", headers: {} });
    expect(res).toEqual({ status: 200, body: '{"itemsList":[]}' });
  });

  it("JSON-serialises non-string data", async () => {
    mockClient.get.mockResolvedValue({ status: 200, data: { key: "value" } });
    const transport = new CycleTlsTransport();
    const res = await transport.get({ url: "https://x.com", headers: {} });
    expect(res.body).toBe('{"key":"value"}');
  });

  it("decodes Buffer-shaped data to a UTF-8 string", async () => {
    const message = "Host not in allowlist";
    const bufferData = { type: "Buffer", data: Array.from(Buffer.from(message, "utf8")) };
    mockClient.get.mockResolvedValue({ status: 403, data: bufferData });
    const transport = new CycleTlsTransport();
    const res = await transport.get({ url: "https://x.com", headers: {} });
    expect(res.body).toBe(message);
    expect(res.status).toBe(403);
  });

  it("decompresses gzip-encoded responses returned as a real Node Buffer", async () => {
    const { gzipSync } = await import("node:zlib");
    const payload = JSON.stringify({ itemsList: [] });
    const compressed = gzipSync(Buffer.from(payload, "utf8"));
    // CycleTLS hands back an actual Buffer instance for compressed bodies.
    mockClient.get.mockResolvedValue({ status: 200, data: compressed });
    const transport = new CycleTlsTransport();
    const res = await transport.get({ url: "https://x.com", headers: {} });
    expect(res.body).toBe(payload);
  });

  it("decompresses gzip-encoded Buffer object responses", async () => {
    const { gzipSync } = await import("node:zlib"); // gzipSync produces output unzipSync can read
    const payload = JSON.stringify({ itemsList: [] });
    const compressed = gzipSync(Buffer.from(payload, "utf8"));
    const bufferData = { type: "Buffer", data: Array.from(compressed) };
    mockClient.get.mockResolvedValue({ status: 200, data: bufferData });
    const transport = new CycleTlsTransport();
    const res = await transport.get({ url: "https://x.com", headers: {} });
    expect(res.body).toBe(payload);
  });

  it("decompresses gzip-encoded Buffer responses serialised as JSON strings", async () => {
    const { gzipSync } = await import("node:zlib"); // gzipSync produces output unzipSync can read
    const payload = JSON.stringify({ itemsList: [] });
    const compressed = gzipSync(Buffer.from(payload, "utf8"));
    const bufferData = { type: "Buffer", data: Array.from(compressed) };
    // CycleTLS sometimes returns the Buffer as a JSON string rather than an object.
    mockClient.get.mockResolvedValue({ status: 200, data: JSON.stringify(bufferData) });
    const transport = new CycleTlsTransport();
    const res = await transport.get({ url: "https://x.com", headers: {} });
    expect(res.body).toBe(payload);
  });

  it("propagates non-200 status codes", async () => {
    mockClient.get.mockResolvedValue({ status: 403, data: "Forbidden" });
    const transport = new CycleTlsTransport();
    const res = await transport.get({ url: "https://x.com", headers: {} });
    expect(res.status).toBe(403);
  });

  it("calls exit() on close() and allows re-init afterwards", async () => {
    mockClient.get.mockResolvedValue({ status: 200, data: "" });
    const transport = new CycleTlsTransport();
    await transport.get({ url: "https://x.com", headers: {} });
    await transport.close();
    expect(mockClient.exit).toHaveBeenCalledOnce();

    // After close, next get() should re-init.
    await transport.get({ url: "https://x.com", headers: {} });
    expect(mockInit).toHaveBeenCalledTimes(2);
  });

  it("close() is a no-op before any request", async () => {
    const transport = new CycleTlsTransport();
    await expect(transport.close()).resolves.toBeUndefined();
    expect(mockClient.exit).not.toHaveBeenCalled();
  });
});
