import path from 'node:path';
import { getAccount } from './corpus.js';
import { extractRawFromGbrainPage, getGbrainPage } from './gbrain.js';
import { parseCsv, safeJsonParse, shortHash } from './util.js';

const NEGATIVE_PATTERNS = [
  /not approved/i,
  /excluded/i,
  /cannot begin/i,
  /cannot occur/i,
  /cannot be/i,
  /must keep/i,
  /must not/i,
  /do not/i,
  /not available/i,
  /not guaranteed/i,
  /no .*sla/i,
  /best[- ]effort/i,
  /blocked/i,
  /no owner/i,
  /not assigned/i,
  /requires .*approval/i,
  /separate .*approval/i,
  /signed change order/i,
  /sandbox .*only/i,
  /preview-only/i,
];

const PROMISE_PATTERNS = [
  /\bwe will\b/i,
  /\bwe'll\b/i,
  /\bi will\b/i,
  /\bwill send\b/i,
  /\bwill share\b/i,
  /\bwill provide\b/i,
  /\bwill confirm\b/i,
  /\bcan target\b/i,
  /\bshould be supportable\b/i,
  /\bcould likely\b/i,
  /\bmight be back\b/i,
  /\bexpected\b/i,
  /\bneeds\b/i,
  /\basked\b/i,
  /\bmust\b/i,
];

const TERM_DEFINITIONS = [
  { key: 'netsuite', label: 'NetSuite pilot scope', patterns: [/netsuite/i] },
  { key: 'dashboard', label: 'dashboard owner and delivery scope', patterns: [/dashboard/i, /qbr/i] },
  { key: 'external-email', label: 'external email pilot boundary', patterns: [/external email/i, /live send/i, /live external/i, /smtp/i, /preview-only/i] },
  { key: 'security', label: 'security packet readiness', patterns: [/security packet/i, /security review/i, /penetration test/i, /pentest/i] },
  { key: 'baa', label: 'BAA and legal approval', patterns: [/\bbaa\b/i, /legal review/i, /legal approval/i] },
  { key: 'onboarding', label: 'onboarding kickoff timing', patterns: [/onboarding/i, /kickoff/i, /start next/i, /launch readiness/i] },
  { key: 'support-sla', label: 'support SLA and resolution promise', patterns: [/\bsla\b/i, /support target/i, /guaranteed resolution/i, /best[- ]effort/i] },
  { key: 'routing-dashboard', label: 'routing dashboard fix', patterns: [/routing dashboard/i, /blank dashboard/i, /aggregation/i] },
  { key: 'payment', label: 'payment reconciliation and token scope', patterns: [/payment/i, /token/i, /reconciliation/i] },
  { key: 'inventory', label: 'inventory sync launch blocker', patterns: [/inventory/i, /store 014/i] },
  { key: 'dispatch', label: 'live dispatch automation boundary', patterns: [/dispatch/i, /control-plane/i, /grid/i, /live .*automation/i] },
  { key: 'roster', label: 'student roster data boundary', patterns: [/roster/i, /student data/i, /production data/i, /\bdpa\b/i] },
  { key: 'connector', label: 'connector change scope', patterns: [/connector/i, /integration/i, /change order/i] },
  { key: 'field-map', label: 'field map dependency', patterns: [/field map/i, /mapping/i] },
  { key: 'procurement', label: 'procurement dependency', patterns: [/procurement/i, /purchase order/i, /\bpo\b/i] },
];

export function buildLedgerFromGbrain(accountSlug, importManifest) {
  const account = getAccount(accountSlug);
  if (!account) throw new Error(`Unknown account: ${accountSlug}`);
  if (!importManifest) throw new Error('GBrain import manifest not found. Run npm run import:gbrain first.');

  const imported = importManifest.imported.filter((item) => item.accountSlug === accountSlug && item.corpusRole === 'evidence');
  if (imported.length === 0) {
    throw new Error(`No imported GBrain pages found for ${accountSlug}. Run npm run import:gbrain.`);
  }

  const pages = imported.map((item) => {
    const page = getGbrainPage(item.slug);
    return {
      ...item,
      gbrainPage: page,
      raw: extractRawFromGbrainPage(page),
    };
  });

  return buildLedgerFromPages(account, pages, importManifest.importedAt);
}

export function buildAccountMemoryFromGbrain(accountSlug, importManifest) {
  const account = getAccount(accountSlug);
  if (!account) throw new Error(`Unknown account: ${accountSlug}`);
  if (!importManifest) throw new Error('GBrain import manifest not found. Run npm run import:gbrain first.');

  const imported = importManifest.imported.filter((item) => item.accountSlug === accountSlug && ['evidence', 'draft'].includes(item.corpusRole));
  if (imported.filter((item) => item.corpusRole === 'evidence').length === 0) {
    throw new Error(`No imported GBrain pages found for ${accountSlug}. Run npm run import:gbrain.`);
  }

  const pages = imported.map((item) => {
    const page = getGbrainPage(item.slug);
    return {
      ...item,
      gbrainPage: page,
      raw: extractRawFromGbrainPage(page),
    };
  });

  return buildAccountMemoryFromPages(account, pages, importManifest.importedAt);
}

