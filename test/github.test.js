import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPromiseDebtIssueLookupFromIssues, createGithubIssuePlanner, getPromiseDebtIssueLookup } from '../src/github.js';

test('GitHub issue planner freezes previewed issues behind a one-time nonce', () => {
  const created = [];
  const planner = createGithubIssuePlanner({
    repo: 'example/promise-ledger',
    nonceFactory: () => 'nonce_test_1',
    findExistingIssue: () => null,
    createIssue: (issue) => {
      created.push(issue.title);
      return { url: `https://github.example/issues/${created.length}` };
    },
  });
  const obligations = [
    {
      id: 'promise-debt-1',
      githubTitle: '[PromiseDebt][Critical] Acme: Dashboard owner',
      githubBody: 'body 1',
      githubLabels: ['promise-debt', 'critical'],
    },
    {
      id: 'promise-debt-2',
      githubTitle: '[PromiseDebt][Critical] Acme: NetSuite scope',
      githubBody: 'body 2',
      githubLabels: ['promise-debt', 'critical'],
    },
  ];

  const preview = planner.preview(obligations);
  assert.equal(preview.repo, 'example/promise-ledger');
  assert.equal(preview.nonce, 'nonce_test_1');
  assert.equal(preview.selectedCount, 2);
  assert.deepEqual(preview.results.map((result) => result.status), ['dry_run', 'dry_run']);

  const result = planner.create({ nonce: preview.nonce });
  assert.deepEqual(created, [
    '[PromiseDebt][Critical] Acme: Dashboard owner',
    '[PromiseDebt][Critical] Acme: NetSuite scope',
  ]);
  assert.deepEqual(result.results.map((item) => item.status), ['created', 'created']);

  assert.throws(
    () => planner.create({ nonce: preview.nonce }),
    (error) => error.code === 'INVALID_NONCE',
  );
});

test('promise-debt issue lookup parses engineering status from GitHub issues', () => {
  const lookup = buildPromiseDebtIssueLookupFromIssues([
    issue({
      number: 7,
      state: 'OPEN',
      body: '## Provenance\n\n- PromiseLedger-Commitment-ID: promise-debt-acme-robotics-netsuite-abc123',
    }),
    issue({
      number: 8,
      state: 'CLOSED',
      title: 'Acme dashboard',
      body: [
        '## Provenance',
        '',
        '- PromiseLedger-Commitment-ID: promise-debt-acme-robotics-dashboard-def456',
        '',
        'Decision: approved_with_wording',
        '',
        '## Customer-safe wording',
        'We will share a dashboard preview plan after reviewing the field map.',
      ].join('\n'),
      labels: [{ name: 'promise-debt' }],
    }),
    issue({
      number: 9,
      state: 'CLOSED',
      title: 'Acme external email',
      body: [
        '## Provenance',
        '',
        '- PromiseLedger-Commitment-ID: promise-debt-acme-robotics-external-email-ghi789',
        '',
        'Decision: not_supported',
      ].join('\n'),
    }),
  ], { repo: 'example/promise-ledger' });

  assert.equal(lookup.status, 'available');
  assert.equal(lookup.repo, 'example/promise-ledger');
  assert.equal(lookup.issuesByCommitmentId['promise-debt-acme-robotics-netsuite-abc123'].status, 'open');
  assert.equal(lookup.issuesByCommitmentId['promise-debt-acme-robotics-dashboard-def456'].status, 'closed_approved_with_wording');
  assert.equal(
    lookup.issuesByCommitmentId['promise-debt-acme-robotics-dashboard-def456'].salesGuidance,
    'We will share a dashboard preview plan after reviewing the field map.',
  );
  assert.equal(lookup.issuesByCommitmentId['promise-debt-acme-robotics-external-email-ghi789'].status, 'closed_not_supported');
});

test('promise-debt issue lookup chooses the newest duplicate deterministically', () => {
  const lookup = buildPromiseDebtIssueLookupFromIssues([
    issue({
      number: 10,
      updatedAt: '2026-05-16T10:00:00Z',
      body: '- PromiseLedger-Commitment-ID: promise-debt-duplicate',
    }),
    issue({
      number: 12,
      updatedAt: '2026-05-16T12:00:00Z',
      body: '- PromiseLedger-Commitment-ID: promise-debt-duplicate',
    }),
  ]);

  assert.deepEqual(lookup.duplicateCommitmentIds, ['promise-debt-duplicate']);
  assert.equal(lookup.issuesByCommitmentId['promise-debt-duplicate'].issue.number, 12);
  assert.equal(lookup.issuesByCommitmentId['promise-debt-duplicate'].duplicateCount, 2);
});

test('pending Sales Guidance instructions do not count as approved safe wording', () => {
  const lookup = buildPromiseDebtIssueLookupFromIssues([
    issue({
      number: 20,
      state: 'CLOSED',
      body: [
        '## Promise Debt',
        '',
        'NetSuite is not approved for pilot scope.',
        '',
        '## Sales Guidance',
        '',
        'Decision: pending',
        '',
        'When Engineering resolves this for Sales, replace the decision with `approved_with_wording` and add `Customer-safe wording: ...`, or use `not_supported` if Sales must not promise it.',
        '',
        '## Provenance',
        '',
        '- PromiseLedger-Commitment-ID: promise-debt-pending',
      ].join('\n'),
    }),
  ]);

  assert.equal(lookup.issuesByCommitmentId['promise-debt-pending'].status, 'closed_no_guidance');
  assert.equal(lookup.issuesByCommitmentId['promise-debt-pending'].decision, 'none');
  assert.equal(lookup.issuesByCommitmentId['promise-debt-pending'].salesGuidance, '');
});

test('promise-debt issue lookup degrades when GitHub is unavailable', () => {
  const lookup = getPromiseDebtIssueLookup({
    repo: 'example/promise-ledger',
    command: () => ({ ok: false, code: 'COMMAND_TIMEOUT', error: 'gh timed out' }),
  });

  assert.equal(lookup.status, 'unavailable');
  assert.equal(lookup.repo, 'example/promise-ledger');
  assert.equal(lookup.errorCode, 'COMMAND_TIMEOUT');
  assert.deepEqual(lookup.issuesByCommitmentId, {});
});

function issue(input = {}) {
  return {
    number: input.number ?? 1,
    title: input.title || 'Promise debt issue',
    state: input.state || 'OPEN',
    stateReason: input.stateReason || '',
    url: input.url || `https://github.example/issues/${input.number ?? 1}`,
    labels: input.labels || [{ name: 'promise-debt' }],
    body: input.body || '',
    updatedAt: input.updatedAt || '2026-05-16T00:00:00Z',
  };
}
