---
schemaVersion: "0.1"
datasetName: "promiseledger-spare-demo"
generatedAt: "2026-05-16T20:00:00-07:00"
---

# PromiseLedger Spare Demo Fixtures

This dataset contains three fictional customer account packets for a PromiseLedger hackathon demo. Each packet includes messy customer-facing and internal artifacts, Promise Guard draft inputs, and expected/oracle outputs.

All companies, people, domains, emails, products, contracts, claims, and facts are fictional. The packets are designed to test extraction of commitments, risks, owners, deadlines, customer dependencies, missing owners, contradictions, and outbound Promise Guard decisions.

## Accounts

- HelioGrid Energy — regulated infrastructure pilot and unsupported live grid-dispatch automation promise.
- Cedar & Slate Retail — retail expansion with payment and data integration scope mismatch.
- Ridgeway University — education onboarding with privacy and legal timeline mismatch.

## Demo Flow

1. Ingest CRM exports, calls, emails, proposals, contracts, Slack handoffs, product boundaries, legal reviews, support records, onboarding plans, and outbound drafts.
2. Extract source-backed obligations.
3. Compare soft promises against authoritative policy, product, contract, and privacy sources.
4. Render an account ledger.
5. Run Promise Guard on safe and risky outbound drafts.
