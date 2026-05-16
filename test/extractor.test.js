import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { getAccount, listImportableFiles } from '../src/corpus.js';
import { buildLedgerFromPages } from '../src/extractor.js';

test('Acme extraction creates source-backed developer issues from raw corpus pages', () => {
  const account = getAccount('acme-robotics');
  const pages = listImportableFiles()
    .filter((file) => file.accountSlug === 'acme-robotics')
    .map((file) => ({
      ...file,
      slug: `test-${file.sourceId}`,
      raw: fs.readFileSync(file.filePath, 'utf8'),
    }));

  const ledger = buildLedgerFromPages(account, pages, '2026-05-16T00:00:00.000Z');
  const issueText = ledger.obligations.map((issue) => `${issue.title}\n${issue.summary}\n${issue.githubBody}`).join('\n');

  assert.equal(ledger.account.accountName, 'Acme Robotics');
  assert.ok(ledger.summary.sourcePages > 10);
  assert.ok(ledger.summary.oraclePages > 0);
  assert.ok(ledger.summary.developerIssueCount >= 3);
  assert.match(issueText, /NetSuite/i);
  assert.match(issueText, /not approved|excluded/i);
  assert.match(issueText, /dashboard/i);
  assert.match(issueText, /preview-only|external email/i);
  assert.doesNotMatch(issueText, /expected_account_ledger/i);
});

test('GitHub issue bodies include provenance marker and acceptance criteria', () => {
  const account = getAccount('acme-robotics');
  const pages = listImportableFiles()
    .filter((file) => file.accountSlug === 'acme-robotics')
    .map((file) => ({
      ...file,
      slug: `test-${file.sourceId}`,
      raw: fs.readFileSync(file.filePath, 'utf8'),
    }));

  const ledger = buildLedgerFromPages(account, pages, '2026-05-16T00:00:00.000Z');
  const issue = ledger.obligations.find((item) => item.term === 'netsuite');

  assert.ok(issue);
  assert.match(issue.githubBody, /PromiseLedger-Commitment-ID:/);
  assert.match(issue.githubBody, /Acceptance Criteria/);
  assert.match(issue.githubBody, /Source-backed Promise Evidence/);
  assert.match(issue.githubBody, /Conflicting \/ Limiting Evidence/);
});
