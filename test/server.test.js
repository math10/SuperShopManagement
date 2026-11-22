import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

test('src/server.js migrates, serves the login page, and stops cleanly on SIGTERM', async () => {
  const child = spawn(process.execPath, ['src/server.js'], {
    env: { ...process.env, PORT: '0', SESSION_SECRET: 'server-test-secret' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const exited = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  try {
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`server did not start:\n${output}`)), 15_000);
      child.stdout.on('data', (chunk) => {
        output += chunk;
        const match = /http:\/\/localhost:(\d+)/.exec(output);
        if (match) {
          clearTimeout(timer);
          resolve(`http://localhost:${match[1]}`);
        }
      });
      child.stderr.on('data', (chunk) => { output += chunk; });
      exited.then((code) => reject(new Error(`server exited early with ${code}:\n${output}`)));
    });

    const res = await fetch(`${url}/login`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /name="username"/);
  } finally {
    child.kill('SIGTERM');
  }
  assert.equal(await exited, 0, output);
});
