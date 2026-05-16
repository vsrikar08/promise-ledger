import { spawnSync } from 'node:child_process';

export function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    input: options.input,
    encoding: 'utf8',
    maxBuffer: options.maxBuffer ?? 20 * 1024 * 1024,
    env: { ...process.env, ...(options.env || {}) },
  });

  if (result.error) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    throw new Error(
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
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
