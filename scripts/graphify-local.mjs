#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, lstat, realpath, rename, rm, copyFile, chmod, readdir } from 'node:fs/promises';
import path from 'node:path';
import { homedir, loadavg, availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';

const extensions = new Set('.ts .tsx .js .jsx .mjs .cjs .py .sql .sh .bash .go .rs .java .c .h .cpp .hpp .cs .php .rb .kt .swift .lua .zig .f .f90 .scala .groovy .ex .exs .json .toml .yaml .yml'.split(' '));
const ignoredParts = new Set(['.git', '.tools', '.venv', '.venv-graphify', 'venv', 'node_modules', 'graphify-out', '.graphify-local', 'dist', 'coverage', 'test-results', 'playwright-report', '__pycache__', '.audit', '.autofix']);
const hash = (v) => createHash('sha256').update(v).digest('hex');
const fileHash = async (file) => { const digest = createHash('sha256'); for await (const part of createReadStream(file)) digest.update(part); return digest.digest('hex'); };
const canonical = (v) => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])])) : v;
const digest = (v) => hash(JSON.stringify(canonical(v)));
const inside = (root, file) => { const rel = path.relative(root, file); return rel === '' || rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel); };
const safeRelative = (v) => typeof v === 'string' && v.length > 0 && !v.startsWith('-') && !path.isAbsolute(v) && !v.split(/[\\/]/).includes('..');
const secretPath = (file) => file.split('/').some((p) => /^\.env(?:\.|$)/i.test(p)) || /(?:^|\/)(?:credentials?|secrets?|private[-_]keys?)\.(?:json|ya?ml|toml)$|\.(?:pem|key|p12|pfx|keystore)$/i.test(file);
const redact = (text) => String(text).replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[JWT REDIGIDO]')
  .replace(/\bBearer\s+\S+/gi, 'Bearer [REDIGIDO]').replace(/\b(?:gh[pousr]_|github_pat_|sk-|sb_secret_)[A-Za-z0-9_-]{12,}/g, '[TOKEN REDIGIDO]')
  .replace(/\b([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)[A-Z0-9_]*\s*[=:]\s*)[^\s,;]+/g, '$1[REDIGIDO]');
