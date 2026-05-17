import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IMPORT_MANIFEST_PATH, REPO_ROOT } from './config.js';
import { getAccount, listAccounts, readImportManifest } from './corpus.js';
import { buildAccountMemoryFromGbrain, buildLedgerFromGbrain, enrichAccountMemoryWithGithubIssues } from './extractor.js';
import { importAllToGbrain, tryDoctor } from './gbrain.js';
import { createGithubIssuePlanner, createGithubIssues, getGithubStatus, getPromiseDebtIssueLookup } from './github.js';

const PORT = Number(process.env.PORT || 3210);
const PUBLIC_DIR = path.join(REPO_ROOT, 'public');
const issuePlanner = createGithubIssuePlanner();

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      await routeApi(request, response, url);
      return;
    }
    await routeStatic(request, response, url.pathname);
  } catch (error) {
    writeError(response, error);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`PromiseLedger running at http://127.0.0.1:${PORT}`);
});

async function routeApi(request, response, url) {
  if (request.method === 'GET' && url.pathname === '/api/health') {
    writeJson(response, 200, {
      gbrain: tryDoctor(),
      github: getGithubStatus(),
      importManifestExists: fs.existsSync(IMPORT_MANIFEST_PATH),
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/accounts') {
    const manifest = readImportManifest(IMPORT_MANIFEST_PATH);
    const importedByAccount = new Map();
    for (const item of manifest?.imported || []) {
      if (!item.accountSlug) continue;
      importedByAccount.set(item.accountSlug, (importedByAccount.get(item.accountSlug) || 0) + 1);
    }
    writeJson(response, 200, {
      accounts: listAccounts().map((account) => ({
        accountId: account.accountId,
        accountSlug: account.accountSlug,
        accountName: account.accountName,
        industry: account.industry,
        scenarioType: account.scenarioType,
        primaryDemoMoment: account.primaryDemoMoment,
        importedPages: importedByAccount.get(account.accountSlug) || 0,
      })),
      importManifest: manifest ? {
        importedAt: manifest.importedAt,
        importedCount: manifest.importedCount,
        failedCount: manifest.failedCount,
      } : null,
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/import') {
    const manifest = importAllToGbrain();
    writeJson(response, manifest.failedCount ? 207 : 200, manifest);
    return;
  }

  const ledgerMatch = url.pathname.match(/^\/api\/accounts\/([^/]+)\/ledger$/);
  if (request.method === 'GET' && ledgerMatch) {
    const accountSlug = decodeURIComponent(ledgerMatch[1]);
    if (!getAccount(accountSlug)) {
      writeJson(response, 404, { error: `Unknown account ${accountSlug}` });
      return;
    }
    const manifest = readImportManifest(IMPORT_MANIFEST_PATH);
    const ledger = buildLedgerFromGbrain(accountSlug, manifest);
    writeJson(response, 200, {
      schemaVersion: ledger.schemaVersion,
      generatedAt: ledger.generatedAt,
      importedAt: ledger.importedAt,
      account: ledger.account,
      salesOwner: ledger.salesOwner,
      summary: ledger.summary,
      obligations: ledger.obligations,
    });
    return;
  }

  const memoryMatch = url.pathname.match(/^\/api\/accounts\/([^/]+)\/memory$/);
  if (request.method === 'GET' && memoryMatch) {
    const accountSlug = decodeURIComponent(memoryMatch[1]);
    if (!getAccount(accountSlug)) {
      writeJson(response, 404, { error: `Unknown account ${accountSlug}`, code: 'UNKNOWN_ACCOUNT' });
      return;
    }
    const manifest = readImportManifest(IMPORT_MANIFEST_PATH);
    const memory = enrichAccountMemoryWithGithubIssues(
      buildAccountMemoryFromGbrain(accountSlug, manifest),
      getPromiseDebtIssueLookup(),
    );
    writeJson(response, 200, memory);
    return;
  }

  const issuePreviewMatch = url.pathname.match(/^\/api\/accounts\/([^/]+)\/issues\/preview$/);
  if (request.method === 'POST' && issuePreviewMatch) {
    const accountSlug = decodeURIComponent(issuePreviewMatch[1]);
    const body = await readRequestJson(request);
    const manifest = readImportManifest(IMPORT_MANIFEST_PATH);
    const ledger = buildLedgerFromGbrain(accountSlug, manifest);
    const obligations = selectObligations(ledger, body.issueIds);
    writeJson(response, 200, issuePlanner.preview(obligations));
    return;
  }

  const issueCreateMatch = url.pathname.match(/^\/api\/accounts\/([^/]+)\/issues\/create$/);
  if (request.method === 'POST' && issueCreateMatch) {
    const body = await readRequestJson(request);
    writeJson(response, 200, issuePlanner.create({ nonce: body.nonce }));
    return;
  }

  const issueMatch = url.pathname.match(/^\/api\/accounts\/([^/]+)\/issues$/);
  if (request.method === 'POST' && issueMatch) {
    const accountSlug = decodeURIComponent(issueMatch[1]);
    const body = await readRequestJson(request);
    const manifest = readImportManifest(IMPORT_MANIFEST_PATH);
    const ledger = buildLedgerFromGbrain(accountSlug, manifest);
    const obligations = selectObligations(ledger, body.issueIds);
    const results = createGithubIssues(obligations, { dryRun: Boolean(body.dryRun) });
    writeJson(response, 200, { results });
    return;
  }

  writeJson(response, 404, { error: 'Not found' });
}

async function routeStatic(request, response, pathname) {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    writeJson(response, 403, { error: 'Forbidden' });
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    writeJson(response, 404, { error: 'Not found' });
    return;
  }
  response.writeHead(200, { 'Content-Type': contentType(filePath) });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  fs.createReadStream(filePath).pipe(response);
}

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(payload, null, 2));
}

function writeError(response, error) {
  const statusCode = error?.statusCode || 500;
  writeJson(response, statusCode, {
    error: error instanceof Error ? error.message : String(error),
    code: error?.code || 'INTERNAL_ERROR',
  });
}

function selectObligations(ledger, issueIds) {
  const selected = new Set(issueIds || ledger.obligations.map((item) => item.id));
  return ledger.obligations.filter((item) => selected.has(item.id));
}

function readRequestJson(request) {
  return new Promise((resolve, reject) => {
    let data = '';
    request.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error('Request body too large'));
        request.destroy();
      }
    });
    request.on('end', () => {
      if (!data) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function contentType(filePath) {
  const ext = path.extname(filePath);
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.js') return 'application/javascript; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  return 'application/octet-stream';
}
