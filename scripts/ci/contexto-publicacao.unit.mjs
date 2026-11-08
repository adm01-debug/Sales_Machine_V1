// Executa o publisher real com Git local. Downloads usam fixtures no formato da action v7;
// dentro do shell, somente o destino do push é redirecionado para um bare local.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const YAML = fs.readFileSync(path.join(ROOT, '.github/workflows/contexto.yml'), 'utf8');
const SOURCES = [
  { key: 'codigo', job: 'codigo', id: '101' },
  { key: 'supabase', job: 'banco', id: '102' },
  { key: 'regras', job: 'regras', id: '103' },
];
const GIT = (process.env.PATH || '').split(path.delimiter)
  .map((dir) => path.join(dir, 'git'))
  .find((file) => { try { fs.accessSync(file, fs.constants.X_OK); return true; } catch { return false; } });
assert.ok(GIT, 'Git é necessário para os testes locais do publisher');
const REAL_GIT = fs.realpathSync(GIT);
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
  GIT_ALLOW_PROTOCOL: 'file', GIT_TERMINAL_PROMPT: '0', HUSKY: '0',
};

function job(name) {
  const lines = YAML.split('\n');
  const start = lines.indexOf(`  ${name}:`);
  assert.ok(start >= 0, `Job ${name} não encontrado`);
  let end = start + 1;
  while (end < lines.length && !/^  [a-z][\w-]*:$/.test(lines[end])) end++;
  return lines.slice(start, end).join('\n');
}

function steps(block) {
  const lines = block.split('\n');
  const starts = lines.flatMap((line, i) => line.startsWith('      - name: ') ? [i] : []);
  return starts.map((start, i) => lines.slice(start, starts[i + 1] ?? lines.length).join('\n'));
}

const property = (block, key) => block.match(new RegExp(`^ +${key}: *(.+)$`, 'm'))?.[1].trim();
const isTrue = (block, key) => /^true(?:\s+#|$)/.test(property(block, key) || '');
const DOWNLOADS = steps(job('publicar')).filter((step) => /uses: actions\/download-artifact@/.test(step));
const PUBLISH_STEP = steps(job('publicar')).find((step) => step.includes('- name: Montar a branch e publicar'));
assert.ok(PUBLISH_STEP, 'Passo real de publicação não encontrado');
const runLines = PUBLISH_STEP.split('\n');
const runStart = runLines.indexOf('        run: |');
assert.ok(runStart >= 0, 'Bloco run do publisher não encontrado');
const PUBLISH_SCRIPT = runLines.slice(runStart + 1).map((line) => {
  assert.ok(!line.trim() || line.startsWith('          '), 'Indentação inesperada no shell do publisher');
  return line.slice(10);
}).join('\n');
const RECOVERY_STEP = steps(job('banco')).find((step) => step.includes('- name: Recuperar snapshot anterior'));
assert.ok(RECOVERY_STEP, 'Passo de recuperação do snapshot não encontrado');
const recoveryLines = RECOVERY_STEP.split('\n');
const recoveryRunStart = recoveryLines.indexOf('        run: |');
assert.ok(recoveryRunStart >= 0, 'Bloco run da recuperação não encontrado');
const RECOVERY_SCRIPT = recoveryLines.slice(recoveryRunStart + 1).map((line) => {
  assert.ok(!line.trim() || line.startsWith('          '), 'Indentação inesperada na recuperação do snapshot');
  return line.slice(10);
}).join('\n');

function writeFiles(dir, files) {
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
}

test('regeneração forçada preserva identidade válida sem legitimar diretório alheio', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'contexto-recovery-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const valid = path.join(root, 'valid');
  const invalid = path.join(root, 'invalid');
  const unowned = path.join(root, 'unowned');
  writeFiles(valid, {
    'snapshot.json': '{"format_version":2,"db":{},"api":{}}\n',
    'README.md': '# Snapshot anterior\n',
  });
  writeFiles(invalid, {
    'snapshot.json': '{"format_version":1,"db":{},"api":{}}\n',
    'user.txt': 'não legitimar\n',
  });
  writeFiles(unowned, { 'user.txt': 'não pertence ao snapshot\n' });

  const run = (snapshotDir) => spawnSync('bash', ['--noprofile', '--norc', '-euo', 'pipefail', '-c', RECOVERY_SCRIPT], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, SNAPSHOT_DIR: snapshotDir, FORCE: 'true', CONTEXTO_BRANCH: 'inexistente' },
  });
  const validResult = run(valid);
  assert.equal(validResult.status, 0, `${validResult.stdout}\n${validResult.stderr}`);
  assert.equal(fs.readFileSync(path.join(valid, '.supabase-snapshot-output'), 'utf8'), 'supabase-snapshot-v2\n');
  assert.equal(fs.existsSync(path.join(valid, 'snapshot.json')), false);
  assert.equal(fs.readFileSync(path.join(valid, 'README.md'), 'utf8'), '# Snapshot anterior\n');

  const invalidResult = run(invalid);
  assert.notEqual(invalidResult.status, 0);
  assert.equal(fs.existsSync(path.join(invalid, '.supabase-snapshot-output')), false);
  assert.equal(fs.readFileSync(path.join(invalid, 'user.txt'), 'utf8'), 'não legitimar\n');

  const unownedResult = run(unowned);
  assert.equal(unownedResult.status, 0, `${unownedResult.stdout}\n${unownedResult.stderr}`);
  assert.equal(fs.existsSync(path.join(unowned, '.supabase-snapshot-output')), false);
  assert.equal(fs.readFileSync(path.join(unowned, 'user.txt'), 'utf8'), 'não pertence ao snapshot\n');
});