export class GraphError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (message, status = 'failed') => { throw new GraphError(status, message); };
const exists = async (p) => lstat(p).then(() => true, (e) => { if (e.code === 'ENOENT') return false; throw e; });
const json = async (p) => JSON.parse(await readFile(p, 'utf8'));
const codes = { current: 0, installed: 0, marked: 0, generated: 0, queried: 0, missing_runtime: 2, missing_graph: 3, unverified: 3, stale: 3, busy: 75, resources: 75, failed: 1 };
const active = new Set();
export function run(command, cwd, env, timeoutMs = 120000) {
  return new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), { cwd, env, shell: false, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', timedOut = false, overflow = false, canceled = false, settled = false, hard;
    const kill = (signal) => { if (child.pid) try { process.kill(-child.pid, signal); } catch { /* processo encerrado */ } };
    const finish = (code) => {
      if (settled) return; settled = true; clearTimeout(timer); clearTimeout(hard); active.delete(cancel);
      kill('SIGKILL'); child.stdout.destroy(); child.stderr.destroy();
      resolve({ code: timedOut || overflow || canceled ? 1 : code ?? 1, output, timedOut, overflow, canceled });
    };
    const stop = () => { kill('SIGTERM'); hard ||= setTimeout(() => { kill('SIGKILL'); finish(1); }, 1000); };
    const cancel = () => { canceled = true; stop(); }; active.add(cancel);
    const timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
    const collect = (chunk) => { if (Buffer.byteLength(output) + chunk.length > 4 * 1024 * 1024) { overflow = true; stop(); } else output += chunk; };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    child.once('error', () => finish(1)); child.once('close', finish);
  });
}
function environment(extra = {}) {
  return { PATH: `${path.dirname(process.execPath)}:${path.join(homedir(), '.local/bin')}:/usr/local/bin:/usr/bin:/bin`, HOME: homedir(), LANG: 'C.UTF-8', TZ: 'America/Sao_Paulo',
    PYTHONNOUSERSITE: '1', PYTHONHASHSEED: '0', GRAPHIFY_MAX_WORKERS: '1', NO_COLOR: '1', GIT_TERMINAL_PROMPT: '0', ...extra };
}
async function checked(command, root, env, timeout) {
  const r = await run(command, root, env, timeout);
  if (r.code !== 0 || r.timedOut || r.overflow || r.canceled) fail(`Comando ${path.basename(command[0])} falhou (exit=${r.code}, timeout=${r.timedOut})`);
  return r.output.trim();
}
const git = async (root, args) => {
  const r = await run(['git', '-c', 'core.hooksPath=/dev/null', '-C', root, ...args], root, environment(), 30000);
  if (r.code !== 0 || r.timedOut || r.overflow || r.canceled) fail('Leitura Git falhou');
  return args.includes('-z') ? r.output : r.output.trim();
};
async function atomic(file, value) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); await rename(temp, file);
}
export async function acquire(dir) {
  await mkdir(path.dirname(dir), { recursive: true, mode: 0o700 });
  try { await mkdir(dir, { mode: 0o700 }); }
  catch (e) {
    if (e.code !== 'EEXIST') throw e;
    const recovery = `${dir}.recovery`;
    try { await mkdir(recovery, { mode: 0o700 }); } catch { fail('Trava em recuperação por outro executor', 'busy'); }
    try {
      let owner; try { owner = await json(path.join(dir, 'owner.json')); } catch { fail('Trava sem dono verificável', 'busy'); }
      if (!Number.isSafeInteger(owner.pid) || owner.pid <= 1) fail('Dono da trava inválido', 'busy');
      let stale = false; try { process.kill(owner.pid, 0); } catch (error) { stale = error.code === 'ESRCH'; }
      if (!stale) fail('Outra execução usa o grafo', 'busy');
      const old = `${dir}.stale-${randomUUID()}`; await rename(dir, old);
      try { await mkdir(dir, { mode: 0o700 }); } finally { await rm(old, { recursive: true, force: true }); }
    } finally { await rm(recovery, { recursive: true, force: true }); }
  }
  const token = randomUUID(); await atomic(path.join(dir, 'owner.json'), { pid: process.pid, token });
  return async () => { const owner = await json(path.join(dir, 'owner.json')); if (owner.token !== token) fail('Dono da trava mudou'); await rm(dir, { recursive: true }); };
}
export function validateConfig(c) {
  const keys = ['version', 'project', 'environment', 'pin', 'pythonVersion', 'state', 'output', 'adapter', 'scope', 'partial', 'timeoutMs', 'minAvailableMb', 'metadata'];
  if (!c || c.version !== 1 || Object.keys(c).some((k) => !keys.includes(k)) || !/^[A-Za-z0-9_.-]+$/.test(c.project || '') || !/^\d+\.\d+\.\d+$/.test(c.pin || '')) fail('Configuração Graphify inválida');
  for (const key of ['environment', 'state', 'output']) if (!safeRelative(c[key])) fail('Caminho da configuração deve ser relativo e confinado');
  if (!['generic', 'finance', 'champions'].includes(c.adapter) || !Array.isArray(c.scope) || !c.scope.length || !c.scope.every(safeRelative) || typeof c.partial !== 'boolean') fail('Adapter ou corpus inválido');
  if (c.adapter === 'generic' && c.scope.length !== 1) fail('Adapter genérico exige um escopo explícito');
  if (c.adapter === 'finance' && (!c.partial || c.scope.length !== 5)) fail('Finance exige perfil pilot parcial explícito');
  if (c.adapter === 'champions' && (!c.partial || c.scope.length !== 1)) fail('Champions exige escopo parcial explícito');
  if (!Number.isInteger(c.timeoutMs) || c.timeoutMs < 100 || c.timeoutMs > 1800000 || !Number.isInteger(c.minAvailableMb) || c.minAvailableMb < 1) fail('Limites de execução inválidos');
  if (!/^3\.1[012]$/.test(c.pythonVersion || '') || !Array.isArray(c.metadata) || !c.metadata.every((f) => safeRelative(f) && !secretPath(f))) fail('Python ou metadados inválidos');
  return c;
}
function parse(args) {
  const options = { terms: [] };
  for (let i = 0; i < args.length; i++) {
    const value = args[i];
    if (value === '--root' || value === '--config') {
      const key = value.slice(2); if (options[key] || !args[i + 1] || args[i + 1].startsWith('--')) fail('Opção duplicada ou sem valor'); options[key] = args[++i];
    } else if (value.startsWith('--')) fail('Opção desconhecida'); else if (!options.action) options.action = value; else options.terms.push(value);
  }
  const { action } = options; if (!['install', 'status', 'mark', 'ensure', 'query', 'path', 'explain'].includes(action)) fail('Use install/status/mark/ensure/query/path/explain');
  if (options.terms.some((term) => term.startsWith('-') || term.includes('\0'))) fail('Termo de consulta inválido');
  const count = action === 'path' ? 2 : ['query', 'explain'].includes(action) ? 1 : 0;
  if (options.terms.length !== count) fail('Quantidade de argumentos inválida'); return options;
}
async function confined(root, relative, { ignored = false } = {}) {
  const target = path.resolve(root, relative); if (!inside(root, target) || target === root) fail('Caminho fora da raiz');
  let cursor = root;
  for (const part of path.relative(root, target).split(path.sep)) {
    cursor = path.join(cursor, part);
    if (await exists(cursor) && (await lstat(cursor)).isSymbolicLink()) fail('Caminho local atravessa symlink');
  }
  if (ignored) {
    const r = await run(['git', '-c', 'core.hooksPath=/dev/null', '-C', root, 'check-ignore', '--quiet', `${target}/probe`], root, environment(), 30000);
    if (r.code !== 0) fail('Diretório local precisa estar ignorado pelo Git');
  }
  return target;
}
export async function fingerprint(root, config) {
  const names = (await git(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z'])).split('\0').filter(Boolean);
  const files = {}, skipped = [];
  for (const file of [...new Set(names)].sort()) {
    if (!extensions.has(path.extname(file).toLowerCase()) || file.split('/').some((p) => ignoredParts.has(p)) || secretPath(file)) continue;
    if (!config.scope.some((s) => s === '.' || file === s || file.startsWith(`${s}/`))) continue;
    const full = path.join(root, file); if (!inside(root, full)) fail('Git retornou caminho fora da raiz');
    const info = await lstat(full).catch((e) => { if (e.code === 'ENOENT') return null; throw e; });
    if (!info) continue;
    if (!info.isFile() || info.isSymbolicLink() || !inside(root, await realpath(full))) { skipped.push(file); continue; }
    if (info.size > 512 * 1024 * 1024) fail('Arquivo de código excede o limite de512MB');
    files[file] = await fileHash(full);
  }
  if (!Object.keys(files).length) fail('Corpus permitido não contém código');
  const metadata = {};
  for (const file of config.metadata) {
    const info = await lstat(path.join(root, file)).catch((e) => { if (e.code === 'ENOENT') return null; throw e; });
    if (info?.isSymbolicLink() || info && !inside(root, await realpath(path.join(root, file)))) fail('Metadado do corpus não pode atravessar symlink');
    metadata[file] = info?.isFile() ? await fileHash(path.join(root, file)) : null;
  }
  const head = await git(root, ['rev-parse', 'HEAD']), configHash = digest(config);
  return { head, configHash, sourceHash: digest(files), metadataHash: digest(metadata), files, metadata, skipped,
    hash: digest({ pin: config.pin, configHash, head, files, metadata }) };
}
async function runtime(ctx) {
  const python = path.join(ctx.envRoot, 'bin/python'), binary = path.join(ctx.envRoot, 'bin/graphify');
  if (await exists(binary) && (await lstat(binary)).isSymbolicLink()) fail('Executável local não pode apontar para CLI compartilhada', 'missing_runtime');
  if (!await exists(python) || !await exists(binary)) fail('Ambiente individual ausente; execute install', 'missing_runtime');
  const script = 'import importlib.metadata as m,sys,json,pathlib;import graphify,networkx,tree_sitter,tree_sitter_sql;assert tree_sitter_sql.language() is not None;print(json.dumps({"version":m.version("graphifyy"),"prefix":sys.prefix,"module":str(pathlib.Path(graphify.__file__).resolve())}))';
  let value; try { value = JSON.parse(await checked([python, '-I', '-c', script], ctx.root, ctx.env, 30000)); } catch { fail('Ambiente individual não passou no smoke de imports', 'missing_runtime'); }
  if (value.version !== ctx.config.pin || path.resolve(value.prefix) !== ctx.envRoot || !inside(ctx.envRoot, value.module)) fail('Runtime não corresponde ao ambiente e pin locais', 'missing_runtime');
  const version = await checked([binary, '--version'], ctx.root, ctx.env, 30000);
  if (!version.split('\n').some((s) => s.trim() === `graphify ${ctx.config.pin}`)) fail('Executável local tem versão divergente', 'missing_runtime');
  return { version: value.version, python, binary, prefix: value.prefix };
}
export async function validateGraph(file, partial = false) {
  const info = await lstat(file); if (!info.isFile() || info.isSymbolicLink() || info.size > 512 * 1024 * 1024) fail('Artefato do grafo não é arquivo regular ou excede512MB');
  const bytes = await readFile(file), graph = JSON.parse(bytes.toString('utf8'));
  if (!Array.isArray(graph.nodes) || !graph.nodes.length) fail('Grafo vazio ou inválido');
  const ids = new Set(graph.nodes.map((n) => String(n.id)));
  if (ids.size !== graph.nodes.length || graph.nodes.some((n) => !['string', 'number'].includes(typeof n.id) || String(n.id).length === 0 || typeof n.id === 'number' && !Number.isFinite(n.id))) fail('IDs do grafo inválidos ou duplicados');
  const edges = graph.links || graph.edges;
  if (!Array.isArray(edges)) fail('Relações do grafo inválidas');
  let unresolvedImports = 0;
  for (const edge of edges) {
    if (ids.has(String(edge.source)) && ids.has(String(edge.target))) continue;
    if (partial && ids.has(String(edge.source)) && ['imports', 'imports_from', 'dynamic_import', 're_exports'].includes(edge.relation)) { unresolvedImports++; continue; }
    fail('Grafo contém relações sem origem/destino');
  }
  return { nodes: graph.nodes.length, edges: edges.length, unresolvedImports, sha256: hash(bytes) };
}
async function status(ctx, currentFingerprint) {
  const runtimeInfo = await runtime(ctx); const fp = currentFingerprint || await fingerprint(ctx.root, ctx.config);
  if (!await exists(ctx.graph)) return { status: 'missing_graph', runtime: runtimeInfo, fingerprint: fp.hash, partial: ctx.config.partial, scope: ctx.config.scope };
  if ((await lstat(ctx.graph)).isSymbolicLink()) fail('Grafo não pode ser symlink');
  const graph = await validateGraph(ctx.graph, ctx.config.partial);
  if (!await exists(ctx.provenance)) return { status: 'unverified', runtime: runtimeInfo, graph, fingerprint: fp.hash, partial: ctx.config.partial, scope: ctx.config.scope };
  if ((await lstat(ctx.provenance)).isSymbolicLink()) fail('Proveniência não pode ser symlink');
  const meta = await json(ctx.provenance);
  const valid = meta.version === 1 && meta.root === ctx.root && meta.pin === ctx.config.pin && meta.fingerprint === fp.hash && meta.graph.sha256 === graph.sha256;
  return { status: valid ? 'current' : 'stale', runtime: runtimeInfo, graph, fingerprint: fp.hash, partial: ctx.config.partial, scope: ctx.config.scope };
}
async function offline(ctx) {
  if (ctx.fixtureOfflinePrefix !== undefined) return ctx.fixtureOfflinePrefix; // Injeção só da API de testes; nenhuma flag/config permite isso.
  const script = 'process.stdout.write(require("node:fs").readlinkSync("/proc/self/ns/net"))';
  const host = await checked([process.execPath, '-e', script], ctx.root, ctx.env, 5000);
  const prefix = ['unshare', '--user', '--map-root-user', '--net', '--'];
  const isolated = await checked([...prefix, process.execPath, '-e', script], ctx.root, ctx.env, 5000);
  if (isolated === host || !isolated.startsWith('net:[')) fail('Namespace offline indisponível'); return prefix;
}
async function resources(ctx) {
  const bytes = await readFile('/proc/meminfo', 'utf8'), availableMb = Number(/MemAvailable:\s+(\d+)/.exec(bytes)?.[1] || 0) / 1024;
  if (availableMb < ctx.config.minAvailableMb || loadavg()[0] > availableParallelism()) fail('Geração adiada por memória/carga', 'resources');
}
async function generate(ctx, fp, expectedGraph) {
  await resources(ctx); const prefix = await offline(ctx);
  const job = path.join(ctx.state, 'runs', `${Date.now()}-${randomUUID()}`); await mkdir(job, { recursive: true, mode: 0o700 });
  let step = 0;
  const execute = async (argv, env = ctx.env) => {
    if (ctx.interrupted()) fail('Execução interrompida');
    const result = await run([...prefix, ...argv], ctx.root, env, ctx.config.timeoutMs);
    const log = path.join(job, `${step++}.log`); await writeFile(log, redact(result.output), { mode: 0o600 });
    if (result.code !== 0 || result.timedOut || result.overflow || result.canceled) fail(`Extração/validação falhou; log privado ${log}`);
    return result.output;
  };
  try {
  let candidate, wrapperEvidence;
  if (ctx.config.adapter === 'finance') {
    const wrapperConfig = await json(path.join(ctx.root, 'scripts/graphify/config.json'));
    if (wrapperConfig.version !== ctx.config.pin || digest(wrapperConfig.profiles?.pilot?.files) !== digest(ctx.config.scope)) fail('Perfil Finance diverge do wrapper pilot versionado');
    const shims = path.join(job, 'bin'); await mkdir(shims, { mode: 0o700 });
    const shim = path.join(shims, 'graphify');
    await writeFile(shim, `#!${process.execPath}\nconst{spawnSync}=require('node:child_process');const a=process.argv.slice(2);for(let i=0;i<a.length;i++)if(a[i]==='--max-workers'&&a[i+1])a[i+1]='1';const r=spawnSync(${JSON.stringify(ctx.binary)},a,{stdio:'inherit',env:process.env});process.exit(r.status??1);\n`, { mode: 0o700 });
    const previous = new Set(await readdir(path.join(ctx.root, 'graphify-out/pilot')).catch(() => []));
    await execute([ctx.python, 'scripts/graphify/run.py', 'pilot', '--profile', 'pilot'], { ...ctx.env, PATH: `${shims}:${ctx.env.PATH}` });
    const runs = (await readdir(path.join(ctx.root, 'graphify-out/pilot'))).filter((n) => n.startsWith('execucao-') && !previous.has(n));
    if (runs.length !== 1) fail('Wrapper Finance não produziu execução única verificável');
    wrapperEvidence = path.join(ctx.root, 'graphify-out/pilot', runs[0], 'evidencia.json');
    if ((await json(wrapperEvidence)).status !== 'validado_com_limitacoes') fail('Wrapper Finance recusou o corpus');
    candidate = path.join(path.dirname(wrapperEvidence), 'graphify-out/graph.json');
  } else if (ctx.config.adapter === 'champions') {
    await confined(ctx.root, '.graphify-local', { ignored: true });
    const destination = `.graphify-local/local-${Date.now()}-${randomUUID()}`;
    await execute([process.execPath, 'scripts/graphify/extract-code-only.mjs', '--scope', ctx.config.scope[0], '--out', destination, '--max-workers', '1', '--allow-large-scope']);
    wrapperEvidence = path.join(ctx.root, destination, 'snapshot.json'); candidate = path.join(ctx.root, destination, 'graphify-out/graph.json');
  } else {
    const staging = path.join(job, 'staging'), corpus = path.join(job, 'corpus');
    await mkdir(corpus, { mode: 0o700 });
    for (const [file, expected] of Object.entries(fp.files)) {
      const target = path.join(corpus, file); await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      await copyFile(path.join(ctx.root, file), target); await chmod(target, 0o600);
      if (await fileHash(target) !== expected) fail('Fonte mudou ao preparar corpus isolado');
    }
    await execute(['git', '-c', 'core.hooksPath=/dev/null', '-C', corpus, 'init', '--quiet']);
    await execute([ctx.binary, 'extract', corpus, '--code-only', '--no-cluster', '--max-workers', '1', '--out', staging]);
    await execute([ctx.binary, 'cluster-only', staging, '--no-label', '--no-viz']);
    candidate = path.join(staging, 'graphify-out/graph.json');
  }
  const graph = await validateGraph(candidate, ctx.config.partial), after = await fingerprint(ctx.root, ctx.config);
  if (after.hash !== fp.hash || ctx.interrupted()) fail('Fonte mudou durante a geração; grafo anterior preservado');
  await mkdir(ctx.outputRoot, { recursive: true, mode: 0o700 });
  for (const file of [ctx.graph, ctx.provenance]) {
    const tracked = await run(['git', '-c', 'core.hooksPath=/dev/null', '-C', ctx.root, 'ls-files', '--error-unmatch', '--', path.relative(ctx.root, file)], ctx.root, ctx.env, 30000);
    if (tracked.code === 0) fail('Saída é rastreada pelo Git; promoção exige fluxo versionado');
  }
  let backup;
  const currentGraph = await exists(ctx.graph) ? await validateGraph(ctx.graph, ctx.config.partial) : null;
  if ((currentGraph?.sha256 || null) !== (expectedGraph?.sha256 || null)) fail('Outro processo mudou o grafo; promoção recusada');
  if (currentGraph) {
    backup = path.join(ctx.state, 'backups', `${Date.now()}-${randomUUID()}`); await mkdir(backup, { recursive: true, mode: 0o700 });
    await copyFile(ctx.graph, path.join(backup, 'graph.json')); await chmod(path.join(backup, 'graph.json'), 0o600);
    if (await exists(ctx.provenance)) await copyFile(ctx.provenance, path.join(backup, 'provenance.json'));
  }
  if (ctx.lockAlive && !ctx.lockAlive()) fail('Lease global perdeu a trava durante extração');
  const temp = path.join(ctx.outputRoot, `.graphify-local-${randomUUID()}.tmp`); await copyFile(candidate, temp); await chmod(temp, 0o600);
  if (!currentGraph) { const { link } = await import('node:fs/promises'); try { await link(temp, ctx.graph); } finally { await rm(temp, { force: true }); } }
  else await rename(temp, ctx.graph);
  const meta = { version: 1, generator: 'graphify-local', root: ctx.root, project: ctx.config.project, pin: ctx.config.pin,
    configHash: fp.configHash, fingerprint: fp.hash, head: fp.head, sourceHash: fp.sourceHash, metadataHash: fp.metadataHash,
    sourceFiles: fp.files, scope: ctx.config.scope, partial: ctx.config.partial, graph, wrapperEvidence,
    createdAt: new Date().toISOString(), inputTokens: 0, outputTokens: 0, network: 'unshare user+net', maxWorkers: 1 };
  await atomic(ctx.provenance, meta); await rm(path.join(ctx.state, 'dirty.json'), { force: true });
  return { status: 'generated', graph, partial: meta.partial, scope: meta.scope, provenance: ctx.provenance, backup, jobDir: job };
  } finally {
    await rm(path.join(job, 'corpus'), { recursive: true, force: true });
    await rm(path.join(job, 'staging'), { recursive: true, force: true });
  }
}
export async function adoptInitial(ctx, fp) {
  const file = path.join(ctx.outputRoot, 'graphify-local-initial-provenance.json');
  if (!await exists(file) || await exists(ctx.provenance)) return false;
  if ((await lstat(file)).isSymbolicLink()) return false;
  const initial = await json(file);
  if (initial.generator !== 'initial-code-only' || initial.root !== ctx.root || initial.graphifyVersion !== ctx.config.pin ||
    initial.partial !== ctx.config.partial || digest(initial.scope) !== digest(ctx.config.scope) || initial.sourceFingerprint?.head !== fp.head || digest(initial.sourceFingerprint.files) !== digest(fp.files)) return false;
  const graph = await validateGraph(ctx.graph, ctx.config.partial); if (initial.graphSha256 !== graph.sha256) return false;
  // Só adota a execução inicial conhecida, com bytes, corpus, versão e commit conferidos.
  // Metadados que alteram descoberta precisam ser anteriores à própria extração.
  for (const file of ctx.config.metadata) {
    const info = await lstat(path.join(ctx.root, file)).catch(() => null);
    if (info && info.mtimeMs > Date.parse(initial.createdAt)) return false;
  }
  await atomic(ctx.provenance, { version: 1, generator: 'graphify-local', adoptedFrom: file, root: ctx.root, project: ctx.config.project,
    pin: ctx.config.pin, configHash: fp.configHash, fingerprint: fp.hash, head: fp.head, sourceHash: fp.sourceHash, metadataHash: fp.metadataHash,
    sourceFiles: fp.files, scope: ctx.config.scope, partial: ctx.config.partial, graph, createdAt: new Date().toISOString(), inputTokens: 0, outputTokens: 0 });
  return true;
}
export async function main(args = process.argv.slice(2), options = {}) {
  let release, globalRelease, ctx; let interrupted = false;
  const stop = () => { interrupted = true; for (const cancel of active) cancel(); }; process.on('SIGTERM', stop); process.on('SIGINT', stop);
  const report = { version: 1, startedAt: new Date().toISOString(), status: 'failed' };
  try {
    const parsed = parse(args), root = await realpath(path.resolve(parsed.root || process.cwd())); report.action = parsed.action; report.root = root;
    if (await realpath(await git(root, ['rev-parse', '--show-toplevel'])) !== root) fail('--root deve apontar para a raiz Git');
    const config = validateConfig(await json(path.resolve(root, parsed.config || 'graphify.local.json'))); report.project = config.project;
    ctx = { root, config, envRoot: await confined(root, config.environment, { ignored: true }), state: await confined(root, config.state, { ignored: true }),
      outputRoot: await confined(root, config.output, { ignored: true }), interrupted: () => interrupted, fixtureOfflinePrefix: options.fixtureOfflinePrefix };
    ctx.python = path.join(ctx.envRoot, 'bin/python'); ctx.binary = path.join(ctx.envRoot, 'bin/graphify');
    ctx.env = environment({ PATH: `${ctx.envRoot}/bin:${path.dirname(process.execPath)}:/usr/local/bin:/usr/bin:/bin` });
    ctx.graph = path.join(ctx.outputRoot, 'graph.json'); ctx.provenance = path.join(ctx.outputRoot, 'graphify-local-provenance.json');
    await mkdir(ctx.state, { recursive: true, mode: 0o700 });
    if (parsed.action === 'mark') { await atomic(path.join(ctx.state, 'dirty.json'), { markedAt: new Date().toISOString() }); report.status = 'marked'; }
    else if (parsed.action === 'install') {
      release = await acquire(path.join(ctx.state, 'running.lock'));
      if (await exists(ctx.python)) { report.runtime = await runtime(ctx); report.status = 'installed'; }
      else {
        if (await exists(path.join(ctx.envRoot, 'pyvenv.cfg'))) fail('Ambiente incompleto preservado; reparo precisa ser explícito', 'missing_runtime');
        await checked(['uv', 'venv', '--allow-existing', '--python', config.pythonVersion, ctx.envRoot], root, environment(), config.timeoutMs);
        if (config.adapter === 'champions') {
          if (config.environment !== 'tools/graphify/.venv') fail('Ambiente Champions diverge do wrapper');
          await checked(['uv', 'sync', '--directory', path.join(root, 'tools/graphify'), '--locked', '--python', config.pythonVersion, '--no-dev', '--link-mode', 'copy'], root, environment(), config.timeoutMs);
          await checked(['uv', 'pip', 'install', '--python', ctx.python, '--link-mode', 'copy', `graphifyy[sql]==${config.pin}`], root, environment(), config.timeoutMs);
        } else {
          const lock = config.adapter === 'finance' ? path.join(root, 'scripts/graphify/requirements-linux-py311.lock') : path.join(root, 'scripts/graphify/requirements.lock');
          if (await exists(lock)) await checked(['uv', 'pip', 'sync', '--python', ctx.python, '--require-hashes', '--link-mode', 'copy', lock], root, environment(), config.timeoutMs);
          else await checked(['uv', 'pip', 'install', '--python', ctx.python, '--link-mode', 'copy', `graphifyy[sql]==${config.pin}`], root, environment(), config.timeoutMs);
        }
        report.runtime = await runtime(ctx); report.status = 'installed';
      }
    } else {
      if (parsed.action === 'status') Object.assign(report, await status(ctx));
      else {
        release = await acquire(path.join(ctx.state, 'running.lock'));
        const fp = await fingerprint(root, config); const state = await status(ctx, fp);
        if (state.status === 'current') { Object.assign(report, state); await rm(path.join(ctx.state, 'dirty.json'), { force: true }); }
        else if (state.status === 'unverified' && await adoptInitial(ctx, fp)) Object.assign(report, await status(ctx, fp), { adoptedInitial: true });
        else {
          globalRelease = await acquireGlobal(options.globalLock || path.join(homedir(), '.cache/repo-maintenance/fleet.lock'));
          ctx.lockAlive = globalRelease.alive;
          Object.assign(report, await generate(ctx, fp, state.graph));
        }
        if (['query', 'path', 'explain'].includes(parsed.action)) {
          const prefix = await offline(ctx);
          const command = [ctx.binary, parsed.action, ...parsed.terms, '--graph', ctx.graph, ...(parsed.action === 'query' ? ['--budget', '1500'] : [])];
          const output = await checked([...prefix, ...command], root, ctx.env, config.timeoutMs);
          report.output = redact(output); report.status = 'queried';
        }
      }
    }
  } catch (e) { report.status = e instanceof GraphError ? e.status : 'failed'; report.message = e instanceof GraphError ? e.message : `Falha interna: ${e.code || e.name}`; }
  finally {
    try { if (globalRelease) await globalRelease(); if (release) await release(); }
    catch { report.status = 'failed'; report.message = 'Falha ao liberar trava'; }
    process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop);
  }
  report.finishedAt = new Date().toISOString();
  if (ctx) { try { await atomic(path.join(ctx.state, 'last-report.json'), report); } catch { report.status = 'failed'; report.message = 'Falha ao gravar relatório privado'; } }
  return { exitCode: codes[report.status] ?? 1, report };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await main(); console.log(JSON.stringify(result.report)); process.exitCode = result.exitCode;
}

// Lease POSIX interoperável com o motor/frota. O FD fica no processo flock até stdin fechar.
export async function acquireGlobal(file) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  return new Promise((resolve, reject) => {
    const child = spawn('flock', ['-n', '-E', '75', file, process.execPath, '-e', 'process.stdout.write("LOCKED\\n");process.stdin.resume();process.stdin.on("end",()=>process.exit(0));'],
      { detached: true, env: environment(), stdio: ['pipe', 'pipe', 'pipe'] });
    let ready = false, output = '', finished = false;
    const kill = () => { if (child.pid) try { process.kill(-child.pid, 'SIGKILL'); } catch { /* lease encerrado */ } };
    const timer = setTimeout(() => { kill(); if (!ready) reject(new GraphError('failed', 'Timeout ao adquirir trava global')); }, 5000);
    child.stderr.resume();
    child.stdout.on('data', (part) => {
      output += part;
      if (!ready && output.includes('LOCKED\n')) {
        ready = true; clearTimeout(timer);
        const release = async () => {
          if (finished) return;
          await new Promise((done) => {
            const timeout = setTimeout(() => { kill(); done(); }, 1500);
            child.once('close', () => { clearTimeout(timeout); done(); });
            child.stdin.end();
          });
        };
        release.alive = () => !finished;
        resolve(release);
      }
    });
    child.once('error', () => { clearTimeout(timer); reject(new GraphError('failed', 'flock indisponível')); });
    child.once('close', (code) => { finished = true; clearTimeout(timer); if (!ready) reject(new GraphError(code === 75 ? 'busy' : 'failed', 'Outra manutenção usa a trava global')); });
  });
}
