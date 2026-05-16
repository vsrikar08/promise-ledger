# PromiseLedger

PromiseLedger is a demo workspace for exploring how customer-facing promises can be extracted, checked, and turned into an account-level ledger.

The current repository contains fictional fixture datasets for hackathon/demo flows. The fixtures include CRM records, calls, emails, Slack threads, proposals, contracts, product boundaries, onboarding plans, outbound drafts, and expected oracle outputs.

## Contents

- `mock data/fixtures/promiseledger-demo/` - primary fictional demo dataset.
- `mock data/fixtures 2/promiseledger-spare-demo/` - spare fictional demo dataset with additional account packets.

## Demo Flow

1. Ingest messy account artifacts from CRM, calls, email, Slack, proposals, contracts, and onboarding documents.
2. Extract source-backed commitments, risks, owners, deadlines, and customer dependencies.
3. Compare promises against product, policy, contract, privacy, and support boundaries.
4. Render an account ledger for review.
5. Run Promise Guard checks on safe and risky outbound drafts.

## Notes

All companies, people, domains, products, contracts, claims, and facts in the fixture data are fictional.
