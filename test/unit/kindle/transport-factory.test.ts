import { describe, expect, it } from "vitest";
import {
  createTransport,
  resolveTransportKind,
  TRANSPORT_ENV_VAR,
} from "../../../src/kindle/transport-factory.js";
import { FetchTransport } from "../../../src/kindle/transport.js";

describe("resolveTransportKind", () => {
  it("defaults to fetch with no flag or env", () => {
    expect(resolveTransportKind({}, {})).toBe("fetch");
  });

  it("returns cycletls when --cycletls flag is set", () => {
    expect(resolveTransportKind({ cycletls: true }, {})).toBe("cycletls");
  });

  it("returns fetch when --fetch flag is set", () => {
    expect(resolveTransportKind({ fetch: true }, {})).toBe("fetch");
  });

  it("honours EBOOK_SYNC_TRANSPORT=cycletls", () => {
    expect(resolveTransportKind({}, { [TRANSPORT_ENV_VAR]: "cycletls" })).toBe(
      "cycletls",
    );
  });

  it("honours EBOOK_SYNC_TRANSPORT=fetch", () => {
    expect(resolveTransportKind({}, { [TRANSPORT_ENV_VAR]: "fetch" })).toBe(
      "fetch",
    );
  });

  it("is case-insensitive and trims whitespace in the env var", () => {
    expect(resolveTransportKind({}, { [TRANSPORT_ENV_VAR]: "  CYCLETLS  " })).toBe(
      "cycletls",
    );
  });

  it("ignores unrecognised env values and falls back to the fetch default", () => {
    expect(resolveTransportKind({}, { [TRANSPORT_ENV_VAR]: "curl" })).toBe(
      "fetch",
    );
  });

  it("--cycletls flag overrides EBOOK_SYNC_TRANSPORT=fetch", () => {
    expect(
      resolveTransportKind({ cycletls: true }, { [TRANSPORT_ENV_VAR]: "fetch" }),
    ).toBe("cycletls");
  });

  it("--fetch flag overrides EBOOK_SYNC_TRANSPORT=cycletls", () => {
    expect(
      resolveTransportKind({ fetch: true }, { [TRANSPORT_ENV_VAR]: "cycletls" }),
    ).toBe("fetch");
  });
});

describe("createTransport", () => {
  it("creates a FetchTransport for kind 'fetch'", () => {
    expect(createTransport("fetch")).toBeInstanceOf(FetchTransport);
  });

  it("creates a CycleTLS-backed transport for kind 'cycletls'", () => {
    // Constructing CycleTlsTransport does not spawn the worker (that happens
    // lazily on first get()), so this is safe in a unit test.
    const t = createTransport("cycletls");
    expect(t).not.toBeInstanceOf(FetchTransport);
    expect(typeof t.get).toBe("function");
  });
});
