import process from 'node:process';

import { processTreeTarget } from './visual.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function defaultIsAlive(target, kill) {
  try {
    kill(target, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

export async function stopProcessTree(child, options = {}) {
  if (!child) return;
  const kill = options.kill ?? process.kill.bind(process);
  const delay = options.delay ?? sleep;
  const isAlive = options.isAlive ?? ((target) => defaultIsAlive(target, kill));
  const target = processTreeTarget(child.pid);
  if (child.exitCode !== null || !isAlive(target)) return;
  try {
    kill(target, 'SIGTERM');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
    return;
  }
  const exitTimeoutMs = options.exitTimeoutMs ?? 3000;
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(exitTimeoutMs),
  ]);
  if (!isAlive(target)) return;
  try {
    kill(target, 'SIGKILL');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
    return;
  }
  await delay(100);
  if (isAlive(target)) throw new Error(`preview process group ${target} survived SIGKILL`);
}

export function worktreePaths(porcelain) {
  return String(porcelain).split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length));
}
