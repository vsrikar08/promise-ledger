import { GITHUB_REPO } from './config.js';
import { runCommand, tryCommand } from './shell.js';
import { shortHash } from './util.js';

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

    const created = createIssueWithGh({
      title: obligation.githubTitle,
      body: obligation.githubBody,
      labels: obligation.githubLabels || [],
    }, GITHUB_REPO);
    results.push({
      status: 'created',
      obligationId: obligation.id,
      title: obligation.githubTitle,
      url: created.url,
      warning: created.warning || null,
    });
  }
  return results;
}

export function createGithubIssuePlanner(options = {}) {
  const repo = options.repo || GITHUB_REPO;
  const pendingPlans = new Map();
  const findIssue = options.findExistingIssue || ((obligationId) => findExistingIssue(obligationId, repo));
  const createIssue = options.createIssue || ((issue) => createIssueWithGh(issue, repo));
  const nonceFactory = options.nonceFactory || (() => `pln_${shortHash(`${Date.now()}:${Math.random()}`)}`);

  return {
    preview(obligations) {
      const frozen = obligations.map((obligation) => freezeIssue(obligation, findIssue(obligation.id)));
      const nonce = nonceFactory();
      pendingPlans.set(nonce, frozen);
      return {
        repo,
        nonce,
        selectedCount: frozen.length,
        duplicateCheck: 'complete',
        frozenPlanToken: nonce,
        results: frozen.map((item) => item.previewResult),
      };
    },

    create(input = {}) {
      const frozen = pendingPlans.get(input.nonce);
      if (!frozen) {
        const error = new Error('Issue preview nonce is invalid or already consumed.');
        error.code = 'INVALID_NONCE';
        error.statusCode = 409;
        throw error;
      }
      pendingPlans.delete(input.nonce);

      return {
        repo,
        consumedNonce: input.nonce,
        results: frozen.map((item) => {
          if (item.existing) {
            return { status: 'exists', obligationId: item.obligationId, issue: item.existing };
          }
          const created = createIssue(item.issue);
          return {
            status: 'created',
            obligationId: item.obligationId,
            title: item.issue.title,
            url: created.url,
            warning: created.warning || null,
          };
        }),
      };
    },
  };
}

function freezeIssue(obligation, existing) {
  const issue = {
    obligationId: obligation.id,
    title: obligation.githubTitle,
    body: obligation.githubBody,
    labels: obligation.githubLabels || [],
  };
  return {
    obligationId: obligation.id,
    issue,
    existing,
    previewResult: existing
      ? { status: 'exists', obligationId: obligation.id, issue: existing }
      : {
          status: 'dry_run',
          obligationId: obligation.id,
          title: issue.title,
          body: issue.body,
          labels: issue.labels,
        },
  };
}

function createIssueWithGh(issue, repo) {
  const args = buildCreateArgs(issue, repo, issue.labels || []);
  try {
    const result = runCommand('gh', args);
    return { url: result.stdout.trim() };
  } catch (error) {
    if (!(issue.labels || []).length || !isLabelFailure(error)) throw error;
    const result = runCommand('gh', buildCreateArgs(issue, repo, []));
    return {
      url: result.stdout.trim(),
      warning: `Labels unavailable in ${repo}; issue created without labels.`,
    };
  }
}

function buildCreateArgs(issue, repo, labels) {
  const args = [
    'issue',
    'create',
    '--repo',
    repo,
    '--title',
    issue.title,
    '--body',
    issue.body,
  ];
  for (const label of labels) {
    args.push('--label', label);
  }
  return args;
}

function isLabelFailure(error) {
  return /label/i.test(error?.message || '');
}

function findExistingIssue(obligationId, repo = GITHUB_REPO) {
  const result = tryCommand('gh', [
    'issue',
    'list',
    '--repo',
    repo,
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
