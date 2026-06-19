/**
 * Transport selection.
 *
 * Two concrete transports exist (see decision log):
 *   - CycleTlsTransport: impersonates a browser's TLS fingerprint. Required on a
 *     normal machine, where Amazon blocks plain `fetch`/`curl` fingerprints.
 *   - FetchTransport: Node's built-in fetch. Simpler and dependency-free, but
 *     gets fingerprint-challenged on a direct connection.
 *
 * In a hosted/container environment the outbound egress proxy terminates and
 * re-originates TLS, so Amazon sees the proxy's fingerprint, not ours — plain
 * fetch works there and CycleTLS's Go worker can't traverse the proxy. We keep
 * CycleTLS as the documented default but let the environment switch the default
 * via `EBOOK_SYNC_TRANSPORT=fetch` (e.g. exported once in the container) so
 * `--fetch` need not be passed on every invocation. The `--fetch` CLI flag
 * forces fetch regardless of environment.
 */
import { FetchTransport, type HttpTransport } from "./transport.js";
import { CycleTlsTransport } from "./cycletls-transport.js";

export type TransportKind = "fetch" | "cycletls";

export const TRANSPORT_ENV_VAR = "EBOOK_SYNC_TRANSPORT";

/**
 * Decide which transport to use. Precedence: explicit `--fetch` flag, then the
 * `EBOOK_SYNC_TRANSPORT` env var, then the CycleTLS default.
 */
export function resolveTransportKind(
  opts: { fetch?: boolean },
  env: Record<string, string | undefined> = process.env,
): TransportKind {
  if (opts.fetch) return "fetch";
  const fromEnv = env[TRANSPORT_ENV_VAR]?.trim().toLowerCase();
  if (fromEnv === "fetch" || fromEnv === "cycletls") return fromEnv;
  return "cycletls";
}

export function createTransport(kind: TransportKind): HttpTransport {
  return kind === "fetch" ? new FetchTransport() : new CycleTlsTransport();
}
