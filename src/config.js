import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MOCK_DATA_DIR = path.join(REPO_ROOT, 'mock data');
export const RUNTIME_DIR = path.join(REPO_ROOT, '.promiseledger');
export const IMPORT_MANIFEST_PATH = path.join(RUNTIME_DIR, 'gbrain-import-manifest.json');
export const GITHUB_REPO = process.env.PROMISELEDGER_GITHUB_REPO || 'vsrikar08/promise-ledger';

export const SOURCE_EXTENSIONS = new Set(['.csv', '.json', '.jsonl', '.md', '.yml', '.yaml']);
