'use strict';

/**
 * Single command for local development:
 *
 *   npm run dev        -> API (http://localhost:3000) + Expo dev server (Metro)
 *   npm run dev:api    -> API only
 *   npm run dev:app    -> Expo only
 *
 * Replaces the old `npm run dev`, which ran a full production web export
 * (30-100s) before anything could start. Metro serves the web app directly
 * from http://localhost:8081, so no export is needed while developing.
 *
 * Ports that are already in use are reused instead of crashing with EADDRINUSE.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RESET = '\x1b[0m';

const TASKS = [
  {
    name: 'api',
    color: '\x1b[36m',
    port: 3000,
    cmd: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: ['run', 'dev', '--prefix', path.join(ROOT, 'backend')],
  },
  {
    name: 'expo',
    color: '\x1b[35m',
    port: 8081,
    cmd: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args: ['expo', 'start', '--offline'],
  },
];

const children = new Map();
let shuttingDown = false;

function paint(task, line) {
  return `${task.color}[${task.name.padEnd(4)}]${RESET} ${line}`;
}

function writeLine(task, line, stream) {
  (stream === 'stderr' ? process.stderr : process.stdout).write(`${paint(task, line)}\n`);
}

function isPortBusy(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    const done = (busy) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(busy);
    };
    socket.setTimeout(400, () => done(true));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

function pipeWithPrefix(task, stream, target) {
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, index).replace(/\r$/, '');
      buffer = buffer.slice(index + 1);
      if (line.trim()) writeLine(task, line, target);
    }
  });
  return () => {
    if (buffer.trim()) writeLine(task, buffer, target);
    buffer = '';
  };
}

function killTree(child) {
  if (!child || child.killed || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children.values()) killTree(child);
  setTimeout(() => process.exit(code), 250);
}

function spawnTask(task) {
  const child = spawn(task.cmd, task.args, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: process.env.FORCE_COLOR || '1', EXPO_NO_TELEMETRY: '1' },
  });

  children.set(task.name, child);
  const flushOut = pipeWithPrefix(task, child.stdout, 'stdout');
  const flushErr = pipeWithPrefix(task, child.stderr, 'stderr');

  child.on('error', (err) => {
    writeLine(task, `failed to start: ${err.message}`, 'stderr');
    shutdown(1);
  });

  child.on('exit', (code, signal) => {
    flushOut();
    flushErr();
    children.delete(task.name);
    if (shuttingDown) return;
    if (code === 0) {
      writeLine(task, 'exited cleanly', 'stdout');
      if (children.size === 0) shutdown(0);
      return;
    }
    writeLine(task, `exited with ${signal || `code ${code}`} — stopping the other processes`, 'stderr');
    shutdown(code || 1);
  });

  return child;
}

async function main() {
  const startedAt = Date.now();

  // This checkout can be frontend-only (the API living in a sibling repo or
  // hosted). Without this guard the `api` task runs `npm --prefix backend`
  // against a folder that isn't there, exits ENOENT and takes Expo down.
  const hasBackend = fs.existsSync(path.join(ROOT, 'backend', 'package.json'));

  // Server sign-in will hit — configured in .env (EXPO_PUBLIC_API_URL).
  let apiUrl = 'https://cafeos.leadingedge.com.np';
  try {
    const match = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').match(/^\s*EXPO_PUBLIC_API_URL\s*=\s*(\S+)/m);
    if (match) apiUrl = match[1];
  } catch {
    // No .env file — the built-in default applies.
  }

  process.stdout.write(
    hasBackend
      ? 'CafeOS dev — API :3000 + Expo Metro :8081 (Ctrl+C stops both)\n'
      : `CafeOS dev — Expo Metro :8081 (Ctrl+C stops it)   API: ${apiUrl}\n`
  );

  const tasks = TASKS.filter((task) => {
    if (task.name === 'api' && !hasBackend) {
      writeLine(task, 'no backend/ folder in this checkout — skipping the API task', 'stderr');
      return false;
    }
    return true;
  });

  for (const task of tasks) {
    if (await isPortBusy(task.port)) {
      writeLine(task, `something is already listening on :${task.port} — reusing it`, 'stdout');
      continue;
    }
    spawnTask(task);
  }

  // No local API: say where sign-in goes instead of leaving it to a generic
  // "server unreachable" on the login form.
  if (!hasBackend) {
    process.stdout.write(`Note: no local API in this checkout — sign-in goes to ${apiUrl}\n`);
  }

  if (children.size === 0) {
    process.stdout.write(
      hasBackend
        ? 'Both servers were already running — nothing new to start.\n'
        : 'Expo Metro already running — nothing new to start (API task was skipped, no backend/ folder).\n'
    );
    return;
  }

  writeLine({ name: 'dev', color: '\x1b[32m' }, `started in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`, 'stdout');
  process.stdout.write(
    hasBackend ? 'Web: http://localhost:8081   API: http://localhost:3000\n' : `Web: http://localhost:8081   API: ${apiUrl}\n`
  );
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

main().catch((err) => {
  process.stderr.write(`dev runner failed: ${err.stack || err}\n`);
  shutdown(1);
});
