import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { main, acquire, acquireGlobal, fingerprint, validateGraph, run, adoptInitial } from './graphify-local.mjs';

function git(root, ...args) {
  const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', '-C', root, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
}
async function fixture(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'graphify-adapter-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const root = path.join(dir, 'repo'), env = path.join(root, '.tools/graphify/.venv');
  await mkdir(path.join(root, 'src'), { recursive: true }); await mkdir(path.join(env, 'bin'), { recursive: true });
  await writeFile(path.join(root, '.gitignore'), '.tools/\ngraphify-out/\nnode_modules/\n');
  await writeFile(path.join(root, 'package.json'), '{"name":"fixture","type":"commonjs"}');
  await writeFile(path.join(root, 'src/value.ts'), 'export const value = "v1";\n');
  const python = `#!${process.execPath}\nconst path=require('node:path');const prefix=path.resolve(__dirname,'..');console.log(JSON.stringify({version:'0.9.97',prefix,module:path.join(prefix,'lib/graphify/__init__.py')}));\n`;
  await writeFile(path.join(env, 'bin/python'), python, { mode: 0o700 });
  const graphify = `#!${process.execPath}\nconst fs=require('node:fs'),path=require('node:path');const a=process.argv.slice(2);const base=path.resolve(__dirname,'..');
if(a[0]==='--version'){console.log('graphify 0.9.97');process.exit(0);}
if(a[0]==='extract'){
 if(process.env.GRAPHIFY_FIXTURE_SECRET||fs.existsSync(path.join(a[1],'.env'))||fs.existsSync(path.join(a[1],'credentials.json'))||fs.existsSync(path.join(a[1],'node_modules')))process.exit(99);
 const source=fs.readFileSync(path.join(a[1],'src/value.ts'),'utf8');
 if(source.includes('TIMEOUT'))setInterval(()=>{},1000);else{
 const out=path.join(a[a.indexOf('--out')+1],'graphify-out');fs.mkdirSync(out,{recursive:true});
 const graph=source.includes('INVALID')?{nodes:[],links:[]}:{nodes:[{id:'value',label:source,source_file:'src/value.ts'}],links:[]};
 fs.writeFileSync(path.join(out,'graph.json'),JSON.stringify(graph));
 fs.appendFileSync(path.join(base,'calls'),'extract\\n');
 if(source.includes('MUTATE'))fs.appendFileSync(path.resolve(base,'../../..','src/value.ts'),'// concurrent change\\n');
 }}else if(a[0]==='cluster-only'){}else{const file=a[a.indexOf('--graph')+1];console.log(a[0]+':'+JSON.parse(fs.readFileSync(file,'utf8')).nodes[0].label);}
`;
  await writeFile(path.join(env, 'bin/graphify'), graphify, { mode: 0o700 });
  const config = { version: 1, project: 'fixture', environment: '.tools/graphify/.venv', pin: '0.9.97', pythonVersion: '3.11',
    state: '.tools/graphify/state', output: 'graphify-out', adapter: 'generic', scope: ['.'], partial: false, timeoutMs: 3000, minAvailableMb: 1, metadata: ['.gitignore', 'package.json'] };
  const configFile = path.join(dir, 'config.json'); await writeFile(configFile, JSON.stringify(config));
  git(root, 'init', '-b', 'main'); git(root, 'config', 'user.name', 'Fixture'); git(root, 'config', 'user.email', 'fixture@example.invalid'); git(root, 'add', '.'); git(root, 'commit', '-m', 'base');
  const options = { globalLock: path.join(dir, 'fleet.lock'), fixtureOfflinePrefix: [] };
  const args = (action, ...terms) => [action, ...terms, '--config', configFile, '--root', root];
  const call = (action, ...terms) => main(args(action, ...terms), options);
  const graph = path.join(root, 'graphify-out/graph.json');
  return { dir, root, env, config, configFile, options, args, call, graph };
}

test('mark é leve, aceita flags intercaladas e não importa runtime nem gera grafo', async (t) => {
  const f = await fixture(t); await rm(path.join(f.env, 'bin/python'));
  const result = await main(['--root', f.root, 'mark', '--config', f.configFile], f.options);
  assert.equal(result.exitCode, 0); assert.equal(result.report.status, 'marked');
  assert.equal((await readdir(path.join(f.root, '.tools/graphify/state'))).includes('dirty.json'), true);
  await assert.rejects(readFile(f.graph), /ENOENT/);
});

