import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile, stat, realpath, rm, symlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { tmpdir } from 'node:os';

export class MaintenanceError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
export const fail = (message) => { throw new MaintenanceError('failed', message); };
export const digest = (value) => createHash('sha256').update(value).digest('hex');
export const exists = async (file) => { try { await stat(file); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } };
export const safeEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'SystemRoot', 'COMSPEC', 'TZ', 'LANG'].includes(k)).concat([['CI', 'true'], ['NO_COLOR', '1'], ['HUSKY', '0'], ['NODE_ENV', 'test']]));
const activeChildren = new Map();
export function stopChildren() {
  for (const [pid, child] of activeChildren) {
    try { process.kill(-pid, 'SIGTERM'); } catch {}
    setTimeout(() => { if (activeChildren.get(pid) === child) { try { process.kill(-pid, 'SIGKILL'); } catch {} child.stdout.destroy(); child.stderr.destroy(); } }, 1000).unref();
  }
}
export function run(command, cwd, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), { cwd, shell: false, detached: true, env: safeEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
    if (child.pid) activeChildren.set(child.pid, child);
    let output = '', timedOut = false, overflow = false;
    const kill = (signal) => { try { process.kill(-child.pid, signal); } catch {} };
    const timer = setTimeout(() => { timedOut = true; kill('SIGTERM'); }, timeoutMs);
    const hardTimer = setTimeout(() => { kill('SIGKILL'); child.stdout.destroy(); child.stderr.destroy(); }, timeoutMs + 1000);
    const collect = (data) => { if (output.length < 4 * 1024 * 1024) output += data; else { overflow = true; kill('SIGKILL'); child.stdout.destroy(); child.stderr.destroy(); } };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    child.once('error', (e) => { activeChildren.delete(child.pid); clearTimeout(timer); clearTimeout(hardTimer); reject(new MaintenanceError('failed', `Não foi possível executar ${path.basename(command[0])}: ${e.code}`)); });
    child.once('close', (code, signal) => { activeChildren.delete(child.pid); kill('SIGKILL'); clearTimeout(timer); clearTimeout(hardTimer); resolve({ code, signal, timedOut, overflow, output }); });
  });
}
export async function checked(command, cwd, timeout) {
  const result = await run(command, cwd, timeout);
  if (result.code !== 0 || result.timedOut || result.overflow) fail(`Comando ${path.basename(command[0])} falhou (exit=${result.code}, timeout=${result.timedOut}, limiteSaida=${result.overflow})`);
  return result.output.trim();
}
export const git = (cwd, args, timeout, prefix = []) => checked([...prefix, 'git', '-c', 'core.hooksPath=/dev/null', ...args], cwd, timeout);
const locks = ['bun.lock', 'bun.lockb', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'];
export async function dependencyFingerprint(root) {
  const files = {};
  for (const file of ['package.json', ...locks]) if (await exists(path.join(root, file))) files[file] = digest(await readFile(path.join(root, file)));
  if (!files['package.json'] || !locks.some((f) => files[f])) throw new MaintenanceError('missing_dependencies', 'Manifesto ou lockfile ausente');
  return { files, hash: digest(JSON.stringify(files)) };
}
export async function reuseDependencies(source, target) {
  const before = await dependencyFingerprint(source), after = await dependencyFingerprint(target);
  if (before.hash !== after.hash) throw new MaintenanceError('missing_dependencies', 'Manifesto/lockfiles do clone diferem da referência isolada');
  const modules = path.join(source, 'node_modules');
  if (!await exists(modules)) throw new MaintenanceError('missing_dependencies', 'node_modules ausente; instalação automática desabilitada');
  await symlink(await realpath(modules), path.join(target, 'node_modules'), 'dir');
  return { source, hash: before.hash, files: before.files };
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
    if (Object.keys(g).some((k) => !['name', 'command'].includes(k)) || !Array.isArray(g.command) || !g.command.length || !g.command.every((s) => typeof s === 'string' && s && !s.includes('\0'))) fail('Comando de gate inválido');
    if (!['node', 'npm', 'bun'].includes(g.command[0]) || g.command.some((s) => ['--watch', '-w', '--fix', '--write', '--update-baseline'].includes(s))) fail('Gate deve ser finito e não corretivo');
    if (g.name === 'types' && (g.command[0] !== 'node' || path.basename(g.command[1] || '') !== 'typecheck.mjs' || !c.tsconfigs.every((cfg) => g.command.includes(cfg)))) fail('Gate types deve usar typecheck.mjs e incluir todos os tsconfigs');
  }
  const f = c.fix;
  if (!f || Object.keys(f).some((k) => !['roots', 'eslintRules', 'prettier'].includes(k)) || !Array.isArray(f.roots) || !f.roots.length || !f.roots.every((x) => x === 'src' || x.startsWith('src/') && relative(x)) || typeof f.prettier !== 'boolean') fail('Escopo de correção deve ficar em src');
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
export async function acquire(directory) {
  await mkdir(path.dirname(directory), { recursive: true, mode: 0o700 });
  let acquired = false;
  try { await mkdir(directory, { mode: 0o700 }); acquired = true; }
  catch (e) { if (e.code !== 'EEXIST') throw e; }
  if (!acquired) {
    const recovering = `${directory}.recovery`;
    try { await mkdir(recovering, { mode: 0o700 }); }
    catch { throw new MaintenanceError('skipped_busy', 'Outra execução está recuperando a trava'); }
    try {
      let stale = false;
      try {
        const owner = JSON.parse(await readFile(path.join(directory, 'owner.json'), 'utf8'));
        if (Number.isSafeInteger(owner.pid) && owner.pid > 1) {
          try { process.kill(owner.pid, 0); }
          catch (e) { stale = e.code === 'ESRCH'; }
        }
      } catch (e) {
        if (e.code === 'ENOENT') { const info = await stat(directory).catch(() => null); stale = info && Date.now() - info.mtimeMs > 300000; }
      }
      if (!stale) throw new MaintenanceError('skipped_busy', 'Execução concorrente ou trava recente; consulte owner.json');
      const old = `${directory}.stale-${randomUUID()}`;
      const { rename } = await import('node:fs/promises');
      await rename(directory, old);
      try { await mkdir(directory, { mode: 0o700 }); acquired = true; }
      catch { throw new MaintenanceError('skipped_busy', 'Outra execução adquiriu a trava recuperada'); }
      finally { await rm(old, { recursive: true, force: true }); }
    } finally { await rm(recovering, { recursive: true, force: true }); }
  }
  const token = randomUUID();
  await writeFile(path.join(directory, 'owner.json'), JSON.stringify({ pid: process.pid, token, startedAt: new Date().toISOString() }), { mode: 0o600 });
  return async () => {
    const owner = JSON.parse(await readFile(path.join(directory, 'owner.json'), 'utf8'));
    if (owner.token !== token) fail('Dono da trava mudou; limpeza interrompida');
    await rm(directory, { recursive: true, force: true });
  };
}
export async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  const { rename } = await import('node:fs/promises'); await rename(temp, file);
}
