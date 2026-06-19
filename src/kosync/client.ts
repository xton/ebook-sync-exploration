/**
 * Low-level KOSync REST client: auth + progress reads.
 *
 * Wire details (see api-types.ts):
 *   - Auth headers on every protected call: x-auth-user = username,
 *     x-auth-key = md5(password). KOReader hashes the password client-side, so
 *     the password supplied here is the same plaintext entered into KOReader.
 *   - Accept: application/vnd.koreader.v1+json (KOReader's versioned media type).
 *
 * I/O is delegated to an injected `KosyncTransport` (fetch by default) so the
 * client is unit-testable without a server. Checkpoint 4 adds `putProgress`.
 */
import { createHash } from "node:crypto";
import { ZodError } from "zod";
import {
  AuthResponseSchema,
  ProgressResponseSchema,
  type ProgressResponse,
} from "./api-types.js";
import type { KosyncTransport } from "./transport.js";

const ACCEPT = "application/vnd.koreader.v1+json";

const md5Hex = (value: string): string =>
  createHash("md5").update(value).digest("hex");

export interface KosyncClientOptions {
  readonly serverUrl: string;
  readonly username: string;
  /** Plaintext password (the one used in KOReader); md5'd into x-auth-key. */
  readonly password: string;
  readonly verbose?: boolean | undefined;
}

export class KosyncClient {
  private readonly base: string;
  private readonly authKey: string;

  constructor(
    private readonly transport: KosyncTransport,
    private readonly opts: KosyncClientOptions,
  ) {
    // Tolerate a trailing slash in the configured server URL.
    this.base = opts.serverUrl.replace(/\/+$/, "");
    this.authKey = md5Hex(opts.password);
  }

  private headers(): Record<string, string> {
    return {
      Accept: ACCEPT,
      "x-auth-user": this.opts.username,
      "x-auth-key": this.authKey,
    };
  }

  private log(line: string): void {
    if (this.opts.verbose) process.stderr.write(`[verbose] ${line}\n`);
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
        const snippet = JSON.stringify(raw).slice(0, 300);
        throw new Error(
          `Unexpected KOSync response shape for ${context}. Raw: ${snippet}\nValidation: ${err.message}`,
        );
      }
      throw err;
    }
  }

  /**
   * Verify credentials via `GET /users/auth`. Throws a clear error on 401 so
   * the CLI can tell the user their username/password is wrong before it tries
   * to list anything.
   */
  async authorize(): Promise<void> {
    const url = `${this.base}/users/auth`;
    const res = await this.transport.send({ method: "GET", url, headers: this.headers() });
    this.log(`GET ${url} → ${res.status}\n${res.body.slice(0, 2000)}`);
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        "KOSync authorization failed (HTTP " +
          res.status +
          "). Check the username and password in config/config.json.",
      );
    }
    if (res.status !== 200) {
      throw new Error(`KOSync ${url} returned HTTP ${res.status}: ${res.body.slice(0, 200)}`);
    }
    const parsed = this.parseOrThrow(AuthResponseSchema, JSON.parse(res.body), "/users/auth");
    if (parsed.authorized && parsed.authorized !== "OK") {
      throw new Error(`KOSync authorization rejected: ${parsed.authorized}`);
    }
  }

  /** Fetch the stored progress record for a document hash. */
  async getProgress(hash: string): Promise<ProgressResponse> {
    const url = `${this.base}/syncs/progress/${encodeURIComponent(hash)}`;
    const res = await this.transport.send({ method: "GET", url, headers: this.headers() });
    this.log(`GET ${url} → ${res.status}\n${res.body.slice(0, 2000)}`);
    if (res.status !== 200) {
      throw new Error(`KOSync ${url} returned HTTP ${res.status}: ${res.body.slice(0, 200)}`);
    }
    // Empty body (some servers) means "no record" → an empty progress object.
    const raw = res.body.trim() === "" ? {} : JSON.parse(res.body);
    return this.parseOrThrow(ProgressResponseSchema, raw, `getProgress(${hash})`);
  }
}
