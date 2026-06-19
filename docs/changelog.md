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
- Transport selection: `--fetch` flag and `EBOOK_SYNC_TRANSPORT` env var choose
  Node's built-in fetch over CycleTLS (for proxied/container environments where
  CycleTLS can't run); logic lives in `kindle/transport-factory.ts`.
