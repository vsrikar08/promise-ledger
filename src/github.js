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

export function getPromiseDebtIssueLookup(options = {}) {
  const repo = options.repo || GITHUB_REPO;
  const command = options.command || tryCommand;
  const args = [
    'issue',
    'list',
    '--repo',
    repo,
    '--state',
    'all',
    '--search',
    'PromiseLedger-Commitment-ID',
    '--json',
    'number,title,state,stateReason,url,labels,body,updatedAt',
    '--limit',
    String(options.limit || 100),
  ];

  try {
    const result = command('gh', args, { timeout: options.timeout ?? 10_000 });
    if (!result.ok) {
      return unavailableIssueLookup(repo, result.code || 'GITHUB_LOOKUP_FAILED', result.error);
    }
    return buildPromiseDebtIssueLookupFromIssues(JSON.parse(result.stdout || '[]'), { repo });
  } catch (error) {
    return unavailableIssueLookup(repo, error?.code || 'GITHUB_LOOKUP_FAILED', error instanceof Error ? error.message : String(error));
  }
}

export function buildPromiseDebtIssueLookupFromIssues(issues, options = {}) {
  const buckets = new Map();
  for (const issue of issues || []) {
    const commitmentId = extractCommitmentId(issue.body || '');
    if (!commitmentId) continue;
    const bucket = buckets.get(commitmentId) || [];
    bucket.push(issue);
    buckets.set(commitmentId, bucket);
  }

  const issuesByCommitmentId = {};
  const duplicateCommitmentIds = [];
  for (const [commitmentId, bucket] of buckets.entries()) {
    const sorted = [...bucket].sort(compareIssueFreshness);
    if (sorted.length > 1) duplicateCommitmentIds.push(commitmentId);
    issuesByCommitmentId[commitmentId] = normalizePromiseDebtIssue(sorted[0], commitmentId, sorted.length);
  }

  return {
    status: 'available',
    repo: options.repo || GITHUB_REPO,
    issueCount: Object.keys(issuesByCommitmentId).length,
    duplicateCommitmentIds,
    issuesByCommitmentId,
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

function unavailableIssueLookup(repo, code, message) {
  return {
    status: 'unavailable',
    repo,
    errorCode: code,
    error: message || 'GitHub issue lookup unavailable.',
    issueCount: 0,
    duplicateCommitmentIds: [],
    issuesByCommitmentId: {},
  };
}

function extractCommitmentId(body) {
  const match = String(body || '').match(/PromiseLedger-Commitment-ID:\s*([^\s\n]+)/i);
  return match ? match[1].trim() : null;
}

function normalizePromiseDebtIssue(issue, commitmentId, duplicateCount) {
  const labels = labelNames(issue);
  const salesGuidance = extractSalesGuidance(issue.body || '');
  const decision = inferSalesDecision(issue.body || '', labels, salesGuidance);
  const state = String(issue.state || '').toLowerCase();
  const status = classifyIssueStatus({ state, decision, salesGuidance });

  return {
    commitmentId,
    status,
    engineeringStatus: issueStatusLabel(status),
    decision,
    salesGuidance,
    blocksOriginalClaim: true,
    duplicateCount,
    issue: {
      number: issue.number,
      title: issue.title || '',
      state: issue.state || '',
      stateReason: issue.stateReason || '',
      url: issue.url || '',
      labels,
      updatedAt: issue.updatedAt || '',
    },
  };
}

function labelNames(issue) {
  return (issue.labels || [])
    .map((label) => (typeof label === 'string' ? label : label?.name))
    .filter(Boolean);
}

function inferSalesDecision(body, labels, salesGuidance) {
  const labelText = labels.join(' ');
  if (/decision:(approved|approved_with_wording|safe_wording|customer_safe)|sales:(approved|safe)/i.test(labelText)) {
    return 'approved_with_wording';
  }
  if (/decision:(not_supported|unsupported|rejected)|sales:(blocked|not_supported)/i.test(labelText)) {
    return 'not_supported';
  }

  const decision = String(body || '').match(/(?:^|\n)\s*(?:Sales\s+)?Decision\s*:\s*([^\n]+)/i)?.[1] || '';
  if (/approved|safe wording|customer-safe|customer safe/i.test(decision)) return 'approved_with_wording';
  if (/not[_ -]supported|unsupported|rejected|do not promise|blocked/i.test(decision)) return 'not_supported';
  return 'none';
}

function extractSalesGuidance(body) {
  const text = String(body || '');
  const inline = text.match(/(?:^|\n)\s*(?:Customer-safe wording|Customer safe wording)\s*:\s*([^\n]+)/i)?.[1];
  if (inline) return inline.trim();

  const section = text.match(/(?:^|\n)#{2,3}\s*(?:Customer-safe wording|Customer safe wording)\s*\n([\s\S]*?)(?=\n#{2,3}\s+|\s*$)/i)?.[1];
  return section ? section.trim().replace(/^[-*]\s+/gm, '').trim() : '';
}

function classifyIssueStatus({ state, decision, salesGuidance }) {
  if (state !== 'closed') return 'open';
  if (decision === 'not_supported') return 'closed_not_supported';
  if (decision === 'approved_with_wording' && salesGuidance) return 'closed_approved_with_wording';
  return 'closed_no_guidance';
}

function issueStatusLabel(status) {
  return {
    open: 'Open engineering issue',
    closed_not_supported: 'Engineering says not supported',
    closed_approved_with_wording: 'Engineering approved safe wording',
    closed_no_guidance: 'Closed without sales guidance',
  }[status] || 'GitHub issue status unknown';
}

function compareIssueFreshness(a, b) {
  const aDate = Date.parse(a.updatedAt || '') || 0;
  const bDate = Date.parse(b.updatedAt || '') || 0;
  if (aDate !== bDate) return bDate - aDate;
  return Number(b.number || 0) - Number(a.number || 0);
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
