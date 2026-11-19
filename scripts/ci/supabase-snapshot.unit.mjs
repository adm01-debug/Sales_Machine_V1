import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('snapshot Supabase preserva SQL durante coletas parciais (offline)', { timeout: 30_000 }, () => {
  const result = spawnSync('python3', ['scripts/supabase_snapshot/test_snapshot.py', '-v'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 25_000,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
