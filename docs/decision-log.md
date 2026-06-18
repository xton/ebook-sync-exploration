# Decision Log

Append-only. Newest first.

## 2026-06-18 — Kindle progress source: Cloud Reader web API, not local files
Research (multiple sources) confirms the Kindle desktop apps do **not** store
reliable reading progress in a queryable local store:
- `KindleSyncMetadataCache.xml` and `book_asset.db` hold library metadata
  (ASIN/title/author) and download bookkeeping — **no position/percent**.
- Last-read position historically lived in per-book binary sidecars
  (`.mbp`/`.mbp1`/`.lpr`), and the modern macOS app (`group.com.amazon.Lassen`)
  keeps it in an **undocumented** sandboxed store.
Therefore reading progress comes from the Cloud Reader web API
(`read.amazon.com`): `getDeviceToken` → `startReading?asin=…` →
`lastPageReadData.position` with `startPosition`/`endPosition`; percent is
computed client-side as `(startPosition + position) / endPosition`.
**Supersedes** the earlier "local DB first" auth decision for *progress*. A local
source may still be used later for fast library/title listing (offline).

## 2026-06-18 — Kindle transport: local TLS-impersonation first, Playwright fallback
Amazon blocks non-browser TLS fingerprints (mid-2023+), so plain `fetch`/`curl`
with valid cookies gets challenged. Plan: use a **local** TLS-impersonation
client (e.g. cycletls) so cookies never leave the machine; if that proves
unreliable against fingerprinting/captcha, fall back to driving a **local
headless browser (Playwright)** with the logged-in session. We explicitly avoid
hosted TLS-proxy packages that would route cookies through a third party.

## 2026-06-18 — MVP sync is one-way; Kindle write-back is advisory
Reading Kindle progress is a simple cookie-authed GET; *writing* it requires the
heavyweight device protocol (auth/register → FIRS → RSA-signed sidecar POST).
MVP therefore syncs **Kindle → KOReader** only. The sync engine is built around a
pluggable `KindleWriter` interface so true write-back can be added later without
refactoring. Until then, the KOReader→Kindle direction is **advisory**: we
compute and display the target Kindle location/page for the user to turn to
manually, rather than writing it.

## 2026-06-18 — Functional tests precede first mutation
Functional test harness (Checkpoint 3.5) is placed immediately before the first
mutating operation (sync write) and is **time-boxed**. Rationale: the first time
we write to a real system is the first time we can do damage; we want a safety
net there, but not an open-ended infra investment.

## 2026-06-18 — Node + TypeScript, functional core
Stack: Node 22 + TypeScript, ESM. Functional-core/imperative-shell design with
strict tsconfig. Rationale: type safety, testability, user preference.

## 2026-06-18 — Kindle auth: local DB first, cookie fallback
Prefer reading the Kindle desktop app's local store when present; fall back to
pasted Amazon session cookies. Rationale: local DB avoids credential handling
and is more stable; cookies are the universal fallback.

## 2026-06-18 — ASIN↔hash pairing is user-assisted, not automatic
Kindle (ASIN) and KOSync (file hash) have no shared key. We provide fuzzy-matched
suggestions and persist user-confirmed pairings rather than attempting fully
automatic linking. Rationale: reliable, and acceptable for MVP scope.

## 2026-06-18 — Conflict resolution: newest-wins default, overridable
Default sync policy is newest-timestamp-wins, with per-book and global overrides.

## 2026-06-18 — Minimal dependencies
commander (CLI), zod (validation/config), ink (TUI, added at Checkpoint 3),
vitest (tests). Prefer Node built-ins (e.g. `node:sqlite`) over native deps.
