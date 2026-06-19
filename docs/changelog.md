# Changelog

## [Unreleased]

### Added
- Project scaffolding: Node 22 + TypeScript (ESM), strict tsconfig, vitest.
- Technical docs: architecture, decision log, roadmap, changelog.
- Live `kindle list` against the Cloud Reader web API (`CookieApiSource`):
  paginated library + per-book `startReading`, with reading fraction computed
  from `lastPageReadData.position`. When `startReading` omits `endPosition`, the
  book's `metadataUrl` is fetched to recover the end bound; position is shown
  when a fraction can't be derived.
- `getDeviceToken` support in the setup wizard (sent as `x-adp-session-token`)
  so `startReading` returns position data.
- `--verbose` flag to dump raw API responses to stderr for debugging.
- Transport selection (`kindle/transport-factory.ts`): `EBOOK_SYNC_TRANSPORT`
  env var plus `--fetch` / `--cycletls` flags.

### Changed
- **`FetchTransport` is now the default transport;** CycleTLS is an opt-in
  fallback (`--cycletls` / `EBOOK_SYNC_TRANSPORT=cycletls`) for direct
  connections that Amazon fingerprint-challenges. Fetch was verified against
  read.amazon.com both in the container (egress proxy re-originates TLS) and on
  a direct laptop connection, and avoids CycleTLS's native Go worker (which also
  can't traverse the container's proxy).
- `kindle list` now fetches per-book progress with **bounded concurrency** (6 at
  a time) and **retries transient throttling** (HTTP 429/5xx) with exponential
  backoff. Firing all `startReading` requests at once made Amazon shed load with
  HTTP 500s, dropping progress for many books; this recovers it (≈205/222 vs
  ≈137/222 in testing).
- Per-book progress failures no longer print one stderr line each. Default output
  is a single summary (`Progress unavailable for N of M books…`); full per-book
  detail is shown only under `--verbose`.
