# Decision Log

Append-only. Newest first.

## 2026-06-19 — KOSync listing is user-curated (no library endpoint)
The KOSync protocol (KOReader's Spore spec, `plugins/kosync.koplugin/api.json`)
has **no "list my books" endpoint** — it only answers
`GET /syncs/progress/:document` for a hash you already hold. So `kosync list`
can't enumerate a library the way `kindle list` does. Decision: the set of
documents to show is **user-curated** in config (`kosync.documents`: each entry
pairs the opaque document hash with display title/authors the server never
stores). This is honest about the protocol and feeds straight into Checkpoint 3
pairing (the hash is exactly the ASIN↔hash key). Wire details confirmed against
the upstream spec: auth via `x-auth-user` + `x-auth-key = md5(password)` (KOReader
hashes the password client-side), `Accept: application/vnd.koreader.v1+json`,
progress record `{ document, progress, percentage, device, device_id, timestamp }`
where `percentage` is a 0..1 fraction and `timestamp` is Unix seconds. The KOSync
HTTP seam is kept separate from the Kindle transport: KOSync is a plain JSON REST
server (no TLS-fingerprint games), so the default is just `fetch`, and the seam
carries method+body (GET to read now, PUT to write at Checkpoint 4).

## 2026-06-19 — `at-main` token refresh: understood, deferred (open question)
Captured so it isn't lost; **no implementation yet.** Observation: the `at-main`
cookie is a short-lived access token (value prefix `Atza|…`); once it lapses,
`read.amazon.com` 302-redirects to `…/ap/signin?…openid.mode=checkid_setup&
openid.pape.max_auth_age=1209600…` — i.e. that redirect *is* the browser's silent
re-auth handshake. So progress reads are gated on token freshness (≈1h), forcing
a periodic server check-in. There are two minting systems behind it:
- **Web "remember-me" cookies:** long-lived `ubid-main` + `x-main` silently mint a
  fresh `at-main` (via the OpenID `checkid_setup` redirect) within `max_auth_age`,
  no password prompt. A browser completes this invisibly; our bare `fetch` only
  sees the 302.
- **Device refresh token:** the Kindle-app path — register a device (`/auth/register`,
  FIRS) for a long-lived `Atnr|…` refresh token, then mint `Atza|…` access tokens
  via `api.amazon.com/auth/token` (`grant_type=refresh_token`). (Config already
  carries an ADP `deviceSessionToken`, i.e. the device-auth family.)

Two routes to self-refresh, both out of current scope:
- **A — replicate the cookie re-auth.** Follow the `checkid_setup` redirect with the
  full cookie jar, capture the new `at-main` from `Set-Cookie`. Brittle (needs more
  cookies than we model: `sess-at-main`, `session-token`, …; fights anti-bot). Most
  reliable as a **logged-in Playwright session** that refreshes for free — fits the
  existing Playwright fallback seam.
- **B — device registration + token refresh.** Durable headless ~yearly credential
  that self-refreshes. This is the **same machinery deferred for Kindle write-back**
  (register → FIRS → RSA-signed requests), so it doubles as the `KindleWriter`
  foundation (Checkpoint 5) — a real milestone, not a quick add.

Note: prefixes/endpoints are inferred from observed behavior + standard Amazon
auth, not verified end-to-end here. Next step when picked up: spike A (detect
302→signin and re-mint) or scope B (device-auth design doc).

## 2026-06-19 — Fetch is now the default transport; CycleTLS is opt-in fallback
After verifying `--fetch` works against `read.amazon.com` not only in the
container but also on a direct laptop connection (no fingerprint challenge
observed with valid cookies), we flipped the default: `FetchTransport` is now
the default and CycleTLS is opt-in via `--cycletls` / `EBOOK_SYNC_TRANSPORT=
cycletls`. Rationale: fetch has no native dependency, spawns no worker, and works
in every environment we've tested; CycleTLS is heavy and can't traverse the
container proxy. We keep CycleTLS rather than deleting it because Amazon's
fingerprint blocking is documented and could resurface on other networks — it's
a cheap, behind-the-seam insurance policy. **Refines** the entry below (which
made fetch an environment-specific override); fetch is now the baseline.

## 2026-06-19 — Container transport: fetch override behind env var
Verified the live Cloud Reader path end-to-end from the hosted container.
Findings: (1) once `*.amazon.com` is in the egress allowlist, Node's plain
`fetch` reaches `read.amazon.com` and is **not** TLS-fingerprint-challenged — the
egress proxy terminates and re-originates TLS, so Amazon sees the proxy's
fingerprint, not ours (a clean `kindle list --fetch` returned the full 222-book
library); (2) CycleTLS's Go worker can't traverse the egress proxy and hangs.
We therefore let the environment select `FetchTransport` via `--fetch` or
`EBOOK_SYNC_TRANSPORT=fetch`, with CycleTLS remaining the documented default for
normal machines (where direct `fetch` *is* fingerprinted). This **does not
supersede** the TLS-impersonation decision below; it's an environment-specific
override. (Note: live runs are also gated on credential freshness — the
`at-main` cookie is a short-lived `Atza|…` OAuth token that 302-redirects to
sign-in once it lapses; unrelated to transport choice.)

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
