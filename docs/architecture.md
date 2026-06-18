# Architecture

## Principles
- Clean, modular abstractions with strict type safety.
- Functional core, imperative shell: pure domain logic (`src/domain`) isolated
  from I/O adapters (`kindle`, `kosync`). Side effects pushed to the edges.
- Adapters implement narrow interfaces so sources are swappable and testable.

## Modules

```
src/
  domain/    Pure types + logic: Book, Progress, Pairing, conflict resolution.
             No I/O. Fully unit-testable.
  kindle/    KindleSource interface + implementations:
               - CookieApiSource (Cloud Reader web API; the real progress source)
               - FixtureSource   (canned data for demos/tests, no network)
             Transport is abstracted (HttpTransport) so the impersonation
             strategy is swappable: CycleTlsTransport (local TLS-impersonation,
             default) → PlaywrightTransport (local headless browser, fallback).
  kosync/    KOSync REST client (read + write progress).
  pairing/   Fuzzy matching (title/author) + pairing persistence.
  sync/      Bidirectional sync engine; applies conflict resolution.
  tui/       ink-based interactive config/pairing UI.
  cli/       commander-based commands (kindle list, kosync list, pair, sync).
```

## Core domain types (sketch)
- `Book`: stable identity within a library + metadata (title, authors).
- `Progress`: normalized `{ fraction: 0..1, position?: string, updatedAt: Date }`.
- `Pairing`: links a Kindle ASIN to a KOSync document hash.
- Conflict resolution is a pure function `(a: Progress, b: Progress, policy) => Resolution`.

## Auth strategy
- **Cookie-based Cloud Reader API** is the source of truth for progress (local
  desktop files do not reliably contain it — see decision log).
- User supplies Amazon session cookies (`at-main`, `session-id`, `ubid-main`,
  `x-main`); stored in `config/config.json` (gitignored). Cookies last ~1 year.
- A device token is obtained via `getDeviceToken` and sent as
  `x-adp-session-token`.
- **TLS fingerprinting:** requests go through a local impersonating transport
  (cycletls) by default; Playwright fallback if challenged. Cookies never leave
  the user's machine.

## Sync direction & write-back
- MVP syncs **Kindle → KOSync** only.
- Writing progress *to* Kindle needs the device protocol (register + RSA signing);
  deferred behind a `KindleWriter` interface.
- Interim KOReader→Kindle is **advisory**: compute the target Kindle
  location/page and display it for the user to navigate to manually.

## Identity mapping
- Kindle keys on ASIN; KOSync keys on a file-content hash. No automatic bridge.
- We assist the user with fuzzy-matched suggestions and persist confirmed pairs.