export function buildAccountMemoryFromPages(account, pages, importedAt = null) {
  const ledger = buildLedgerFromPages(account, pages, importedAt);
  return {
    schemaVersion: '0.1',
    generatedAt: ledger.generatedAt,
    importedAt,
    account: ledger.account,
    salesOwner: ledger.salesOwner,
    summary: ledger.summary,
    ledger,
    timeline: buildSourceTimeline(pages, ledger),
    presetAnswers: buildPresetAnswers(ledger),
    guardResults: buildGuardResults(pages, ledger),
  };
}

export function buildLedgerFromPages(account, pages, importedAt = null) {
  const evidencePages = pages.filter((page) => page.corpusRole === 'evidence');
  const oraclePages = pages.filter((page) => page.corpusRole === 'oracle');
  const contacts = extractContacts(evidencePages);
  const salesOwner = contacts.find((person) => person.role === 'account_owner' && person.is_internal === 'true')
    || contacts.find((person) => person.is_internal === 'true')
    || null;
  const evidenceItems = evidencePages.flatMap(pageToEvidenceItems);
  const promiseCandidates = evidenceItems.filter(isPromiseCandidate);
  const blockers = evidenceItems.filter(isBlocker);
  const obligations = buildObligations({ account, salesOwner, promiseCandidates, blockers, evidenceItems });

  return {
    schemaVersion: '0.1',
    generatedAt: new Date().toISOString(),
    importedAt,
    account: {
      accountId: account.accountId,
      accountSlug: account.accountSlug,
      accountName: account.accountName,
      industry: account.industry,
      scenarioType: account.scenarioType,
      primaryDemoMoment: account.primaryDemoMoment,
    },
    salesOwner,
    summary: {
      sourcePages: evidencePages.length,
      oraclePages: oraclePages.length,
      evidenceItems: evidenceItems.length,
      promiseCandidates: promiseCandidates.length,
      blockers: blockers.length,
      developerIssueCount: obligations.length,
      criticalCount: obligations.filter((item) => item.risk === 'critical').length,
      highCount: obligations.filter((item) => item.risk === 'high').length,
      missingOwnerCount: obligations.filter((item) => item.flags.includes('missing_owner')).length,
      githubReady: obligations.filter((item) => item.githubBody).length,
    },
    obligations,
    extractedCommitments: promiseCandidates.slice(0, 24),
    blockers: blockers.slice(0, 24),
  };
}

function extractContacts(pages) {
  const contactsPage = pages.find((page) => page.relativeToAccount?.endsWith('crm/contacts.csv'));
  return contactsPage ? parseCsv(contactsPage.raw) : [];
}

function pageToEvidenceItems(page) {
  const ext = path.extname(page.relativeToAccount || page.relativeToRepo);
  if (ext === '.jsonl') return parseJsonlPage(page);
  if (ext === '.csv') return parseCsvPage(page);
  return parseTextPage(page);
}

function parseJsonlPage(page) {
  return page.raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const record = safeJsonParse(line);
      if (!record) return null;
      const text = record.text || record.bodyMarkdown || record.summary || JSON.stringify(record);
      return makeEvidenceItem(page, {
        text,
        locator: record.lineId || record.messageId || record.ticketId || `line_${index + 1}`,
        speakerName: record.speakerName || record.authorName || record.fromPersonId || record.authorPersonId || '',
        speakerPersonId: record.speakerPersonId || record.authorPersonId || record.fromPersonId || '',
        speakerSide: record.speakerSide || '',
        tags: record.tags || [],
        visibility: record.visibility || page.visibility || '',
        reliability: record.reliability || page.reliability || '',
        record,
      });
    })
    .filter(Boolean);
}

function parseCsvPage(page) {
  return parseCsv(page.raw).map((row, index) => makeEvidenceItem(page, {
    text: Object.values(row).join(' | '),
    locator: `row_${index + 1}`,
    tags: ['crm_record'],
    visibility: 'internal',
    reliability: 'medium',
    record: row,
  }));
}

