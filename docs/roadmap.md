# Roadmap

Each checkpoint is independently demo-able.

## Checkpoint 1 — List Kindle books & progress
- Define `KindleSource` interface + pure mapping logic (raw API → domain).
- `FixtureSource` (no network) for demo/tests; `CookieApiSource` against the
  Cloud Reader web API (`kindle-library/search` + `startReading`) behind a
  swappable `HttpTransport` (cycletls → Playwright).
- Percent computed client-side: `(startPosition + position) / endPosition`.
- CLI: `ebook-sync kindle list` → books (ASIN, title, author, progress %,
  last-read timestamp). `--fixture` runs offline.
- **Demo:** `kindle list --fixture` now; live cookies once supplied.

## Checkpoint 2 — List KOSync books & progress ✅
- Implement `KosyncClient` (KOSync REST: auth, `GET /syncs/progress/:doc`).
- CLI: `ebook-sync kosync list` (`--fixture` offline; `--verbose`).
- KOSync has no library-listing endpoint, so the books to show are
  **user-curated**: a `kosync.documents` list in config pairs each opaque
  document hash with display labels (title/authors the server doesn't store).
- **Demo:** `kosync list --fixture` now; live against a KOSync server
  (koreader.rocks / Crosspoint / self-hosted) once `kosync` config is supplied.

## Checkpoint 3 — Pair books (TUI)
- Fuzzy match titles/authors across both libraries to suggest pairings.
- `ink` TUI to confirm/override suggested pairs; persist to `config/pairings.json`.
- **Demo:** interactive pairing session producing a saved mapping.

## Checkpoint 3.5 — Functional test harness (TIME-BOXED)
- Sits immediately before the first mutating operation (the sync write).
- KOSync server in a container (testcontainers) + a Kindle API simulator.
- End-to-end read path verified against real-ish services before we write.
- **Time-box:** capped effort. If containers/simulator prove costly, fall back to
  a documented stub-based functional test and move on. Goal is a safety net for
  mutation, not exhaustive coverage.

## Checkpoint 4 — One-way sync (Kindle → KOSync)
- Conflict resolution: newest timestamp wins (default).
- First mutation. Dry-run mode by default; `--apply` to write.
- **Demo:** push Kindle progress to KOSync for paired books.

## Checkpoint 5 — Reverse direction (advisory) + overrides
- KOReader→Kindle is **advisory**: when KOSync is ahead, print the Kindle
  location/page to navigate to manually (no write to Amazon).
- Per-book and global override of the newest-wins policy.
- Keep a `KindleWriter` seam so true write-back (device protocol) can drop in.
- **Demo:** two-way reconciliation where the Kindle side is advice, not a write.

## Checkpoint 6 — Hardening / hosting (later)
- Scheduling, daemon mode, deployment. Out of MVP scope.
