# CLAUDE.md

## Project
`ebook-sync-bridge` — a CLI/TUI tool to sync reading progress between Kindle (Cloud Reader) and KOSync-compatible devices (KOReader/Crosspoint).

See `docs/` for architecture, decision log, roadmap, and changelog.

## Development process

### PRs
- **Open a PR for every checkpoint** (one per roadmap milestone). Prefer more PRs to fewer.
- Commit in chronological, logical steps within a PR to help review.
- Auto-track every PR you open: subscribe to CI events and respond to failures automatically.
- Branch from `main`; name branches `feat/<short-description>`.

### CI
- Every push runs: `npm run typecheck`, `npm test` (unit tests via vitest).
- Functional tests (`npm run test:functional`) run as a separate, optional CI job — they are time-boxed and may require containers.

### Checkpoints (demo-able milestones)
1. **Kindle list** — `ebook-sync kindle list [--fixture]` ✅
2. **KOSync list** — `ebook-sync kosync list`
3. **Pairing TUI** — fuzzy-match books, persist pairings
3.5 **Functional test harness** — time-boxed; containers + Kindle API simulator, before first mutation
4. **Sync Kindle→KOReader** — dry-run default, `--apply` to write
5. **Advisory reverse direction** — show Kindle location/page to navigate to; `KindleWriter` seam for future write-back
6. **Hardening / hosting** (out of MVP scope)

## Stack
- Node 22 + TypeScript (strict, ESM)
- vitest for unit tests; testcontainers for functional tests
- commander (CLI), ink (TUI, Checkpoint 3), zod (validation)

## Key design rules
- Functional core (`src/domain/`, mappings): pure functions, no I/O, fully unit-tested.
- I/O at the edges only (`src/kindle/`, `src/kosync/`, `src/cli/`).
- Interfaces are narrow and injectable so adapters are swappable in tests.
- Transport is abstracted (`HttpTransport`): CycleTLS (default) → Playwright (fallback) for Amazon's TLS fingerprinting.
- Sync is **one-way Kindle→KOReader** in MVP; `KindleWriter` interface kept as a seam.
- Secrets (`config/config.json`) are gitignored — never commit.

## Running locally
```
npm install
npm run dev -- kindle list --fixture     # offline demo (no credentials)
npm test                                  # unit tests
npm run typecheck                         # type check
```
