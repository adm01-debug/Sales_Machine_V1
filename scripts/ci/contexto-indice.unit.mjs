import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../regras_negocio/indice.py', import.meta.url));
const head = '1234567890123456789012345678901234567890';

function fixture(t, manifest = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'contexto-indice-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'fonte');
  mkdirSync(source);
  writeFileSync(path.join(source, 'INDEX.md'), '# Fonte de teste\n');
  const writeManifest = (data) => writeFileSync(path.join(source, 'manifest.json'), JSON.stringify(data));
  writeManifest({ gerado_em: new Date().toISOString(), commit: head, ...manifest });
  const run = (name = 'código') => {
    execFileSync('python3', [script, '--repo', root, '--out', 'INDEX.md', '--head', head,
      '--remote', 'owner/repo', '--fonte', `${name}=fonte`], { encoding: 'utf8', stdio: 'pipe' });
    return readFileSync(path.join(root, 'INDEX.md'), 'utf8');
  };
  return { root, source, writeManifest, run };
}

test('fonte recente sem erro continua disponível como ok', (t) => {
  const f = fixture(t, { erros: [] });
  assert.match(f.run(), /\| ok · \d+ min atrás \|/);
});

for (const key of ['erros', 'errors', 'erros_do_gerador']) {
  test(`fonte recente com ${key} fica parcial`, (t) => {
    const f = fixture(t, { [key]: [{ secao: 'banco', erro: 'falha simulada' }] });
    const output = f.run();
    assert.match(output, /\| parcial ·/);
    assert.match(output, /1 erro\(s\) de coleta no manifest/);
    assert.doesNotMatch(output, /\| ok ·/);
  });
}

test('erros do snapshot são lidos mesmo sem manifest de saúde', (t) => {
  const f = fixture(t);
  writeFileSync(path.join(f.source, 'errors.md'), '# Erros\n\n| seção | erro |\n|---|---|\n| db_stats | permissão negada |\n');
  assert.match(f.run('banco real'), /parcial.*1 seção\(ões\) com erro em errors.md/);
});

test('relatório do snapshot sem erros não torna a fonte parcial', (t) => {
  const f = fixture(t);
  writeFileSync(path.join(f.source, 'errors.md'), '# Erros da última coleta\n\n_nenhum_\n');
  assert.match(f.run('banco real'), /\| ok ·/);
});

test('manifest inválido não fica ok nem interrompe o índice', (t) => {
  const f = fixture(t);
  writeFileSync(path.join(f.source, 'manifest.json'), '{ inválido');
  assert.match(f.run(), /não verificável.*manifest.json ilegível/);
});

test('manifest de formato inesperado não é considerado saudável', (t) => {
  const f = fixture(t);
  f.writeManifest([]);
  assert.match(f.run(), /não verificável.*objeto JSON/);
});

test('relatório de erros ilegível não fica ok', (t) => {
  const f = fixture(t);
  mkdirSync(path.join(f.source, 'errors.md'));
  assert.match(f.run(), /não verificável.*errors.md ilegível/);
});

test('coleta que reaproveitou seções anteriores fica parcial', (t) => {
  const f = fixture(t, { carried: ['functions'] });
  assert.match(f.run(), /parcial.*seções reaproveitadas/);
});

test('candidatos a inconsistências de negócio não são falhas de geração', (t) => {
  const f = fixture(t, { inconsistencias: 195, lacunas: 56 });
  assert.match(f.run('regras de negócio'), /\| ok ·/);
});

test('banco antigo é marcado como desatualizado mesmo com o mesmo commit', (t) => {
  const f = fixture(t, { gerado_em: '2020-01-01T00:00:00Z' });
  assert.match(f.run('banco real'), /\| desatualizado ·/);
});

for (const name of ['código', 'regras de negócio']) {
  test(`${name} do mesmo commit permanece atual quando o gate evita regeração`, (t) => {
    const f = fixture(t, { gerado_em: '2020-01-01T00:00:00Z' });
    assert.match(f.run(name), /\| ok ·/);
    assert.doesNotMatch(f.run(name), /desatualizado/);
  });
}

test('código antigo sem commit verificável continua sujeito ao limite de idade', (t) => {
  const f = fixture(t, { gerado_em: '2020-01-01T00:00:00Z', commit: null });
  assert.match(f.run(), /\| desatualizado ·/);
});

test('fonte de outro commit fica desatualizada mesmo que tenha data recente', (t) => {
  const f = fixture(t, { commit: 'abcdef01234567890123456789012345678901234' });
  assert.match(f.run(), /\| desatualizado ·.*gerado no commit/);
});

test('commit abreviado válido continua aceito', (t) => {
  const f = fixture(t, { commit: head.slice(0, 7) });
  assert.match(f.run(), /\| ok ·/);
});

test('SHAs completos diferentes com o mesmo prefixo não são confundidos', (t) => {
  const f = fixture(t, { commit: `${head.slice(0, 7)}${'a'.repeat(33)}` });
  assert.match(f.run(), /\| desatualizado ·.*gerado no commit/);
});

test('falha parcial continua visível quando o banco também está antigo', (t) => {
  const f = fixture(t, { gerado_em: '2020-01-01T00:00:00Z', erros: ['falha simulada'] });
  assert.match(f.run('banco real'), /\| parcial ·.*desatualizado há/);
});

test('recuperação de uma fonte parcial atualiza o índice', (t) => {
  const f = fixture(t, { erros: ['falha simulada'] });
  assert.match(f.run(), /\| parcial ·/);
  f.writeManifest({ gerado_em: new Date().toISOString(), commit: head, erros: [] });
  const output = f.run();
  assert.match(output, /\| ok ·/);
  assert.doesNotMatch(output, /erro\(s\) de coleta/);
});

test('fonte ausente permanece identificada como ainda não gerada', (t) => {
  const f = fixture(t);
  rmSync(f.source, { recursive: true });
  assert.match(f.run(), /ainda não gerado/);
});
