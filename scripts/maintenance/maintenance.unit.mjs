import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, utimes } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { main, parseArgs, networkPrefix } from './run.mjs';
import { git, run, acquire, validateConfig, exists, dependencyFingerprint } from './lib.mjs';

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

async function saveFixture(f) {
  await git(f.root, ['add', '.']);
  await git(f.root, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@localhost', 'commit', '-qm', 'fixture alterada']);
}
async function saveConfig(f) { await writeFile(f.configFile, JSON.stringify(f.config)); }
async function formatter(f, body) { await writeFile(path.join(f.root, 'node_modules/prettier/bin.mjs'), body); }

for (const [name, body] of [
  ['crash de inicialização', `throw new Error('formatter fixture failed');`],
  ['exit 1 vazio', 'process.exit(1);'],
  ['lista misturada com diagnóstico', `console.log('src/value.ts');console.log('Error: invalid formatter');process.exit(1);`],
  ['diagnóstico em stderr', `console.log('src/value.ts');console.error('Error: invalid formatter');process.exit(1);`],
  ['exit 0 com lista contraditória', `console.log('src/value.ts');`],
]) test(`scan Prettier rejeita ${name}`, isolated, async (t) => {
  const f = await fixture(t); await formatter(f, body);
  const result = await main(f.args());
  assert.equal(result.report.status, 'failed', JSON.stringify(result.report));
  assert.match(result.report.message, /lista válida|Gate.*scan/);
  assert.equal((await git(f.root, ['branch', '--format=%(refname:short)'])), 'main');
});

test('check/heal validam tsconfig da ref e doctor continua validando checkout sujo', isolated, async (t) => {
  const f = await fixture(t); await writeFile(path.join(f.root, 'tsconfig.app.json'), '{"files":[]}');
  assert.equal((await main(f.args('check'))).report.status, 'checked');
  assert.equal((await main(f.args())).report.status, 'validated_patch');
  assert.equal((await main(f.args('doctor'))).report.status, 'failed');
  assert.equal(await readFile(path.join(f.root, 'tsconfig.app.json'), 'utf8'), '{"files":[]}');
});

test('stdout e stderr preservam UTF8 partido entre eventos', async () => {
  const code = `process.stdout.write(Buffer.from([0xc3]));process.stderr.write(Buffer.from([0xf0,0x9f]));setTimeout(()=>{process.stdout.write(Buffer.from([0xa7]));process.stderr.write(Buffer.from([0x98,0x80]));},30);`;
  const result = await run(['node', '-e', code], process.cwd(), 1000);
  assert.equal(result.stdout, 'ç'); assert.equal(result.stderr, '😀'); assert.ok(!result.output.includes('\ufffd'));
});
test('patch Git real com linha longa UTF8 é preservado na exportação e no commit', isolated, async (t) => {
  const text = 'ç'.repeat(90000), f = await fixture(t, { content: `bad${text}` });
  const result = await main(f.args()); assert.equal(result.report.status, 'validated_patch', JSON.stringify(result.report));
  const patch = await readFile(result.report.patch, 'utf8'); assert.ok(!patch.includes('\ufffd')); assert.ok(patch.includes(text));
  assert.equal(await git(f.root, ['show', `${result.report.commit}:src/value.ts`]), `export const value = 'good${text}';`);
});

test('trava recovery abandonada também é recuperada e recovery de dono vivo permanece', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'maintenance-recovery-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const lock = path.join(dir, 'lock');
  for (const name of [lock, `${lock}.recovery`]) { await mkdir(name); await writeFile(path.join(name, 'owner.json'), JSON.stringify({ pid: 2147483647, token: 'dead' })); }
  const release = await acquire(lock); await release(); assert.equal(await exists(`${lock}.recovery`), false);
  await mkdir(`${lock}.recovery`); await writeFile(path.join(`${lock}.recovery`, 'owner.json'), JSON.stringify({ pid: process.pid, token: 'live' }));
  await assert.rejects(acquire(lock), (error) => error.code === 'skipped_busy');
  assert.equal(JSON.parse(await readFile(path.join(`${lock}.recovery`, 'owner.json'), 'utf8')).token, 'live');
});

test('recovery antiga sem dono é recuperada e token alheio impede limpeza', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'maintenance-recovery-age-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const lock = path.join(dir, 'lock'); await mkdir(`${lock}.recovery`);
  const old = new Date(Date.now() - 600000); await utimes(`${lock}.recovery`, old, old);
  const release = await acquire(lock);
  await writeFile(path.join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, token: 'different-owner' }));
  await assert.rejects(release(), /Dono da trava mudou/); assert.equal(await exists(lock), true);
});

