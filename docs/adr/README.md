# Architecture Decision Records

This directory records the significant, non-obvious decisions made in this project,
in the lightweight [Nygard ADR](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
format. Each record is immutable once Accepted; supersede it with a new record
rather than rewriting history.

| ADR | Title | Status |
| --- | ----- | ------ |
| [0001](0001-numeric-id-validation.md) | Validate sevDesk object IDs as numeric to prevent URL path manipulation | Accepted |
| [0002](0002-ci-test-gate-and-branch-protection.md) | Enforce green tests before merge (CI + branch protection) | Accepted |

New ADR: copy the structure of an existing one, take the next number, set Status to
`Proposed`, and flip to `Accepted` when merged.