function fixture(t, { ageMinutes = 0 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'contexto-publish-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const repo = path.join(dir, 'repo');
  const bare = path.join(dir, 'origin.git');
  const runner = path.join(dir, 'runner');
  const bin = path.join(dir, 'bin');
  for (const folder of [repo, runner, bin]) fs.mkdirSync(folder, { recursive: true });
  const git = (...args) => execFileSync(REAL_GIT, args, { cwd: repo, env: GIT_ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '--bare', '--quiet', bare);
  git('init', '--quiet', '-b', 'main');
  git('config', 'user.name', 'offline');
  git('config', 'user.email', 'offline@example.invalid');
  git('config', 'core.hooksPath', '/dev/null');
  writeFiles(repo, {
    'scripts/regras_negocio/indice.py': fs.readFileSync(path.join(ROOT, 'scripts/regras_negocio/indice.py'), 'utf8'),
    'docs/contexto/regras/manual/regras.md': '# Regra humana preservada\n',
    'publisher.sh': PUBLISH_SCRIPT,
  });
  git('add', '.');
  git('commit', '--quiet', '-m', 'fixture');
  git('remote', 'add', 'origin', bare);
  git('push', '--quiet', 'origin', 'main');
  const head = git('rev-parse', 'HEAD');
  const stamp = new Date(Date.now() - ageMinutes * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const remote = 'https://x-access-token:offline-fixture@github.com/offline/contexto.git';
  const proxy = `#!/usr/bin/env bash
set -euo pipefail
if [[ "$CONTEXT_TEST_FAIL_MANIFEST_READ" == true && "\${1:-}" == show && "\${2:-}" == HEAD:docs/contexto/supabase/manifest.json ]]; then
  echo 'Falha simulada na leitura do manifest publicado' >&2; exit 128
fi
if [[ "\${1:-}" == push ]]; then
  contexto_args=("$@")
  contexto_found=false
  for contexto_i in "\${!contexto_args[@]}"; do
    if [[ "\${contexto_args[$contexto_i]}" == "$CONTEXT_TEST_REMOTE" ]]; then
      contexto_args[$contexto_i]="$CONTEXT_TEST_ORIGIN"
      contexto_found=true
    fi
  done
  if [[ "$contexto_found" != true ]]; then echo 'Destino de push inesperado no teste offline' >&2; exit 1; fi
  exec "$CONTEXT_TEST_GIT" "\${contexto_args[@]}"
fi
exec "$CONTEXT_TEST_GIT" "$@"
`;
  fs.writeFileSync(path.join(bin, 'git'), proxy, { mode: 0o755 });
  const env = {
    ...GIT_ENV, PATH: `${bin}${path.delimiter}${process.env.PATH || ''}`,
    RUNNER_TEMP: runner, GH_TOKEN: 'offline-fixture', GITHUB_REPOSITORY: 'offline/contexto',
    HEAD_MAIN: head, CONTEXTO_BRANCH: 'contexto', CONTEXTO_DIR: 'docs/contexto',
    VOLATILE_MIN_INTERVAL_MIN: '60', PYTHONDONTWRITEBYTECODE: '1',
    CONTEXT_TEST_GIT: REAL_GIT, CONTEXT_TEST_REMOTE: remote, CONTEXT_TEST_ORIGIN: bare,
  };
  const read = (file) => {
    try { return git('--git-dir', bare, 'show', `refs/heads/contexto:${file}`); } catch { return null; }
  };
  const remoteHead = () => {
    try { return git('--git-dir', bare, 'rev-parse', '--verify', 'refs/heads/contexto'); } catch { return null; }
  };
  const artifact = (key, revision = 1) => {
    const common = { 'state.json': `${JSON.stringify({ source: key, revision })}\n` };
    if (key === 'supabase') return {
      ...common, 'README.md': '# Banco\n', 'errors.md': '# Erros da última coleta\n\n_nenhum_\n',
      'CHANGELOG.md': `# Histórico\n\n## ${stamp.slice(0, 16).replace('T', ' ')} UTC\n\n- Coleta.\n`,
      'snapshot.json': '{"format_version":2,"db":{},"api":{"enabled":false},"errors":[],"carried":[]}\n',
      'manifest.json': `${JSON.stringify({ produtor: 'supabase-snapshot', gerador: 'scripts/supabase_snapshot/snapshot.py', gerado_em: stamp, entrada: 'README.md', erros: [], carried: [] })}\n`,
      'stats.json': '{"bytes":1}\n',
    };
    return {
      ...common, 'INDEX.md': `# ${key}\n`,
      'manifest.json': `${JSON.stringify({ gerado_em: stamp, commit: head, entrada: 'INDEX.md', erros_do_gerador: [] })}\n`,
    };
  };
  const all = (revision = 1) => Object.fromEntries(SOURCES.map(({ key }) => [key, artifact(key, revision)]));

  function run(artifacts, { failDownload, commitDate, failPublishedManifestRead = false } = {}) {
    const art = path.join(runner, 'art');
    fs.rmSync(art, { recursive: true, force: true });
    fs.mkdirSync(art, { recursive: true });
    const records = SOURCES.filter(({ key }) => Object.hasOwn(artifacts, key))
      .map((source) => ({ ...source, name: `contexto-${source.key}`, files: artifacts[source.key] }));
    const outputs = Object.fromEntries(SOURCES.map(({ job: producer, id, key }) => [producer, Object.hasOwn(artifacts, key) ? id : '']));
    for (const step of DOWNLOADS) {
      const ids = property(step, 'artifact-ids');
      const producer = ids?.match(/needs\.([a-z]+)\.outputs\.artifact-id/)?.[1];
      const condition = property(step, 'if');
      if (producer && condition?.includes(`needs.${producer}.outputs.artifact-id != ''`) && !outputs[producer]) continue;
      try {
        const selected = producer ? records.filter((record) => record.id === outputs[producer]) : records;
        if (producer && selected.length !== 1) throw new Error('Artifact-id sem arquivo correspondente');
        if (selected.some((record) => record.key === failDownload)) throw new Error(`Download simulado falhou: ${failDownload}`);
        const destination = property(step, 'path').replace('${{ runner.temp }}', runner);
        // Contrato da action v7: um único artefato é extraído diretamente em path.
        for (const record of selected) {
          const target = selected.length === 1 || isTrue(step, 'merge-multiple')
            ? destination : path.join(destination, record.name);
          writeFiles(target, record.files);
        }
      } catch (error) {
        if (!isTrue(step, 'continue-on-error')) return { status: 'failure', stage: 'download', message: error.message };
      }
    }
    const result = spawnSync('bash', ['--noprofile', '--norc', '-euo', 'pipefail', path.join(repo, 'publisher.sh')], {
      cwd: repo, encoding: 'utf8', timeout: 25_000,
      env: {
        ...env, CONTEXT_TEST_FAIL_MANIFEST_READ: String(failPublishedManifestRead),
        ...(commitDate ? { GIT_AUTHOR_DATE: commitDate, GIT_COMMITTER_DATE: commitDate } : {}),
      },
    });
    assert.ifError(result.error);
    return { status: result.status === 0 ? 'success' : 'failure', stage: 'publisher', code: result.status, stdout: result.stdout, stderr: result.stderr };
  }
  const expectSuccess = (result) => assert.equal(result.status, 'success', `${result.stdout || result.message}\n${result.stderr || ''}`);
  return { artifact, all, run, read, remoteHead, expectSuccess, head, stamp };
}

test('cada upload fornece um ID e cada download usa destino explícito sem ocultar falhas', () => {
  assert.equal(DOWNLOADS.length, 3);
  for (const { job: producer, key } of SOURCES) {
    const block = job(producer);
    const upload = steps(block).find((step) => /uses: actions\/upload-artifact@/.test(step));
    const uploadId = property(upload, 'id');
    assert.ok(uploadId, `Upload de ${producer} sem id`);
    assert.equal(property(block, 'artifact-id'), `\${{ steps.${uploadId}.outputs.artifact-id }}`);
    const download = DOWNLOADS.find((step) => property(step, 'artifact-ids') === `\${{ needs.${producer}.outputs.artifact-id }}`);
    assert.ok(download, `Download por ID de ${producer} ausente`);
    assert.equal(property(download, 'path'), `\${{ runner.temp }}/art/contexto-${key}`);
    assert.equal(property(download, 'if'), `needs.${producer}.outputs.artifact-id != ''`);
    assert.equal(isTrue(download, 'continue-on-error'), false);
  }
});

test('produtores independentes falham de verdade e o publisher ainda aceita as fontes disponíveis', () => {
  for (const { job: producer } of SOURCES) {
    const block = job(producer);
    assert.match(block, /^    needs: gate$/m);
    assert.doesNotMatch(block, /^    continue-on-error: true/m);
  }
  assert.equal(property(job('publicar'), 'if'), "${{ !cancelled() && needs.gate.result == 'success' }}");
  const graphify = steps(job('codigo')).find((step) => step.includes('- name: Grafo de código'));
  assert.equal(isTrue(graphify, 'continue-on-error'), true, 'O grafo opcional continua tolerado');
});

for (const { key: failed } of SOURCES) {
  test(`falha fatal de ${failed} mantém sua versão anterior e publica as duas fontes saudáveis`, { timeout: 45_000 }, (t) => {
    const f = fixture(t);
    f.expectSuccess(f.run(f.all()));
    const payload = f.all(2);
    delete payload[failed]; // O upload do produtor fatalmente interrompido não entrega artifact-id.
    f.expectSuccess(f.run(payload));
    for (const { key } of SOURCES) {
      const data = JSON.parse(f.read(`docs/contexto/${key}/state.json`));
      assert.equal(data.revision, key === failed ? 1 : 2);
    }
  });
}

for (const previousBranch of [false, true]) {
  for (let mask = 0; mask < 8; mask++) {
    const selected = SOURCES.filter((_, i) => mask & (1 << i)).map(({ key }) => key);
    test(`publisher ${previousBranch ? 'com' : 'sem'} branch anterior: ${selected.join('+') || 'nenhum artefato'}`, { timeout: 45_000 }, (t) => {
      const f = fixture(t);
      if (previousBranch) f.expectSuccess(f.run(f.all()));
      const before = f.remoteHead();
      const payload = Object.fromEntries(selected.map((key) => [key, f.artifact(key, 2)]));
      f.expectSuccess(f.run(payload));
      for (const { key } of SOURCES) {
        const data = f.read(`docs/contexto/${key}/state.json`);
        const expected = selected.includes(key) ? 2 : previousBranch ? 1 : null;
        assert.equal(data ? JSON.parse(data).revision : null, expected, `Conteúdo da fonte ${key}`);
      }
      assert.equal(f.read('docs/contexto/regras/manual/regras.md'), '# Regra humana preservada');
      if (previousBranch && mask === 0) assert.equal(f.remoteHead(), before, 'Sem artefato novo não pode criar commit vazio');
    });
  }
}

for (const previousBranch of [false, true]) {
  for (const { key } of SOURCES) {
    test(`falha no download ${key} ${previousBranch ? 'preserva a branch existente' : 'não publica a primeira branch'}`, { timeout: 45_000 }, (t) => {
      const f = fixture(t);
      if (previousBranch) f.expectSuccess(f.run(f.all()));
      const before = f.remoteHead();
      const result = f.run(f.all(2), { failDownload: key });
      assert.equal(result.status, 'failure');
      assert.equal(result.stage, 'download');
      assert.equal(f.remoteHead(), before);
      for (const { key: source } of SOURCES) {
        const data = f.read(`docs/contexto/${source}/state.json`);
        assert.equal(data ? JSON.parse(data).revision : null, previousBranch ? 1 : null);
      }
    });
  }
}

const ERROR_REPORT = '# Erros da última coleta\n\n| seção | erro |\n|---|---|\n| auth | permissão insuficiente |\n';
for (const recovering of [false, true]) {
  test(`saúde: ${recovering ? 'recuperação' : 'erro novo'} é publicada antes de 60 minutos`, { timeout: 45_000 }, (t) => {
    const f = fixture(t);
    const first = f.all();
    if (recovering) first.supabase['errors.md'] = ERROR_REPORT;
    f.expectSuccess(f.run(first));
    const before = f.remoteHead();
    const next = f.artifact('supabase');
    if (!recovering) next['errors.md'] = ERROR_REPORT;
    f.expectSuccess(f.run({ ...f.all(), supabase: next }));
    assert.notEqual(f.remoteHead(), before);
    assert.equal(f.read('docs/contexto/supabase/errors.md'), next['errors.md'].trim());
    const line = f.read('docs/contexto/00-INDEX.md').split('\n').find((row) => row.includes('**banco real**'));
    assert.equal(line.includes('parcial'), !recovering);
  });
}

for (const recovering of [false, true]) {
  test(`índice: fonte ${recovering ? 'atualizada' : 'desatualizada'} por commit muda sem esperar 60 minutos`, { timeout: 45_000 }, (t) => {
    const f = fixture(t);
    const first = f.all();
    const setCommit = (payload, commit) => { const manifest = JSON.parse(payload['manifest.json']); manifest.commit = commit; payload['manifest.json'] = `${JSON.stringify(manifest)}\n`; };
    if (recovering) setCommit(first.codigo, '0'.repeat(40));
    f.expectSuccess(f.run(first));
    const before = f.remoteHead();
    const next = f.artifact('codigo');
    if (!recovering) setCommit(next, '0'.repeat(40));
    f.expectSuccess(f.run({ ...f.all(), codigo: next }));
    assert.notEqual(f.remoteHead(), before);
    const line = f.read('docs/contexto/00-INDEX.md').split('\n').find((row) => row.includes('**código**'));
    assert.equal(line.includes('desatualizado'), !recovering);
  });
}

for (const ageMinutes of [0, 59, 60]) {
  test(`métricas sem mudança de saúde: manifest publicado há ${ageMinutes} minutos`, { timeout: 45_000 }, (t) => {
    const f = fixture(t, { ageMinutes });
    f.expectSuccess(f.run(f.all(), { commitDate: f.stamp }));
    const before = f.remoteHead();
    const next = f.artifact('supabase');
    const manifest = JSON.parse(next['manifest.json']);
    manifest.gerado_em = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    next['manifest.json'] = `${JSON.stringify(manifest)}\n`;
    next['stats.json'] = '{"bytes":2}\n';
    f.expectSuccess(f.run({ ...f.all(), supabase: next }));
    assert.equal(f.remoteHead() === before, ageMinutes < 60);
    assert.equal(JSON.parse(f.read('docs/contexto/supabase/stats.json')).bytes, ageMinutes < 60 ? 1 : 2);
    assert.equal(JSON.parse(f.read('docs/contexto/supabase/manifest.json')).gerado_em, ageMinutes < 60 ? f.stamp : manifest.gerado_em);
  });
}

test('relógio bancário: commits frequentes só de código não adiam o heartbeat', { timeout: 90_000 }, (t) => {
  const f = fixture(t, { ageMinutes: 70 });
  f.expectSuccess(f.run(f.all(), { commitDate: f.stamp }));
  for (const revision of [2, 3]) {
    const before = f.remoteHead();
    f.expectSuccess(f.run({ codigo: f.artifact('codigo', revision) }));
    assert.notEqual(f.remoteHead(), before, 'O código precisa realmente criar um commit recente');
    assert.equal(JSON.parse(f.read('docs/contexto/supabase/manifest.json')).gerado_em, f.stamp);
  }
  const before = f.remoteHead();
  const indexBefore = f.read('docs/contexto/00-INDEX.md');
  const next = f.artifact('supabase');
  const manifest = JSON.parse(next['manifest.json']);
  manifest.gerado_em = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  next['manifest.json'] = `${JSON.stringify(manifest)}\n`;
  f.expectSuccess(f.run({ supabase: next }));
  assert.notEqual(f.remoteHead(), before, 'A data do banco publicado deve liberar o heartbeat após 60 min');
  assert.equal(f.read('docs/contexto/00-INDEX.md'), indexBefore, 'O teste deve atingir o throttle de metadados, sem mudança estrutural');
  assert.equal(JSON.parse(f.read('docs/contexto/supabase/manifest.json')).gerado_em, manifest.gerado_em);
  assert.equal(JSON.parse(f.read('docs/contexto/codigo/state.json')).revision, 3);
});

const UNKNOWN_BANK_CLOCKS = [
  { name: 'manifest ausente', manifest: null },
  { name: 'JSON ilegível', manifest: '{' },
  { name: 'JSON sem objeto', manifest: '[]' },
  { name: 'data ausente', manifest: '{}' },
  { name: 'data inválida', manifest: '{"gerado_em":"2026-02-30T00:00:00Z"}' },
  { name: 'data sem fuso', manifest: JSON.stringify({ gerado_em: new Date().toISOString().slice(0, 19) }) },
  { name: 'data futura', manifest: JSON.stringify({ gerado_em: new Date(Date.now() + 86_400_000).toISOString() }) },
  { name: 'git show indisponível', failPublishedManifestRead: true },
];
for (const scenario of UNKNOWN_BANK_CLOCKS) {
  test(`relógio bancário: ${scenario.name} permite publicar sem congelar as métricas`, { timeout: 45_000 }, (t) => {
    const f = fixture(t);
    const first = f.all();
    const next = f.artifact('supabase');
    for (const bank of [first.supabase, next]) {
      if (!Object.hasOwn(scenario, 'manifest')) continue;
      if (scenario.manifest === null) delete bank['manifest.json'];
      else bank['manifest.json'] = scenario.manifest;
    }
    f.expectSuccess(f.run(first));
    const before = f.remoteHead();
    const indexBefore = f.read('docs/contexto/00-INDEX.md');
    next['stats.json'] = '{"bytes":2}\n';
    f.expectSuccess(f.run({ supabase: next }, { failPublishedManifestRead: scenario.failPublishedManifestRead }));
    assert.notEqual(f.remoteHead(), before);
    assert.equal(JSON.parse(f.read('docs/contexto/supabase/stats.json')).bytes, 2);
    assert.equal(f.read('docs/contexto/00-INDEX.md'), indexBefore, 'O fallback deve ser exercitado sem mudança de saúde ou inventário');
  });
}

test('três artefatos idênticos não criam novo commit', { timeout: 45_000 }, (t) => {
  const f = fixture(t);
  f.expectSuccess(f.run(f.all()));
  const before = f.remoteHead();
  const result = f.run(f.all());
  f.expectSuccess(result);
  assert.equal(f.remoteHead(), before);
  assert.match(result.stdout, /nada mudou em nenhuma das fontes/);
});
