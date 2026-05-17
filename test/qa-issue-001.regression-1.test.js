import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

test('pre-boot controls start disabled until app state is ready', () => {
  // Regression: ISSUE-001 - toolbar clicks could be swallowed before app boot.
  // Found by /qa on 2026-05-16.
  // Report: .gstack/qa-reports/qa-report-127-0-0-1-3212-2026-05-16.md
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

  assert.match(html, /id="importButton"[^>]*disabled/);
  assert.match(html, /id="loadLedgerButton"[^>]*disabled/);
  assert.match(html, /id="dryRunButton"[^>]*disabled/);
  assert.match(html, /id="createIssuesButton"[^>]*disabled/);
});
