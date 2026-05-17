import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { getAccount, listImportableFiles } from '../src/corpus.js';
import { buildAccountMemoryFromPages, buildLedgerFromPages, enrichAccountMemoryWithGithubIssues } from '../src/extractor.js';
import { buildPromiseDebtIssueLookupFromIssues } from '../src/github.js';

test('Acme extraction creates source-backed developer issues from raw corpus pages', () => {
  const { account, pages } = loadAccountPages('acme-robotics');

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
  const { account, pages } = loadAccountPages('acme-robotics');

  const ledger = buildLedgerFromPages(account, pages, '2026-05-16T00:00:00.000Z');
  const issue = ledger.obligations.find((item) => item.term === 'netsuite');

  assert.ok(issue);
  assert.match(issue.githubBody, /PromiseLedger-Commitment-ID:/);
  assert.match(issue.githubBody, /Acceptance Criteria/);
  assert.match(issue.githubBody, /Sales Guidance/);
  assert.match(issue.githubBody, /Decision: pending/);
  assert.match(issue.githubBody, /Source-backed Promise Evidence/);
  assert.match(issue.githubBody, /Conflicting \/ Limiting Evidence/);
  assert.ok(issue.githubLabels.includes('promise-debt'));
  assert.ok(issue.githubLabels.includes('risk:critical'));
});

test('Acme account memory includes answer, timeline, and Promise Guard surfaces', () => {
  const { account, pages } = loadAccountPages('acme-robotics');

  const memory = buildAccountMemoryFromPages(account, pages, '2026-05-16T00:00:00.000Z');
  const answerText = memory.presetAnswers[0].bullets.map((bullet) => bullet.text).join('\n');
  const timelineSources = memory.timeline.map((event) => event.sourceId);
  const riskyGuard = memory.guardResults.find((result) => result.draftId === 'draft_acme_robotics_risky_followup');
  const safeGuard = memory.guardResults.find((result) => result.draftId === 'draft_acme_robotics_safe_followup');

  assert.equal(memory.account.accountName, 'Acme Robotics');
  assert.ok(memory.ledger.summary.developerIssueCount >= 3);
  assert.equal(memory.presetAnswers[0].question, 'What do we owe Acme before kickoff?');
  assert.match(answerText, /dashboard/i);
  assert.match(answerText, /NetSuite/i);
  assert.match(answerText, /external email/i);
  assert.ok(timelineSources.indexOf('src_acme_robotics_call_2026_05_16_demo') < timelineSources.indexOf('src_acme_robotics_sow_2026_05_20'));
  assert.equal(riskyGuard.decision, 'block');
  assert.equal(riskyGuard.blockedClaims.length, 3);
  assert.equal(safeGuard.decision, 'allow');
});

test('Promise Guard blocked claims expose exact obligation references', () => {
  const { account, pages } = loadAccountPages('acme-robotics');
  const memory = buildAccountMemoryFromPages(account, pages, '2026-05-16T00:00:00.000Z');
  const riskyGuard = memory.guardResults.find((result) => result.draftId === 'draft_acme_robotics_risky_followup');
  const obligationIds = new Set(memory.ledger.obligations.map((obligation) => obligation.id));

  assert.ok(riskyGuard);
  for (const claim of riskyGuard.blockedClaims) {
    assert.equal(claim.matchStatus, 'matched');
    assert.ok(obligationIds.has(claim.obligationId));
    assert.match(claim.term, /netsuite|dashboard|external-email/);
    assert.ok(claim.safeAlternative);
  }
});