function parseTextPage(page) {
  if (/product_scope|integration_support_matrix|policy_boundaries/.test(page.sourceType || '')) {
    return parseCapabilityPage(page);
  }

  const chunks = [];
  const lines = page.raw.split(/\r?\n/);
  let currentHeading = '';
  let buffer = [];

  const flush = () => {
    const text = buffer.join('\n').trim();
    if (!text) return;
    chunks.push(makeEvidenceItem(page, {
      text,
      locator: currentHeading || `${page.sourceType}:${chunks.length + 1}`,
      tags: [],
      visibility: inferVisibility(page),
      reliability: inferReliability(page),
      record: null,
    }));
    buffer = [];
  };

  for (const line of lines) {
    if (/^#{1,3}\s+/.test(line)) {
      flush();
      currentHeading = line.replace(/^#{1,3}\s+/, '').trim();
    } else if (/^\s*-\s+/.test(line) || /^[a-zA-Z0-9_ -]+:\s/.test(line) || line.trim()) {
      buffer.push(line);
      if (buffer.join('\n').length > 1200) flush();
    }
  }
  flush();
  return chunks;
}

function parseCapabilityPage(page) {
  const chunks = [];
  const lines = page.raw.split(/\r?\n/);
  let preamble = [];
  let current = [];
  let currentId = '';

  const flushCurrent = () => {
    const text = current.join('\n').trim();
    if (!text) return;
    chunks.push(makeEvidenceItem(page, {
      text,
      locator: currentId || `${page.sourceType}:${chunks.length + 1}`,
      tags: [],
      visibility: inferVisibility(page),
      reliability: inferReliability(page),
      record: null,
    }));
    current = [];
    currentId = '';
  };

  for (const line of lines) {
    const capabilityMatch = line.match(/^\s*-\s+(?:capabilityId|policyId):\s*"?([^"]+)"?/);
    if (capabilityMatch) {
      if (!current.length && preamble.length) {
        current = [...preamble];
        preamble = [];
      } else {
        flushCurrent();
      }
      currentId = capabilityMatch[1];
      current.push(line);
      continue;
    }
    if (current.length) {
      current.push(line);
    } else {
      preamble.push(line);
    }
  }
  flushCurrent();

  if (!chunks.length) {
    return parseTextPageFallback(page);
  }
  return chunks;
}

function parseTextPageFallback(page) {
  const chunks = [];
  const lines = page.raw.split(/\r?\n/);
  let buffer = [];
  for (const line of lines) {
    if (line.trim()) buffer.push(line);
    if (buffer.join('\n').length > 1000) {
      chunks.push(makeEvidenceItem(page, {
        text: buffer.join('\n'),
        locator: `${page.sourceType}:${chunks.length + 1}`,
        tags: [],
        visibility: inferVisibility(page),
        reliability: inferReliability(page),
        record: null,
      }));
      buffer = [];
    }
  }
  if (buffer.length) {
    chunks.push(makeEvidenceItem(page, {
      text: buffer.join('\n'),
      locator: `${page.sourceType}:${chunks.length + 1}`,
      tags: [],
      visibility: inferVisibility(page),
      reliability: inferReliability(page),
      record: null,
    }));
  }
  return chunks;
}

function makeEvidenceItem(page, input) {
  const text = normalizeWhitespace(input.text);
  const terms = detectTerms(text);
  const sourceKind = classifySourceKind(page, input);
  return {
    id: `${page.sourceId}:${input.locator}`,
    sourceId: page.sourceId,
    sourceSlug: page.slug,
    sourceType: page.sourceType,
    corpusRole: page.corpusRole,
    relativeToAccount: page.relativeToAccount,
    dealId: page.dealId,
    accountSlug: page.accountSlug,
    text,
    quote: firstSentence(text, 260),
    locator: input.locator,
    speakerName: input.speakerName || '',
    speakerPersonId: input.speakerPersonId || '',
    speakerSide: input.speakerSide || '',
    tags: input.tags || [],
    visibility: input.visibility || inferVisibility(page),
    reliability: input.reliability || inferReliability(page),
    sourceKind,
    terms,
    record: input.record,
  };
}

