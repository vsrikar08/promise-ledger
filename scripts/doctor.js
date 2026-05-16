import fs from 'node:fs';
import { IMPORT_MANIFEST_PATH } from '../src/config.js';
import { tryDoctor } from '../src/gbrain.js';
import { getGithubStatus } from '../src/github.js';

const gbrain = tryDoctor();
const github = getGithubStatus();
const manifestExists = fs.existsSync(IMPORT_MANIFEST_PATH);

const checks = [
  {
    name: 'GBrain doctor',
    ok: gbrain.ok && gbrain.stdout.includes('"connection","status":"ok"'),
    detail: gbrain.ok ? 'connection ok' : gbrain.error,
  },
  {
    name: 'GitHub auth',
    ok: github.auth.ok,
    detail: github.auth.ok ? `authenticated for ${github.repo}` : github.auth.error,
  },
  {
    name: 'GBrain import manifest',
    ok: manifestExists,
    detail: manifestExists ? IMPORT_MANIFEST_PATH : 'run npm run import:gbrain',
  },
];

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.name}: ${check.detail}`);
}

if (checks.some((check) => !check.ok)) {
  process.exitCode = 1;
}
