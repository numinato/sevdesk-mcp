# ADR-0001: Validate sevDesk object IDs as numeric to prevent URL path manipulation

- Status: Accepted
- Date: 2026-06-19
- Decided in: PR #1

## Context

Every tool addresses its sevDesk object through a single `id` parameter that is
interpolated directly into the request path, e.g. `/Voucher/${id}` or
`/Invoice/${id}/enshrine` (`src/tools/*.ts`). Query-string parameters already pass
through `encodeURIComponent` via `buildQueryString` (`src/api.ts`), but path
segments did not.

IDs were typed as a free `z.string()`. A crafted value such as `5/enshrine` or
`../Invoice/9` could therefore redirect a routine `delete`/`update` call to a
different — and in the case of `enshrine`, irreversible — endpoint **within the
authenticated account**. The blast radius is bounded to that account (the base URL
`https://my.sevdesk.de/api/v1` is hardcoded, so this is not SSRF), but it is a real
path-manipulation / request-integrity issue. The realistic trigger is prompt
injection: an agent picking up an `id` from untrusted content (a document, a
webhook, another tool's output) and passing it through verbatim.

## Decision

Constrain every sevDesk object `id` to digits (`/^\d+$/`), with a **single source of
truth** in `src/validation.ts`:

- **`idSchema`** (zod) — used by every tool input schema. This is the MCP boundary:
  the MCP SDK validates tool arguments against the schema before the handler runs.
- **`idSegment(id)`** — a runtime guard that wraps every `id` interpolated into a
  request path. This is the path-construction boundary. It also rejects non-string
  input and `String()`-coerces + truncates + `JSON.stringify`-serializes the
  offending value in its error message, so nothing untrusted is reflected back
  through `handleError()`.

Two layers are deliberate: the tool functions are exported and can be imported and
called directly, bypassing Zod. `idSegment` closes that direct-call path.

## Alternatives considered

- **`encodeURIComponent` at each call site.** Rejected: ~64 interpolation sites,
  easy to miss one, and it *sanitizes* rather than *validates* — a strange-but-
  encoded id would still be accepted. Validation is stricter and centralizable.
- **`z.number()` / numeric coercion.** Rejected: sevDesk object IDs are modelled as
  decimal strings throughout the type layer (`SevdeskObjectRef { id: string }`,
  `src/types.ts`). Switching to `number` would ripple through types and the API
  contract for no added safety.
- **Schema-only (no `idSegment`).** Rejected: leaves the direct-import path
  unguarded (surfaced in code review).

## Consequences

- The **entire** path-interpolation surface is covered (64 `id` fields across 10
  tool modules), verified by a repo-wide grep and by an exhaustive regression test
  that auto-discovers every exported `*Schema` with an `id` field via
  `import.meta.glob('../tools/**/*.ts')` (`src/tests/id-validation.test.ts`). A
  count guard fails the suite if discovery silently drops schemas.
- **Breaking change:** previously-accepted non-numeric `id` strings now raise a
  validation error. Hence the major version bump to `2.0.0`.
- Unicode digits are intentionally rejected — `\d` is ASCII-only in JS regex.
- If sevDesk ever introduces non-numeric or composite path IDs, only
  `idSchema`/`idSegment` need to change (one file).
- Layered defense: Zod at parse → `idSegment` at the call site → `handleError` at
  the MCP boundary.
