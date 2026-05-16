import fs from 'node:fs';
import path from 'node:path';
import { MOCK_DATA_DIR, SOURCE_EXTENSIONS } from './config.js';
import { readJson, slugify, walkFiles } from './util.js';

export function listAccounts() {
  const manifests = walkFiles(MOCK_DATA_DIR)
    .filter((filePath) => path.basename(filePath) === 'manifest.json')
    .filter((filePath) => filePath.includes(`${path.sep}accounts${path.sep}`));

  return manifests.map((manifestPath) => {
    const manifest = readJson(manifestPath);
    const accountRoot = path.dirname(manifestPath);
    const datasetRoot = findDatasetRoot(accountRoot);
    return {
      accountId: manifest.accountId,
      accountSlug: manifest.accountSlug,
      accountName: manifest.accountName,
      industry: manifest.industry,
      scenarioType: manifest.scenarioType,
      primaryDemoMoment: manifest.fixtureIntent?.primaryDemoMoment || manifest.scenarioType,
      accountRoot,
      datasetRoot,
      manifestPath,
      sourceFiles: manifest.sourceFiles || [],
    };
  }).sort((a, b) => a.accountName.localeCompare(b.accountName));
}

export function getAccount(accountSlug) {
  return listAccounts().find((account) => account.accountSlug === accountSlug);
}

export function listImportableFiles() {
  const accounts = listAccounts();
  const accountByRoot = new Map(accounts.map((account) => [account.accountRoot, account]));
  const sourceByAccountAndPath = new Map();

  for (const account of accounts) {
    for (const source of account.sourceFiles) {
      sourceByAccountAndPath.set(`${account.accountSlug}:${source.path}`, source);
    }
  }

  return walkFiles(MOCK_DATA_DIR)
    .filter((filePath) => !filePath.endsWith('.DS_Store'))
    .filter((filePath) => SOURCE_EXTENSIONS.has(path.extname(filePath)))
    .map((filePath) => {
      const account = findOwningAccount(filePath, accountByRoot);
      const relativeToRepo = path.relative(process.cwd(), filePath);
      const relativeToAccount = account ? path.relative(account.accountRoot, filePath) : null;
      const source = account && relativeToAccount
        ? sourceByAccountAndPath.get(`${account.accountSlug}:${relativeToAccount}`)
        : null;
      const isExpected = relativeToAccount?.startsWith(`expected${path.sep}`) || false;
      const isDraft = relativeToAccount?.startsWith(`drafts${path.sep}`) || false;
      const sourceId = source?.sourceId || buildSyntheticSourceId(account, relativeToAccount, filePath);

      return {
        filePath,
        relativeToRepo,
        relativeToAccount,
        accountId: account?.accountId || null,
        accountSlug: account?.accountSlug || null,
        accountName: account?.accountName || null,
        dealId: source?.dealId || null,
        sourceId,
        sourceType: source?.sourceType || inferSourceType(relativeToAccount || relativeToRepo),
        system: source?.system || inferSystem(relativeToAccount || relativeToRepo),
        date: source?.date || null,
        participants: source?.participants || [],
        corpusRole: isExpected ? 'oracle' : isDraft ? 'draft' : account ? 'evidence' : 'dataset',
      };
    });
}

function findDatasetRoot(accountRoot) {
  let cursor = accountRoot;
  while (cursor !== path.dirname(cursor)) {
    if (path.basename(cursor) === 'accounts') return path.dirname(cursor);
    cursor = path.dirname(cursor);
  }
  return path.dirname(accountRoot);
}

function findOwningAccount(filePath, accountByRoot) {
  let best = null;
  for (const [accountRoot, account] of accountByRoot.entries()) {
    if (filePath === accountRoot || filePath.startsWith(`${accountRoot}${path.sep}`)) {
      if (!best || accountRoot.length > best.accountRoot.length) best = account;
    }
  }
  return best;
}

function buildSyntheticSourceId(account, relativeToAccount, filePath) {
  if (account && relativeToAccount) {
    const role = relativeToAccount.startsWith(`expected${path.sep}`) ? 'oracle' : 'source';
    return `${role}_${account.accountSlug}_${slugify(relativeToAccount, 80)}`;
  }
  return `dataset_${slugify(path.relative(MOCK_DATA_DIR, filePath), 100)}`;
}

function inferSourceType(relativePath) {
  const normalized = relativePath.replaceAll(path.sep, '/');
  if (normalized.includes('/expected/')) return 'oracle';
  if (normalized.includes('/calls/')) return 'call_transcript';
  if (normalized.includes('/emails/')) return 'email_thread';
  if (normalized.includes('/slack/')) return 'slack_thread';
  if (normalized.includes('/contracts/')) return 'contract';
  if (normalized.includes('/product/')) return 'product_policy';
  if (normalized.includes('/crm/')) return 'crm';
  if (normalized.includes('/drafts/')) return 'draft';
  if (normalized.includes('/support/')) return 'support';
  if (normalized.includes('/security_legal/')) return 'security_legal';
  if (normalized.includes('/onboarding/')) return 'onboarding';
  if (normalized.includes('/proposals/')) return 'proposal';
  return path.extname(relativePath).replace('.', '') || 'document';
}

function inferSystem(relativePath) {
  const normalized = relativePath.replaceAll(path.sep, '/');
  if (normalized.includes('/crm/')) return 'salesforce';
  if (normalized.includes('/calls/')) return 'call_recording';
  if (normalized.includes('/emails/')) return 'email';
  if (normalized.includes('/slack/')) return 'slack';
  if (normalized.includes('/support/')) return 'support';
  return 'file';
}

export function readImportManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) return null;
  return readJson(manifestPath);
}
