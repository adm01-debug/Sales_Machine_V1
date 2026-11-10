import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile, stat, realpath, rm, symlink, readdir, lstat, open } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { StringDecoder } from 'node:string_decoder';
import path from 'node:path';
import { tmpdir } from 'node:os';

export class MaintenanceError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
export const fail = (message) => { throw new MaintenanceError('failed', message); };
export const digest = (value) => createHash('sha256').update(value).digest('hex');
export const exists = async (file) => { try { await stat(file); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } };
export const safeEnv = ({ nodeEnv, publicEnv = {}, hooks = false } = {}) => ({
  ...Object.fromEntries(Object.entries(process.env).filter(([k]) => ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'SystemRoot', 'COMSPEC', 'TZ', 'LANG'].includes(k))),
  CI: 'true', NO_COLOR: '1', ...(nodeEnv ? { NODE_ENV: nodeEnv } : {}),
  ...(hooks ? { HUSKY: '1' } : {}), ...publicEnv,
});
const activeChildren = new Map();
export function stopChildren() {
  for (const [pid, child] of activeChildren) {
    try { process.kill(-pid, 'SIGTERM'); } catch { /* O processo pode já ter encerrado. */ }
    setTimeout(() => { if (activeChildren.get(pid) === child) { try { process.kill(-pid, 'SIGKILL'); } catch { /* O processo pode já ter encerrado. */ } child.stdout.destroy(); child.stderr.destroy(); } }, 1000).unref();
  }
}
export function run(command, cwd, timeoutMs = 120000, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), { cwd, shell: false, detached: true, env: safeEnv(options), stdio: ['ignore', 'pipe', 'pipe'] });
    if (child.pid) activeChildren.set(child.pid, child);
    let output = '', stdout = '', stderr = '', bytes = 0, timedOut = false, overflow = false;
    const decoders = { stdout: new StringDecoder('utf8'), stderr: new StringDecoder('utf8') };
    const kill = (signal) => { try { process.kill(-child.pid, signal); } catch { /* O processo pode já ter encerrado. */ } };
    const timer = setTimeout(() => { timedOut = true; kill('SIGTERM'); }, timeoutMs);
    const hardTimer = setTimeout(() => { kill('SIGKILL'); child.stdout.destroy(); child.stderr.destroy(); }, timeoutMs + 1000);
    const collect = (stream, data) => {
      bytes += data.length;
      if (bytes > 4 * 1024 * 1024) { overflow = true; kill('SIGKILL'); child.stdout.destroy(); child.stderr.destroy(); return; }
      const text = decoders[stream].write(data); output += text;
      if (stream === 'stdout') stdout += text; else stderr += text;
    };
    child.stdout.on('data', (data) => collect('stdout', data)); child.stderr.on('data', (data) => collect('stderr', data));
    child.once('error', (e) => { activeChildren.delete(child.pid); clearTimeout(timer); clearTimeout(hardTimer); reject(new MaintenanceError('failed', `Não foi possível executar ${path.basename(command[0])}: ${e.code}`)); });
    child.once('close', (code, signal) => {
      const outEnd = decoders.stdout.end(), errEnd = decoders.stderr.end(); stdout += outEnd; stderr += errEnd; output += outEnd + errEnd;
      activeChildren.delete(child.pid); kill('SIGKILL'); clearTimeout(timer); clearTimeout(hardTimer);
      resolve({ code, signal, timedOut, overflow, output, stdout, stderr });
    });
  });
}
export async function checked(command, cwd, timeout) {
  const result = await run(command, cwd, timeout);
  if (result.code !== 0 || result.timedOut || result.overflow) fail(`Comando ${path.basename(command[0])} falhou (exit=${result.code}, timeout=${result.timedOut}, limiteSaida=${result.overflow})`);
  return result.output.trim();
}
export const git = (cwd, args, timeout, prefix = []) => checked([...prefix, 'git', '-c', 'core.hooksPath=/dev/null', ...args], cwd, timeout);
export async function commitWithHooks(source, workspace, jobDir, args, timeout, prefix = []) {
  const configured = await run([...prefix, 'git', 'config', '--get', 'core.hooksPath'], source, timeout);
  if (![0, 1].includes(configured.code) || configured.timedOut || configured.overflow) fail('Não foi possível resolver os hooks obrigatórios');
  const value = configured.stdout.trim();
  const relative = value ? path.relative(source, path.resolve(source, value)) : '';
  const husky = relative.replaceAll('\\', '/').match(/^(.*\.husky)(?:\/_)?$/)?.[1]
    || (!value && await exists(path.join(workspace, '.husky')) ? '.husky' : null);
  const directory = path.join(jobDir, 'commit-hooks'); await mkdir(directory, { mode: 0o700 });
  let bootstrap;
  if (husky) {
    const helper = path.join(workspace, husky, '_', 'husky.sh');
    if (!await exists(helper)) {
      const parent = path.dirname(helper), createdParent = !await exists(parent);
      await mkdir(parent, { recursive: true });
      await writeFile(helper, '# Bootstrap isolado: o dispatcher executa os hooks com sh -e.\n', { mode: 0o600 });
      bootstrap = async () => { await rm(helper, { force: true }); if (createdParent) await rm(parent, { recursive: true, force: true }); };
    }
  }
  const names = [];
  const quote = (text) => `'${text.replaceAll("'", "'\\''")}'`;
  try {
    for (const name of ['pre-commit', 'prepare-commit-msg', 'commit-msg', 'post-commit']) {
      let script;
      if (husky) script = path.join(workspace, husky, name);
      else if (value && inside(source, path.resolve(source, value))) {
        script = path.join(workspace, relative, name);
        if (!await exists(script)) {
          const installed = path.resolve(source, value, name);
          if (await exists(installed)) {
            const tracked = await run([...prefix, 'git', 'ls-files', '-z', '--', path.relative(source, installed)], source, timeout);
            if (tracked.code !== 0 || tracked.timedOut || tracked.overflow) fail('Não foi possível resolver o hook instalado');
            if (!tracked.stdout) script = installed;
          }
        }
      }
      else if (value) script = path.resolve(source, value, name);
      else script = path.join(await git(source, ['rev-parse', '--path-format=absolute', '--git-common-dir'], timeout, prefix), 'hooks', name);
      if (!await exists(script)) continue;
      const invocation = husky ? `sh -e ${quote(script)}` : quote(script);
      await writeFile(path.join(directory, name), `#!/bin/sh\nset -eu\nPATH=${quote(path.join(workspace, 'node_modules/.bin'))}:"$PATH"\nexport PATH\nexec ${invocation} "$@"\n`, { mode: 0o700 });
      names.push(name);
    }
    const result = await run([...prefix, 'git', '-c', `core.hooksPath=${directory}`, ...args], workspace, timeout, { hooks: true });
    return { names, ...result };
  } finally { if (bootstrap) await bootstrap(); }
}
const locks = ['bun.lock', 'bun.lockb', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'];
const inside = (root, file) => { const relative = path.relative(root, file); return relative === '' || !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`); };
async function directoryHash(root) {
  const entries = [];
  async function visit(file, relative) {
    const info = await lstat(file);
    if (info.isSymbolicLink()) throw new MaintenanceError('missing_dependencies', 'Symlink interno em dependência local não suportado');
    if (info.isDirectory()) {
      for (const name of (await readdir(file)).sort()) {
        if (name === '.git') throw new MaintenanceError('missing_dependencies', 'Submódulo local precisa de instalação isolada explícita');
        await visit(path.join(file, name), relative ? `${relative}/${name}` : name);
      }
    } else if (info.isFile()) entries.push([relative, info.mode & 0o111, digest(await readFile(file))]);
    else throw new MaintenanceError('missing_dependencies', 'Entrada especial em dependência local não suportada');
  }
  await visit(root, ''); return digest(JSON.stringify(entries));
}
async function localDependencies(root) {
  const paths = new Set(), links = {};
  const add = (value) => {
    const relative = value.replace(/^(file:|link:)/, '').replaceAll('\\', '/').replace(/^\.\//, '');
    const absolute = path.resolve(root, relative);
    if (!relative || relative === '.' || !inside(root, absolute)) throw new MaintenanceError('missing_dependencies', 'Dependência local fora do repositório não suportada');
    paths.add(path.relative(root, absolute).replaceAll('\\', '/'));
    return path.relative(root, absolute).replaceAll('\\', '/');
  };
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const visit = (value) => {
    if (typeof value === 'string' && /^(file:|link:)/.test(value)) add(value);
    else if (typeof value === 'string' && value.startsWith('workspace:')) throw new MaintenanceError('missing_dependencies', 'Dependência workspace precisa de instalação isolada explícita');
    else if (value && typeof value === 'object') for (const child of Object.values(value)) visit(child);
  };
  visit(manifest);
  for (const name of ['package-lock.json', 'bun.lock', 'pnpm-lock.yaml', 'yarn.lock']) if (await exists(path.join(root, name))) {
    const text = await readFile(path.join(root, name), 'utf8');
    if (name === 'package-lock.json') {
      const lock = JSON.parse(text);
      for (const [key, entry] of Object.entries(lock.packages || {})) {
        if (entry.link === true && typeof entry.resolved === 'string') links[key] = add(entry.resolved);
        else if (typeof entry.resolved === 'string' && /^(file:|link:)/.test(entry.resolved)) links[key] = add(entry.resolved);
      }
    } else if (/\b(?:file:|link:|workspace:)/.test(text) && paths.size === 0) {
      throw new MaintenanceError('missing_dependencies', 'Dependência local no lockfile sem manifesto/package-lock verificável');
    }
  }
  const local = {};
  for (const relative of [...paths].sort()) {
    const absolute = path.join(root, relative);
    if (!await exists(absolute) || !(await lstat(absolute)).isDirectory()) throw new MaintenanceError('missing_dependencies', 'Dependência local precisa ser um diretório versionado');
    const metadata = JSON.parse(await readFile(path.join(absolute, 'package.json'), 'utf8'));
    local[relative] = await directoryHash(absolute);
    if (typeof metadata.name === 'string') {
      const installed = path.posix.join('node_modules', metadata.name);
      if (!inside(path.join(root, 'node_modules'), path.resolve(root, installed))) throw new MaintenanceError('missing_dependencies', 'Nome de dependência local inválido');
      links[installed] ||= relative;
    }
  }
  return { local, links };
}
export async function dependencyFingerprint(root) {
  const files = {};
  for (const file of ['package.json', ...locks]) if (await exists(path.join(root, file))) files[file] = digest(await readFile(path.join(root, file)));
  if (!files['package.json'] || !locks.some((f) => files[f])) throw new MaintenanceError('missing_dependencies', 'Manifesto ou lockfile ausente');
  const dependencies = await localDependencies(root);
  if (await exists(path.join(root, 'node_modules'))) {
    for (const [installed, relative] of Object.entries(dependencies.links)) if (installed.startsWith('node_modules/')) {
      let actual;
      try { actual = await realpath(path.join(root, installed)); }
      catch { throw new MaintenanceError('missing_dependencies', 'Dependência local instalada ausente'); }
      if (await directoryHash(actual) !== dependencies.local[relative]) throw new MaintenanceError('missing_dependencies', 'Dependência local instalada difere do conteúdo versionado');
    }
  }
  return { files, ...dependencies, hash: digest(JSON.stringify({ files, ...dependencies })) };
}
export async function reuseDependencies(source, target) {
  const before = await dependencyFingerprint(source), after = await dependencyFingerprint(target);
  if (before.hash !== after.hash) throw new MaintenanceError('missing_dependencies', 'Manifesto/lockfiles/dependências locais do clone diferem da referência isolada');
  const modules = path.join(source, 'node_modules');
  if (!await exists(modules)) throw new MaintenanceError('missing_dependencies', 'node_modules ausente; instalação automática desabilitada');
  for (const [installed, relative] of Object.entries(before.links)) {
    if (!installed.startsWith('node_modules/')) continue;
    let actual;
    try { actual = await realpath(path.join(source, installed)); }
    catch { throw new MaintenanceError('missing_dependencies', 'Dependência local instalada ausente'); }
    if (await directoryHash(actual) !== before.local[relative]) throw new MaintenanceError('missing_dependencies', 'Dependência local instalada difere da referência isolada');
  }
  const modulesReal = await realpath(modules);
  async function checkLinks(folder, scope = '') {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(folder, entry.name), name = scope ? `${scope}/${entry.name}` : entry.name;
      if (!scope && entry.name.startsWith('@') && entry.isDirectory()) await checkLinks(full, entry.name);
      if (entry.isSymbolicLink()) {
        const actual = await realpath(full);
        if (!inside(modulesReal, actual) && !before.links[`node_modules/${name}`]) throw new MaintenanceError('missing_dependencies', 'Link externo em node_modules sem dependência local verificável');
      }
    }
  }
  await checkLinks(modulesReal);
  await symlink(await realpath(modules), path.join(target, 'node_modules'), 'dir');
  return { source, hash: before.hash, files: before.files, local: before.local };
}
export const localRequire = (root) => createRequire(path.join(root, 'package.json'));
export function tool(root, name) {
  try {
    const req = localRequire(root), pkg = req.resolve(`${name}/package.json`), dir = path.dirname(pkg);
    return { req, dir, pkg };
  } catch { throw new MaintenanceError('missing_dependencies', `Dependência local ausente: ${name}`); }
}
export function validateConfig(c) {
  const keys = ['version', 'manager', 'tsconfigs', 'gates', 'fix', 'timeoutMs', 'maxFiles', 'maxChangedLines'];
  if (!c || typeof c !== 'object' || Object.keys(c).some((k) => !keys.includes(k)) || c.version !== 1) fail('Configuração inválida ou versão desconhecida');
  if (!['npm', 'bun'].includes(c.manager)) fail('Gerenciador deve ser npm ou bun');
  const relative = (x) => typeof x === 'string' && x.length && !path.isAbsolute(x) && !x.split(/[\\/]/).includes('..') && !x.startsWith('-');
  if (!Array.isArray(c.tsconfigs) || !c.tsconfigs.length || !c.tsconfigs.every(relative)) fail('tsconfigs explícitos obrigatórios');
  const expected = ['lint', 'types', 'test', 'build'];
  if (!Array.isArray(c.gates) || c.gates.length !== 4 || expected.some((name) => c.gates.filter((g) => g.name === name).length !== 1)) fail('Gates lint/types/test/build obrigatórios e únicos');
  for (const g of c.gates) {
    if (Object.keys(g).some((k) => !['name', 'command', 'env'].includes(k)) || !Array.isArray(g.command) || !g.command.length || !g.command.every((s) => typeof s === 'string' && s && !s.includes('\0'))) fail('Comando de gate inválido');
    if (g.env !== undefined) {
      if (!g.env || typeof g.env !== 'object' || Array.isArray(g.env)) fail('Ambiente de gate inválido');
      for (const [name, value] of Object.entries(g.env)) {
        if (typeof value !== 'string') fail('Variável de teste deve ser texto');
        if (name === 'VITE_SUPABASE_URL') {
          let url; try { url = new URL(value); } catch { fail('URL pública de teste inválida'); }
          if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && !url.hostname.endsWith('.invalid') || url.username || url.password || url.search || url.hash) fail('URL pública deve ser local ou .invalid, sem credenciais');
        } else if (name === 'VITE_SUPABASE_PROJECT_ID') {
          if (!['maintenance_test', 'test_fixture'].includes(value)) fail('Project ID deve ser um identificador sintético de teste');
        } else if (['VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY'].includes(name)) {
          if (!/^(?:sb_publishable_)?(?:test|example|fixture|local|maintenance)[A-Za-z0-9_.-]{0,128}$/.test(value)) fail('Chave pública deve ser um placeholder explícito de teste');
        } else fail('Variável de ambiente fora da allowlist pública de teste');
      }
    }
    if (!['node', 'npm', 'bun'].includes(g.command[0]) || g.command.some((s) => ['--watch', '-w', '--fix', '--write', '--update-baseline'].includes(s))) fail('Gate deve ser finito e não corretivo');
    if (g.name === 'types' && (g.command[0] !== 'node' || path.basename(g.command[1] || '') !== 'typecheck.mjs' || !c.tsconfigs.every((cfg) => g.command.includes(cfg)))) fail('Gate types deve usar typecheck.mjs e incluir todos os tsconfigs');
  }
  const f = c.fix;
  if (!f || Object.keys(f).some((k) => !['roots', 'eslintRules', 'prettier', 'exclude'].includes(k)) || !Array.isArray(f.roots) || !f.roots.length || !f.roots.every((x) => x === 'src' || x.startsWith('src/') && relative(x)) || typeof f.prettier !== 'boolean') fail('Escopo de correção deve ficar em src');
  if (f.exclude !== undefined && (!Array.isArray(f.exclude) || !f.exclude.every((file) => relative(file) && !/[*?\[\]{}]/.test(file)))) fail('Exclusões devem ser caminhos relativos explícitos, sem globs');
  const allowed = ['semi', 'quotes', 'indent', 'comma-dangle', 'eol-last', 'no-trailing-spaces', 'space-infix-ops', 'keyword-spacing', 'object-curly-spacing', 'array-bracket-spacing'];
  if (!Array.isArray(f.eslintRules) || !f.eslintRules.every((x) => allowed.includes(x))) fail('Regra ESLint não autorizada para correção');
  for (const key of ['timeoutMs', 'maxFiles', 'maxChangedLines']) if (!Number.isInteger(c[key]) || c[key] < 1) fail(`Limite ${key} inválido`);
  if (c.timeoutMs > 900000 || c.maxFiles > 20 || c.maxChangedLines > 400) fail('Limites excedem política: timeout 15min, 20 arquivos, 400 linhas');
  return c;
}
export async function inspect(root, config) {
  const { req } = tool(root, 'typescript');
  tool(root, 'eslint'); if (config.fix.prettier) tool(root, 'prettier');
  const ts = req('typescript'), coverage = [];
  const hasApi = typeof ts.readConfigFile === 'function' && typeof ts.parseJsonConfigFileContent === 'function' && typeof ts.sys?.readFile === 'function';
  for (const cfg of config.tsconfigs) {
    const filename = path.resolve(root, cfg); let fileNames;
    if (hasApi) {
      const parsed = ts.readConfigFile(filename, ts.sys.readFile);
      if (parsed.error) fail(`Não foi possível ler tsconfig ${cfg}`);
      const result = ts.parseJsonConfigFileContent(parsed.config, ts.sys, path.dirname(filename));
      if (result.errors.length) fail(`tsconfig inválido: ${cfg}`);
      fileNames = result.fileNames;
    } else {
      const temporary = await mkdtemp(path.join(tmpdir(), 'maintenance-ts-list-'));
      try {
        const bin = path.join(tool(root, 'typescript').dir, 'bin/tsc');
        const result = await run(['unshare', '--user', '--map-root-user', '--net', '--', process.execPath, bin, '--noEmit', '--project', cfg, '--tsBuildInfoFile', path.join(temporary, 'list.tsbuildinfo'), '--listFilesOnly'], root, config.timeoutMs);
        if (result.code !== 0 || result.timedOut || result.overflow) fail(`TypeScript CLI não conseguiu listar arquivos de ${cfg} (exit=${result.code}, timeout=${result.timedOut})`);
        fileNames = result.output.split('\n').map((f) => f.trim()).filter((f) => path.isAbsolute(f) && /\.[cm]?[jt]sx?$/.test(f));
        if (!fileNames.length) fail(`Projeto TypeScript vazio ou inválido: ${cfg}`);
      } finally { await rm(temporary, { recursive: true, force: true }); }
    }
    const source = fileNames.filter((f) => path.relative(root, f).replaceAll('\\', '/').startsWith('src/'));
    coverage.push({ config: cfg, files: fileNames.length, sourceFiles: source.length, method: hasApi ? 'api' : 'cli' });
  }
  if (!coverage.some((c) => c.sourceFiles > 0)) fail('tsconfigs não incluem nenhum arquivo src');
  return { coverage, dependencies: await dependencyFingerprint(root) };
}
async function holdAdvisoryLock(file) {
  const handle = await open(file, 'a', 0o600); await handle.close();
  return await new Promise((resolve, reject) => {
    const child = spawn('flock', ['--nonblock', '--conflict-exit-code', '75', file, process.execPath, '-e', 'process.stdout.write("locked\\n");process.stdin.resume();'], { env: safeEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
    let ready = false, closed = false, response = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new MaintenanceError('failed', 'flock não respondeu')); }, 5000);
    child.once('error', () => { clearTimeout(timer); reject(new MaintenanceError('failed', 'flock obrigatório para recuperar travas com segurança')); });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (data) => {
      response += data;
      if (!ready && response.includes('locked\n')) {
        ready = true; clearTimeout(timer);
        resolve(async () => {
          if (closed) return;
          const completion = new Promise((done) => child.once('close', done));
          child.stdin.end(); await completion;
        });
      }
    });
    child.once('close', (code) => {
      closed = true;
      clearTimeout(timer);
      if (!ready) reject(new MaintenanceError(code === 75 ? 'skipped_busy' : 'failed', code === 75 ? 'Outra execução mantém a trava do processo' : 'Falha no processo de trava'));
    });
  });
}
async function staleDirectory(directory) {
  try {
    const owner = JSON.parse(await readFile(path.join(directory, 'owner.json'), 'utf8'));
    if (Number.isSafeInteger(owner.pid) && owner.pid > 1) {
      try { process.kill(owner.pid, 0); return false; }
      catch (error) { return error.code === 'ESRCH'; }
    }
  } catch (error) {
    if (!['ENOENT', 'SyntaxError'].includes(error.code || error.name)) throw error;
  }
  const info = await stat(directory).catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
  return info === null || Date.now() - info.mtimeMs > 300000;
}
export async function acquire(directory) {
  await mkdir(path.dirname(directory), { recursive: true, mode: 0o700 });
  const releaseProcess = await holdAdvisoryLock(`${directory}.guard`);
  const token = randomUUID(); let owned = false;
  try {
    // O guard do SO serializa inclusive a recuperação da trava auxiliar. Um
    // crash fecha o pipe e libera o flock, sem depender de apagar diretórios.
    for (const current of [`${directory}.recovery`, directory]) if (await exists(current)) {
      if (!await staleDirectory(current)) throw new MaintenanceError('skipped_busy', 'Trava com dono vivo ou criação recente; consulte owner.json');
      await rm(current, { recursive: true, force: true });
    }
    await mkdir(directory, { mode: 0o700 });
    await writeFile(path.join(directory, 'owner.json'), JSON.stringify({ pid: process.pid, token, startedAt: new Date().toISOString() }), { mode: 0o600 });
    owned = true;
  } finally { if (!owned) await releaseProcess(); }
  return async () => {
    try {
      const owner = JSON.parse(await readFile(path.join(directory, 'owner.json'), 'utf8'));
      if (owner.pid !== process.pid || owner.token !== token) fail('Dono da trava mudou; limpeza interrompida');
      await rm(directory, { recursive: true, force: true });
    } finally { await releaseProcess(); }
  };
}
export async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  const { rename } = await import('node:fs/promises'); await rename(temp, file);
}
