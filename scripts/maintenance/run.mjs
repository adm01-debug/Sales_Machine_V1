#!/usr/bin/env node
import { readFile, writeFile, mkdir, rm, rename, lstat, readlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { MaintenanceError, fail, digest, exists, run, git, tool, validateConfig, inspect, acquire, reuseDependencies, dependencyFingerprint, writeJson, stopChildren } from './lib.mjs';

const exits = { healthy: 0, checked: 0, no_changes: 0, validated_patch: 0, integrated_patch: 0, missing_dependencies: 2, blocked_baseline: 3, failed: 1, skipped_busy: 75, pending_patch: 4, blocked_network_sandbox: 5 };
export function parseArgs(args) {
  const [action, ...rest] = args;
  if (!['doctor', 'check', 'heal'].includes(action)) fail('Use doctor, check ou heal');
  const options = { action };
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i];
    if (!['--root', '--ref', '--config', '--state'].includes(key) || !rest[i + 1] || rest[i + 1].startsWith('--') || options[key.slice(2)] !== undefined) fail('Argumento desconhecido, duplicado ou sem valor');
    options[key.slice(2)] = rest[i + 1];
  }
  if (!options.root || action !== 'doctor' && !options.ref) fail('--root obrigatório; --ref explícita obrigatória para check/heal');
  return options;
}
function redact(output) {
  return output.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[JWT REDIGIDO]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [REDIGIDO]')
    .replace(/\b(?:gh[pousr]_|github_pat_|sk-)[A-Za-z0-9_-]{12,}/g, '[TOKEN REDIGIDO]')
    .replace(/\b([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)[A-Z0-9_]*\s*[=:]\s*)[^\s,;]+/g, '$1[REDIGIDO]');
}
export async function networkPrefix(root) {
  let host;
  try { host = await readlink('/proc/self/ns/net'); }
  catch { throw new MaintenanceError('blocked_network_sandbox', 'Isolamento de rede Linux indisponível'); }
  const probe = await run(['unshare', '--user', '--map-root-user', '--net', '--', process.execPath, '-e', 'process.stdout.write(require("fs").readlinkSync("/proc/self/ns/net"))'], root, 5000).catch(() => null);
  if (!probe || probe.code !== 0 || probe.output.trim() === host || !probe.output.startsWith('net:[')) throw new MaintenanceError('blocked_network_sandbox', 'Não foi possível criar namespace de rede isolado');
  return ['unshare', '--user', '--map-root-user', '--net', '--'];
}
const environmentFile = (file) => /(^|\/)\.env(?:\.|$)/.test(file) && !/\.(example|sample)$/.test(file);
async function quarantine(root, jobDir, prefix = []) {
  const tracked = (await git(root, ['ls-files', '-z'], undefined, prefix)).split('\0').filter(Boolean);
  const files = tracked.filter(environmentFile), saved = [];
  await mkdir(path.join(jobDir, 'quarantine'), { recursive: true, mode: 0o700 });
  for (const [i, file] of files.entries()) {
    const from = path.join(root, file), to = path.join(jobDir, 'quarantine', String(i));
    if (await exists(from)) { await rename(from, to); saved.push({ from, to }); }
  }
  return async () => { for (const { from, to } of saved.splice(0)) await rename(to, from); };
}
async function changed(root, config, prefix = []) {
  const staged = await run([...prefix, 'git', '-c', 'core.hooksPath=/dev/null', 'diff', '--cached', '--quiet'], root, config.timeoutMs);
  if (staged.code !== 0 || staged.timedOut) fail('Gate/corretor alterou o índice Git; execução descartada');
  const status = await git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], undefined, prefix);
  const modulesLink = await lstat(path.join(root, 'node_modules')).then((s) => s.isSymbolicLink(), () => false);
  if (status.split('\0').some((line) => line.startsWith('??') && !(modulesLink && line.slice(3) === 'node_modules'))) fail('Arquivo não rastreado criado por correção/gate');
  const files = (await git(root, ['diff', '--name-only', '-z', '--no-renames'], undefined, prefix)).split('\0').filter(Boolean);
  if (files.some((f) => !config.fix.roots.some((r) => f.startsWith(`${r}/`)))) fail('Correção alterou arquivo fora do escopo autorizado');
  const stats = (await git(root, ['diff', '--numstat', '-z', '--no-renames'], undefined, prefix)).split('\0').filter(Boolean);
  let lines = 0;
  for (const row of stats) {
    const [add, remove] = row.split('\t');
    if (!/^\d+$/.test(add) || !/^\d+$/.test(remove)) fail('Alteração binária não autorizada');
    lines += Number(add) + Number(remove);
  }
  if (files.length > config.maxFiles || lines > config.maxChangedLines) fail(`Limite de alteração excedido: ${files.length} arquivos, ${lines} linhas`);
  return { files, lines };
}
async function fixes(root, config, jobDir, execute, prefix = []) {
  const modes = (await git(root, ['ls-files', '-s', '-z', '--', ...config.fix.roots], undefined, prefix)).split('\0').filter(Boolean);
  if (modes.some((line) => line.startsWith('120000 '))) fail('Symlink em src impede correção autônoma');
  const tracked = new Set((await git(root, ['ls-files', '-z', '--', ...config.fix.roots], undefined, prefix)).split('\0').filter(Boolean));
  const candidates = new Set(); let prettierBin, eslintArgs;
  if (config.fix.prettier) {
    const p = tool(root, 'prettier');
    const pkg = JSON.parse(await readFile(p.pkg, 'utf8')), bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin.prettier;
    prettierBin = path.resolve(p.dir, bin);
    const scan = await execute('scan', 'prettier', [process.execPath, prettierBin, '--list-different', '--ignore-unknown', ...config.fix.roots], true);
    for (const file of scan.output.split('\n').map((f) => f.trim())) if (tracked.has(file)) candidates.add(file);
  }
  if (config.fix.eslintRules.length) {
    tool(root, 'typescript-eslint');
    const override = path.join(jobDir, 'eslint-layout.mjs');
    const settings = { semi: ['error', 'always'], quotes: ['error', 'double'], indent: ['error', 2], 'comma-dangle': ['error', 'always-multiline'], 'eol-last': ['error', 'always'], 'no-trailing-spaces': 'error', 'space-infix-ops': 'error', 'keyword-spacing': 'error', 'object-curly-spacing': ['error', 'always'], 'array-bracket-spacing': ['error', 'never'] };
    const rules = Object.fromEntries(config.fix.eslintRules.map((r) => [r, settings[r]]));
    await writeFile(override, `import {createRequire} from 'node:module';\nconst req=createRequire(${JSON.stringify(path.join(root, 'package.json'))});\nexport default [{files:['**/*.{js,jsx,ts,tsx,mjs,cjs}'],languageOptions:{parser:req('typescript-eslint').parser,parserOptions:{ecmaFeatures:{jsx:true}}},rules:${JSON.stringify(rules)}}];\n`, { mode: 0o600 });
    const eslint = tool(root, 'eslint');
    eslintArgs = [process.execPath, path.join(eslint.dir, 'bin/eslint.js'), '--no-config-lookup', '--config', override, '--fix-type', 'layout'];
    const scan = await execute('scan', 'eslint_layout', [...eslintArgs, '--fix-dry-run', '--format', 'json', ...config.fix.roots], true);
    let entries; try { entries = JSON.parse(scan.output); } catch { fail('ESLint dry-run não produziu JSON válido'); }
    for (const item of entries) if (item.output !== undefined) {
      const file = path.relative(root, item.filePath).replaceAll('\\', '/'); if (tracked.has(file)) candidates.add(file);
    }
  }
  const selected = [], skippedBudget = []; let lines = 0;
  for (const file of [...candidates].sort()) {
    if (selected.length >= config.maxFiles) { skippedBudget.push(file); continue; }
    if (prettierBin) await execute('fix', 'prettier', [process.execPath, prettierBin, '--write', '--ignore-unknown', file]);
    if (eslintArgs && /\.[cm]?[jt]sx?$/.test(file)) await execute('fix', 'eslint_layout', [...eslintArgs, '--fix', file]);
    const row = await git(root, ['diff', '--numstat', '--', file], undefined, prefix);
    if (!row) continue;
    const [add, remove] = row.split('\t');
    if (!/^\d+$/.test(add) || !/^\d+$/.test(remove)) fail('Correção binária não autorizada');
    const count = Number(add) + Number(remove);
    if (lines + count > config.maxChangedLines) {
      await git(root, ['restore', '--source=HEAD', '--worktree', '--', file], undefined, prefix); skippedBudget.push(file); continue;
    }
    selected.push(file); lines += count;
  }
  return { candidates: candidates.size, selected, skippedBudget, lines };
}
const originalGit = git;
export async function main(args = process.argv.slice(2)) {
  let prefix = []; const git = (cwd, argv, timeout) => originalGit(cwd, argv, timeout, prefix);
  const report = { version: 1, startedAt: new Date().toISOString(), status: 'failed', steps: [] };
  let interrupted = false; const onSignal = () => { interrupted = true; stopChildren(); };
  process.on('SIGTERM', onSignal); process.on('SIGINT', onSignal);
  let release, workspace, jobDir, branch, source, stateDir, pendingFile, config, keepBranch = false;
  try {
    const options = parseArgs(args); report.action = options.action;
    source = path.resolve(options.root); report.root = source;
    const top = await git(source, ['rev-parse', '--show-toplevel']);
    if (path.resolve(top) !== source) fail('--root deve ser a raiz Git do projeto');
    const common = await git(source, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
    stateDir = path.join(path.resolve(options.state || path.join(process.env.XDG_STATE_HOME || path.join(homedir(), '.local/state'), 'repo-maintenance')), digest(common).slice(0, 24));
    await mkdir(stateDir, { recursive: true, mode: 0o700 });
    jobDir = path.join(stateDir, 'runs', `${Date.now()}-${randomUUID()}`);
    await mkdir(jobDir, { recursive: true, mode: 0o700 });
    report.id = path.basename(jobDir);
    release = await acquire(path.join(stateDir, 'running.lock'));
    config = validateConfig(JSON.parse(await readFile(path.resolve(options.config || path.join(path.dirname(fileURLToPath(import.meta.url)), 'config.json')), 'utf8')));
    report.configHash = digest(JSON.stringify(config));
    report.doctor = await inspect(source, config);
    if (options.action === 'doctor') { report.status = 'healthy'; return await finish(); }
    report.base = await git(source, ['rev-parse', '--verify', '--end-of-options', `${options.ref}^{commit}`]);
    prefix = await networkPrefix(source);
    pendingFile = path.join(stateDir, 'pending.json');
    let pending;
    if (await exists(pendingFile)) {
      pending = JSON.parse(await readFile(pendingFile, 'utf8'));
      const integrated = await run([...prefix, 'git', 'merge-base', '--is-ancestor', pending.commit, report.base], source, config.timeoutMs);
      if (integrated.code === 0) {
        await writeJson(path.join(stateDir, 'integrated', `${pending.commit}.json`), pending);
        await rm(pendingFile); pending = null;
      } else {
        const merge = await run([...prefix, 'git', 'merge-tree', '--write-tree', '--merge-base', pending.base, report.base, pending.commit], source, config.timeoutMs);
        const tree = await git(source, ['rev-parse', `${report.base}^{tree}`]);
        if (merge.code === 0 && merge.output.split('\n')[0] === tree) {
          await writeJson(path.join(stateDir, 'integrated', `${pending.commit}.json`), pending); await rm(pendingFile); pending = null;
        }
      }
      if (pending && options.action === 'heal') throw new MaintenanceError('pending_patch', `Patch local pendente para base ${pending.base.slice(0, 12)}; branch ${pending.branch}`);
    }
    workspace = path.join(jobDir, 'worktree');
    await git(source, ['worktree', 'add', '--detach', workspace, report.base]);
    report.dependencies = await reuseDependencies(source, workspace);
    const restore = await quarantine(workspace, jobDir, prefix);
    const execute = async (phase, name, command, allowOne = false) => {
      if (interrupted) fail('Execução interrompida por sinal');
      const result = await run([...prefix, ...command], workspace, config.timeoutMs);
      const output = redact(result.output);
      const logFile = `${report.steps.length}-${phase}-${name}.log`;
      await writeFile(path.join(jobDir, logFile), output, { mode: 0o600 });
      report.steps.push({ phase, name, exit: result.code, timeout: result.timedOut, log: logFile, diagnostics: output.split('\n').filter((s) => /error TS\d+:|^Error:|^error:|FAIL|failed|Error \[/.test(s)).slice(0, 5) });
      if ((result.code !== 0 && !(allowOne && result.code === 1)) || result.timedOut || result.overflow) throw new MaintenanceError(phase === 'baseline' ? 'blocked_baseline' : 'failed', `Gate ${name} (${phase}) falhou: exit=${result.code}, timeout=${result.timedOut}`);
      return result;
    };
    try {
      report.isolatedDoctor = await inspect(workspace, config);
      for (const g of config.gates) await execute('baseline', g.name, g.command);
    } finally { await restore(); }
    if ((await changed(workspace, config, prefix)).files.length) fail('Gate baseline alterou arquivos rastreados');
    if (options.action === 'check') { report.status = 'checked'; return await finish(); }
    const restoreFix = await quarantine(workspace, path.join(jobDir, 'fix'), prefix);
    try { report.scope = await fixes(workspace, config, jobDir, execute, prefix); }
    finally { await restoreFix(); }
    report.change = await changed(workspace, config, prefix);
    if (!report.change.files.length) { report.status = 'no_changes'; return await finish(); }
    const snapshotDiff = async (staged = false) => {
      const result = await run([...prefix, 'git', '-c', 'core.hooksPath=/dev/null', 'diff', ...(staged ? ['--cached'] : []), '--binary', '--no-ext-diff', '--no-textconv'], workspace, config.timeoutMs);
      if (result.code !== 0 || result.timedOut || result.overflow) fail('Não foi possível congelar o patch');
      return result.output;
    };
    const fixedDiff = await snapshotDiff();
    const restoreAgain = await quarantine(workspace, path.join(jobDir, 'after'), prefix);
    try { for (const g of config.gates) await execute('patched', g.name, g.command); }
    finally { await restoreAgain(); }
    if (await snapshotDiff() !== fixedDiff) fail('Gate alterou o patch; resultado descartado');
    report.change = await changed(workspace, config, prefix);
    if (!report.change.files.length) fail('Gate removeu o patch depois da correção');
    if ((await dependencyFingerprint(source)).hash !== report.dependencies.hash) fail('Dependências do clone mudaram durante a execução');
    if (interrupted) fail('Execução interrompida por sinal');
    await git(workspace, ['diff', '--check']);
    const patchResult = await run([...prefix, 'git', '-c', 'core.hooksPath=/dev/null', 'diff', '--binary', '--no-ext-diff'], workspace, config.timeoutMs);
    if (patchResult.code !== 0 || patchResult.timedOut || patchResult.overflow) fail('Não foi possível exportar patch completo');
    const patchFile = path.join(jobDir, 'validated.patch'); await writeFile(patchFile, patchResult.output, { mode: 0o600 });
    const now = new Date().toISOString().replace(/[-:TZ.]/g, '');
    branch = `claude/chore-manutencao-${now.slice(2, 8)}-${now.slice(8, 12)}-${randomUUID().slice(0, 8)}`;
    await git(workspace, ['switch', '-c', branch]);
    await git(workspace, ['add', '--', ...report.change.files]);
    if (await snapshotDiff(true) !== fixedDiff) fail('Filtro Git alterou o patch ao preparar o commit');
    await git(workspace, ['-c', 'user.name=Manutencao local', '-c', 'user.email=maintenance@localhost', '-c', 'commit.gpgsign=false', 'commit', '-m', 'style: aplica correcoes locais verificadas']);
    report.commit = await git(workspace, ['rev-parse', 'HEAD']); report.branch = branch; report.patch = patchFile;
    await writeJson(pendingFile, { base: report.base, commit: report.commit, branch, patch: patchFile, configHash: report.configHash });
    keepBranch = true; report.status = 'validated_patch';
  } catch (e) {
    report.status = e instanceof MaintenanceError ? e.code : 'failed';
    report.message = redact(e instanceof MaintenanceError ? e.message : `Falha interna: ${e.code || e.name}`);
  }
  return await finish();
  async function finish() {
    if (workspace && await exists(workspace)) {
      try { await git(source, ['worktree', 'remove', '--force', workspace]); }
      catch { report.cleanupFailed = true; report.status = 'failed'; }
      workspace = null;
    }
    if (branch && !keepBranch) await git(source, ['branch', '-D', branch]).catch(() => {});
    if (release) { await release(); release = null; }
    process.removeListener('SIGTERM', onSignal); process.removeListener('SIGINT', onSignal);
    report.finishedAt = new Date().toISOString();
    if (jobDir) { report.reportFile = path.join(jobDir, 'report.json'); await writeJson(report.reportFile, report); }
    return { exitCode: exits[report.status] ?? 1, report };
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await main(); console.log(JSON.stringify(result.report)); process.exitCode = result.exitCode;
}
