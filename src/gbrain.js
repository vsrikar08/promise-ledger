import fs from 'node:fs';
import path from 'node:path';
import { IMPORT_MANIFEST_PATH, RUNTIME_DIR } from './config.js';
import { listImportableFiles } from './corpus.js';
import { runCommand, tryCommand } from './shell.js';
import { ensureDir, shortHash, slugify } from './util.js';

const RAW_FENCE = 'promiseledger-source';

export function buildGbrainSlug(fileRecord) {
  const account = fileRecord.accountSlug || 'dataset';
  const source = fileRecord.sourceId || fileRecord.relativeToRepo;
  return slugify(`promiseledger-${account}-${fileRecord.corpusRole}-${source}`, 180);
}

export function importAllToGbrain(options = {}) {
  ensureDir(RUNTIME_DIR);
  const files = listImportableFiles();
  const imported = [];
  const failed = [];
  const startedAt = new Date().toISOString();

  for (const fileRecord of files) {
    const slug = buildGbrainSlug(fileRecord);
    const raw = fs.readFileSync(fileRecord.filePath, 'utf8');
    const page = renderGbrainPage(fileRecord, raw);

    if (!options.dryRun) {
      try {
        const result = runCommand('gbrain', ['put', slug], { input: page });
        imported.push({
          ...fileRecord,
          slug,
          bytes: Buffer.byteLength(raw),
          gbrain: parseGbrainPutOutput(result.stdout),
        });
      } catch (error) {
        failed.push({
          ...fileRecord,
          slug,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } else {
      imported.push({
        ...fileRecord,
        slug,
        bytes: Buffer.byteLength(raw),
        gbrain: { status: 'dry_run' },
      });
    }
  }

  const manifest = {
    schemaVersion: '0.1',
    importedAt: startedAt,
    totalFiles: files.length,
    importedCount: imported.length,
    failedCount: failed.length,
    imported,
    failed,
  };

  if (!options.dryRun) {
    fs.writeFileSync(IMPORT_MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  }

  return manifest;
}

export function getGbrainPage(slug) {
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const result = runCommand('gbrain', ['get', slug]);
      return result.stdout;
    } catch (error) {
      lastError = error;
      if (!String(error?.message || error).includes('PGLite lock')) break;
    }
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `${message}\nGBrain local PGLite is single-writer. Stop any running gbrain serve process or remove a stale ~/.gbrain/brain.pglite/.gbrain-lock directory, then retry.`,
  );
}

export function tryDoctor() {
  return tryCommand('gbrain', ['doctor', '--json']);
}

export function extractRawFromGbrainPage(page) {
  const match = page.match(new RegExp(`\\\`\\\`\\\`${RAW_FENCE}\\n([\\s\\S]*?)\\n\\\`\\\`\\\``));
  return match ? match[1] : page;
}

function renderGbrainPage(fileRecord, raw) {
  const title = [
    fileRecord.accountName || 'PromiseLedger dataset',
    fileRecord.sourceType,
    fileRecord.relativeToAccount || fileRecord.relativeToRepo,
  ].filter(Boolean).join(' | ');
  const metadataJson = JSON.stringify({
    accountId: fileRecord.accountId,
    accountSlug: fileRecord.accountSlug,
    accountName: fileRecord.accountName,
    dealId: fileRecord.dealId,
    sourceId: fileRecord.sourceId,
    sourceType: fileRecord.sourceType,
    corpusRole: fileRecord.corpusRole,
    system: fileRecord.system,
    date: fileRecord.date,
    relativeToRepo: fileRecord.relativeToRepo,
    relativeToAccount: fileRecord.relativeToAccount,
    contentHash: shortHash(raw),
  }, null, 2);

  return `---\ntype: concept\ntitle: ${JSON.stringify(title)}\n---\n\n# ${title}\n\nPromiseLedger imported source artifact. Treat corpusRole=oracle as evaluation data, not customer evidence.\n\n## Metadata\n\n\`\`\`json\n${metadataJson}\n\`\`\`\n\n## Raw Source\n\n\`\`\`${RAW_FENCE}\n${raw.replaceAll('```', '``\\`')}\n\`\`\`\n`;
}

function parseGbrainPutOutput(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return { raw: stdout.trim() };
  }
}