test('crash libera flock automaticamente e permite recuperar a trava de PID morto', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'maintenance-lock-crash-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const lock = path.join(dir, 'lock');
  const child = spawn(process.execPath, ['--input-type=module', '-e', `import {acquire} from ${JSON.stringify(new URL('./lib.mjs', import.meta.url).href)};await acquire(${JSON.stringify(lock)});console.log('ready');setInterval(()=>{},1000);`], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill('SIGKILL'));
  await once(child.stdout, 'data'); const closed = once(child, 'close'); child.kill('SIGKILL'); await closed;
  let release;
  for (let attempt = 0; attempt < 50 && !release; attempt++) {
    try { release = await acquire(lock); } catch (error) { if (error.code !== 'skipped_busy') throw error; await new Promise((resolve) => setTimeout(resolve, 20)); }
  }
  assert.equal(typeof release, 'function'); await release();
});

async function vendorFixture(t) {
  const f = await fixture(t), vendor = path.join(f.root, 'vendor/local-dep'); await mkdir(vendor, { recursive: true });
  await writeFile(path.join(vendor, 'package.json'), JSON.stringify({ name: 'local-dep', version: '1.0.0', main: 'index.cjs' }));
  await writeFile(path.join(vendor, 'index.cjs'), "module.exports = 'base';\n");
  await writeFile(path.join(f.root, 'package.json'), JSON.stringify({ name: 'fixture', type: 'module', dependencies: { 'local-dep': 'file:vendor/local-dep' } }));
  await writeFile(path.join(f.root, 'package-lock.json'), JSON.stringify({ packages: { 'node_modules/local-dep': { resolved: 'vendor/local-dep', link: true } } }));
  await symlink('../vendor/local-dep', path.join(f.root, 'node_modules/local-dep'), 'dir');
  await saveFixture(f); return { ...f, vendor };
}
test('dependência vendor por link idêntico é reutilizada sem instalar pacotes', isolated, async (t) => {
  const f = await vendorFixture(t); const result = await main(f.args());
  assert.equal(result.report.status, 'validated_patch', JSON.stringify(result.report));
  assert.equal(typeof result.report.dependencies.local['vendor/local-dep'], 'string');
});
test('vendor sujo e referência com vendor diferente bloqueiam antes dos gates', isolated, async (t) => {
  const f = await vendorFixture(t), base = await git(f.root, ['rev-parse', 'HEAD']);
  await writeFile(path.join(f.vendor, 'index.cjs'), "module.exports = 'modified';\n");
  const dirty = await main(f.args()); assert.equal(dirty.report.status, 'missing_dependencies'); assert.equal(dirty.report.steps.length, 0);
  await saveFixture(f);
  const args = f.args(); args[args.indexOf('--ref') + 1] = base;
  const old = await main(args); assert.equal(old.report.status, 'missing_dependencies'); assert.equal(old.report.steps.length, 0);
});
test('link instalado para outro vendor divergente e file externo são recusados', isolated, async (t) => {
  const f = await vendorFixture(t), outside = path.join(f.dir, 'other'); await mkdir(outside);
  await writeFile(path.join(outside, 'package.json'), '{"name":"local-dep"}');
  await rm(path.join(f.root, 'node_modules/local-dep')); await symlink(outside, path.join(f.root, 'node_modules/local-dep'));
  const result = await main(f.args()); assert.equal(result.report.status, 'missing_dependencies');
  await writeFile(path.join(f.root, 'package.json'), '{"dependencies":{"outside":"file:../other"}}');
  await assert.rejects(dependencyFingerprint(f.root), /fora do repositório/);
});
test('mudança do vendor durante gate impede sucesso mesmo em check sem patch', isolated, async (t) => {
  const f = await vendorFixture(t);
  await writeFile(path.join(f.root, 'scripts/gate.mjs'), `import fs from 'node:fs';if(process.argv[2]==='build')fs.writeFileSync(${JSON.stringify(path.join(f.vendor, 'index.cjs'))}, 'modified during gate');`);
  await saveFixture(f); const result = await main(f.args('check'));
  assert.equal(result.report.status, 'failed'); assert.match(result.report.message, /Dependências do clone mudaram/);
});

