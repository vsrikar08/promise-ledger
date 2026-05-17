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

## Hackathon App

PromiseLedger now includes a small dependency-free Node app that imports the mock sales-system corpus into GBrain, extracts promise debt from the imported pages, and creates real GitHub Issues for developer follow-up. Promise Guard also reads linked GitHub issues back into the account memory rail so Sales can see engineering status before repeating an unsupported claim.

### Prerequisites

- Node 22+
- `gbrain` on `PATH`
- GitHub CLI authenticated as an account that can create issues in `vsrikar08/promise-ledger`

### Run

```bash
npm run import:gbrain
npm run dev
```

If `3210` is already occupied, run:

```bash
PORT=3211 npm run dev
```

Open:

```text
http://127.0.0.1:3210
```

or the fallback port you selected, for example `http://127.0.0.1:3211`.

The demo flow is:

1. Import all mock data into GBrain.
2. Select Acme Robotics.
3. Extract promise debt from GBrain.
4. Review source-backed developer issues.
5. Review Promise Guard results for risky and safe outbound drafts.
6. Check linked GitHub engineering status and customer-safe wording on blocked claims.
7. Preview or create selected GitHub Issues.

### Useful Commands

```bash
npm test
npm run eval
gh issue list --repo vsrikar08/promise-ledger
```

Runtime state is written to `.promiseledger/` and is intentionally ignored by git.