function buildObligations({ account, salesOwner, promiseCandidates, blockers }) {
  const obligations = [];
  const seen = new Set();
  const termKeys = new Set([...promiseCandidates, ...blockers].flatMap((item) => item.terms.map((term) => term.key)));
  if (termKeys.has('netsuite')) termKeys.delete('connector');

  for (const termKey of termKeys) {
    const term = TERM_DEFINITIONS.find((candidate) => candidate.key === termKey);
    if (!term) continue;
    const relatedPromises = promiseCandidates.filter((item) => item.terms.some((candidate) => candidate.key === termKey));
    const relatedBlockers = blockers.filter((item) => item.terms.some((candidate) => candidate.key === termKey));

    if (relatedPromises.length === 0 && relatedBlockers.length === 0) continue;
    if (!shouldCreateDeveloperIssue(termKey, relatedPromises, relatedBlockers)) continue;

    const risk = classifyRisk(termKey, relatedPromises, relatedBlockers);
    const flags = detectFlags(relatedPromises, relatedBlockers);
    const id = `promise-debt-${account.accountSlug}-${termKey}-${shortHash([
      ...relatedPromises.map((item) => item.id),
      ...relatedBlockers.map((item) => item.id),
    ].join('|'))}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const dueDate = inferDueDate([...relatedPromises, ...relatedBlockers]);
    const title = buildIssueTitle(account, term, risk);
    const summary = buildSummary(term, relatedPromises, relatedBlockers);
    const developerAction = buildDeveloperAction(termKey, account);
    const acceptanceCriteria = buildAcceptanceCriteria(termKey, account);
    const sourceEvidence = pickEvidence(relatedPromises, 3, termKey);
    const conflictingEvidence = pickEvidence(relatedBlockers, 4, termKey);
    const body = renderGithubIssueBody({
      id,
      account,
      salesOwner,
      term,
      risk,
      flags,
      summary,
      developerAction,
      dueDate,
      sourceEvidence,
      conflictingEvidence,
      acceptanceCriteria,
    });

    obligations.push({
      id,
      title,
      summary,
      term: term.key,
      termLabel: term.label,
      risk,
      riskReason: summarizeRisk(termKey, relatedBlockers),
      flags,
      dueDate,
      salesOwner,
      developerAction,
      sourceEvidence,
      conflictingEvidence,
      acceptanceCriteria,
      githubTitle: title,
      githubBody: body,
      githubLabels: buildGithubLabels(risk, term.key, flags),
    });
  }

  return obligations.sort((a, b) => riskRank(a.risk) - riskRank(b.risk) || a.title.localeCompare(b.title));
}

function buildGithubLabels(risk, termKey, flags) {
  return [
    'promise-debt',
    `risk:${risk}`,
    `term:${termKey}`,
    ...flags.map((flag) => `flag:${flag}`),
  ];
}

function isPromiseCandidate(item) {
  if (item.corpusRole === 'oracle') return false;
  if (item.corpusRole === 'draft') return false;
  if (item.sourceKind === 'authoritative' && !/deliverable|customer obligation|vendor obligation/i.test(item.locator || '')) return false;
  if (item.tags.some((tag) => ['promise_candidate', 'soft_promise', 'customer_ask', 'customer_commitment', 'timeline'].includes(tag))) {
    return item.terms.length > 0;
  }
  return item.terms.length > 0 && PROMISE_PATTERNS.some((pattern) => pattern.test(item.text));
}

function isBlocker(item) {
  if (item.corpusRole === 'oracle') return false;
  if (item.tags.some((tag) => ['scope_warning', 'product_confirmation', 'promise_guard_block', 'missing_owner'].includes(tag))) {
    return item.terms.length > 0;
  }
  if (item.sourceKind === 'authoritative' || item.sourceKind === 'internal') {
    return item.terms.length > 0 && NEGATIVE_PATTERNS.some((pattern) => pattern.test(item.text));
  }
  return false;
}

function shouldCreateDeveloperIssue(termKey, promises, blockers) {
  const combined = [...promises, ...blockers].map((item) => `${item.text} ${(item.tags || []).join(' ')}`).join('\n');
  const hasCustomerOrSalesPromise = promises.some((item) => item.sourceKind === 'customer' || item.tags.includes('promise_candidate') || item.tags.includes('soft_promise'));
  const hasAuthoritativeBlocker = blockers.some((item) => item.sourceKind === 'authoritative' || /product_confirmation|scope_warning|promise_guard_block|missing_owner/.test((item.tags || []).join(' ')));

  if (['security', 'procurement', 'field-map'].includes(termKey)) {
    return false;
  }

  if (termKey === 'onboarding') {
    return hasCustomerOrSalesPromise
      && hasAuthoritativeBlocker
      && /start|kickoff|onboarding/i.test(combined)
      && /cannot|no earlier|within \d+ business days|approval|signed|po\b/i.test(combined);
  }

  if (termKey === 'support-sla') {
    return hasCustomerOrSalesPromise
      && hasAuthoritativeBlocker
      && /guarantee|sla|resolution|monday|support target|best[- ]effort/i.test(combined);
  }

  if (termKey === 'roster') {
    return hasCustomerOrSalesPromise
      && hasAuthoritativeBlocker
      && /roster|student|production data|dpa/i.test(combined);
  }

  if (['netsuite', 'dashboard', 'external-email', 'baa', 'payment', 'dispatch', 'connector'].includes(termKey)) {
    return hasCustomerOrSalesPromise && (hasAuthoritativeBlocker || blockers.length > 0);
  }

  return hasCustomerOrSalesPromise && blockers.length > 0;
}

function classifyRisk(termKey, promises, blockers) {
  const combined = [...promises, ...blockers].map((item) => `${item.text} ${(item.tags || []).join(' ')}`).join('\n');
  if (termKey === 'dashboard' && /no owner|not assigned|missing_owner/i.test(combined)) {
    return 'critical';
  }
  if (/not approved|excluded|do not say|definitely supported|cannot begin|cannot occur|production data|live control-plane|payment token|guaranteed/i.test(combined)) {
    return 'critical';
  }
  if (/no owner|not assigned|requires .*approval|best[- ]effort|blocked|legal|baa|dpa|support target|preview-only/i.test(combined)) {
    return 'high';
  }
  if (termKey === 'security' || termKey === 'procurement' || termKey === 'field-map') return 'medium';
  return 'high';
}

function detectFlags(promises, blockers) {
  const text = [...promises, ...blockers].map((item) => `${item.text} ${(item.tags || []).join(' ')}`).join('\n');
  const flags = [];
  if (/no owner|not assigned|missing_owner/i.test(text)) flags.push('missing_owner');
  if (/not approved|excluded|cannot|do not|blocked/i.test(text)) flags.push('contradiction');
  if (/approval|signed|legal|baa|dpa/i.test(text)) flags.push('approval_required');
  if (/customer_ask|customer_dependency|field map|procurement|checklist/i.test(text)) flags.push('customer_dependency');
  return [...new Set(flags)];
}

function detectTerms(text) {
  return TERM_DEFINITIONS.filter((term) => term.patterns.some((pattern) => pattern.test(text)));
}

function classifySourceKind(page, item) {
  const sourceType = page.sourceType || '';
  const text = item.text || '';
  if (/sow|msa|dpa|order_form|product_scope|support_matrix|policy|security_review|legal/i.test(sourceType)) return 'authoritative';
  if (/authoritative/i.test(text)) return 'authoritative';
  if (/slack|support/i.test(sourceType) || item.visibility === 'internal') return 'internal';
  if (/email|call|proposal/i.test(sourceType)) return 'customer';
  return 'source';
}

function inferVisibility(page) {
  if (/slack|crm/.test(page.sourceType || '')) return 'internal';
  if (/product|policy|security|legal/.test(page.sourceType || '')) return 'internal';
  if (/email|call|proposal|contract/.test(page.sourceType || '')) return 'customer_facing';
  return '';
}

function inferReliability(page) {
  if (/sow|msa|dpa|order_form|product|policy|security|legal/.test(page.sourceType || '')) return 'authoritative';
  if (/email|proposal/.test(page.sourceType || '')) return 'high';
  return 'medium';
}

function pickEvidence(items, max, termKey = null) {
  const unique = [];
  const seen = new Set();
  for (const item of [...items].sort((a, b) => compareEvidenceStrength(a, b, termKey))) {
    const key = `${item.sourceId}:${item.locator}:${item.quote}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({
      sourceId: item.sourceId,
      sourceSlug: item.sourceSlug,
      sourceType: item.sourceType,
      locator: item.locator,
      quote: item.quote,
      reliability: item.reliability,
      speakerName: item.speakerName,
    });
    if (unique.length >= max) break;
  }
  return unique;
}