for (const name of ['pre-commit', 'commit-msg']) test(`hook ${name} bloqueante impede commit validado`, isolated, async (t) => {
  const f = await fixture(t); await mkdir(path.join(f.root, '.husky'));
  await writeFile(path.join(f.root, '.husky', name), '#!/bin/sh\nexit 19\n'); await saveFixture(f);
  const refs = await git(f.root, ['show-ref']); const result = await main(f.args());
  assert.equal(result.report.status, 'failed'); assert.match(result.report.message, /Hook\/commit obrigatório/);
  assert.equal(await git(f.root, ['show-ref']), refs); assert.equal(await exists(path.join(f.root, '.husky/_')), false);
});
test('hooks versionados rodam offline sem .env/segredo e commit inclui escopo obrigatório', isolated, async (t) => {
  const f = await fixture(t, { trackedEnv: true }); await mkdir(path.join(f.root, '.husky'));
  await writeFile(path.join(f.root, '.husky/pre-commit'), `#!/bin/sh\ntest "$HUSKY" != 0\ntest ! -e .env\ntest -z "\${MAINTENANCE_TEST_SECRET:-}"\nnode -e "fetch('http://192.0.2.1:9').then(()=>process.exit(7),()=>process.exit(0))"\necho hook-offline-validado\n`);
  await writeFile(path.join(f.root, '.husky/commit-msg'), `#!/bin/sh\ngrep -q '^style(manutencao): aplica correcoes locais verificadas$' "$1"\necho escopo-validado\n`);
  await saveFixture(f); await git(f.root, ['config', 'core.hooksPath', '.husky/_']);
  process.env.MAINTENANCE_TEST_SECRET = 'must-not-reach-hook'; t.after(() => delete process.env.MAINTENANCE_TEST_SECRET);
  const result = await main(f.args()); assert.equal(result.report.status, 'validated_patch', JSON.stringify(result.report));
  const hookLog = await readFile(path.join(path.dirname(result.report.reportFile), result.report.hooks.log), 'utf8');
  assert.deepEqual(result.report.hooks.names, ['pre-commit', 'commit-msg']); assert.match(hookLog, /hook-offline-validado/); assert.match(hookLog, /escopo-validado/);
  assert.equal((await run(['git', 'config', '--get', 'core.hooksPath'], f.root)).stdout.trim(), '.husky/_');
  assert.equal(await git(f.root, ['log', '-1', '--format=%s', result.report.commit]), 'style(manutencao): aplica correcoes locais verificadas');
});
test('hook que altera e adiciona o patch é rejeitado depois do commit isolado', isolated, async (t) => {
  const f = await fixture(t); await mkdir(path.join(f.root, '.husky'));
  await writeFile(path.join(f.root, '.husky/pre-commit'), `#!/bin/sh\necho 'changed by hook' > src/value.ts\ngit add src/value.ts\n`); await saveFixture(f);
  const refs = await git(f.root, ['show-ref']), result = await main(f.args());
  assert.equal(result.report.status, 'failed'); assert.match(result.report.message, /Hook alterou o patch commitado/); assert.equal(await git(f.root, ['show-ref']), refs);
});
test('hook que remove o escopo da mensagem não produz commit validado', isolated, async (t) => {
  const f = await fixture(t); await mkdir(path.join(f.root, '.husky'));
  await writeFile(path.join(f.root, '.husky/commit-msg'), `#!/bin/sh\nprintf 'style: mensagem sem escopo\\n' > "$1"\n`); await saveFixture(f);
  const refs = await git(f.root, ['show-ref']), result = await main(f.args());
  assert.equal(result.report.status, 'failed'); assert.match(result.report.message, /mensagem obrigatória/); assert.equal(await git(f.root, ['show-ref']), refs);
});
test('hook customizado instalado fora dos arquivos versionados não é ignorado', isolated, async (t) => {
  const f = await fixture(t); await mkdir(path.join(f.root, '.hooks'));
  await writeFile(path.join(f.root, '.gitignore'), 'node_modules/\ndist/\n.hooks/\n'); await saveFixture(f);
  await writeFile(path.join(f.root, '.hooks/pre-commit'), '#!/bin/sh\nexit 24\n', { mode: 0o700 });
  await git(f.root, ['config', 'core.hooksPath', '.hooks']);
  const result = await main(f.args()); assert.equal(result.report.status, 'failed'); assert.match(result.report.message, /Hook\/commit obrigatório/);
  assert.deepEqual(result.report.hooks.names, ['pre-commit']);
});
test('post-commit que altera a worktree também invalida o resultado', isolated, async (t) => {
  const f = await fixture(t); await mkdir(path.join(f.root, '.husky'));
  await writeFile(path.join(f.root, '.husky/post-commit'), '#!/bin/sh\necho hook-modified > src/value.ts\n'); await saveFixture(f);
  const result = await main(f.args()); assert.equal(result.report.status, 'failed'); assert.match(result.report.message, /Hook alterou a worktree/);
});