test('ensure gera em staging, valida e status usa fonte/config/versão/HEAD', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.call('status')).report.status, 'missing_graph');
  const first = await f.call('ensure'); assert.equal(first.exitCode, 0, JSON.stringify(first.report)); assert.equal(first.report.status, 'generated');
  assert.equal((await f.call('status')).report.status, 'current');
  await writeFile(path.join(f.root, 'src/value.ts'), 'export const value = "dirty";\n');
  assert.equal((await f.call('status')).report.status, 'stale');
  const second = await f.call('ensure'); assert.equal(second.exitCode, 0, JSON.stringify(second.report));
  assert.ok(second.report.backup); assert.match(await readFile(path.join(second.report.backup, 'graph.json'), 'utf8'), /v1/);
  assert.equal((await f.call('status')).report.status, 'current');
  assert.match(await readFile(f.graph, 'utf8'), /dirty/);
});

test('query/path/explain sempre verificam freshness e usam CLI local', async (t) => {
  const f = await fixture(t);
  const first = await f.call('query', 'value'); assert.equal(first.exitCode, 0, JSON.stringify(first.report)); assert.equal(first.report.status, 'queried'); assert.match(first.report.output, /v1/);
  await writeFile(path.join(f.root, 'src/value.ts'), 'export const value = "v2";\n');
  const updated = await f.call('path', 'first', 'second'); assert.equal(updated.exitCode, 0, JSON.stringify(updated.report)); assert.match(updated.report.output, /v2/);
  assert.equal((await f.call('explain', 'value')).exitCode, 0);
  assert.equal((await f.call('query', '--root')).exitCode, 1);
});

test('mark com hash igual não desperdiça nova extração', async (t) => {
  const f = await fixture(t); assert.equal((await f.call('ensure')).exitCode, 0);
  const counter = path.join(f.env, 'calls'), before = await readFile(counter, 'utf8');
  assert.equal((await f.call('mark')).exitCode, 0); assert.equal((await f.call('ensure')).exitCode, 0);
  assert.equal(await readFile(counter, 'utf8'), before);
});

test('arquivo novo e alteração de configuração tornam o snapshot stale', async (t) => {
  const f = await fixture(t); assert.equal((await f.call('ensure')).exitCode, 0);
  await writeFile(path.join(f.root, 'src/new.ts'), 'export const created = true;\n');
  assert.equal((await f.call('status')).report.status, 'stale');
  assert.equal((await f.call('ensure')).exitCode, 0);
  await writeFile(f.configFile, JSON.stringify({ ...f.config, timeoutMs: 4000 }));
  assert.equal((await f.call('status')).report.status, 'stale');
});

test('fingerprint ignora secrets/env, dependências, saídas e symlinks', async (t) => {
  const f = await fixture(t), before = await fingerprint(f.root, f.config);
  await writeFile(path.join(f.root, '.env'), 'PRIVATE_FIXTURE_TOKEN=private-value');
  await writeFile(path.join(f.root, 'credentials.json'), '{"token":"private-value"}');
  await mkdir(path.join(f.root, 'node_modules')); await writeFile(path.join(f.root, 'node_modules/pkg.js'), 'module.exports=1');
  await symlink(path.join(f.dir, 'outside.ts'), path.join(f.root, 'src/link.ts')); await writeFile(path.join(f.dir, 'outside.ts'), 'export const outside = true;');
  const after = await fingerprint(f.root, f.config);
  assert.deepEqual(after.files, before.files); assert.ok(after.skipped.includes('src/link.ts'));
  assert.equal(Object.keys(after.files).some((file) => file.includes('credentials') || file.includes('.env')), false);
});

test('runtime ausente/divergente e CLI global por symlink falham fechados', async (t) => {
  const f = await fixture(t);
  await writeFile(f.configFile, JSON.stringify({ ...f.config, pin: '0.9.68' }));
  assert.equal((await f.call('ensure')).report.status, 'missing_runtime');
  await writeFile(f.configFile, JSON.stringify(f.config));
  await rm(path.join(f.env, 'bin/graphify')); await symlink(process.execPath, path.join(f.env, 'bin/graphify'));
  assert.equal((await f.call('ensure')).report.status, 'missing_runtime');
});

