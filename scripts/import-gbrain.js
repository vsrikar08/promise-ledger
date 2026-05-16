#!/usr/bin/env node
import { importAllToGbrain } from '../src/gbrain.js';

const dryRun = process.argv.includes('--dry-run');
const manifest = importAllToGbrain({ dryRun });

console.log(JSON.stringify({
  status: manifest.failedCount === 0 ? 'ok' : 'partial',
  importedCount: manifest.importedCount,
  failedCount: manifest.failedCount,
  totalFiles: manifest.totalFiles,
  manifestPath: dryRun ? null : '.promiseledger/gbrain-import-manifest.json',
  failed: manifest.failed.map((item) => ({
    sourceId: item.sourceId,
    relativeToRepo: item.relativeToRepo,
    error: item.error,
  })),
}, null, 2));

if (manifest.failedCount > 0) process.exitCode = 1;