function compareEvidenceStrength(a, b, termKey) {
  return evidenceScore(b, termKey) - evidenceScore(a, termKey);
}

function evidenceScore(item, termKey = null) {
  let score = 0;
  if (item.sourceKind === 'authoritative') score += 50;
  if (item.sourceType?.includes('product') || item.sourceType?.includes('policy')) score += 35;
  if (item.sourceType?.includes('sow') || item.sourceType?.includes('contract')) score += 30;
  if (item.sourceType?.includes('slack')) score += 20;
  if (item.sourceType?.includes('email')) score += 15;
  if (item.sourceType?.includes('call')) score += 10;
  if (item.sourceType === 'crm') score -= 20;
  if (/not approved|excluded|do not|cannot|must keep|no owner|not assigned|preview-only/i.test(item.text)) score += 20;
  if (/promiseGuardPolicy|supportedIntegrations|unsupportedIntegrations/i.test(item.text)) score -= 10;
  if (termKey === 'dashboard') {
    if (/dashboard/i.test(item.text)) score += 30;
    if (/no owner|not assigned/i.test(item.text)) score += 80;
    if (/production dashboard|dashboard preview/i.test(item.text)) score += 35;
    if (/NetSuite is not approved/i.test(item.text)) score -= 50;
  }
  if (termKey === 'netsuite') {
    if (/netsuite/i.test(item.text)) score += 30;
    if (/not approved|excluded|definitely supported|change order/i.test(item.text)) score += 45;
  }
  if (termKey === 'external-email') {
    if (/external email|live send|preview-only|smtp/i.test(item.text)) score += 30;
    if (/must keep|do not promise live|excluded|disabled/i.test(item.text)) score += 45;
    if (/NetSuite/i.test(item.text) && !/external email|live send|preview-only|smtp/i.test(item.text)) score -= 35;
  }
  return score;
}