test('grafo vazio ou inválido não substitui snapshot anterior', async (t) => {
  const f = await fixture(t); assert.equal((await f.call('ensure')).exitCode, 0); const before = await readFile(f.graph, 'utf8');
  await writeFile(path.join(f.root, 'src/value.ts'), 'export const value = "INVALID";\n');
  const result = await f.call('ensure'); assert.equal(result.exitCode, 1); assert.equal(await readFile(f.graph, 'utf8'), before);
});

test('mudança de código durante geração impede promoção', async (t) => {
  const f = await fixture(t); await writeFile(path.join(f.root, 'src/value.ts'), 'export const value = "MUTATE";\n');
  const result = await f.call('ensure'); assert.equal(result.exitCode, 1); assert.match(result.report.message, /Fonte mudou/);
  await assert.rejects(readFile(f.graph), /ENOENT/);
});

test('saída rastreada é preservada e exige fluxo versionado', async (t) => {
  const f = await fixture(t); await mkdir(path.dirname(f.graph)); await writeFile(f.graph, JSON.stringify({ nodes: [{ id: 'old' }], links: [] }));
  git(f.root, 'add', '-f', 'graphify-out/graph.json'); git(f.root, 'commit', '-m', 'tracked graph');
  const result = await f.call('ensure'); assert.equal(result.exitCode, 1); assert.match(result.report.message, /rastreada/);
  assert.match(await readFile(f.graph, 'utf8'), /old/);
});

test('corpus parcial permite apenas imports externos documentados', async (t) => {
  const f = await fixture(t);
  await mkdir(path.dirname(f.graph)); await writeFile(f.graph, JSON.stringify({ nodes: [{ id: 'source' }], edges: [{ source: 'source', target: 'external', relation: 'imports' }] }));
  assert.equal((await validateGraph(f.graph, true)).unresolvedImports, 1);
  await assert.rejects(validateGraph(f.graph), /sem origem/);
  await writeFile(f.graph, JSON.stringify({ nodes: [{ id: 'source' }], edges: [{ source: 'missing', target: 'external', relation: 'imports' }] }));
  await assert.rejects(validateGraph(f.graph, true), /sem origem/);
});

test('trava local impede concorrência e recupera apenas dono comprovadamente morto', async (t) => {
  const f = await fixture(t), lock = path.join(f.dir, 'local.lock'), release = await acquire(lock);
  await assert.rejects(acquire(lock), (e) => e.status === 'busy'); await release();
  await mkdir(lock); await writeFile(path.join(lock, 'owner.json'), JSON.stringify({ pid: 2147483647, token: 'old' }));
  const recovered = await acquire(lock); await recovered();
});

test('lease global é interoperável com flock e libera FD ao terminar', async (t) => {
  const f = await fixture(t), file = path.join(f.dir, 'shared.lock'), release = await acquireGlobal(file);
  const held = spawnSync('flock', ['-n', '-E', '75', file, 'true']); assert.equal(held.status, 75);
  await release(); const free = spawnSync('flock', ['-n', '-E', '75', file, 'true']); assert.equal(free.status, 0);
});

test('timeout termina grupos de subprocessos e não deixa grafo parcial', async (t) => {
  const f = await fixture(t); await writeFile(f.configFile, JSON.stringify({ ...f.config, timeoutMs: 100 }));
  await writeFile(path.join(f.root, 'src/value.ts'), 'export const value = "TIMEOUT";\n');
  const started = Date.now(), result = await f.call('ensure'); assert.equal(result.exitCode, 1); assert.ok(Date.now() - started < 5000);
  await assert.rejects(readFile(f.graph), /ENOENT/);
  const child = await run([process.execPath, '-e', 'setInterval(()=>{},1000)'], f.root, { PATH: process.env.PATH }, 100);
  assert.equal(child.timedOut, true); assert.notEqual(child.code, 0);
});

test('configuração não pode desativar rede, escapar raiz ou trocar corpus silenciosamente', async (t) => {
  const f = await fixture(t);
  for (const update of [{ environment: '../outside' }, { offline: false }, { adapter: 'finance', partial: false }]) {
    await writeFile(f.configFile, JSON.stringify({ ...f.config, ...update })); assert.equal((await f.call('mark')).exitCode, 1);
  }
});

