import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execute, parseArgs, validateConfig } from './automation.mjs';

const kit = dirname(fileURLToPath(import.meta.url));
const text = p => readFileSync(p, 'utf8');
function fixture(t, { originalHook = '', hookName = 'pre-commit', previous = '.original-hooks' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'repo-automation-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (p, contents) => { mkdirSync(dirname(join(root, p)), { recursive: true }); writeFileSync(join(root, p), contents); };
  const run = (cmd, args, extra = {}) => spawnSync(cmd, args, { cwd: root, encoding: 'utf8', timeout: 15000, env: { ...process.env, HUSKY: '0' }, ...extra });
  const git = (...args) => { const r = run('git', args); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  git('init', '-b', 'main'); git('config', 'user.name', 'Fixture automation'); git('config', 'user.email', 'automation@example.invalid');
  git('config', 'core.hooksPath', '/dev/null');
  write('.gitignore', '.tools/graph-state/\nfixture-*.log\n');
  write('src/source.txt', 'base\n');
  write('scripts/smoke.unit.mjs', "import test from 'node:test'; import assert from 'node:assert/strict'; test('fixture',()=>assert.equal(2+2,4));\n");
  write('scripts/motor.sh', '#!/bin/sh\nprintf \'%s\\n\' "$@" > fixture-motor.log\nexit "${FIXTURE_MOTOR_EXIT:-0}"\n');
  write('scripts/graph.mjs', `import fs from 'node:fs';
fs.writeFileSync('fixture-graph.log',JSON.stringify(process.argv.slice(2)));
if(process.argv[2]==='mark'){fs.mkdirSync('.tools/graph-state',{recursive:true});fs.writeFileSync('.tools/graph-state/dirty.json','{}');}
process.exit(Number(process.env.FIXTURE_GRAPH_EXIT||0));\n`);
  write('scripts/automation.mjs', text(join(kit, 'automation.mjs')));
  write('graphify.local.json', '{}\n');
  const config = {
    version: 1, name: 'fixture', entrypoint: 'scripts/automation.mjs',
    testSuites: ['scripts/smoke.unit.mjs'], motor: ['sh', 'scripts/motor.sh'], graph: ['node', 'scripts/graph.mjs'], graphConfig: 'graphify.local.json',
    aliases: { 'automation:test': 'node scripts/automation.mjs test', 'automation:doctor': 'node scripts/automation.mjs doctor --static' },
    registrations: [
      { id: 'core', kind: 'tool', files: ['scripts/automation.mjs'], manual: ['node','scripts/automation.mjs','doctor'], triggers: ['manual','prepush'] },
      { id: 'units', kind: 'test', files: ['scripts/smoke.unit.mjs'], manual: ['node','scripts/automation.mjs','test'], triggers: ['manual','precommit','prepush','PR','pushmain'] },
      { id: 'motor', kind: 'motor', files: ['scripts/motor.sh'], manual: ['node','scripts/automation.mjs','heal','--ref','HEAD'], triggers: ['manual','nightly'] },
      { id: 'graph', kind: 'graph', files: ['scripts/graph.mjs'], manual: ['node','scripts/automation.mjs','graph','status'], triggers: ['manual','postcommit','postmerge','postcheckout','nightly'] },
    ],
    ci: [{ file: '.github/workflows/ci.yml', events: ['PR','pushmain'], command: 'node scripts/automation.mjs test' }],
    nightly: { command: ['node','scripts/automation.mjs','nightly','--ref','origin/main'] }, timeoutMs: 5000,
  };
  const save = () => write('scripts/automation.config.json', JSON.stringify(config, null, 2)); save();
  write('package.json', JSON.stringify({ type: 'module', scripts: config.aliases }));
  write('.github/workflows/ci.yml', 'name: fixture\non:\n  pull_request: {}\n  push:\n    branches: [main]\njobs:\n  tools:\n    runs-on: ubuntu-latest\n    steps:\n      - run: node scripts/automation.mjs test\n');
  git('add', '.'); git('commit', '-m', 'base');
  git('config', 'core.hooksPath', previous);
  if (originalHook) { write(previous + '/' + hookName, '#!/bin/sh\n' + originalHook); chmodSync(join(root, previous, hookName), 0o700); }
  const cli = (...args) => run(process.execPath, ['scripts/automation.mjs', '--root', root, ...args]);
  const install = () => { const r = cli('install-hooks'); assert.equal(r.status, 0, r.stderr + r.stdout); return r; };
  return { root, config, write, run, git, save, cli, install };
}

test('doctor static verifica alias, arquivos, eventos e run real sem ativar Git', (t) => {
  const f = fixture(t);
  const before = f.git('config', 'core.hooksPath');
  let result = f.cli('doctor', '--static'); assert.equal(result.status, 0, result.stdout);
  const health = JSON.parse(result.stdout); assert.equal(health.source, 'source_integrated'); assert.equal(health.ciActive, false); assert.equal(health.hooks, 'not_installed');
  assert.equal(f.git('config', 'core.hooksPath'), before);
  f.write('package.json', '{"scripts":{}}'); result = f.cli('doctor', '--static'); assert.equal(result.status, 1); assert.match(result.stdout, /alias não encadeado/);
});

test('doctor bloqueia script novo órfão e legado catch-all ou sem justificativa', (t) => {
  const f = fixture(t); f.write('scripts/orphan.sh', 'exit 0\n');
  const r = f.cli('doctor', '--static'); assert.equal(r.status, 1); assert.match(r.stdout, /script sem registro\/gatilho/);
  f.config.registrations.push({ id: 'legacy', kind: 'legacy', files: ['scripts/**'], manual: ['sh','scripts/orphan.sh'], triggers: ['manual'], reason: 'Operação destrutiva, somente manual.' });
  assert.throws(() => validateConfig(f.config), /arquivos exatos/);
});

test('doctor não confunde comentário de workflow com execução', (t) => {
  const f = fixture(t); f.write('.github/workflows/ci.yml', 'on:\n  pull_request: {}\n  push:\n    branches: [main]\n# run: node scripts/automation.mjs test\njobs: {}\n');
  const r = f.cli('doctor', '--static'); assert.equal(r.status, 1); assert.match(r.stdout, /sem run encadeado/);
});

test('CLI/config desconhecidos falham e check/heal exigem ref explícita', (t) => {
  const f = fixture(t);
  for (const args of [['unknown'],['doctor','--oops'],['check'],['heal'],['nightly']]) assert.notEqual(f.cli(...args).status, 0);
  f.config.secretEscape = true; f.save(); assert.notEqual(f.cli('doctor','--static').status, 0);
  assert.throws(() => parseArgs(['doctor','--root']), /exige valor/);
});

test('test propaga falha real de node:test', (t) => {
  const f = fixture(t); f.write('scripts/smoke.unit.mjs', "import test from 'node:test';test('erro',()=>{throw new Error('falha fixture')});\n");
  assert.equal(f.cli('test').status, 1);
});

test('check/heal preservam root/ref e encaminham configuração do motor', (t) => {
  const f = fixture(t); f.config.motorConfig = 'motor.json'; f.write('motor.json', '{}'); f.save();
  for (const action of ['check','heal']) {
    const r = f.cli(action,'--ref','HEAD'); assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(text(join(f.root,'fixture-motor.log')).trim().split('\n'),[action,'--root',f.root,'--ref','HEAD','--config',join(f.root,'motor.json')]);
  }
});

test('graph usa seu próprio config e traduz doctor/build, sem instalar implicitamente', (t) => {
  const f = fixture(t);
  for (const [input, expected] of [['doctor','status'],['build','ensure']]) {
    const r = f.cli('graph',input); assert.equal(r.status, 0,r.stderr);
    assert.deepEqual(JSON.parse(text(join(f.root,'fixture-graph.log'))),[expected,'--root',f.root,'--config',join(f.root,'graphify.local.json')]);
  }
});

test('nightly tenta grafo e heal independentes e agrega falha', (t) => {
  const f = fixture(t);
  const r = f.run(process.execPath,['scripts/automation.mjs','nightly','--ref','origin/main'],{env:{...process.env,FIXTURE_GRAPH_EXIT:'3'}});
  assert.equal(r.status,1); assert.ok(existsSync(join(f.root,'fixture-motor.log')));
  const report=JSON.parse(r.stdout); assert.equal(report.results.graph.code,3); assert.equal(report.results.heal.code,0);
});

test('install/uninstall idempotentes restauram hooksPath e exclusões anteriores', (t) => {
  const f = fixture(t); const exclude = join(f.root,'.git/info/exclude'); const before=text(exclude);
  f.install(); f.install(); assert.equal(f.git('check-ignore','.tools/repo-automation/state.json'),'.tools/repo-automation/state.json');
  assert.equal(f.cli('doctor').status,0);
  assert.equal(f.cli('uninstall-hooks').status,0); assert.equal(f.cli('uninstall-hooks').status,0);
  assert.equal(f.git('config','core.hooksPath'),'.original-hooks'); assert.equal(text(exclude),before);
});

test('uninstall funciona se o config versionado foi removido e não apaga mudança de terceiro', (t) => {
  const f = fixture(t); f.install(); f.git('config','core.hooksPath','.third-party');
  assert.notEqual(f.cli('uninstall-hooks').status,0); assert.equal(f.git('config','core.hooksPath'),'.third-party');
  f.git('config','core.hooksPath',join(f.root,'.tools/repo-automation/hooks')); rmSync(join(f.root,'scripts/automation.config.json'));
  assert.equal(f.cli('uninstall-hooks').status,0); assert.equal(f.git('config','core.hooksPath'),'.original-hooks');
});

test('commit real aciona ponte e conserva falha original antes de nossos testes', (t) => {
  const f = fixture(t,{originalHook:'printf original > fixture-original.log\nexit 7\n'}); f.install();
  f.write('src/source.txt','novo\n'); f.git('add','src/source.txt'); const before=f.git('rev-parse','HEAD');
  const r=f.run('git',['commit','-m','não pode']); assert.notEqual(r.status,0); assert.equal(text(join(f.root,'fixture-original.log')),'original'); assert.equal(f.git('rev-parse','HEAD'),before);
});

test('commit-msg original também permanece obrigatório', (t) => {
  const f=fixture(t,{hookName:'commit-msg',originalHook:'printf "%s" "$1" > fixture-message.log\nexit 9\n'});f.install();
  f.write('src/source.txt','novo\n');f.git('add','src/source.txt');assert.notEqual(f.run('git',['commit','-m','bloqueado']).status,0);assert.match(text(join(f.root,'fixture-message.log')),/COMMIT_EDITMSG/);
});

test('ponte preserva argumentos e stdin completos do pre-push', (t) => {
  const f=fixture(t,{hookName:'pre-push',originalHook:'printf "%s\\n" "$@" > fixture-args.log\ncat > fixture-stdin.log\n'});f.install();
  const input='refs/heads/main '+ '1'.repeat(40)+' refs/heads/main '+'0'.repeat(40)+'\n';
  const r=f.run(join(f.root,'.tools/repo-automation/hooks/pre-push'),['origin','remote fixture'],{input});assert.equal(r.status,0,r.stderr);
  assert.equal(text(join(f.root,'fixture-stdin.log')),input);assert.equal(text(join(f.root,'fixture-args.log')),'origin\nremote fixture\n');
});

test('hook versionado Husky executa via sh quando bootstrap não existe', (t) => {
  const f=fixture(t,{previous:'.husky/_'});f.write('.husky/pre-commit','printf husky > fixture-husky.log\nexit 6\n');f.install();
  f.write('src/source.txt','novo\n');f.git('add','src/source.txt');assert.notEqual(f.run('git',['commit','-m','bloqueado']).status,0);assert.equal(text(join(f.root,'fixture-husky.log')),'husky');
});

test('sem Husky, ponte não reformata nem perde partial staging', (t) => {
  const f=fixture(t);f.install();f.write('src/source.txt','staged\n');f.git('add','src/source.txt');f.write('src/source.txt','unstaged\n');
  const r=f.run('git',['commit','-m','parcial']);assert.equal(r.status,0,r.stderr);assert.equal(f.git('show','HEAD:src/source.txt'),'staged');assert.equal(text(join(f.root,'src/source.txt')),'unstaged\n');assert.ok(existsSync(join(f.root,'.tools/graph-state/dirty.json')));
});

test('pre-commit executa testes de tooling e conserva erro de suite', (t) => {
  const f=fixture(t);f.install();f.write('scripts/smoke.unit.mjs',"import test from 'node:test';test('bloqueia',()=>{throw Error('fixture')});\n");f.git('add','scripts/smoke.unit.mjs');
  const r=f.run('git',['commit','-m','tool quebrado']);assert.notEqual(r.status,0);assert.match(f.git('diff','--cached','--name-only'),/smoke.unit.mjs/);
});

test('hook recursivo original é bloqueado sem bypass', (t) => {
  const f=fixture(t,{originalHook:'git hook run pre-commit\n'});f.install();f.write('src/source.txt','novo\n');f.git('add','src/source.txt');
  const r=f.run('git',['commit','-m','recursão']);assert.notEqual(r.status,0);assert.match(r.stderr,/recursão de hook recusada/);
});

test('timeout encerra subprocesso e retorna 124 em prazo finito',async()=>{
  const before=Date.now();const r=await execute([process.execPath,'-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{timeout:100,capture:true});
  assert.equal(r.code,124);assert.equal(r.timedOut,true);assert.ok(Date.now()-before<2000);
});

test('captura preserva UTF-8 dividido em eventos de saída',async()=>{
  const r=await execute([process.execPath,'-e',"process.stdout.write(Buffer.from([0xc3]));setTimeout(()=>process.stdout.write(Buffer.from([0xa7])),20)"],{capture:true});assert.equal(r.code,0);assert.equal(r.stdout,'ç');
});


test('ponte compartilhada usa raiz e staging da worktree que disparou o hook', (t) => {
  const f=fixture(t); f.install();
  const worktree=mkdtempSync(join(tmpdir(),'repo-automation-linked-'));
  t.after(()=>rmSync(worktree,{recursive:true,force:true}));
  f.git('worktree','add','--detach',worktree,'HEAD');
  writeFileSync(join(worktree,'src/source.txt'),'outra worktree\n');
  const add=f.run('git',['-C',worktree,'add','src/source.txt']);assert.equal(add.status,0,add.stderr);
  const r=f.run('git',['-C',worktree,'commit','-m','worktree fixture']);assert.equal(r.status,0,r.stderr);
  assert.equal(text(join(f.root,'src/source.txt')),'base\n');
  assert.ok(existsSync(join(worktree,'.tools/graph-state/dirty.json')));
  assert.equal(f.git('show','HEAD:src/source.txt'),'base');
});

test('snapshot aprovado atende pré-merge sem afirmar source/CI integrados', (t) => {
  const f=fixture(t);
  const home=join(f.root,'fixture-home'),store=join(home,'.local/share/repo-maintenance'),snapshot=join(store,'snapshots/fixture');
  mkdirSync(snapshot,{recursive:true});
  for(const rel of ['scripts','.github','package.json','graphify.local.json']) cpSync(join(f.root,rel),join(snapshot,rel),{recursive:true});
  f.write('package.json','{"scripts":{}}');
  const config={...f.config,snapshot:{root:snapshot,ref:'1'.repeat(40)}};
  const installed=join(store,'profiles/fixture.json');mkdirSync(dirname(installed),{recursive:true});writeFileSync(installed,JSON.stringify(config));
  const r=f.run(process.execPath,[join(snapshot,'scripts/automation.mjs'),'--root',f.root,'--config',installed,'doctor','--static'],{env:{...process.env,HOME:home}});
  assert.equal(r.status,0,r.stderr+r.stdout);const health=JSON.parse(r.stdout);assert.equal(health.source,'installed_snapshot');assert.equal(health.ciActive,false);
  const outside=join(f.root,'outside.mjs');writeFileSync(outside,'process.exit(0)');config.entrypoint=outside;writeFileSync(installed,JSON.stringify(config));
  const blocked=f.run(process.execPath,[join(snapshot,'scripts/automation.mjs'),'--root',f.root,'--config',installed,'doctor','--static'],{env:{...process.env,HOME:home}});
  assert.equal(blocked.status,1);assert.match(blocked.stdout,/fora do runtime instalado aprovado/);
});

test('não sobrescreve arquivos de terceiros na instalação nem na reversão', (t) => {
  const f=fixture(t);f.write('.tools/repo-automation/foreign.txt','preservar\n');
  assert.notEqual(f.cli('install-hooks').status,0);assert.equal(text(join(f.root,'.tools/repo-automation/foreign.txt')),'preservar\n');
  rmSync(join(f.root,'.tools/repo-automation/foreign.txt'));f.install();
  const bridge=join(f.root,'.tools/repo-automation/hooks/pre-commit');writeFileSync(bridge,'#!/bin/sh\nexit 3\n');
  assert.notEqual(f.cli('uninstall-hooks').status,0);assert.equal(text(bridge),'#!/bin/sh\nexit 3\n');
});

test('dependência ausente falha no doctor local sem instalação automática', (t) => {
  const f=fixture(t);f.config.requirements=['node_modules/fixture-cli/package.json'];f.save();f.install();
  assert.equal(f.cli('doctor','--static').status,0);
  const r=f.cli('doctor');assert.equal(r.status,1);assert.match(r.stdout,/arquivo ausente: node_modules/);assert.equal(existsSync(join(f.root,'node_modules')),false);
});

test('registro operacional manual não é executado por hooks ou nightly', (t) => {
  const f=fixture(t);f.write('scripts/legacy-danger.sh','#!/bin/sh\nprintf indevido > fixture-legacy.log\nexit 9\n');
  f.config.registrations.push({id:'legacy-op',kind:'legacy',files:['scripts/legacy-danger.sh'],manual:['sh','scripts/legacy-danger.sh'],triggers:['manual'],reason:'Operação operacional exige seleção manual explícita; não pertence aos gates.'});f.save();f.install();
  assert.equal(f.cli('nightly','--ref','HEAD').status,0);
  const hook=f.run(join(f.root,'.tools/repo-automation/hooks/pre-push'),['origin','fixture'],{input:''});assert.equal(hook.status,0,hook.stderr);
  assert.equal(existsSync(join(f.root,'fixture-legacy.log')),false);
});
