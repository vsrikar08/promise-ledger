import { spawnSync } from 'node:child_process';

export function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    input: options.input,
    encoding: 'utf8',
    maxBuffer: options.maxBuffer ?? 20 * 1024 * 1024,
    timeout: options.timeout ?? 30_000,
    env: { ...process.env, ...(options.env || {}) },
  });

  if (result.error) {
    throw commandError(
      result.error.code === 'ETIMEDOUT' ? 'COMMAND_TIMEOUT' : 'COMMAND_FAILED',
      `${command} ${args.join(' ')} ${result.error.code === 'ETIMEDOUT' ? 'timed out' : 'failed'}: ${result.error.message}`,
    );
  }

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    throw commandError(
      'COMMAND_EXIT_NONZERO',
      `${command} ${args.join(' ')} exited ${result.status}${stderr ? `\n${stderr}` : ''}${stdout ? `\n${stdout}` : ''}`,
    );
  }

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

export function tryCommand(command, args, options = {}) {
  try {
    return { ok: true, ...runCommand(command, args, options) };
  } catch (error) {
    return {
      ok: false,
      code: error?.code || 'COMMAND_FAILED',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function commandError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
