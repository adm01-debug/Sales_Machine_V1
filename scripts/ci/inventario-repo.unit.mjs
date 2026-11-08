import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = join(ROOT, 'scripts/inventario/gerar-repo.mjs');

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'inventario-repo-'));
  for (const dir of [
    'scripts/inventario',
    'supabase/functions/exemplo',
    'supabase/migrations',
    'src',
    'e2e',
    '.github/workflows',
    'inventario/estado',
  ]) mkdirSync(join(root, dir), { recursive: true });

  copyFileSync(SCRIPT, join(root, 'scripts/inventario/gerar-repo.mjs'));
  writeFileSync(join(root, 'supabase/functions/exemplo/index.ts'), 'Deno.serve(() => new Response("ok"));\n');
  writeFileSync(join(root, 'supabase/config.toml'), '[functions.exemplo]\nverify_jwt = true\n');
  return root;
}

test('stdin vazio (/dev/null) gera edges sem criar tabelas-uso.json', () => {
  const root = fixture();
  const bin = join(root, 'bin');
  mkdirSync(bin);
  const rg = join(bin, 'rg');
  writeFileSync(rg, '#!/bin/sh\nexit 1\n');
  chmodSync(rg, 0o755);
  const result = spawnSync(process.execPath, [join(root, 'scripts/inventario/gerar-repo.mjs')], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(join(root, 'inventario/estado/edges.json')));
  assert.equal(existsSync(join(root, 'inventario/estado/tabelas-uso.json')), false);
  const edges = JSON.parse(readFileSync(join(root, 'inventario/estado/edges.json'), 'utf8'));
  assert.equal(edges.edge_functions.exemplo.sem_chamador, true, 'exit 1 do rg significa busca sem resultado');
});

test('rg ausente falha fechado e não publica edges.json incompleto', () => {
  const root = fixture();
  const pathVazio = join(root, 'path-sem-rg');
  mkdirSync(pathVazio);
  const result = spawnSync(process.execPath, [join(root, 'scripts/inventario/gerar-repo.mjs')], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PATH: pathVazio },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ripgrep \(rg\) não encontrado/);
  assert.equal(existsSync(join(root, 'inventario/estado/edges.json')), false);
});

test('rg com erro operacional (exit >= 2) falha fechado', () => {
  const root = fixture();
  const bin = join(root, 'bin');
  mkdirSync(bin);
  const rg = join(bin, 'rg');
  writeFileSync(rg, '#!/bin/sh\nexit 2\n');
  chmodSync(rg, 0o755);
  const result = spawnSync(process.execPath, [join(root, 'scripts/inventario/gerar-repo.mjs')], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PATH: bin },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ripgrep \(rg\) falhou com exit 2/);
  assert.equal(existsSync(join(root, 'inventario/estado/edges.json')), false);
});
