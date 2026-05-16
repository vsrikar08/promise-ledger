import { GITHUB_REPO } from './config.js';
import { runCommand, tryCommand } from './shell.js';

export function getGithubStatus() {
  const auth = tryCommand('gh', ['auth', 'status']);
  const issues = tryCommand('gh', ['issue', 'list', '--repo', GITHUB_REPO, '--limit', '10', '--json', 'number,title,state,url,labels']);
  return {
    repo: GITHUB_REPO,
    auth,
    issues: issues.ok ? JSON.parse(issues.stdout || '[]') : [],
    issueError: issues.ok ? null : issues.error,
  };
}

export function createGithubIssues(obligations, options = {}) {
  const results = [];
  for (const obligation of obligations) {
    const existing = findExistingIssue(obligation.id);
    if (existing) {
      results.push({ status: 'exists', obligationId: obligation.id, issue: existing });
      continue;
    }

    if (options.dryRun) {
      results.push({
        status: 'dry_run',
        obligationId: obligation.id,
        title: obligation.githubTitle,
        body: obligation.githubBody,
      });
      continue;
    }

    const args = [
      'issue',
      'create',
      '--repo',
      GITHUB_REPO,
      '--title',
      obligation.githubTitle,
      '--body',
      obligation.githubBody,
    ];
    for (const label of obligation.githubLabels || []) {
      args.push('--label', label);
    }

    const result = runCommand('gh', args);
    const url = result.stdout.trim();
    results.push({
      status: 'created',
      obligationId: obligation.id,
      title: obligation.githubTitle,
      url,
    });
  }
  return results;
}

function findExistingIssue(obligationId) {
  const result = tryCommand('gh', [
    'issue',
    'list',
    '--repo',
    GITHUB_REPO,
    '--state',
    'all',
    '--search',
    `"${obligationId}"`,
    '--json',
    'number,title,state,url',
    '--limit',
    '5',
  ]);
  if (!result.ok) return null;
  const issues = JSON.parse(result.stdout || '[]');
  return issues[0] || null;
}