function buildIssueTitle(account, term, risk) {
  const prefix = risk === 'critical' ? '[PromiseDebt][Critical]' : '[PromiseDebt]';
  return `${prefix} ${account.accountName}: ${capitalize(term.label)}`;
}

function buildSummary(term, promises, blockers) {
  if (term.key === 'dashboard') {
    return 'Sales/customer materials created a dashboard preview expectation, but internal handoff shows no assigned owner and Product blocks production-dashboard wording without approval.';
  }
  if (term.key === 'external-email') {
    return 'The pilot boundary is preview-only external email. Any live-send promise needs separate approval before Sales repeats it.';
  }
  if (term.key === 'netsuite') {
    return 'NetSuite became a customer-critical pilot ask, but Product and the signed SOW say it is not approved for pilot scope.';
  }
  if (term.key === 'payment') {
    return 'Customer-facing payment scope exceeds the approved pilot boundary and needs Product/legal clarification before engineering commits.';
  }
  if (term.key === 'dispatch') {
    return 'Sales language suggests live automation, but policy limits the pilot to simulation or operator-approved actions.';
  }
  if (term.key === 'roster') {
    return 'Customer-facing onboarding language risks production-data processing before DPA approval and sandbox validation.';
  }
  if (term.key === 'support-sla') {
    return 'Support language risks implying a guaranteed resolution timeline that the contract does not provide.';
  }
  const promise = pickEvidence(promises, 1, term.key)[0]?.quote;
  const blocker = pickEvidence(blockers, 1, term.key)[0]?.quote;
  if (promise && blocker) return `${promise} But ${lowercaseFirst(blocker)}`;
  if (blocker) return blocker;
  if (promise) return promise;
  return `Promise debt found around ${term.label}.`;
}

function buildDeveloperAction(termKey, account) {
  const map = {
    netsuite: `Decide the approved ${account.accountName} pilot integration path, document whether NetSuite is out of scope, and give Sales safe customer-facing wording.`,
    dashboard: `Assign an engineering/product owner and produce the dashboard preview plan promised to the customer, or renegotiate the date with Sales.`,
    'external-email': `Enforce preview-only external email behavior for the pilot and document the approval path for any live send request.`,
    security: `Package the security deliverable and confirm the customer-facing send date is still accurate.`,
    baa: `Coordinate Legal/Product approval for the BAA language before Sales or CS repeats any onboarding date.`,
    onboarding: `Reconcile the customer-facing kickoff date with legal/procurement prerequisites and publish the earliest valid start condition.`,
    'support-sla': `Turn the support expectation into a realistic owner/date/status update without implying a guaranteed SLA.`,
    'routing-dashboard': `Assign the routing dashboard product owner and publish a customer-safe resolution plan.`,
    payment: `Resolve whether payment reconciliation or token handling is in scope, then document the supported pilot boundary.`,
    inventory: `Triage the inventory sync blocker and publish the launch readiness dependency for the customer account.`,
    dispatch: `Confirm that live dispatch automation is excluded from pilot scope and provide simulation-only acceptance criteria.`,
    roster: `Document the allowed roster import path before DPA approval and block production-data wording.`,
    connector: `Clarify connector change scope and decide whether this requires change control.`,
    'field-map': `Track the customer field-map dependency and make downstream dashboard/integration work conditional on receipt.`,
    procurement: `Track the procurement dependency and make kickoff/readiness work conditional on completion.`,
  };
  return map[termKey] || `Turn this promise debt into an engineering-owned plan with clear scope, owner, and customer-safe wording.`;
}

function buildAcceptanceCriteria(termKey, account) {
  const base = [
    'Issue links back to every supporting and conflicting source artifact.',
    'Engineering owner can state what is in scope, out of scope, and blocked.',
    'Sales gets safe customer-facing wording before the next follow-up.',
  ];
  const specific = {
    netsuite: [
      'NetSuite pilot support is marked approved, rejected, or change-order-only.',
      'A supported fallback path such as CSV import is documented if NetSuite is out of scope.',
    ],
    dashboard: [
      'Dashboard preview plan has a named owner and explicit delivery date.',
      'Plan avoids promising a production dashboard unless Product approves it.',
    ],
    'external-email': [
      'Pilot configuration cannot send live external emails without a signed approval path.',
      'Customer-facing wording says preview-only unless a separate go-live approval exists.',
    ],
    'support-sla': [
      'Customer update avoids guaranteed resolution language unless a real SLA exists.',
      'Internal owner and next status checkpoint are recorded.',
    ],
    dispatch: [
      'Pilot acceptance criteria use simulation/operator approval, not automatic live actions.',
      'Safety/Product confirms the boundary before any customer follow-up.',
    ],
    roster: [
      'Production roster processing is blocked until DPA approval and sandbox validation are complete.',
      'Sandbox-only onboarding path is documented.',
    ],
  };
  return [...(specific[termKey] || []), ...base];
}