test('NODE_ENV é escolhido por gate e variáveis privadas não chegam aos filhos', isolated, async (t) => {
  const f = await fixture(t); await writeFile(path.join(f.root, 'scripts/gate.mjs'), `const phase=process.argv[2];const expected=phase==='test'?'test':phase==='build'?'production':undefined;if(process.env.NODE_ENV!==expected||process.env.SECRET_KEY||process.env.VITE_SUPABASE_URL)process.exit(11);`); await saveFixture(f);
  process.env.NODE_ENV = 'development'; process.env.SECRET_KEY = 'private-placeholder'; process.env.VITE_SUPABASE_URL = 'https://production.invalid';
  t.after(() => { delete process.env.NODE_ENV; delete process.env.SECRET_KEY; delete process.env.VITE_SUPABASE_URL; });
  assert.equal((await main(f.args('check'))).report.status, 'checked');
});
test('ambiente público explícito aceita placeholders e rejeita secret/host de produção', isolated, async (t) => {
  const f = await fixture(t); f.config.gates.find((gate) => gate.name === 'build').env = { VITE_SUPABASE_URL: 'https://maintenance.invalid', VITE_SUPABASE_PROJECT_ID: 'maintenance_test', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_maintenance_test' }; await saveConfig(f);
  await writeFile(path.join(f.root, 'scripts/gate.mjs'), `if(process.argv[2]==='build'&&(process.env.NODE_ENV!=='production'||process.env.VITE_SUPABASE_URL!=='https://maintenance.invalid'||process.env.VITE_SUPABASE_PROJECT_ID!=='maintenance_test'||process.env.VITE_SUPABASE_PUBLISHABLE_KEY!=='sb_publishable_maintenance_test'))process.exit(12);`); await saveFixture(f);
  assert.equal((await main(f.args('check'))).report.status, 'checked');
  for (const env of [{ SECRET_KEY: 'fixture' }, { NODE_ENV: 'test' }, { VITE_SUPABASE_URL: 'https://production.supabase.co' }, { VITE_SUPABASE_PROJECT_ID: 'abcdefghijklmnopqrst' }, { VITE_SUPABASE_ANON_KEY: 'eyJ.production.token' }]) {
    const copy = structuredClone(f.config); copy.gates[3].env = env; assert.throws(() => validateConfig(copy));
  }
  const alternate = structuredClone(f.config); alternate.gates[3].env.VITE_SUPABASE_PROJECT_ID = 'test_fixture'; assert.doesNotThrow(() => validateConfig(alternate));
  const invalidExclude = structuredClone(f.config); invalidExclude.fix.exclude = ['src/**/*.ts']; assert.throws(() => validateConfig(invalidExclude), /sem globs/);
});

const genericFormatter = `import fs from 'node:fs';const args=process.argv.slice(2),files=args.slice(args.indexOf('--')+1);if(args.includes('--list-different')){const bad=files.filter(f=>fs.readFileSync(f,'utf8').includes('bad'));if(bad.length)console.log(bad.join('\\n'));process.exit(bad.length?1:0);}const file=args.at(-1);fs.writeFileSync(file,fs.readFileSync(file,'utf8').replaceAll('bad','good'));`;
test('generated e types.ts ficam fora de candidatos e alterações laterais são rejeitadas', isolated, async (t) => {
  const f = await fixture(t); await formatter(f, genericFormatter);
  await mkdir(path.join(f.root, 'src/integrations/supabase'), { recursive: true });
  await writeFile(path.join(f.root, 'src/integrations/supabase/types.ts'), "export const generated = 'bad';\n");
  await writeFile(path.join(f.root, 'src/auto.ts'), "// @generated DO NOT EDIT\nexport const generated = 'bad';\n");
  await writeFile(path.join(f.root, 'src/component.generated.ts'), "export const generated = 'bad';\n");
  await writeFile(path.join(f.root, 'src/excluded.ts'), "export const excluded = 'bad';\n");
  f.config.fix.exclude = ['src/excluded.ts']; await saveConfig(f); await saveFixture(f);
  const result = await main(f.args()); assert.equal(result.report.status, 'validated_patch', JSON.stringify(result.report));
  assert.deepEqual(result.report.scope.selected, ['src/value.ts']);
  for (const file of ['src/auto.ts', 'src/component.generated.ts', 'src/excluded.ts', 'src/integrations/supabase/types.ts']) assert.match(await git(f.root, ['show', `${result.report.commit}:${file}`]), /bad/);
  const second = await fixture(t); await mkdir(path.join(second.root, 'src/integrations/supabase'), { recursive: true });
  await writeFile(path.join(second.root, 'src/integrations/supabase/types.ts'), "// generated\nexport const x = 'bad';\n"); await saveFixture(second);
  await formatter(second, genericFormatter + "fs.writeFileSync('src/integrations/supabase/types.ts','changed');");
  const rejected = await main(second.args()); assert.equal(rejected.report.status, 'failed'); assert.match(rejected.report.message, /gerado ou excluído/);
});
test('formatter não pode mudar permissões ou remover arquivos rastreados', isolated, async (t) => {
  const f = await fixture(t);
  await formatter(f, genericFormatter + "fs.chmodSync(file,0o755);");
  const result = await main(f.args()); assert.equal(result.report.status, 'failed'); assert.match(result.report.message, /modo\/tipo/);
});

async function fakeEslint(f) {
  const parser = path.join(f.root, 'node_modules/typescript-eslint'); await mkdir(parser); await writeFile(path.join(parser, 'package.json'), '{"name":"typescript-eslint","main":"index.cjs"}'); await writeFile(path.join(parser, 'index.cjs'), 'module.exports={parser:{}};');
  const bin = path.join(f.root, 'node_modules/eslint/bin'); await mkdir(bin);
  await writeFile(path.join(bin, 'eslint.js'), `import fs from 'node:fs';import path from 'node:path';const args=process.argv.slice(2);if(!args.includes('--no-inline-config'))process.exit(23);let files=args.includes('--')?args.slice(args.indexOf('--')+1):args.includes('--fix')?[args.at(-1)]:fs.readdirSync('src').filter(f=>f.endsWith('.ts')).map(f=>'src/'+f);if(args.includes('--fix-dry-run')){console.log(JSON.stringify(files.map(f=>{const text=fs.readFileSync(f,'utf8');return {filePath:path.resolve(f),messages:[],fatalErrorCount:0,...(text.includes('bad')?{output:text.replaceAll('bad','good')}:{})};})));}else{for(const f of files)fs.writeFileSync(f,fs.readFileSync(f,'utf8').replaceAll('bad','good'));}`);
  f.config.fix.prettier = false; f.config.fix.eslintRules = ['semi']; await saveConfig(f);
}
test('ESLint não aceita diretivas inline para regras fora da allowlist', isolated, async (t) => {
  const f = await fixture(t); await fakeEslint(f);
  await writeFile(path.join(f.root, 'src/value.ts'), "/* eslint no-unused-vars: error */\nexport const value = 'bad';\n"); await saveFixture(f);
  const result = await main(f.args()); assert.equal(result.report.status, 'validated_patch', JSON.stringify(result.report));
  assert.match(await git(f.root, ['show', `${result.report.commit}:src/value.ts`]), /eslint no-unused-vars.*\nexport const value = 'good'/);
});
test('scans ESLint em lotes cabem em 4MB e orçamento de 20 arquivos continua global', isolated, async (t) => {
  const f = await fixture(t); await fakeEslint(f);
  for (let i = 0; i < 39; i++) await writeFile(path.join(f.root, `src/batch-${String(i).padStart(2, '0')}.ts`), `// ${'x'.repeat(150000)}\nexport const value = 'bad';\n`);
  await saveFixture(f); const result = await main(f.args()); assert.equal(result.report.status, 'validated_patch', JSON.stringify(result.report));
  assert.equal(result.report.scope.candidates, 40); assert.equal(result.report.scope.selected.length, 20); assert.equal(result.report.scope.skippedBudget.length, 20);
  assert.equal(result.report.steps.filter((step) => step.phase === 'scan').length, 3); assert.ok(result.report.change.lines <= 400);
});
