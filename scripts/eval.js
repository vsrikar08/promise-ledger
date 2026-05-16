#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { listAccounts, listImportableFiles } from '../src/corpus.js';
import { buildLedgerFromPages } from '../src/extractor.js';

const accounts = listAccounts();
const files = listImportableFiles();
const results = [];

for (const account of accounts) {
  const pages = files
    .filter((file) => file.accountSlug === account.accountSlug)
    .map((file) => ({
      ...file,
      slug: `eval-${file.sourceId}`,
      raw: fs.readFileSync(file.filePath, 'utf8'),
    }));
  const ledger = buildLedgerFromPages(account, pages, new Date().toISOString());
  const expectedPath = path.join(account.accountRoot, 'expected', 'expected_contradictions.json');
  const expected = fs.existsSync(expectedPath)
    ? JSON.parse(fs.readFileSync(expectedPath, 'utf8')).contradictions || []
    : [];
  const issueText = ledger.obligations.map((issue) => `${issue.title}\n${issue.summary}\n${issue.riskReason}`).join('\n').toLowerCase();
  const matched = expected.filter((item) => roughMatch(item.summary, issueText));
  results.push({
    account: account.accountName,
    obligations: ledger.obligations.length,
    critical: ledger.summary.criticalCount,
    expectedContradictions: expected.length,
    matchedContradictions: matched.length,
    status: ledger.obligations.length > 0 && matched.length > 0 ? 'ok' : 'needs_review',
  });
}

console.table(results);

if (results.some((result) => result.status !== 'ok')) {
  process.exitCode = 1;
}

function roughMatch(summary, issueText) {
  const tokens = summary
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 4)
    .filter((token) => !['while', 'could', 'would', 'before', 'after'].includes(token));
  if (tokens.length === 0) return false;
  const hits = tokens.filter((token) => issueText.includes(token));
  return hits.length >= Math.min(3, tokens.length);
}
