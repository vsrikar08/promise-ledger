import test from 'node:test';
import assert from 'node:assert/strict';
import { createGithubIssuePlanner } from '../src/github.js';

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
