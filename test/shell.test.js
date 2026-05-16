import test from 'node:test';
import assert from 'node:assert/strict';
import { tryCommand } from '../src/shell.js';

test('tryCommand returns a typed timeout error', () => {
  const result = tryCommand(process.execPath, ['-e', 'setTimeout(() => {}, 1000)'], { timeout: 10 });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'COMMAND_TIMEOUT');
  assert.match(result.error, /timed out/i);
});
