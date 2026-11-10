import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { main, parseArgs, networkPrefix } from './run.mjs';
import { git, run, acquire, validateConfig } from './lib.mjs';

async function fixture(t, { content = 'bad', failure = '', emptyTypes = false, trackedEnv = false, formatterEscapes = false, nativeTypes = false } = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'maintenance-test-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const root = path.join(dir, 'repo'), state = path.join(dir, 'state'); await mkdir(root); await mkdir(path.join(root, 'src')); await mkdir(path.join(root, 'scripts'));
  await git(root, ['init', '-q', '-b', 'main']);
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture', type: 'module', private: true }));
  await writeFile(path.join(root, 'package-lock.json'), '{}'); await writeFile(path.join(root, '.gitignore'), 'node_modules/\ndist/\n');
  await writeFile(path.join(root, 'src/value.ts'), `export const value = '${content}';\n`);
  await writeFile(path.join(root, 'tsconfig.app.json'), JSON.stringify({ files: emptyTypes ? [] : ['src/value.ts'] }));
  if (trackedEnv) await writeFile(path.join(root, '.env'), 'MAINTENANCE_TEST_SECRET=private-fixture-value\n');
  const gates = `import fs from 'node:fs';import {spawnSync} from 'node:child_process';\nconst text=fs.readFileSync('src/value.ts','utf8'); const phase=process.argv[2];\nif(fs.existsSync('.env') || process.env.MAINTENANCE_TEST_SECRET) {console.error('secret environment was present');process.exit(40);}\nif(${JSON.stringify(failure)}==='baseline' && phase==='lint') {console.error('Error: baseline fixture');process.exit(21);}\nif(${JSON.stringify(failure)}==='patched' && phase==='test' && text.includes('good')) {console.error('Error: patched fixture');process.exit(22);}\nif(${JSON.stringify(failure)}==='staged' && phase==='lint'){fs.appendFileSync('package.json','\\n');spawnSync('git',['add','package.json']);}\nif(${JSON.stringify(failure)}==='mutating' && phase==='test' && text.includes('good'))fs.writeFileSync('src/value.ts',text.replace('good','different'));\nif(${JSON.stringify(failure)}==='timeout' && phase==='test') await new Promise(r=>setTimeout(r,30000));\n`;
  await writeFile(path.join(root, 'scripts/gate.mjs'), gates);
  const tsDir = path.join(root, 'node_modules/typescript'); await mkdir(tsDir, { recursive: true });
  await writeFile(path.join(tsDir, 'package.json'), JSON.stringify({ name: 'typescript', main: 'index.cjs' }));
  await mkdir(path.join(tsDir, 'bin')); await writeFile(path.join(tsDir, 'bin/tsc'), nativeTypes ? `const fs=require('fs'),path=require('path');if(process.argv.includes('--listFilesOnly')){const cfg=process.argv[process.argv.indexOf('--project')+1];console.log(JSON.parse(fs.readFileSync(cfg,'utf8')).files.map(f=>path.resolve(f)).join('\\n'));}` : 'process.exit(0);');
  await writeFile(path.join(tsDir, 'index.cjs'), nativeTypes ? 'module.exports={version:"7.0.2",versionMajorMinor:"7.0"};' : `const fs=require('fs'),path=require('path');module.exports={sys:{readFile:f=>fs.readFileSync(f,'utf8')},readConfigFile:(f,read)=>({config:JSON.parse(read(f))}),parseJsonConfigFileContent:(c,sys,base)=>({errors:[],fileNames:(c.files||[]).map(f=>path.resolve(base,f))})};`);
  for (const name of ['eslint', 'prettier']) {
    const d = path.join(root, 'node_modules', name); await mkdir(d, { recursive: true });
    await writeFile(path.join(d, 'package.json'), JSON.stringify({ name, type: 'module', bin: { [name]: 'bin.mjs' } }));
    await writeFile(path.join(d, 'bin.mjs'), name === 'prettier' ? `import fs from 'node:fs';const f='src/value.ts';if(process.argv.includes('--list-different')){if(fs.readFileSync(f,'utf8').includes('bad')){console.log(f);process.exit(1);}process.exit(0);}fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace('bad','good'));${formatterEscapes ? "fs.writeFileSync('package.json','{}');" : ''}` : '');
  }
  const config = { version: 1, manager: 'npm', tsconfigs: ['tsconfig.app.json'], gates: ['lint', 'types', 'test', 'build'].map((name) => ({ name, command: name === 'types' ? ['node', new URL('./typecheck.mjs', import.meta.url).pathname, 'tsconfig.app.json'] : ['node', 'scripts/gate.mjs', name] })), fix: { roots: ['src'], prettier: true, eslintRules: [] }, timeoutMs: failure === 'timeout' ? 300 : 5000, maxFiles: 20, maxChangedLines: 400 };
  const configFile = path.join(dir, 'config.json'); await writeFile(configFile, JSON.stringify(config));
  await git(root, ['add', '.']); await git(root, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@localhost', 'commit', '-qm', 'base']);
  const args = (action = 'heal') => [action, '--root', root, '--ref', 'main', '--config', configFile, '--state', state];
  return { root, state, configFile, args, config, dir };
}
const sandboxAvailable = await networkPrefix(process.cwd()).then(() => true, () => false);
const isolated = { skip: !sandboxAvailable };
test('CLI e config desconhecidas falham fechadas', () => {
  assert.throws(() => parseArgs(['heal', '--root', '/tmp/x']), /--ref/);
  assert.throws(() => parseArgs(['doctor', '--root', '/tmp/x', '--apply', 'yes']), /Argumento/);
  assert.throws(() => validateConfig({ version: 1, surprise: true }), /Configuração/);
});
test('tsconfig vazio impede doctor saudável', async (t) => {
  const f = await fixture(t, { emptyTypes: true }); const result = await main(f.args('doctor'));
  assert.equal(result.exitCode, 1); assert.equal(result.report.status, 'failed'); assert.match(result.report.message, /nenhum arquivo src/);
});
test('trava atômica impede segundo executor', async (t) => {
  const d = await mkdtemp(path.join(os.tmpdir(), 'maintenance-lock-')); t.after(() => rm(d, { recursive: true, force: true }));
  const unlock = await acquire(path.join(d, 'lock'));
  await assert.rejects(acquire(path.join(d, 'lock')), (e) => e.code === 'skipped_busy'); await unlock();
  const again = await acquire(path.join(d, 'lock')); await again();
});
test('timeout mata grupo de subprocessos e distingue resultado', async () => {
  const start = Date.now(); const result = await run(['node', '-e', 'setInterval(()=>{},1000)'], process.cwd(), 100);
  assert.equal(result.timedOut, true); assert.notEqual(result.code, 0); assert.ok(Date.now() - start < 2500);
});
test('gate baseline falha sem criar branch ou tocar clone sujo', isolated, async (t) => {
  const f = await fixture(t, { failure: 'baseline' }); await writeFile(path.join(f.root, 'src/value.ts'), 'human dirty edit\n');
  const before = await git(f.root, ['show-ref']); const result = await main(f.args());
  assert.equal(result.report.status, 'blocked_baseline'); assert.equal(result.exitCode, 3);
  assert.equal(await readFile(path.join(f.root, 'src/value.ts'), 'utf8'), 'human dirty edit\n'); assert.equal(await git(f.root, ['show-ref']), before);
  assert.equal((await git(f.root, ['worktree', 'list', '--porcelain'])).match(/worktree /g).length, 1);
});
test('patch isolado é validado, commitado localmente e não duplicado', isolated, async (t) => {
  const f = await fixture(t, { trackedEnv: true }); const base = await git(f.root, ['rev-parse', 'HEAD']);
  process.env.MAINTENANCE_TEST_SECRET = 'must-not-reach-child'; t.after(() => delete process.env.MAINTENANCE_TEST_SECRET);
  const result = await main(f.args()); assert.equal(result.report.status, 'validated_patch', JSON.stringify(result.report)); assert.equal(result.exitCode, 0);
  assert.equal(await git(f.root, ['rev-parse', 'HEAD']), base); assert.match(await readFile(path.join(f.root, 'src/value.ts'), 'utf8'), /bad/);
  assert.equal(result.report.steps.filter((s) => s.phase === 'patched').length, 4);
  const patch = await readFile(result.report.patch, 'utf8'); assert.match(patch, /good/); assert.ok(!patch.includes('private-fixture-value'));
  assert.match(await git(f.root, ['show', `${result.report.commit}:src/value.ts`]), /good/);
  assert.equal(await git(f.root, ['show', `${result.report.commit}:.env`]), 'MAINTENANCE_TEST_SECRET=private-fixture-value');
  assert.equal((await main(f.args())).report.status, 'pending_patch');
  assert.equal((await git(f.root, ['worktree', 'list', '--porcelain'])).match(/worktree /g).length, 1);
});
test('gate após patch falha sem commit nem branch restante', isolated, async (t) => {
  const f = await fixture(t, { failure: 'patched' }); const before = await git(f.root, ['show-ref']); const result = await main(f.args());
  assert.equal(result.report.status, 'failed'); assert.match(result.report.message, /patched/); assert.equal(await git(f.root, ['show-ref']), before);
  assert.match(await readFile(path.join(f.root, 'src/value.ts'), 'utf8'), /bad/);
});
test('formatter fora do escopo é descartado antes de commit', isolated, async (t) => {
  const f = await fixture(t, { formatterEscapes: true }); const result = await main(f.args());
  assert.equal(result.report.status, 'failed'); assert.match(result.report.message, /fora do escopo/);
  assert.equal(JSON.parse(await readFile(path.join(f.root, 'package.json'), 'utf8')).name, 'fixture');
});
test('código de saída baseline timeout é bloqueante', isolated, async (t) => {
  const f = await fixture(t, { failure: 'timeout' }); const result = await main(f.args());
  assert.equal(result.report.status, 'blocked_baseline'); assert.equal(result.exitCode, 3); assert.ok(result.report.steps.some((s) => s.timeout));
});
test('sem alterações termina sem branch ou pending', isolated, async (t) => {
  const f = await fixture(t, { content: 'good' }); const result = await main(f.args());
  assert.equal(result.report.status, 'no_changes', JSON.stringify(result.report)); assert.equal(result.exitCode, 0);
  assert.equal((await git(f.root, ['branch', '--format=%(refname:short)'])).split('\n').length, 1);
});
test('dependências divergentes da referência bloqueiam reutilização', isolated, async (t) => {
  const f = await fixture(t); await writeFile(path.join(f.root, 'package-lock.json'), '{"changed":true}'); const result = await main(f.args());
  assert.equal(result.report.status, 'missing_dependencies'); assert.equal(result.exitCode, 2);
});

test('índice alterado por gate bloqueia commit de arquivos indevidos', isolated, async (t) => {
  const f = await fixture(t, { failure: 'staged' }); const before = await git(f.root, ['show-ref']); const result = await main(f.args());
  assert.equal(result.report.status, 'failed'); assert.match(result.report.message, /índice Git/); assert.equal(await git(f.root, ['show-ref']), before);
});
test('gate que modifica o patch é descartado', isolated, async (t) => {
  const f = await fixture(t, { failure: 'mutating' }); const before = await git(f.root, ['show-ref']); const result = await main(f.args());
  assert.equal(result.report.status, 'failed'); assert.match(result.report.message, /alterou o patch/); assert.equal(await git(f.root, ['show-ref']), before);
});
test('trava de pid morto é recuperada, trava recente sem dono fica bloqueante', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'maintenance-stale-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const lock = path.join(dir, 'lock'); await mkdir(lock); await writeFile(path.join(lock, 'owner.json'), JSON.stringify({pid:2147483647}));
  const release = await acquire(lock); await release(); await mkdir(lock);
  await assert.rejects(acquire(lock), (e) => e.code === 'skipped_busy');
});
test('namespace de rede impede acesso externo de todos os filhos', isolated, async () => {
  const prefix = await networkPrefix(process.cwd());
  const result = await run([...prefix, 'node', '-e', "fetch('http://192.0.2.1:9').then(()=>process.exit(7),()=>process.exit(0))"], process.cwd(), 5000);
  assert.equal(result.code, 0); assert.equal(result.timedOut, false);
});
test('patch integrado por squash é reconhecido e não bloqueia manutenção', isolated, async (t) => {
  const f = await fixture(t); const first = await main(f.args()); assert.equal(first.report.status, 'validated_patch');
  await git(f.root, ['cherry-pick', '--no-commit', first.report.commit]);
  await git(f.root, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@localhost', 'commit', '-qm', 'squash integration']);
  const second = await main(f.args()); assert.equal(second.report.status, 'no_changes', JSON.stringify(second.report));
});

test('TypeScript 7 sem API usa CLI isolada e valida o patch', isolated, async (t) => {
  const f = await fixture(t, { nativeTypes: true }); const result = await main(f.args());
  assert.equal(result.report.status, 'validated_patch', JSON.stringify(result.report));
  assert.equal(result.report.doctor.coverage[0].method, 'cli'); assert.equal(result.report.doctor.coverage[0].sourceFiles, 1);
});
test('TypeScript 7 com CLI sem arquivos bloqueia doctor', isolated, async (t) => {
  const f = await fixture(t, { nativeTypes: true, emptyTypes: true }); const result = await main(f.args('doctor'));
  assert.equal(result.report.status, 'failed'); assert.match(result.report.message, /vazio ou inválido/);
});