function renderGithubIssueBody(input) {
  const evidenceList = (items) => items.map((item) => {
    const speaker = item.speakerName ? ` (${item.speakerName})` : '';
    return `- \`${item.sourceId}\` ${item.locator}${speaker}: "${item.quote}"`;
  }).join('\n') || '- None found.';

  return `## Promise Debt\n\n${input.summary}\n\n## Customer / Deal\n\n- Customer: ${input.account.accountName}\n- Deal: ${input.account.scenarioType}\n- Sales owner: ${input.salesOwner?.name || 'Unknown'}${input.salesOwner?.email ? ` <${input.salesOwner.email}>` : ''}\n- Risk: ${input.risk.toUpperCase()}\n- Flags: ${input.flags.length ? input.flags.join(', ') : 'none'}\n${input.dueDate ? `- Customer-visible date: ${input.dueDate}\n` : ''}\n## Developer Task\n\n${input.developerAction}\n\n## Source-backed Promise Evidence\n\n${evidenceList(input.sourceEvidence)}\n\n## Conflicting / Limiting Evidence\n\n${evidenceList(input.conflictingEvidence)}\n\n## Acceptance Criteria\n\n${input.acceptanceCriteria.map((item) => `- [ ] ${item}`).join('\n')}\n\n## Provenance\n\n- PromiseLedger-Commitment-ID: ${input.id}\n- Generated from GBrain-imported source artifacts, not from a manually entered issue.\n- Term: ${input.term.label}\n`;
}

function buildSourceTimeline(pages, ledger) {
  const relatedBySource = new Map();
  for (const obligation of ledger.obligations) {
    for (const item of obligation.sourceEvidence) {
      appendSourceRelation(relatedBySource, item.sourceId, obligation, 'support');
    }
    for (const item of obligation.conflictingEvidence) {
      appendSourceRelation(relatedBySource, item.sourceId, obligation, 'conflict');
    }
  }

  return pages
    .filter((page) => page.corpusRole === 'evidence')
    .filter((page) => page.sourceId)
    .map((page) => {
      const related = dedupeObjects(relatedBySource.get(page.sourceId) || [], (item) => `${item.term}:${item.kind}`);
      return {
        sourceId: page.sourceId,
        sourceSlug: page.slug,
        sourceType: page.sourceType,
        date: page.date || 'Date unknown',
        relativeToAccount: page.relativeToAccount,
        title: page.relativeToAccount || page.sourceId,
        eventKind: related.some((item) => item.kind === 'conflict') ? 'conflict' : related.length ? 'support' : 'context',
        terms: related.map((item) => item.termLabel),
        risks: [...new Set(related.map((item) => item.risk))],
        summary: buildTimelineSummary(page, related),
      };
    })
    .sort(compareTimelineDate);
}

function appendSourceRelation(map, sourceId, obligation, kind) {
  const list = map.get(sourceId) || [];
  list.push({
    term: obligation.term,
    termLabel: obligation.termLabel,
    risk: obligation.risk,
    kind,
  });
  map.set(sourceId, list);
}

function buildTimelineSummary(page, related) {
  if (!related.length) return `${humanizeSourceType(page.sourceType)} context for the account review.`;
  const terms = [...new Set(related.map((item) => item.termLabel))].join(', ');
  if (related.some((item) => item.kind === 'conflict')) {
    return `${humanizeSourceType(page.sourceType)} limits or contradicts: ${terms}.`;
  }
  return `${humanizeSourceType(page.sourceType)} supports: ${terms}.`;
}

function buildPresetAnswers(ledger) {
  const bullets = ledger.obligations
    .filter((obligation) => ['critical', 'high'].includes(obligation.risk))
    .slice(0, 5)
    .map((obligation) => ({
      issueId: obligation.id,
      text: `${obligation.developerAction} Risk: ${obligation.risk}. Date: ${obligation.dueDate || 'Not found in sources'}.`,
      owner: obligation.salesOwner?.name || 'Not found in sources',
      date: obligation.dueDate || null,
      risk: obligation.risk,
      citations: [...obligation.sourceEvidence, ...obligation.conflictingEvidence].slice(0, 3).map((item) => ({
        sourceId: item.sourceId,
        locator: item.locator,
        quote: item.quote,
      })),
    }));

  return [{
    id: 'what-do-we-owe-before-kickoff',
    question: 'What do we owe Acme before kickoff?',
    status: bullets.length ? 'answered' : 'empty',
    bullets,
  }];
}

