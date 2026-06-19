/**
 * Transport selection.
 *
 * Two concrete transports exist (see decision log):
 *   - FetchTransport: Node's built-in fetch. The default — proven against
 *     read.amazon.com both in the hosted container (where the egress proxy
 *     re-originates TLS) and on a direct connection. No native deps, no worker.
 *   - CycleTlsTransport: impersonates a browser's TLS fingerprint. Kept as an
 *     opt-in fallback for the case where Amazon fingerprint-challenges a direct
 *     `fetch` connection. Heavy (spawns a Go worker) and can't traverse the
 *     container's egress proxy, so it is no longer the default.
 *
 * Default is fetch; opt into impersonation with `--cycletls` or
 * `EBOOK_SYNC_TRANSPORT=cycletls`.
 */
import { FetchTransport, type HttpTransport } from "./transport.js";
import { CycleTlsTransport } from "./cycletls-transport.js";

export type TransportKind = "fetch" | "cycletls";

export const TRANSPORT_ENV_VAR = "EBOOK_SYNC_TRANSPORT";

/**
 * Decide which transport to use. Precedence: explicit flags (`--cycletls` then
 * `--fetch`), then the `EBOOK_SYNC_TRANSPORT` env var, then the fetch default.
 */
export function resolveTransportKind(
  opts: { fetch?: boolean; cycletls?: boolean },
  env: Record<string, string | undefined> = process.env,
): TransportKind {
  if (opts.cycletls) return "cycletls";
  if (opts.fetch) return "fetch";
  const fromEnv = env[TRANSPORT_ENV_VAR]?.trim().toLowerCase();
  if (fromEnv === "fetch" || fromEnv === "cycletls") return fromEnv;
  return "fetch";
}

export function createTransport(kind: TransportKind): HttpTransport {
  return kind === "fetch" ? new FetchTransport() : new CycleTlsTransport();
}

