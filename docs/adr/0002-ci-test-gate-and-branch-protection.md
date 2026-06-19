# ADR-0002: Enforce green tests before merge (CI + branch protection)

- Status: Accepted
- Date: 2026-06-19

## Context

This server manipulates real accounting data. A regression in the ID hardening
(ADR-0001) — or anything else — must not reach `main` silently. The project had no
continuous integration and no merge gate.

## Decision

- Add `.github/workflows/ci.yml`, triggered on `pull_request` and on `push` to
  `main`. The single `test` job runs `pnpm install --frozen-lockfile` →
  `pnpm build` → `pnpm test`, with a workflow-level `permissions: contents: read`
  (least-privilege `GITHUB_TOKEN`).
- Protect `main` with three rules: **require a pull request before merging** (with
  zero required approvals, so the maintainer can still self-merge); require the
  `test` status check to pass (strict — the branch must be up to date before merge);
  and `enforce_admins: true`, so the rules apply to the owner as well. Together these
  block direct pushes to `main` for everyone — all changes go through a branch + PR.

## Alternatives considered

- **npm in CI.** Rejected: the repo declares `packageManager: pnpm@10.25.0` and
  commits `pnpm-lock.yaml`. pnpm with `--frozen-lockfile` is the reproducible,
  consistent choice. (`package-lock.json` is intentionally not committed.)
- **`enforce_admins: false`.** Rejected by the maintainer in favour of a hard gate;
  a read-only "escape hatch" was not wanted.

## Consequences

- No pull request merges into `main` without a green `test` run. Direct pushes to
  `main` are blocked — work goes through a branch and PR (this ADR included).
- Open follow-up (non-blocking, raised in review): SHA-pin the action tags
  (`actions/checkout@v4`, `actions/setup-node@v4`, `pnpm/action-setup@v4`) for
  supply-chain hardening.