function buildGuardResults(pages, ledger) {
  return pages
    .filter((page) => page.corpusRole === 'draft')
    .map((page) => {
      const draft = safeJsonParse(page.raw);
      if (!draft) {
        return {
          draftId: page.sourceId,
          subject: page.relativeToAccount,
          decision: 'error',
          risk: 'unknown',
          blockedClaims: [],
          error: 'Draft JSON could not be parsed.',
        };
      }

      const claims = Array.isArray(draft.intendedClaims) ? draft.intendedClaims : inferDraftClaims(draft.bodyMarkdown);
      const blockedClaims = claims
        .filter((claim) => claim.shouldBeAllowed === false || (claim.shouldBeAllowed !== true && claimLooksBlocked(claim.text, ledger)))
        .map((claim) => buildBlockedClaim(claim, ledger));

      return {
        draftId: draft.draftId || page.sourceId,
        subject: draft.subject || page.relativeToAccount,
        channel: draft.channel || '',
        audience: draft.audience || '',
        decision: blockedClaims.length ? 'block' : 'allow',
        risk: blockedClaims.length ? strongestRisk(blockedClaims.map((claim) => claim.risk)) : 'low',
        blockedClaims,
      };
    })
    .sort((a, b) => a.draftId.localeCompare(b.draftId));
}

function inferDraftClaims(bodyMarkdown = '') {
  return String(bodyMarkdown)
    .split(/(?<=[.!?])\s+/)
    .map((text, index) => ({ claimId: `claim_${index + 1}`, text: text.trim(), shouldBeAllowed: true }))
    .filter((claim) => claim.text);
}

function claimLooksBlocked(text, ledger) {
  const terms = detectTerms(text);
  return terms.length > 0 && ledger.obligations.some((obligation) => terms.some((term) => term.key === obligation.term));
}

function buildBlockedClaim(claim, ledger) {
  const terms = detectTerms(claim.text);
  const obligation = ledger.obligations.find((item) => terms.some((term) => term.key === item.term)) || ledger.obligations[0];
  const conflicts = obligation ? obligation.conflictingEvidence : [];
  return {
    claimId: claim.claimId,
    text: claim.text,
    risk: obligation?.risk || 'high',
    reason: obligation?.riskReason || 'Claim conflicts with source-backed account memory.',
    conflictingSourceIds: conflicts.map((item) => item.sourceId),
    citations: conflicts.map((item) => ({
      sourceId: item.sourceId,
      locator: item.locator,
      quote: item.quote,
    })),
    safeAlternative: buildSafeAlternative(obligation),
  };
}

function buildSafeAlternative(obligation) {
  if (!obligation) return 'Use source-backed wording before sending this draft.';
  if (obligation.term === 'netsuite') return 'We will confirm the NetSuite integration scope with Product before adding it to the pilot plan.';
  if (obligation.term === 'dashboard') return 'We will share a renewal dashboard preview plan after reviewing the field map.';
  if (obligation.term === 'external-email') return 'We can support preview-only email workflows during the pilot.';
  return 'Use the issue guidance and citations before repeating this claim.';
}

function compareTimelineDate(a, b) {
  const aUnknown = a.date === 'Date unknown';
  const bUnknown = b.date === 'Date unknown';
  if (aUnknown && !bUnknown) return 1;
  if (!aUnknown && bUnknown) return -1;
  return String(a.date).localeCompare(String(b.date)) || a.sourceId.localeCompare(b.sourceId);
}

function humanizeSourceType(value) {
  return String(value || 'source').replaceAll('_', ' ');
}

function strongestRisk(risks) {
  return [...risks].sort((a, b) => riskRank(a) - riskRank(b))[0] || 'low';
}

function dedupeObjects(items, keyForItem) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const key = keyForItem(item);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function summarizeRisk(termKey, blockers) {
  if (blockers.length === 0) return 'Promise needs engineering intake before Sales repeats it.';
  const strongestEvidence = pickEvidence(blockers, 1, termKey)[0];
  const strongest = blockers.find((item) => item.sourceId === strongestEvidence?.sourceId && item.locator === strongestEvidence?.locator)
    || blockers.find((item) => item.sourceKind === 'authoritative')
    || blockers[0];
  return `${strongest.sourceType} says: ${strongest.quote}`;
}

function inferDueDate(items) {
  const text = items.map((item) => item.text).join('\n');
  const date = text.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:,\s+\d{4})?/i);
  if (date) return date[0];
  const weekday = text.match(/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday)\b(?:,\s+)?(?:May|June|Jul|July)?\s*\d{0,2}/i);
  return weekday ? weekday[0].trim() : null;
}

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function firstSentence(value, maxLength) {
  const clean = normalizeWhitespace(value);
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 1).replace(/\s+\S*$/g, '')}…`;
}

function riskRank(risk) {
  return { critical: 0, high: 1, medium: 2, low: 3 }[risk] ?? 4;
}

function capitalize(value) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

function lowercaseFirst(value) {
  return value ? `${value[0].toLowerCase()}${value.slice(1)}` : value;
}