test('adoção inicial exige bytes, corpus, commit, pin e escopo iguais', async (t) => {
  const f = await fixture(t); await mkdir(path.dirname(f.graph));
  await writeFile(f.graph, JSON.stringify({ nodes: [{ id: 'initial' }], links: [] }));
  const fp = await fingerprint(f.root, f.config), info = await validateGraph(f.graph);
  const initial = path.join(f.root, 'graphify-out/graphify-local-initial-provenance.json');
  await writeFile(initial, JSON.stringify({ generator: 'initial-code-only', root: f.root, graphifyVersion: '0.9.97', partial: false, scope: ['.'], sourceFingerprint: { head: fp.head, files: fp.files }, graphSha256: info.sha256, createdAt: new Date(Date.now() + 1000).toISOString() }));
  const ctx = { root: f.root, config: f.config, graph: f.graph, outputRoot: path.dirname(f.graph), provenance: path.join(path.dirname(f.graph), 'graphify-local-provenance.json') };
  await writeFile(f.graph, JSON.stringify({ nodes: [{ id: 'tampered' }], links: [] }));
  assert.equal(await adoptInitial(ctx, fp), false);
  await writeFile(f.graph, JSON.stringify({ nodes: [{ id: 'initial' }], links: [] }));
  assert.equal(await adoptInitial(ctx, fp), true);
  assert.equal((await f.call('status')).report.status, 'current');
  await assert.rejects(readFile(path.join(f.env, 'calls')), /ENOENT/);
});

test('lock global da manutenção impede extração e libera lock local', async (t) => {
  const f = await fixture(t), release = await acquireGlobal(f.options.globalLock);
  const result = await f.call('ensure'); assert.equal(result.exitCode, 75); assert.equal(result.report.status, 'busy');
  await release(); assert.equal((await f.call('ensure')).exitCode, 0);
});

test('install preserva ambiente individual válido sem chamar CLI global', async (t) => {
  const f = await fixture(t), result = await f.call('install');
  assert.equal(result.exitCode, 0); assert.equal(result.report.runtime.prefix, f.env);
  await assert.rejects(readFile(f.graph), /ENOENT/);
});

test('chaves do processo pai não chegam ao extrator', async (t) => {
  const f = await fixture(t); process.env.GRAPHIFY_FIXTURE_SECRET = 'private-fixture-value'; t.after(() => delete process.env.GRAPHIFY_FIXTURE_SECRET);
  const result = await f.call('ensure'); assert.equal(result.exitCode, 0, JSON.stringify(result.report));
});


test('corpus de geração contém apenas arquivos permitidos e hashes grandes usam streaming', async (t) => {
  const f = await fixture(t);
  await writeFile(path.join(f.root, '.env'), 'PRIVATE_FIXTURE_TOKEN=private');
  await writeFile(path.join(f.root, 'credentials.json'), '{"token":"private"}');
  await mkdir(path.join(f.root, 'node_modules')); await writeFile(path.join(f.root, 'node_modules/dep.js'), 'dep');
  await mkdir(path.join(f.root, 'src/tools')); await writeFile(path.join(f.root, 'src/tools/tool.ts'), 'export const tool=1');
  await writeFile(path.join(f.root, 'src/large.sql'), Buffer.alloc(11*1024*1024, 32));
  const fp=await fingerprint(f.root,f.config);assert.ok(fp.files['src/tools/tool.ts']);assert.ok(fp.files['src/large.sql']);
  assert.equal((await f.call('ensure')).exitCode,0);
  const states=await readdir(path.join(f.root,f.config.state,'runs'));
  const corpus=path.join(f.root,f.config.state,'runs',states[0],'corpus');
  await assert.rejects(readdir(corpus),/ENOENT/);
  assert.equal((await f.call('status')).report.status,'current');
});

test('config relativo resolve em root mesmo com cwd diferente', async (t) => {
 const f=await fixture(t);await writeFile(path.join(f.root,'graphify.local.json'),JSON.stringify(f.config));
 const r=await main(['--root',f.root,'--config','graphify.local.json','mark'],f.options);assert.equal(r.exitCode,0);
});
