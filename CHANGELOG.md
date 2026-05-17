# Changelog

All notable changes to PromiseLedger are documented here.

## [0.2.0.0] - 2026-05-16

### Added

- Sales can now see engineering issue status directly inside Promise Guard blocked claims, including linked GitHub issues and customer-safe wording when engineering provides it.
- Generated promise-debt issues now include a Sales Guidance section so engineering can explicitly approve safe wording or mark a claim as unsupported.
- Account memory responses now include GitHub lookup status and linked issue counts alongside ledger, timeline, Q&A, and Guard results.

### Fixed

- Promise Guard now renders every blocked claim for a risky draft instead of hiding claims after the first two.
- Closed GitHub issues no longer count as approved Sales guidance unless they include explicit customer-safe wording.
- Toolbar actions start disabled before app boot finishes so early clicks cannot be swallowed.

### Changed

- Promise Guard blocked claims now carry exact obligation references instead of falling back to the first ledger item.
- GitHub issue reads are batched once per account memory request and degrade to visible unavailable status when `gh` fails.

### Tests

- Added coverage for GitHub issue status parsing, duplicate issue handling, unavailable GitHub fallback, explicit safe wording, pending placeholder guidance, exact blocked-claim obligation matching, and the QA pre-boot toolbar regression.