test('GitHub issue enrichment attaches engineering state to obligations and blocked claims', () => {
  const { account, pages } = loadAccountPages('acme-robotics');
  const memory = buildAccountMemoryFromPages(account, pages, '2026-05-16T00:00:00.000Z');
  const dashboard = memory.ledger.obligations.find((obligation) => obligation.term === 'dashboard');
  const netsuite = memory.ledger.obligations.find((obligation) => obligation.term === 'netsuite');
  const approvedWording = 'We will share a dashboard preview plan after reviewing the field map.';
  const lookup = buildPromiseDebtIssueLookupFromIssues([
    githubIssue({
      number: 21,
      state: 'OPEN',
      body: `- PromiseLedger-Commitment-ID: ${netsuite.id}`,
    }),
    githubIssue({
      number: 22,
      state: 'CLOSED',
      body: [
        `- PromiseLedger-Commitment-ID: ${dashboard.id}`,
        '',
        'Decision: approved_with_wording',
        '',
        '## Customer-safe wording',
        approvedWording,
      ].join('\n'),
    }),
  ]);

  const enriched = enrichAccountMemoryWithGithubIssues(memory, lookup);
  const enrichedDashboard = enriched.ledger.obligations.find((obligation) => obligation.id === dashboard.id);
  const enrichedNetsuite = enriched.ledger.obligations.find((obligation) => obligation.id === netsuite.id);
  const dashboardClaim = enriched.guardResults
    .flatMap((result) => result.blockedClaims)
    .find((claim) => claim.obligationId === dashboard.id);

  assert.equal(enriched.githubIssueLookup.status, 'available');
  assert.equal(enriched.summary.linkedGithubIssueCount, 2);
  assert.equal(enriched.ledger.summary.linkedGithubIssueCount, 2);
  assert.equal(enriched.ledger.summary.githubIssueLookupStatus, 'available');
  assert.equal(enrichedNetsuite.githubIssueState.status, 'open');
  assert.equal(enrichedDashboard.githubIssueState.status, 'closed_approved_with_wording');
  assert.equal(dashboardClaim.githubIssueState.issue.number, 22);
  assert.equal(dashboardClaim.safeAlternative, approvedWording);
});

test('GitHub issue enrichment degrades without clearing source-backed Guard results', () => {
  const { account, pages } = loadAccountPages('acme-robotics');
  const memory = buildAccountMemoryFromPages(account, pages, '2026-05-16T00:00:00.000Z');
  const enriched = enrichAccountMemoryWithGithubIssues(memory, {
    status: 'unavailable',
    repo: 'example/promise-ledger',
    errorCode: 'COMMAND_TIMEOUT',
    error: 'gh timed out',
    issueCount: 0,
    duplicateCommitmentIds: [],
    issuesByCommitmentId: {},
  });
  const riskyGuard = enriched.guardResults.find((result) => result.draftId === 'draft_acme_robotics_risky_followup');
  const safeGuard = enriched.guardResults.find((result) => result.draftId === 'draft_acme_robotics_safe_followup');

  assert.equal(enriched.githubIssueLookup.status, 'unavailable');
  assert.equal(riskyGuard.decision, 'block');
  assert.equal(riskyGuard.blockedClaims.length, 3);
  assert.ok(riskyGuard.blockedClaims.every((claim) => claim.githubIssueState.status === 'unavailable'));
  assert.equal(safeGuard.decision, 'allow');
});

test('Unrelated GitHub issues do not make safe drafts risky', () => {
  const { account, pages } = loadAccountPages('acme-robotics');
  const memory = buildAccountMemoryFromPages(account, pages, '2026-05-16T00:00:00.000Z');
  const lookup = buildPromiseDebtIssueLookupFromIssues([
    githubIssue({
      number: 31,
      body: '- PromiseLedger-Commitment-ID: promise-debt-unrelated',
    }),
  ]);
  const enriched = enrichAccountMemoryWithGithubIssues(memory, lookup);
  const safeGuard = enriched.guardResults.find((result) => result.draftId === 'draft_acme_robotics_safe_followup');

  assert.equal(safeGuard.decision, 'allow');
  assert.equal(safeGuard.blockedClaims.length, 0);
});

function loadAccountPages(accountSlug) {
  return {
    account: getAccount(accountSlug),
    pages: listImportableFiles()
      .filter((file) => file.accountSlug === accountSlug)
      .map((file) => ({
        ...file,
        slug: `test-${file.sourceId}`,
        raw: fs.readFileSync(file.filePath, 'utf8'),
      })),
  };
}

function githubIssue(input = {}) {
  return {
    number: input.number || 1,
    title: input.title || 'Promise debt issue',
    state: input.state || 'OPEN',
    stateReason: input.stateReason || '',
    url: input.url || `https://github.example/issues/${input.number || 1}`,
    labels: input.labels || [{ name: 'promise-debt' }],
    body: input.body || '',
    updatedAt: input.updatedAt || '2026-05-16T00:00:00Z',
  };
}
